use rusqlite::{params, OptionalExtension};
use tauri::State;

use crate::db::{new_id, now_ms, Db};
use crate::error::{Result, ScriptzError};
use crate::models::Folder;

fn row_to_folder(
    id: String,
    name: String,
    created_at: i64,
    updated_at: i64,
    script_count: i64,
) -> Folder {
    Folder { id, name, created_at, updated_at, script_count }
}

/// Count of all live (non-archived) scripts. Used by the "Alle"-chip in
/// the Browser, where summing per-folder counts would miss scripts that
/// don't belong to any folder.
#[tauri::command]
pub fn count_live_scripts(db: State<Db>) -> Result<i64> {
    let conn = db.conn()?;
    let n: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM scripts WHERE archived_at IS NULL",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    Ok(n)
}

#[tauri::command]
pub fn list_folders(db: State<Db>) -> Result<Vec<Folder>> {
    let conn = db.conn()?;
    // Counts only live (non-archived) scripts so the chip number matches
    // what the user sees in the grid. Archived items go to Papierkorb,
    // not into folder counts.
    let mut stmt = conn.prepare(
        "SELECT f.id, f.name, f.created_at, f.updated_at,
                (SELECT COUNT(*) FROM scripts s
                  WHERE s.folder_id = f.id AND s.archived_at IS NULL) AS cnt
         FROM folders f
         ORDER BY f.name COLLATE NOCASE ASC",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(row_to_folder(
            r.get(0)?,
            r.get(1)?,
            r.get(2)?,
            r.get(3)?,
            r.get(4)?,
        ))
    })?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

#[tauri::command]
pub fn create_folder(db: State<Db>, name: String) -> Result<Folder> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(ScriptzError::Other("folder name must not be empty".into()));
    }
    let conn = db.conn()?;
    let id = new_id();
    let now = now_ms();
    conn.execute(
        "INSERT INTO folders (id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)",
        params![id, trimmed, now],
    )?;
    Ok(Folder {
        id,
        name: trimmed.to_string(),
        created_at: now,
        updated_at: now,
        script_count: 0,
    })
}

#[tauri::command]
pub fn rename_folder(db: State<Db>, id: String, name: String) -> Result<Folder> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(ScriptzError::Other("folder name must not be empty".into()));
    }
    let conn = db.conn()?;
    let now = now_ms();
    let updated = conn.execute(
        "UPDATE folders SET name = ?1, updated_at = ?2 WHERE id = ?3",
        params![trimmed, now, id],
    )?;
    if updated == 0 {
        return Err(ScriptzError::NotFound(format!("folder {id}")));
    }
    let cnt: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM scripts WHERE folder_id = ?1 AND archived_at IS NULL",
            params![id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let created_at: i64 = conn
        .query_row("SELECT created_at FROM folders WHERE id = ?1", params![id], |r| r.get(0))
        .optional()?
        .unwrap_or(now);
    Ok(Folder {
        id,
        name: trimmed.to_string(),
        created_at,
        updated_at: now,
        script_count: cnt,
    })
}

#[tauri::command]
pub fn delete_folder(db: State<Db>, id: String) -> Result<()> {
    // FK ON DELETE SET NULL takes care of orphaned scripts — they reappear
    // in "Alle" without their folder_id. No cascading delete of scripts
    // (that would be confusing and there's no UNDO for it).
    let conn = db.conn()?;
    let removed = conn.execute("DELETE FROM folders WHERE id = ?1", params![id])?;
    if removed == 0 {
        return Err(ScriptzError::NotFound(format!("folder {id}")));
    }
    Ok(())
}

#[tauri::command]
pub fn move_script(db: State<Db>, script_id: String, folder_id: Option<String>) -> Result<()> {
    let conn = db.conn()?;
    if let Some(fid) = &folder_id {
        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM folders WHERE id = ?1",
                params![fid],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if exists == 0 {
            return Err(ScriptzError::NotFound(format!("folder {fid}")));
        }
    }
    let now = now_ms();
    let updated = conn.execute(
        "UPDATE scripts SET folder_id = ?1, updated_at = ?2 WHERE id = ?3",
        params![folder_id, now, script_id],
    )?;
    if updated == 0 {
        return Err(ScriptzError::NotFound(format!("script {script_id}")));
    }
    Ok(())
}

#[tauri::command]
pub fn move_scripts(
    db: State<Db>,
    script_ids: Vec<String>,
    folder_id: Option<String>,
) -> Result<()> {
    if script_ids.is_empty() {
        return Ok(());
    }
    let mut conn = db.conn()?;
    if let Some(fid) = &folder_id {
        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM folders WHERE id = ?1",
                params![fid],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if exists == 0 {
            return Err(ScriptzError::NotFound(format!("folder {fid}")));
        }
    }
    let now = now_ms();
    let tx = conn.transaction()?;
    for sid in &script_ids {
        tx.execute(
            "UPDATE scripts SET folder_id = ?1, updated_at = ?2 WHERE id = ?3",
            params![folder_id, now, sid],
        )?;
    }
    tx.commit()?;
    Ok(())
}
