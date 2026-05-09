use rusqlite::{params, Connection};

use crate::error::Result;

// `sanitize_fts_query` moved to TS in Migration Phase 6.

pub fn upsert_script_fts(
    conn: &Connection,
    script_id: &str,
    title: &str,
    content_text: &str,
) -> Result<()> {
    conn.execute(
        "DELETE FROM scripts_fts WHERE script_id = ?1",
        params![script_id],
    )?;
    conn.execute(
        "INSERT INTO scripts_fts (script_id, title, content_text) VALUES (?1, ?2, ?3)",
        params![script_id, title, content_text],
    )?;
    Ok(())
}

pub fn delete_script_fts(conn: &Connection, script_id: &str) -> Result<()> {
    conn.execute(
        "DELETE FROM scripts_fts WHERE script_id = ?1",
        params![script_id],
    )?;
    Ok(())
}
