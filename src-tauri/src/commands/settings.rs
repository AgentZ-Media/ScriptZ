use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::Db;
use crate::error::Result;

#[derive(Debug, Serialize, Deserialize)]
pub struct SettingEntry {
    pub key: String,
    pub value: String,
}

#[tauri::command]
pub fn get_setting(db: State<Db>, key: String) -> Result<Option<String>> {
    let conn = db.conn()?;
    let v: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![key],
            |r| r.get(0),
        )
        .ok();
    Ok(v)
}

#[tauri::command]
pub fn set_setting(db: State<Db>, key: String, value: String) -> Result<()> {
    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

#[tauri::command]
pub fn list_settings(db: State<Db>) -> Result<Vec<SettingEntry>> {
    let conn = db.conn()?;
    let mut stmt = conn.prepare("SELECT key, value FROM settings ORDER BY key")?;
    let rows = stmt.query_map([], |r| {
        Ok(SettingEntry {
            key: r.get(0)?,
            value: r.get(1)?,
        })
    })?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}
