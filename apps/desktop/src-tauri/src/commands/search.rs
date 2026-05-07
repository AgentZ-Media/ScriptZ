use rusqlite::params;
use tauri::State;

use crate::db::Db;
use crate::error::Result;
use crate::fts::sanitize_fts_query;
use crate::models::SearchHit;

#[tauri::command]
pub fn global_search(db: State<Db>, query: String, limit: Option<i64>) -> Result<Vec<SearchHit>> {
    let limit = limit.unwrap_or(50).clamp(1, 200);
    let q = sanitize_fts_query(&query);
    if q.is_empty() {
        return Ok(vec![]);
    }
    let conn = db.conn()?;
    let mut out: Vec<SearchHit> = Vec::new();

    let sql = "SELECT s.id, s.title,
                      snippet(scripts_fts, 1, '<mark>', '</mark>', '…', 8) AS snip,
                      s.updated_at
               FROM scripts_fts f
               JOIN scripts s ON s.id = f.script_id
               WHERE scripts_fts MATCH ?1 AND s.archived_at IS NULL
               ORDER BY bm25(scripts_fts) ASC
               LIMIT ?2";
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map(params![q, limit], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, String>(2)?,
            r.get::<_, i64>(3)?,
        ))
    })?;
    for row in rows {
        let (id, title, snippet, updated_at) = row?;
        out.push(SearchHit {
            kind: "script".into(),
            id,
            title,
            snippet,
            meta: serde_json::json!({ "updated_at": updated_at }),
        });
    }

    Ok(out)
}
