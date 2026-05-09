use serde::{Deserialize, Serialize};

/// A character that exists only within a single script.
/// Derived from the script's content (Character blocks) and persisted as JSON
/// in `scripts.characters_meta`. Color is sticky once assigned.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptCharacter {
    pub name: String,
    pub color: String,
}

// Script + ScriptSummary + UpdateScriptInput + CreateScriptInput +
// ListScriptsQuery moved to TS in Migration Phase 7. ScriptCharacter
// stays put because commands/export.rs still deserialises
// `scripts.characters_meta` JSON via this type.
// Folder model moved to TS in Migration Phase 4.
// Snapshot + SnapshotMeta moved to TS in Migration Phase 5.
// SearchHit moved to TS in Migration Phase 6.
