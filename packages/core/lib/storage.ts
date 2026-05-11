// High-Level Storage-Adapter fuer @scriptz/core.
//
// Sitzt eine Etage ueber DbConnection (siehe ./platform.ts): waehrend
// DbConnection den rohen `select`/`execute`-Zugriff abstrahiert (gut
// fuer sql.js auf Web, plugin-sql auf Desktop), bietet StorageAdapter
// typisierte CRUD-Methoden - "createScript", "listFolders" etc.
//
// Warum zwei Ebenen?
//  - Phase A hat DbConnection fuer den Desktop ausreichend gemacht;
//    Core kann SQL gegen die Tauri-Database absetzen, ohne Tauri zu
//    kennen.
//  - Aber sobald die Web-Variante mit IndexedDB / Dexie kommt, kann
//    der Adapter SQL nicht parsen. Die Wahl: entweder sql.js laden
//    (DbConnection-kompatibel, ~1 MB WASM) ODER einen eigenen Web-
//    StorageAdapter registrieren, der direkt gegen Dexie geht.
//  - Diese Datei haelt den Auswahlpunkt offen, ohne sich heute
//    festzulegen. Default-Registrierung ist die SQL-basierte
//    api-Facade aus ./api.ts.
//
// Der `api`-Export aus ./api.ts ist ein Proxy auf
// `getStorageAdapter()`, sodass Bestandscode (19 Call-Sites) ohne
// Anpassung weiterlaeuft, aber ein spaeterer
// `setStorageAdapter(webImpl)` sofort durchgreift.

import type {
  CharacterColorRecord,
  DailyStatsSummary,
  DailyWordEntry,
  Folder,
  Idea,
  Script,
  ScriptCharacter,
  ScriptSummary,
  SearchHit,
  Snapshot,
  SnapshotMeta,
} from "./types";

export interface CreateScriptInput {
  title?: string;
  initialContentJson?: string;
  folderId?: string | null;
}

export interface UpdateScriptInput {
  id: string;
  title?: string;
  highlightingEnabled?: number | null;
  contentJson?: string;
  characters?: ScriptCharacter[];
}

export interface ListScriptsQuery {
  includeArchived?: boolean;
  onlyArchived?: boolean;
  sort?: "updated" | "created" | "title";
  query?: string;
  limit?: number;
  offset?: number;
  folderId?: string | null;
}

export interface CreateIdeaInput {
  title: string;
  notes?: string;
}

export interface UpdateIdeaInput {
  id: string;
  title?: string;
  notes?: string;
}

export interface ConvertIdeaInput {
  ideaId: string;
  folderId?: string | null;
  notesAsAction?: boolean;
}

export interface ExportPdfRequest {
  scriptId: string;
  includeHighlighting: boolean;
  includeTitlePage: boolean;
}

export interface ExportPlaintextRequest {
  scriptId: string;
}

export interface ExportResult {
  /** True wenn der User abgebrochen hat (Desktop: Save-Dialog cancel).
   *  Caller sollten dann keinen "Export gespeichert"-Toast zeigen. */
  cancelled: boolean;
  /** Absoluter Pfad bei Desktop, null im Browser. */
  path: string | null;
}

export interface StorageAdapter {
  // ===== Scripts =====
  createScript(input: CreateScriptInput): Promise<ScriptSummary>;
  getScript(id: string): Promise<Script>;
  updateScript(input: UpdateScriptInput): Promise<ScriptSummary>;
  listScripts(query?: ListScriptsQuery): Promise<ScriptSummary[]>;
  archiveScript(id: string): Promise<void>;
  restoreScript(id: string): Promise<void>;
  purgeScript(id: string): Promise<void>;
  emptyTrash(): Promise<void>;
  duplicateScript(id: string): Promise<ScriptSummary>;
  renameScript(id: string, title: string): Promise<ScriptSummary>;
  backfillRuntimeStats(): Promise<void>;

  // ===== Folders =====
  listFolders(): Promise<Folder[]>;
  countLiveScripts(): Promise<number>;
  createFolder(name: string): Promise<Folder>;
  renameFolder(id: string, name: string): Promise<Folder>;
  deleteFolder(id: string): Promise<void>;
  moveScript(scriptId: string, folderId: string | null): Promise<void>;
  moveScripts(scriptIds: string[], folderId: string | null): Promise<void>;

  // ===== Snapshots =====
  createSnapshot(scriptId: string, trigger: "auto" | "manual"): Promise<SnapshotMeta>;
  listSnapshots(scriptId: string): Promise<SnapshotMeta[]>;
  getSnapshot(id: string): Promise<Snapshot>;
  restoreSnapshot(snapshotId: string): Promise<void>;
  deleteSnapshot(id: string): Promise<void>;

  // ===== Search =====
  globalSearch(query: string, limit?: number): Promise<SearchHit[]>;

  // ===== Settings + App-State =====
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
  getAppState(key: string): Promise<string | null>;
  setAppState(key: string, value: string): Promise<void>;

  // ===== Character-Colors =====
  listCharacterColors(): Promise<CharacterColorRecord[]>;
  setCharacterColor(name: string, color: string): Promise<string[]>;
  /** Clear the manual override and fall back to the recorded default.
   * `activeScriptId` is the palette context used when no default has
   * been recorded yet - so the freshly-picked colour avoids colliding
   * with other characters in the script the writer is currently looking
   * at. */
  clearCharacterColor(name: string, activeScriptId?: string): Promise<string[]>;

  // ===== Export (delegiert intern an PlatformAdapter) =====
  exportPdf(input: ExportPdfRequest): Promise<ExportResult>;
  exportPlaintext(input: ExportPlaintextRequest): Promise<ExportResult>;
  /** Schreibt das Skript als .scriptz-Datei raus (Blob-Download im Web,
   *  Save-Dialog auf Desktop). Phase G. */
  exportScriptz(scriptId: string): Promise<ExportResult>;
  /** Liest eine .scriptz-Datei vom User (Open-Dialog) und legt ein neues
   *  Skript daraus an. Returns null wenn der User abbricht. */
  importScriptz(): Promise<{ scriptId: string; title: string } | null>;

  // ===== Ideen-Inbox =====
  listIdeas(): Promise<Idea[]>;
  createIdea(input: CreateIdeaInput): Promise<Idea>;
  updateIdea(input: UpdateIdeaInput): Promise<Idea>;
  deleteIdea(id: string): Promise<void>;
  convertIdeaToScript(
    input: ConvertIdeaInput,
  ): Promise<{ idea: Idea; script: ScriptSummary }>;

  // ===== Schreibstatistik =====
  loadDailyWords(days?: number): Promise<DailyWordEntry[]>;
  loadDailyStats(): Promise<DailyStatsSummary>;
}

let adapter: StorageAdapter | null = null;

/** Register the high-level storage adapter. Called once at app
 * startup. On Desktop the SQL-backed `api` default registers itself.
 * Web build can register a Dexie- or sql.js-backed alternative. */
export function setStorageAdapter(a: StorageAdapter): void {
  adapter = a;
}

export function getStorageAdapter(): StorageAdapter {
  if (!adapter) {
    throw new Error(
      "Storage adapter not set. Make sure @scriptz/core/lib/api was imported (or a custom adapter registered) before this call.",
    );
  }
  return adapter;
}
