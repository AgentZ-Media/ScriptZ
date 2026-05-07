use rusqlite::params;
use tauri::State;

use crate::db::Db;
use crate::error::Result;

#[tauri::command]
pub fn get_app_state(db: State<Db>, key: String) -> Result<Option<String>> {
    let conn = db.conn()?;
    let v: Option<String> = conn
        .query_row(
            "SELECT value FROM app_state WHERE key = ?1",
            params![key],
            |r| r.get(0),
        )
        .ok();
    Ok(v)
}

#[tauri::command]
pub fn set_app_state(db: State<Db>, key: String, value: String) -> Result<()> {
    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO app_state (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}
