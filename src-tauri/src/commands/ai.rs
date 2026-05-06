// OpenRouter integration: opt-in, optional, all I/O behind these commands so
// the API key never leaves the Rust side. The key lives in the macOS Keychain
// (service: "ScriptZ", account: "openrouter_api_key"). Model preference and
// the on/off toggle live in the regular `settings` table.
//
// The model list fetched from OpenRouter is cached as JSON in `settings` for
// 24 h to avoid hammering their API every time the user opens the picker.
//
// Summary generation is triggered by `commands::scripts::update_script` after
// each save and runs on a background tokio task. We never block the save
// itself on the network round-trip.

use once_cell::sync::Lazy;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

use crate::db::{now_ms, Db};
use crate::error::{Result, ScriptzError};
use crate::lex::{extract_plain_text, jaccard_similarity, word_token_set};

const KEYCHAIN_SERVICE: &str = "ScriptZ";
const KEYCHAIN_ACCOUNT: &str = "openrouter_api_key";

const SETTING_MODEL_ID: &str = "ai.model_id";
const SETTING_ENABLED: &str = "ai.enabled";
const SETTING_MODELS_CACHE: &str = "ai.models_cache";
const SETTING_MODELS_CACHE_AT: &str = "ai.models_cache_at";

const DEFAULT_MODEL_ID: &str = "google/gemini-3.1-flash-lite-preview";
const MODELS_CACHE_TTL_MS: i64 = 24 * 60 * 60 * 1000;
const MIN_WORD_COUNT_FOR_SUMMARY: usize = 30;
const RE_SUMMARIZE_JACCARD_THRESHOLD: f32 = 0.5;
const MIN_SECONDS_BETWEEN_GENERATIONS: i64 = 90;
const OPENROUTER_BASE: &str = "https://openrouter.ai/api/v1";

static HTTP: Lazy<reqwest::Client> = Lazy::new(|| {
    reqwest::Client::builder()
        .user_agent("ScriptZ/0.1 (https://github.com/ibimspumo/ScriptZ)")
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .expect("reqwest client")
});

/// Per-script in-flight guard. Prevents queueing multiple summary requests
/// while one is already running for the same script.
static IN_FLIGHT: Lazy<Mutex<HashMap<String, ()>>> = Lazy::new(|| Mutex::new(HashMap::new()));

// ---------------------------------------------------------------------------
// Settings + state shape
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
pub struct AiState {
    pub enabled: bool,
    pub has_api_key: bool,
    pub model_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub context_length: Option<i64>,
    pub prompt_price: Option<String>,
    pub completion_price: Option<String>,
}

fn read_setting(conn: &Connection, key: &str) -> Result<Option<String>> {
    let v: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![key],
            |r| r.get(0),
        )
        .optional()?;
    Ok(v)
}

fn write_setting(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

fn keychain_entry() -> Result<keyring::Entry> {
    Ok(keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT)?)
}

fn read_api_key() -> Option<String> {
    keychain_entry()
        .ok()
        .and_then(|e| match e.get_password() {
            Ok(s) if !s.is_empty() => Some(s),
            _ => None,
        })
}

fn read_state(db: &Db) -> Result<AiState> {
    let conn = db.conn()?;
    let model_id = read_setting(&conn, SETTING_MODEL_ID)?
        .unwrap_or_else(|| DEFAULT_MODEL_ID.to_string());
    let enabled = read_setting(&conn, SETTING_ENABLED)?
        .map(|v| v == "1")
        .unwrap_or(false);
    let has_api_key = read_api_key().is_some();
    Ok(AiState {
        enabled,
        has_api_key,
        model_id,
    })
}

// ---------------------------------------------------------------------------
// Tauri commands — settings/keychain
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn ai_get_state(db: State<Db>) -> Result<AiState> {
    read_state(&db)
}

#[tauri::command]
pub fn ai_set_api_key(key: String) -> Result<()> {
    let entry = keychain_entry()?;
    let trimmed = key.trim();
    if trimmed.is_empty() {
        // Empty == clear.
        let _ = entry.delete_credential();
        return Ok(());
    }
    entry.set_password(trimmed)?;
    Ok(())
}

#[tauri::command]
pub fn ai_clear_api_key() -> Result<()> {
    let entry = keychain_entry()?;
    let _ = entry.delete_credential();
    Ok(())
}

#[tauri::command]
pub fn ai_set_enabled(db: State<Db>, enabled: bool) -> Result<()> {
    let conn = db.conn()?;
    write_setting(&conn, SETTING_ENABLED, if enabled { "1" } else { "0" })
}

#[tauri::command]
pub fn ai_set_model(db: State<Db>, model_id: String) -> Result<()> {
    let conn = db.conn()?;
    write_setting(&conn, SETTING_MODEL_ID, &model_id)
}

// ---------------------------------------------------------------------------
// Tauri command — model list (with 24h cache)
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn ai_list_models(
    db: State<'_, Db>,
    refresh: Option<bool>,
) -> Result<Vec<ModelInfo>> {
    let force = refresh.unwrap_or(false);

    let cached: Option<(String, i64)> = {
        let conn = db.conn()?;
        let cache = read_setting(&conn, SETTING_MODELS_CACHE)?;
        let at = read_setting(&conn, SETTING_MODELS_CACHE_AT)?
            .and_then(|s| s.parse::<i64>().ok())
            .unwrap_or(0);
        cache.map(|c| (c, at))
    };

    if !force {
        if let Some((cache_json, at)) = &cached {
            if now_ms() - at < MODELS_CACHE_TTL_MS {
                if let Ok(list) = serde_json::from_str::<Vec<ModelInfo>>(cache_json) {
                    return Ok(list);
                }
            }
        }
    }

    let url = format!(
        "{}/models?supported_parameters=structured_outputs",
        OPENROUTER_BASE
    );
    let resp = HTTP
        .get(&url)
        .header("HTTP-Referer", "https://github.com/ibimspumo/ScriptZ")
        .header("X-Title", "ScriptZ")
        .send()
        .await
        .map_err(|e| ScriptzError::Http(format!("models fetch: {e}")))?;
    let status = resp.status();
    let body = resp
        .text()
        .await
        .map_err(|e| ScriptzError::Http(format!("models body: {e}")))?;
    if !status.is_success() {
        // Use cache if we have any, even if stale, so the UI never goes blank
        // just because OpenRouter blipped.
        if let Some((cache_json, _)) = &cached {
            if let Ok(list) = serde_json::from_str::<Vec<ModelInfo>>(cache_json) {
                return Ok(list);
            }
        }
        return Err(ScriptzError::Http(format!("models {status}: {body}")));
    }

    let parsed: serde_json::Value = serde_json::from_str(&body)?;
    let list: Vec<ModelInfo> = parsed
        .get("data")
        .and_then(|d| d.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|m| {
                    let id = m.get("id")?.as_str()?.to_string();
                    let name = m
                        .get("name")
                        .and_then(|n| n.as_str())
                        .unwrap_or(&id)
                        .to_string();
                    let description = m
                        .get("description")
                        .and_then(|d| d.as_str())
                        .map(|s| s.to_string());
                    let context_length =
                        m.get("context_length").and_then(|c| c.as_i64());
                    let prompt_price = m
                        .get("pricing")
                        .and_then(|p| p.get("prompt"))
                        .and_then(|p| p.as_str())
                        .map(|s| s.to_string());
                    let completion_price = m
                        .get("pricing")
                        .and_then(|p| p.get("completion"))
                        .and_then(|p| p.as_str())
                        .map(|s| s.to_string());
                    Some(ModelInfo {
                        id,
                        name,
                        description,
                        context_length,
                        prompt_price,
                        completion_price,
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    {
        let conn = db.conn()?;
        let json = serde_json::to_string(&list).unwrap_or_else(|_| "[]".into());
        write_setting(&conn, SETTING_MODELS_CACHE, &json)?;
        write_setting(&conn, SETTING_MODELS_CACHE_AT, &now_ms().to_string())?;
    }

    Ok(list)
}

// ---------------------------------------------------------------------------
// Tauri command — connection test
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn ai_test_connection() -> Result<String> {
    let key = read_api_key()
        .ok_or_else(|| ScriptzError::Ai("Kein API-Key hinterlegt".into()))?;

    let resp = HTTP
        .get(format!("{}/key", OPENROUTER_BASE))
        .bearer_auth(&key)
        .header("HTTP-Referer", "https://github.com/ibimspumo/ScriptZ")
        .header("X-Title", "ScriptZ")
        .send()
        .await
        .map_err(|e| ScriptzError::Http(format!("test: {e}")))?;
    let status = resp.status();
    let body = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(ScriptzError::Ai(format!("OpenRouter: {status} {body}")));
    }
    Ok(body)
}

// ---------------------------------------------------------------------------
// Summary generation
// ---------------------------------------------------------------------------

/// Persisted alongside the script so we can compute a Jaccard score on the
/// next save without re-reading the entire content. Also ensures we never
/// throw away a usable summary just because the script grew.
struct SummaryState {
    summary: Option<String>,
    summary_source_text: Option<String>,
    summary_generated_at: Option<i64>,
}

fn read_summary_state(conn: &Connection, script_id: &str) -> Result<SummaryState> {
    let row = conn
        .query_row(
            "SELECT summary, summary_source_text, summary_generated_at
             FROM scripts WHERE id = ?1",
            params![script_id],
            |r| {
                Ok(SummaryState {
                    summary: r.get(0)?,
                    summary_source_text: r.get(1)?,
                    summary_generated_at: r.get(2)?,
                })
            },
        )
        .optional()?
        .unwrap_or(SummaryState {
            summary: None,
            summary_source_text: None,
            summary_generated_at: None,
        });
    Ok(row)
}

fn write_summary(
    conn: &Connection,
    script_id: &str,
    summary: &str,
    source_text: &str,
    model: &str,
) -> Result<()> {
    conn.execute(
        "UPDATE scripts SET summary = ?1, summary_source_text = ?2,
                            summary_generated_at = ?3, summary_model = ?4
         WHERE id = ?5",
        params![summary, source_text, now_ms(), model, script_id],
    )?;
    Ok(())
}

fn try_acquire_inflight(script_id: &str) -> bool {
    let mut g = IN_FLIGHT.lock().expect("inflight mutex");
    if g.contains_key(script_id) {
        return false;
    }
    g.insert(script_id.to_string(), ());
    true
}

fn release_inflight(script_id: &str) {
    let mut g = IN_FLIGHT.lock().expect("inflight mutex");
    g.remove(script_id);
}

/// Decide whether `current_text` warrants a fresh summary. Encapsulates all
/// the heuristics in one place so the trigger from `update_script` and the
/// manual "Force-Regenerate" command share a single source of truth.
enum Decision {
    Skip(&'static str),
    Generate,
}

fn decide(state: &SummaryState, current_text: &str, force: bool) -> Decision {
    let word_count = word_token_set(current_text).len();
    if word_count < MIN_WORD_COUNT_FOR_SUMMARY && !force {
        return Decision::Skip("zu wenig Inhalt");
    }
    if let Some(at) = state.summary_generated_at {
        let elapsed = (now_ms() - at) / 1000;
        if elapsed < MIN_SECONDS_BETWEEN_GENERATIONS && !force {
            return Decision::Skip("rate-limit");
        }
    }
    if force {
        return Decision::Generate;
    }
    match (&state.summary, &state.summary_source_text) {
        (Some(_), Some(prev)) => {
            let prev_set = word_token_set(prev);
            let curr_set = word_token_set(current_text);
            let sim = jaccard_similarity(&prev_set, &curr_set);
            if sim >= RE_SUMMARIZE_JACCARD_THRESHOLD {
                Decision::Skip("kein wesentlicher Inhalt-Drift")
            } else {
                Decision::Generate
            }
        }
        _ => Decision::Generate,
    }
}

async fn call_openrouter(
    api_key: &str,
    model_id: &str,
    plain_text: &str,
) -> Result<String> {
    // Trim very long scripts to keep request size + cost predictable. Gemini
    // 3.1 Flash Lite has a 1M ctx window so this is overkill for safety only.
    let trimmed = if plain_text.chars().count() > 12_000 {
        plain_text.chars().take(12_000).collect::<String>()
    } else {
        plain_text.to_string()
    };

    let body = serde_json::json!({
        "model": model_id,
        "messages": [
            {
                "role": "system",
                "content": "Du fasst Drehbuch-Skripte (Sketch/TikTok) in EINEM prägnanten Satz zusammen. Maximal 18 Wörter. Antworte in der Sprache, in der das Skript geschrieben ist. Keine Anführungszeichen, kein Punkt am Ende, kein Vorwort wie 'Zusammenfassung:'. Antworte ausschließlich im geforderten JSON-Schema."
            },
            { "role": "user", "content": trimmed }
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "script_summary",
                "strict": true,
                "schema": {
                    "type": "object",
                    "properties": {
                        "summary": {
                            "type": "string",
                            "description": "Eine prägnante Zusammenfassung in der Sprache des Skripts, max. 18 Wörter."
                        }
                    },
                    "required": ["summary"],
                    "additionalProperties": false
                }
            }
        },
        "max_tokens": 160,
        "temperature": 0.4,
        "provider": { "require_parameters": true }
    });

    let resp = HTTP
        .post(format!("{}/chat/completions", OPENROUTER_BASE))
        .bearer_auth(api_key)
        .header("HTTP-Referer", "https://github.com/ibimspumo/ScriptZ")
        .header("X-Title", "ScriptZ")
        .json(&body)
        .send()
        .await?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(ScriptzError::Ai(format!("OpenRouter {status}: {text}")));
    }
    let v: serde_json::Value = serde_json::from_str(&text)?;
    let content = v
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .ok_or_else(|| ScriptzError::Ai("OpenRouter: leere Antwort".into()))?;
    let parsed: serde_json::Value = serde_json::from_str(content)
        .map_err(|e| ScriptzError::Ai(format!("kein gültiges JSON: {e}")))?;
    let summary = parsed
        .get("summary")
        .and_then(|s| s.as_str())
        .ok_or_else(|| ScriptzError::Ai("Feld 'summary' fehlt".into()))?
        .trim()
        .trim_matches(|c| c == '"' || c == '\u{201C}' || c == '\u{201D}')
        .trim_end_matches('.')
        .to_string();
    if summary.is_empty() {
        return Err(ScriptzError::Ai("Leere Zusammenfassung".into()));
    }
    Ok(summary)
}

#[tauri::command]
pub async fn ai_generate_summary(
    db: State<'_, Db>,
    script_id: String,
    force: Option<bool>,
) -> Result<Option<String>> {
    generate_summary_inner(&db, &script_id, force.unwrap_or(false)).await
}

async fn generate_summary_inner(
    db: &Db,
    script_id: &str,
    force: bool,
) -> Result<Option<String>> {
    // Phase 1: read state + decide. All sync, no .await held over Connection.
    let (decision, content_text, model_id, api_key) = {
        let conn = db.conn()?;
        let enabled = read_setting(&conn, SETTING_ENABLED)?
            .map(|v| v == "1")
            .unwrap_or(false);
        if !enabled {
            return Ok(None);
        }
        let model_id = read_setting(&conn, SETTING_MODEL_ID)?
            .unwrap_or_else(|| DEFAULT_MODEL_ID.to_string());
        let key = read_api_key();
        let Some(key) = key else { return Ok(None) };
        let row = conn
            .query_row(
                "SELECT content_json FROM scripts WHERE id = ?1",
                params![script_id],
                |r| r.get::<_, String>(0),
            )
            .optional()?;
        let Some(content_json) = row else {
            return Err(ScriptzError::NotFound(format!("script {script_id}")));
        };
        let plain = extract_plain_text(&content_json);
        let state = read_summary_state(&conn, script_id)?;
        let decision = decide(&state, &plain, force);
        (decision, plain, model_id, key)
    };

    let plain = match decision {
        Decision::Skip(reason) => {
            tracing::debug!(target: "ai", "skip summary for {script_id}: {reason}");
            return Ok(None);
        }
        Decision::Generate => content_text,
    };

    if !try_acquire_inflight(script_id) {
        return Ok(None);
    }
    let result = call_openrouter(&api_key, &model_id, &plain).await;
    release_inflight(script_id);

    let summary = result?;

    {
        let conn = db.conn()?;
        write_summary(&conn, script_id, &summary, &plain, &model_id)?;
    }

    Ok(Some(summary))
}

/// Fire-and-forget trigger called from `update_script` after each save. Eats
/// errors after logging — a transient OpenRouter blip should never surface to
/// the editor.
pub fn trigger_summary_async(app: AppHandle, script_id: String) {
    tauri::async_runtime::spawn(async move {
        let db = app.state::<Db>().inner().clone();
        if let Err(e) = generate_summary_inner(&db, &script_id, false).await {
            tracing::debug!(target: "ai", "background summary for {script_id} failed: {e}");
        }
    });
}
