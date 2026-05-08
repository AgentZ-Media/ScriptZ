// App-wide character-colour records.
//
// Two columns per name:
//   - `default_color`: the colour the palette assigned the very first time
//     a script saved with this character. Set once, then never modified.
//     This is what "Standard" means everywhere in the app.
//   - `override_color`: nullable manual override picked by the writer.
//     When set, it wins over `default_color` and gets propagated into
//     every script's `characters_meta`.
//
// Both writes leave `scripts.updated_at` alone — colour swaps aren't
// content edits and shouldn't push the script up the "last edited" sort.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::scripts::{
    parse_chars_meta, serialize_chars_meta, upsert_default_color,
};
use crate::db::{now_ms, Db};
use crate::error::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharacterColorRecord {
    pub name: String,
    pub default_color: Option<String>,
    pub override_color: Option<String>,
    pub updated_at: i64,
}

#[tauri::command]
pub fn list_character_colors(db: State<Db>) -> Result<Vec<CharacterColorRecord>> {
    let conn = db.conn()?;
    let mut stmt = conn.prepare(
        "SELECT name, default_color, override_color, updated_at
         FROM character_colors ORDER BY name",
    )?;
    let rows: Vec<CharacterColorRecord> = stmt
        .query_map([], |r| {
            Ok(CharacterColorRecord {
                name: r.get(0)?,
                default_color: r.get(1)?,
                override_color: r.get(2)?,
                updated_at: r.get(3)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

/// Find every script whose `characters_meta` contains the given name and
/// return `(id, content_json, characters_meta)` for each. Uses the
/// JSON-quoted-name LIKE prefilter to skip rows that obviously don't
/// reference the character without deserialising every row.
fn affected_scripts(
    conn: &Connection,
    name_upper: &str,
) -> Result<Vec<(String, String, String)>> {
    let like = format!("%\"{}\"%", name_upper.replace('"', "\"\""));
    let mut stmt = conn.prepare(
        "SELECT id, content_json, characters_meta FROM scripts
         WHERE characters_meta LIKE ?1 COLLATE NOCASE",
    )?;
    let rows = stmt
        .query_map(params![like], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
            ))
        })?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

/// Pick the next palette colour that's not already claimed in the given
/// script's `characters_meta` (excluding the name we're picking for).
/// Used as the last-resort fallback when both `default_color` and
/// `override_color` are missing.
fn pick_palette_in_script(
    existing: &[crate::models::ScriptCharacter],
    skip_name: &str,
) -> String {
    use std::collections::HashSet;
    let used: HashSet<&str> = existing
        .iter()
        .filter(|c| !c.name.eq_ignore_ascii_case(skip_name))
        .map(|c| c.color.as_str())
        .collect();
    crate::commands::scripts::DEFAULT_PALETTE
        .iter()
        .find(|p| !used.contains(*p))
        .copied()
        .unwrap_or(crate::commands::scripts::DEFAULT_PALETTE[0])
        .to_string()
}

/// Set the manual override for a name and propagate it to every script's
/// `characters_meta`. Returns the IDs of scripts that actually changed so
/// the frontend can decide what to refetch.
#[tauri::command]
pub fn set_character_color(db: State<Db>, name: String, color: String) -> Result<Vec<String>> {
    let trimmed = name.trim().to_uppercase();
    let color = color.trim().to_string();
    if trimmed.is_empty() || color.is_empty() {
        return Ok(vec![]);
    }
    let mut conn = db.conn()?;
    let now = now_ms();
    let tx = conn.transaction()?;

    // Upsert override; leave default_color alone (it's the write-once
    // record of what the palette originally chose for this name).
    tx.execute(
        "INSERT INTO character_colors (name, override_color, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(name) DO UPDATE SET
           override_color = excluded.override_color,
           updated_at = excluded.updated_at",
        params![trimmed, color, now],
    )?;

    let mut changed_ids: Vec<String> = Vec::new();
    for (id, _content_json, meta_raw) in affected_scripts(&tx, &trimmed)? {
        let mut chars = parse_chars_meta(&meta_raw);
        let mut touched = false;
        for c in chars.iter_mut() {
            if c.name.eq_ignore_ascii_case(&trimmed) && c.color != color {
                c.color = color.clone();
                touched = true;
            }
        }
        if !touched {
            continue;
        }
        let new_meta = serialize_chars_meta(&chars);
        tx.execute(
            "UPDATE scripts SET characters_meta = ?1 WHERE id = ?2",
            params![new_meta, id],
        )?;
        changed_ids.push(id);
    }

    tx.commit()?;
    Ok(changed_ids)
}

/// Drop the manual override and fall back to the recorded
/// `default_color`. If no default has been recorded yet (legacy data, or
/// a name we've never seen go through reconcile), pick a palette colour
/// in the *active* script's context, register it as the new default, and
/// propagate it to every script — so the same name lands on the same
/// colour everywhere from then on.
#[tauri::command]
pub fn clear_character_color(
    db: State<Db>,
    name: String,
    active_script_id: Option<String>,
) -> Result<Vec<String>> {
    let trimmed = name.trim().to_uppercase();
    if trimmed.is_empty() {
        return Ok(vec![]);
    }
    let mut conn = db.conn()?;
    let now = now_ms();
    let tx = conn.transaction()?;

    // Read the current record (if any) before mutating, so we know
    // whether a default already exists.
    let existing_default: Option<String> = tx
        .query_row(
            "SELECT default_color FROM character_colors WHERE name = ?1 COLLATE NOCASE",
            params![trimmed],
            |r| r.get::<_, Option<String>>(0),
        )
        .unwrap_or(None);

    // Clear the override but keep the default. UPDATE returns 0 if no row
    // existed — that's fine, we still proceed in case characters_meta
    // entries need the default propagated.
    tx.execute(
        "UPDATE character_colors SET override_color = NULL, updated_at = ?1
         WHERE name = ?2 COLLATE NOCASE",
        params![now, trimmed],
    )?;

    // Resolve the colour we're going to apply. If a default exists, use
    // it. Otherwise pick a palette colour in the active script's context
    // (or any affected script if no active context was passed) so we can
    // register a default and converge.
    let affected = affected_scripts(&tx, &trimmed)?;
    let target_color: String = if let Some(d) = existing_default.clone() {
        d
    } else {
        // Pick a palette colour. Prefer the active script's context; fall
        // back to the first affected script; fall back to palette[0] if
        // no script holds the name at all (no-op anyway).
        let context_meta: Option<&String> = active_script_id
            .as_ref()
            .and_then(|id| affected.iter().find(|(sid, _, _)| sid == id))
            .or_else(|| affected.first())
            .map(|(_, _, meta)| meta);

        let picked = if let Some(meta) = context_meta {
            let existing = parse_chars_meta(meta);
            pick_palette_in_script(&existing, &trimmed)
        } else {
            crate::commands::scripts::DEFAULT_PALETTE[0].to_string()
        };
        // Register so future scripts (and future resets) use it too.
        upsert_default_color(&tx, &trimmed, &picked, now)?;
        picked
    };

    let mut changed_ids: Vec<String> = Vec::new();
    for (id, _content_json, meta_raw) in affected {
        let mut chars = parse_chars_meta(&meta_raw);
        let mut touched = false;
        for c in chars.iter_mut() {
            if c.name.eq_ignore_ascii_case(&trimmed) && c.color != target_color {
                c.color = target_color.clone();
                touched = true;
            }
        }
        if !touched {
            continue;
        }
        let new_meta = serialize_chars_meta(&chars);
        tx.execute(
            "UPDATE scripts SET characters_meta = ?1 WHERE id = ?2",
            params![new_meta, id],
        )?;
        changed_ids.push(id);
    }

    tx.commit()?;
    Ok(changed_ids)
}
