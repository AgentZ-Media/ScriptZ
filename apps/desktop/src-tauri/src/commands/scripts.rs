use std::collections::HashMap;

use rusqlite::{params, Connection, OptionalExtension};
use tauri::{AppHandle, State};

use crate::commands::ai;
use crate::db::{new_id, now_ms, Db};
use crate::error::{Result, ScriptzError};
use crate::fts::{delete_script_fts, upsert_script_fts};
use crate::lex::{extract_character_names, extract_plain_text};
use crate::models::{
    CreateScriptInput, ListScriptsQuery, Script, ScriptCharacter, ScriptSummary, UpdateScriptInput,
};

pub const DEFAULT_PALETTE: &[&str] = &[
    "#e0791f", "#3a8ed4", "#7a4ad4", "#2fa56b", "#d04141",
    "#c87b00", "#1a9aa0", "#a855f7", "#d946ef", "#0ea5e9",
];

#[derive(Debug, Clone, Default)]
pub struct ColorRecord {
    pub default_color: Option<String>,
    pub override_color: Option<String>,
}

/// Load all per-name colour records (default + override). Keys are upper-cased
/// so callers can do straight lookups without re-normalising.
pub fn load_color_records(conn: &Connection) -> Result<HashMap<String, ColorRecord>> {
    let mut stmt = conn
        .prepare("SELECT name, default_color, override_color FROM character_colors")?;
    let rows: HashMap<String, ColorRecord> = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, Option<String>>(1)?,
                r.get::<_, Option<String>>(2)?,
            ))
        })?
        .filter_map(|r| r.ok())
        .map(|(n, d, o)| {
            (
                n.to_uppercase(),
                ColorRecord {
                    default_color: d,
                    override_color: o,
                },
            )
        })
        .collect();
    Ok(rows)
}

/// Insert or update a `default_color` entry for `name`. Existing
/// `default_color` is preserved (the very first auto-assigned colour wins
/// forever — that's the whole point), and `override_color` is left
/// completely alone.
pub fn upsert_default_color(
    conn: &Connection,
    name: &str,
    default_color: &str,
    now: i64,
) -> Result<()> {
    conn.execute(
        "INSERT INTO character_colors (name, default_color, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(name) DO UPDATE SET
           default_color = COALESCE(character_colors.default_color, excluded.default_color),
           updated_at = CASE
             WHEN character_colors.default_color IS NULL THEN excluded.updated_at
             ELSE character_colors.updated_at
           END",
        params![name, default_color, now],
    )?;
    Ok(())
}

fn empty_lexical_state() -> String {
    serde_json::json!({
        "root": {
            "children": [
                {
                    "type": "scriptz-character",
                    "version": 1,
                    "characterName": "",
                    "direction": null,
                    "format": "",
                    "indent": 0,
                    "children": []
                }
            ],
            "direction": null,
            "format": "",
            "indent": 0,
            "type": "root",
            "version": 1
        }
    })
    .to_string()
}

pub fn parse_chars_meta(raw: &str) -> Vec<ScriptCharacter> {
    serde_json::from_str(raw).unwrap_or_default()
}

pub fn serialize_chars_meta(list: &[ScriptCharacter]) -> String {
    serde_json::to_string(list).unwrap_or_else(|_| "[]".to_string())
}

/// Reconcile the per-script character list with the names actually present
/// in the latest content. Resolution priority per name:
///   1. App-wide override (`override_color`)
///   2. Existing per-script entry (sticky — preserves colours from before
///      the global registry existed)
///   3. App-wide default (`default_color`)
///   4. Next palette colour not already claimed in this script
///
/// Returns `(chars, defaults_to_register)` — the second tuple lists names
/// whose `default_color` is still NULL in the registry alongside the
/// colour they should be backfilled to. Callers must persist these so the
/// global default converges.
pub fn reconcile_chars_from_content(
    existing: &[ScriptCharacter],
    content_json: &str,
    records: &HashMap<String, ColorRecord>,
) -> (Vec<ScriptCharacter>, Vec<(String, String)>) {
    let names = extract_character_names(content_json);
    let mut out: Vec<ScriptCharacter> = Vec::with_capacity(names.len());
    let mut new_defaults: Vec<(String, String)> = Vec::new();
    for name in names {
        let upper = name.to_uppercase();
        let rec = records.get(&upper);

        let chosen = if let Some(o) = rec.and_then(|r| r.override_color.as_ref()) {
            o.clone()
        } else if let Some(c) = existing
            .iter()
            .find(|c| c.name.eq_ignore_ascii_case(&name))
        {
            c.color.clone()
        } else if let Some(d) = rec.and_then(|r| r.default_color.as_ref()) {
            d.clone()
        } else {
            let used: std::collections::HashSet<&str> =
                out.iter().map(|c| c.color.as_str()).collect();
            let used_existing: std::collections::HashSet<&str> =
                existing.iter().map(|c| c.color.as_str()).collect();
            DEFAULT_PALETTE
                .iter()
                .find(|p| !used.contains(*p) && !used_existing.contains(*p))
                .copied()
                .unwrap_or(DEFAULT_PALETTE[0])
                .to_string()
        };

        // Backfill the default registry whenever we touch a name whose
        // default isn't recorded yet — handles both "brand new name" and
        // "old name from before the registry existed" in one branch. We
        // dedupe by name so a script with the same character twice only
        // queues one upsert.
        let needs_default = rec.map(|r| r.default_color.is_none()).unwrap_or(true);
        if needs_default
            && !new_defaults.iter().any(|(n, _)| n.eq_ignore_ascii_case(&upper))
        {
            new_defaults.push((upper, chosen.clone()));
        }

        out.push(ScriptCharacter { name, color: chosen });
    }
    (out, new_defaults)
}

fn refresh_fts(conn: &Connection, script_id: &str) -> Result<()> {
    let row = conn
        .query_row(
            "SELECT title, content_json FROM scripts WHERE id = ?1",
            params![script_id],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
        )
        .optional()?;
    let Some((title, content_json)) = row else {
        return Ok(());
    };
    let content_text = extract_plain_text(&content_json);
    upsert_script_fts(conn, script_id, &title, &content_text)
}

fn row_to_summary(conn: &Connection, id: String) -> Result<ScriptSummary> {
    let s = conn
        .query_row(
            "SELECT id, title, highlighting_enabled, characters_meta,
                    created_at, updated_at, archived_at, page_count, summary, folder_id
             FROM scripts WHERE id = ?1",
            params![id],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, Option<i64>>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, i64>(4)?,
                    r.get::<_, i64>(5)?,
                    r.get::<_, Option<i64>>(6)?,
                    r.get::<_, i64>(7)?,
                    r.get::<_, Option<String>>(8)?,
                    r.get::<_, Option<String>>(9)?,
                ))
            },
        )
        .optional()?
        .ok_or_else(|| ScriptzError::NotFound(format!("script {id}")))?;
    Ok(ScriptSummary {
        id: s.0,
        title: s.1,
        highlighting_enabled: s.2,
        characters: parse_chars_meta(&s.3),
        created_at: s.4,
        updated_at: s.5,
        archived_at: s.6,
        page_count: s.7,
        summary: s.8,
        folder_id: s.9,
    })
}

#[tauri::command]
pub fn create_script(db: State<Db>, input: CreateScriptInput) -> Result<ScriptSummary> {
    let conn = db.conn()?;
    let id = new_id();
    let now = now_ms();
    let title = input.title.clone().unwrap_or_else(|| "Unbenannt".into());
    let content_json = input
        .initial_content_json
        .clone()
        .unwrap_or_else(empty_lexical_state);
    let records = load_color_records(&conn)?;
    let (chars, new_defaults) = reconcile_chars_from_content(&[], &content_json, &records);
    for (n, c) in &new_defaults {
        upsert_default_color(&conn, n, c, now)?;
    }
    let chars_json = serialize_chars_meta(&chars);
    if let Some(fid) = &input.folder_id {
        let exists: i64 = conn
            .query_row("SELECT COUNT(*) FROM folders WHERE id = ?1", params![fid], |r| {
                r.get(0)
            })
            .unwrap_or(0);
        if exists == 0 {
            return Err(ScriptzError::NotFound(format!("folder {fid}")));
        }
    }
    conn.execute(
        "INSERT INTO scripts (id, title, highlighting_enabled, content_json, characters_meta,
                              created_at, updated_at, page_count, folder_id)
         VALUES (?1, ?2, NULL, ?3, ?4, ?5, ?5, 1, ?6)",
        params![id, title, content_json, chars_json, now, input.folder_id],
    )?;
    refresh_fts(&conn, &id)?;
    row_to_summary(&conn, id)
}

#[tauri::command]
pub fn get_script(db: State<Db>, id: String) -> Result<Script> {
    let conn = db.conn()?;
    let s = conn
        .query_row(
            "SELECT id, title, highlighting_enabled, content_json, characters_meta,
                    created_at, updated_at, archived_at, page_count, summary, folder_id
             FROM scripts WHERE id = ?1",
            params![id],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, Option<i64>>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                    r.get::<_, i64>(5)?,
                    r.get::<_, i64>(6)?,
                    r.get::<_, Option<i64>>(7)?,
                    r.get::<_, i64>(8)?,
                    r.get::<_, Option<String>>(9)?,
                    r.get::<_, Option<String>>(10)?,
                ))
            },
        )
        .optional()?
        .ok_or_else(|| ScriptzError::NotFound(format!("script {id}")))?;
    Ok(Script {
        id: s.0,
        title: s.1,
        highlighting_enabled: s.2,
        content_json: s.3,
        characters: parse_chars_meta(&s.4),
        created_at: s.5,
        updated_at: s.6,
        archived_at: s.7,
        page_count: s.8,
        summary: s.9,
        folder_id: s.10,
    })
}

#[tauri::command]
pub fn update_script(
    app: AppHandle,
    db: State<Db>,
    input: UpdateScriptInput,
) -> Result<ScriptSummary> {
    let mut conn = db.conn()?;
    let now = now_ms();
    let exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM scripts WHERE id = ?1",
            params![input.id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if exists == 0 {
        return Err(ScriptzError::NotFound(format!("script {}", input.id)));
    }
    let content_changed = input.content_json.is_some();

    // Wrap all field-level UPDATEs in a single transaction so two
    // concurrent saves can't interleave (e.g. content from save A landing
    // between title + chars from save B). FTS5 refresh runs inside the
    // same transaction so the index never points at a half-written row.
    let tx = conn.transaction()?;

    if let Some(title) = &input.title {
        tx.execute(
            "UPDATE scripts SET title = ?1, updated_at = ?2 WHERE id = ?3",
            params![title, now, input.id],
        )?;
    }
    if let Some(hl) = &input.highlighting_enabled {
        tx.execute(
            "UPDATE scripts SET highlighting_enabled = ?1, updated_at = ?2 WHERE id = ?3",
            params![hl, now, input.id],
        )?;
    }
    if let Some(content_json) = &input.content_json {
        // Reconcile characters_meta against the new content.
        let existing_meta: String = tx.query_row(
            "SELECT characters_meta FROM scripts WHERE id = ?1",
            params![input.id],
            |r| r.get(0),
        )?;
        let existing = parse_chars_meta(&existing_meta);
        let records = load_color_records(&tx)?;
        let (chars, new_defaults) =
            reconcile_chars_from_content(&existing, content_json, &records);
        for (n, c) in &new_defaults {
            upsert_default_color(&tx, n, c, now)?;
        }
        let chars_json = serialize_chars_meta(&chars);
        tx.execute(
            "UPDATE scripts SET content_json = ?1, characters_meta = ?2, updated_at = ?3 WHERE id = ?4",
            params![content_json, chars_json, now, input.id],
        )?;
    }
    if let Some(pc) = &input.page_count {
        tx.execute(
            "UPDATE scripts SET page_count = ?1 WHERE id = ?2",
            params![pc, input.id],
        )?;
    }
    if let Some(chars) = &input.characters {
        // Caller-supplied list (e.g. user edited a color) — overwrite directly.
        let chars_json = serialize_chars_meta(chars);
        tx.execute(
            "UPDATE scripts SET characters_meta = ?1, updated_at = ?2 WHERE id = ?3",
            params![chars_json, now, input.id],
        )?;
    }
    refresh_fts(&tx, &input.id)?;
    tx.commit()?;

    let summary = row_to_summary(&conn, input.id.clone())?;
    drop(conn);
    if content_changed {
        ai::trigger_summary_async(app, input.id);
    }
    Ok(summary)
}

#[tauri::command]
pub fn list_scripts(db: State<Db>, query: ListScriptsQuery) -> Result<Vec<ScriptSummary>> {
    let conn = db.conn()?;
    let include_archived = query.include_archived.unwrap_or(false);
    let only_archived = query.only_archived.unwrap_or(false);

    let mut sql = String::from("SELECT id FROM scripts WHERE 1=1");
    let mut args: Vec<Box<dyn rusqlite::ToSql>> = vec![];
    if only_archived {
        sql.push_str(" AND archived_at IS NOT NULL");
    } else if !include_archived {
        sql.push_str(" AND archived_at IS NULL");
    }
    if let Some(q) = &query.query {
        let trimmed = q.trim();
        if !trimmed.is_empty() {
            sql.push_str(" AND title LIKE ?");
            args.push(Box::new(format!("%{}%", trimmed)));
        }
    }
    if let Some(folder_id) = &query.folder_id {
        sql.push_str(" AND folder_id = ?");
        args.push(Box::new(folder_id.clone()));
    }
    let sort = query.sort.as_deref().unwrap_or("updated");
    match sort {
        "created" => sql.push_str(" ORDER BY created_at DESC"),
        "title" => sql.push_str(" ORDER BY title COLLATE NOCASE ASC"),
        _ => sql.push_str(" ORDER BY updated_at DESC"),
    }
    if let Some(limit) = query.limit {
        sql.push_str(&format!(" LIMIT {}", limit));
        if let Some(offset) = query.offset {
            sql.push_str(&format!(" OFFSET {}", offset));
        }
    }

    let arg_refs: Vec<&dyn rusqlite::ToSql> = args.iter().map(|b| b.as_ref()).collect();
    let mut stmt = conn.prepare(&sql)?;
    let ids: Vec<String> = stmt
        .query_map(rusqlite::params_from_iter(arg_refs.iter()), |r| {
            r.get::<_, String>(0)
        })?
        .filter_map(|r| r.ok())
        .collect();

    let mut out = Vec::with_capacity(ids.len());
    for id in ids {
        out.push(row_to_summary(&conn, id)?);
    }
    Ok(out)
}

#[tauri::command]
pub fn archive_script(db: State<Db>, id: String) -> Result<()> {
    let conn = db.conn()?;
    let now = now_ms();
    conn.execute(
        "UPDATE scripts SET archived_at = ?1 WHERE id = ?2",
        params![now, id],
    )?;
    Ok(())
}

#[tauri::command]
pub fn restore_script(db: State<Db>, id: String) -> Result<()> {
    let conn = db.conn()?;
    conn.execute(
        "UPDATE scripts SET archived_at = NULL WHERE id = ?1",
        params![id],
    )?;
    Ok(())
}

#[tauri::command]
pub fn purge_script(db: State<Db>, id: String) -> Result<()> {
    let mut conn = db.conn()?;
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM scripts WHERE id = ?1", params![id])?;
    delete_script_fts(&tx, &id)?;
    tx.commit()?;
    Ok(())
}

#[tauri::command]
pub fn empty_trash(db: State<Db>) -> Result<()> {
    let mut conn = db.conn()?;
    let ids: Vec<String> = {
        let mut stmt = conn.prepare("SELECT id FROM scripts WHERE archived_at IS NOT NULL")?;
        let rows: Vec<String> = stmt
            .query_map([], |r| r.get::<_, String>(0))?
            .filter_map(|r| r.ok())
            .collect();
        rows
    };
    let tx = conn.transaction()?;
    for id in &ids {
        tx.execute("DELETE FROM scripts WHERE id = ?1", params![id])?;
        delete_script_fts(&tx, id)?;
    }
    tx.commit()?;
    Ok(())
}

#[tauri::command]
pub fn duplicate_script(db: State<Db>, id: String) -> Result<ScriptSummary> {
    let src = get_script(db.clone(), id.clone())?;
    let conn = db.conn()?;
    let new_id = new_id();
    let now = now_ms();
    let new_title = format!("{} (Kopie)", src.title);
    let chars_json = serialize_chars_meta(&src.characters);
    conn.execute(
        "INSERT INTO scripts (id, title, highlighting_enabled, content_json, characters_meta,
                              created_at, updated_at, page_count, folder_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, ?7, ?8)",
        params![
            new_id,
            new_title,
            src.highlighting_enabled,
            src.content_json,
            chars_json,
            now,
            src.page_count,
            src.folder_id,
        ],
    )?;
    refresh_fts(&conn, &new_id)?;
    row_to_summary(&conn, new_id)
}

#[tauri::command]
pub fn rename_script(db: State<Db>, id: String, title: String) -> Result<ScriptSummary> {
    let conn = db.conn()?;
    let now = now_ms();
    conn.execute(
        "UPDATE scripts SET title = ?1, updated_at = ?2 WHERE id = ?3",
        params![title, now, id],
    )?;
    refresh_fts(&conn, &id)?;
    row_to_summary(&conn, id)
}
