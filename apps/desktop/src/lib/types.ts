// Mirror of src-tauri/src/models.rs

export interface ScriptCharacter {
  name: string;
  color: string;
}

export interface ScriptSummary {
  id: string;
  title: string;
  highlighting_enabled: number | null;
  created_at: number;
  updated_at: number;
  archived_at: number | null;
  page_count: number;
  characters: ScriptCharacter[];
  summary: string | null;
  folder_id: string | null;
}

export interface Script extends ScriptSummary {
  content_json: string;
}

export interface Folder {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
  script_count: number;
}

// ---- AI / OpenRouter ----

export interface AiState {
  enabled: boolean;
  has_api_key: boolean;
  model_id: string;
}

export interface AiModelInfo {
  id: string;
  name: string;
  description: string | null;
  context_length: number | null;
  prompt_price: string | null;
  completion_price: string | null;
}

export interface Snapshot {
  id: string;
  script_id: string;
  content_json: string;
  trigger: "auto" | "manual";
  created_at: number;
}

export interface SnapshotMeta {
  id: string;
  script_id: string;
  trigger: "auto" | "manual";
  created_at: number;
}

export interface SearchHit {
  kind: "script";
  id: string;
  title: string;
  snippet: string;
  meta: Record<string, unknown>;
}

export type BlockType =
  | "scriptz-action"
  | "scriptz-character"
  | "scriptz-dialog"
  | "scriptz-parenthetical"
  | "scriptz-camera"
  | "scriptz-caption"
  | "scriptz-sfx";
