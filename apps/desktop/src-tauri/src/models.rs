use serde::{Deserialize, Serialize};

/// A character that exists only within a single script.
/// Derived from the script's content (Character blocks) and persisted as JSON
/// in `scripts.characters_meta`. Color is sticky once assigned.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptCharacter {
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptSummary {
    pub id: String,
    pub title: String,
    pub highlighting_enabled: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
    pub archived_at: Option<i64>,
    pub page_count: i64,
    pub characters: Vec<ScriptCharacter>,
    pub summary: Option<String>,
    pub folder_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Script {
    pub id: String,
    pub title: String,
    pub highlighting_enabled: Option<i64>,
    pub content_json: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub archived_at: Option<i64>,
    pub page_count: i64,
    pub characters: Vec<ScriptCharacter>,
    pub summary: Option<String>,
    pub folder_id: Option<String>,
}

// Folder model moved to TS in Migration Phase 4

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snapshot {
    pub id: String,
    pub script_id: String,
    pub content_json: String,
    pub trigger: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotMeta {
    pub id: String,
    pub script_id: String,
    pub trigger: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateScriptInput {
    pub title: Option<String>,
    pub initial_content_json: Option<String>,
    pub folder_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateScriptInput {
    pub id: String,
    pub title: Option<String>,
    pub highlighting_enabled: Option<Option<i64>>,
    pub content_json: Option<String>,
    pub page_count: Option<i64>,
    /// Replace the per-script character list. Names are matched case-insensitively
    /// against existing entries to preserve color stickiness.
    pub characters: Option<Vec<ScriptCharacter>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchHit {
    pub kind: String,
    pub id: String,
    pub title: String,
    pub snippet: String,
    pub meta: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListScriptsQuery {
    pub include_archived: Option<bool>,
    pub only_archived: Option<bool>,
    pub sort: Option<String>,
    pub query: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    /// When `Some(id)`, restrict to scripts in that folder. When `None`,
    /// no folder filter is applied (= "Alle"). There is no explicit
    /// "ungrouped" filter on purpose: the UI surfaces every script under
    /// "Alle" and individual folders, nothing in between.
    pub folder_id: Option<String>,
}
