// Mirror of src-tauri/src/models.rs

export interface ScriptCharacter {
  name: string;
  color: string;
}

export interface CharacterColorRecord {
  name: string;
  default_color: string | null;
  override_color: string | null;
  updated_at: number;
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

/** Eine Schreib-Idee aus dem Ideen-Drawer. `usedAt` markiert die
 *  Konvertierung in ein echtes Skript. */
export interface Idea {
  id: string;
  title: string;
  notes: string;
  created_at: number;
  used_at: number | null;
  script_id: string | null;
}

/** Ein Eintrag im täglichen Wortprotokoll. `date` ist im lokalen
 *  YYYY-MM-DD-Format (kein Zeitzonen-Drift). */
export interface DailyWordEntry {
  date: string;
  words_added: number;
}

/** Aggregierte Schreibstatistik fürs Home-Strip + Activity-Modal. */
export interface DailyStatsSummary {
  /** Wörter, die heute (lokale Mitternacht bis jetzt) addiert wurden. */
  wordsToday: number;
  /** Anzahl aufeinanderfolgender Schreibtage, endet heute oder gestern. */
  streakDays: number;
  /** 365-Tage-Verlauf, älterster zuerst, heute zuletzt. */
  dailyWords: number[];
  /** Anzahl Tage in den letzten 365 mit > 0 geschriebenen Wörtern. */
  activeDays: number;
  /** Summe Wörter im 365-Tage-Fenster. */
  totalWords: number;
}
