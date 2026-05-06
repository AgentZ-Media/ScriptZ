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

const DEFAULT_PALETTE: &[&str] = &[
    "#e0791f", "#3a8ed4", "#7a4ad4", "#2fa56b", "#d04141",
    "#c87b00", "#1a9aa0", "#a855f7", "#d946ef", "#0ea5e9",
];

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

fn parse_chars_meta(raw: &str) -> Vec<ScriptCharacter> {
    serde_json::from_str(raw).unwrap_or_default()
}

fn serialize_chars_meta(list: &[ScriptCharacter]) -> String {
    serde_json::to_string(list).unwrap_or_else(|_| "[]".to_string())
}

/// Reconcile the per-script character list with the names actually present
/// in the latest content. Existing entries keep their color (sticky); new
/// names get the next palette color not already in use.
fn reconcile_chars_from_content(existing: &[ScriptCharacter], content_json: &str) -> Vec<ScriptCharacter> {
    let names = extract_character_names(content_json);
    let mut out: Vec<ScriptCharacter> = Vec::with_capacity(names.len());
    for name in names {
        let found = existing
            .iter()
            .find(|c| c.name.eq_ignore_ascii_case(&name));
        if let Some(c) = found {
            out.push(ScriptCharacter {
                name,
                color: c.color.clone(),
            });
        } else {
            let used: std::collections::HashSet<&str> =
                out.iter().map(|c| c.color.as_str()).collect();
            let used_existing: std::collections::HashSet<&str> =
                existing.iter().map(|c| c.color.as_str()).collect();
            let color = DEFAULT_PALETTE
                .iter()
                .find(|p| !used.contains(*p) && !used_existing.contains(*p))
                .copied()
                .unwrap_or(DEFAULT_PALETTE[0]);
            out.push(ScriptCharacter {
                name,
                color: color.to_string(),
            });
        }
    }
    out
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

pub fn refresh_fts_for_script(conn: &Connection, script_id: &str) -> Result<()> {
    refresh_fts(conn, script_id)
}

fn row_to_summary(conn: &Connection, id: String) -> Result<ScriptSummary> {
    let s = conn
        .query_row(
            "SELECT id, title, highlighting_enabled, characters_meta,
                    created_at, updated_at, archived_at, page_count, summary
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
    let chars = reconcile_chars_from_content(&[], &content_json);
    let chars_json = serialize_chars_meta(&chars);
    conn.execute(
        "INSERT INTO scripts (id, title, highlighting_enabled, content_json, characters_meta,
                              created_at, updated_at, page_count)
         VALUES (?1, ?2, NULL, ?3, ?4, ?5, ?5, 1)",
        params![id, title, content_json, chars_json, now],
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
                    created_at, updated_at, archived_at, page_count, summary
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
    })
}

#[tauri::command]
pub fn update_script(
    app: AppHandle,
    db: State<Db>,
    input: UpdateScriptInput,
) -> Result<ScriptSummary> {
    let conn = db.conn()?;
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

    if let Some(title) = &input.title {
        conn.execute(
            "UPDATE scripts SET title = ?1, updated_at = ?2 WHERE id = ?3",
            params![title, now, input.id],
        )?;
    }
    if let Some(hl) = &input.highlighting_enabled {
        conn.execute(
            "UPDATE scripts SET highlighting_enabled = ?1, updated_at = ?2 WHERE id = ?3",
            params![hl, now, input.id],
        )?;
    }
    if let Some(content_json) = &input.content_json {
        // Reconcile characters_meta against the new content.
        let existing_meta: String = conn.query_row(
            "SELECT characters_meta FROM scripts WHERE id = ?1",
            params![input.id],
            |r| r.get(0),
        )?;
        let existing = parse_chars_meta(&existing_meta);
        let chars = reconcile_chars_from_content(&existing, content_json);
        let chars_json = serialize_chars_meta(&chars);
        conn.execute(
            "UPDATE scripts SET content_json = ?1, characters_meta = ?2, updated_at = ?3 WHERE id = ?4",
            params![content_json, chars_json, now, input.id],
        )?;
    }
    if let Some(pc) = &input.page_count {
        conn.execute(
            "UPDATE scripts SET page_count = ?1 WHERE id = ?2",
            params![pc, input.id],
        )?;
    }
    if let Some(chars) = &input.characters {
        // Caller-supplied list (e.g. user edited a color) — overwrite directly.
        let chars_json = serialize_chars_meta(chars);
        conn.execute(
            "UPDATE scripts SET characters_meta = ?1, updated_at = ?2 WHERE id = ?3",
            params![chars_json, now, input.id],
        )?;
    }
    refresh_fts(&conn, &input.id)?;
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
    let conn = db.conn()?;
    conn.execute("DELETE FROM scripts WHERE id = ?1", params![id])?;
    delete_script_fts(&conn, &id)?;
    Ok(())
}

#[tauri::command]
pub fn empty_trash(db: State<Db>) -> Result<()> {
    let conn = db.conn()?;
    let mut stmt = conn.prepare("SELECT id FROM scripts WHERE archived_at IS NOT NULL")?;
    let ids: Vec<String> = stmt
        .query_map([], |r| r.get::<_, String>(0))?
        .filter_map(|r| r.ok())
        .collect();
    drop(stmt);
    for id in ids {
        conn.execute("DELETE FROM scripts WHERE id = ?1", params![id])?;
        delete_script_fts(&conn, &id)?;
    }
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
                              created_at, updated_at, page_count)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, ?7)",
        params![
            new_id,
            new_title,
            src.highlighting_enabled,
            src.content_json,
            chars_json,
            now,
            src.page_count,
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
