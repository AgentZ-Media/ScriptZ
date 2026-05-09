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

// Script model moved to TS in Migration Phase 7a (only get_script
// returned the full row)
// Folder model moved to TS in Migration Phase 4
// Snapshot + SnapshotMeta moved to TS in Migration Phase 5
// SearchHit moved to TS in Migration Phase 6
// CreateScriptInput moved to TS in Migration Phase 7b
// ListScriptsQuery moved to TS in Migration Phase 7a

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
