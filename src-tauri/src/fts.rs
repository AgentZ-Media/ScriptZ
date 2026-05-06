use rusqlite::{params, Connection};

use crate::error::Result;

/// Sanitize FTS5 query: wrap each token in quotes (avoid syntax errors from
/// punctuation), append `*` to last token for prefix matching, fold to lower.
pub fn sanitize_fts_query(input: &str) -> String {
    use unicode_segmentation::UnicodeSegmentation;
    let s = input.trim().to_lowercase();
    if s.is_empty() {
        return String::new();
    }
    let words: Vec<String> = s
        .unicode_words()
        .filter(|w| !w.is_empty())
        .map(|w| {
            let escaped = w.replace('"', "\"\"");
            format!("\"{}\"", escaped)
        })
        .collect();
    if words.is_empty() {
        return String::new();
    }
    let mut joined: Vec<String> = Vec::with_capacity(words.len());
    let last_idx = words.len() - 1;
    for (i, w) in words.into_iter().enumerate() {
        if i == last_idx {
            joined.push(format!("{}*", w));
        } else {
            joined.push(w);
        }
    }
    joined.join(" ")
}

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
