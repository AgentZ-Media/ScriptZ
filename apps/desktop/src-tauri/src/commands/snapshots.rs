use rusqlite::{params, OptionalExtension};
use tauri::State;

use crate::db::{new_id, now_ms, Db};
use crate::error::{Result, ScriptzError};
use crate::models::{Snapshot, SnapshotMeta};

const MAX_SNAPSHOTS_PER_SCRIPT: i64 = 50;

#[tauri::command]
pub fn create_snapshot(db: State<Db>, script_id: String, trigger: String) -> Result<SnapshotMeta> {
    let mut conn = db.conn()?;
    let trigger = if trigger == "manual" { "manual" } else { "auto" };
    let cj: String = conn
        .query_row(
            "SELECT content_json FROM scripts WHERE id = ?1",
            params![script_id],
            |r| r.get(0),
        )
        .optional()?
        .ok_or_else(|| ScriptzError::NotFound(format!("script {script_id}")))?;
    let id = new_id();
    let now = now_ms();
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO snapshots (id, script_id, content_json, trigger, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, script_id, cj, trigger, now],
    )?;
    // Cap to MAX_SNAPSHOTS_PER_SCRIPT, oldest first
    tx.execute(
        "DELETE FROM snapshots WHERE id IN (
            SELECT id FROM snapshots WHERE script_id = ?1
            ORDER BY created_at DESC
            LIMIT -1 OFFSET ?2
         )",
        params![script_id, MAX_SNAPSHOTS_PER_SCRIPT],
    )?;
    tx.commit()?;
    Ok(SnapshotMeta {
        id,
        script_id,
        trigger: trigger.to_string(),
        created_at: now,
    })
}

#[tauri::command]
pub fn list_snapshots(db: State<Db>, script_id: String) -> Result<Vec<SnapshotMeta>> {
    let conn = db.conn()?;
    let mut stmt = conn.prepare(
        "SELECT id, script_id, trigger, created_at FROM snapshots WHERE script_id = ?1 ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map(params![script_id], |r| {
        Ok(SnapshotMeta {
            id: r.get(0)?,
            script_id: r.get(1)?,
            trigger: r.get(2)?,
            created_at: r.get(3)?,
        })
    })?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

#[tauri::command]
pub fn get_snapshot(db: State<Db>, id: String) -> Result<Snapshot> {
    let conn = db.conn()?;
    conn.query_row(
        "SELECT id, script_id, content_json, trigger, created_at FROM snapshots WHERE id = ?1",
        params![id],
        |r| {
            Ok(Snapshot {
                id: r.get(0)?,
                script_id: r.get(1)?,
                content_json: r.get(2)?,
                trigger: r.get(3)?,
                created_at: r.get(4)?,
            })
        },
    )
    .optional()?
    .ok_or_else(|| ScriptzError::NotFound(format!("snapshot {id}")))
}

#[tauri::command]
pub fn restore_snapshot(db: State<Db>, snapshot_id: String) -> Result<()> {
    let mut conn = db.conn()?;
    let now = now_ms();
    let (script_id, content_json): (String, String) = conn
        .query_row(
            "SELECT script_id, content_json FROM snapshots WHERE id = ?1",
            params![snapshot_id],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
        )
        .optional()?
        .ok_or_else(|| ScriptzError::NotFound(format!("snapshot {snapshot_id}")))?;

    // Backup-snapshot + content overwrite + FTS refresh in one
    // transaction so we never end up with an orphan backup snapshot
    // pointing at content that wasn't actually replaced.
    let tx = conn.transaction()?;
    let cur_cj: String = tx.query_row(
        "SELECT content_json FROM scripts WHERE id = ?1",
        params![script_id],
        |r| r.get(0),
    )?;
    let backup_id = new_id();
    tx.execute(
        "INSERT INTO snapshots (id, script_id, content_json, trigger, created_at) VALUES (?1, ?2, ?3, 'auto', ?4)",
        params![backup_id, script_id, cur_cj, now],
    )?;
    tx.execute(
        "UPDATE scripts SET content_json = ?1, updated_at = ?2 WHERE id = ?3",
        params![content_json, now, script_id],
    )?;
    crate::commands::scripts::refresh_fts_for_script(&tx, &script_id)?;
    tx.commit()?;
    Ok(())
}

#[tauri::command]
pub fn delete_snapshot(db: State<Db>, id: String) -> Result<()> {
    let conn = db.conn()?;
    conn.execute("DELETE FROM snapshots WHERE id = ?1", params![id])?;
    Ok(())
}
