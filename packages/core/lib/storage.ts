// High-level storage adapter for @scriptz/core.
//
// Sits one layer above DbConnection (see ./platform.ts): while
// DbConnection abstracts raw `select`/`execute` access (good
// for sql.js on web, plugin-sql on desktop), StorageAdapter offers
// typed CRUD methods - "createScript", "listFolders" etc.
//
// Why two levels?
//  - Phase A made DbConnection sufficient for desktop;
//    core can issue SQL against the Tauri database without knowing
//    Tauri.
//  - But as soon as the web variant with IndexedDB / Dexie comes,
//    the adapter can't parse SQL. The choice: either load sql.js
//    (DbConnection-compatible, ~1 MB WASM) OR register a separate
//    web StorageAdapter that talks directly to Dexie.
//  - This file keeps the choice point open without committing
//    today. Default registration is the SQL-based
//    api facade from ./api.ts.
//
// The `api` export from ./api.ts is a proxy onto
// `getStorageAdapter()`, so existing code (19 call sites) keeps
// running without change, but a later
// `setStorageAdapter(webImpl)` immediately takes effect.

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
  /** Optional target folder (shared with scripts). NULL/undefined =
   *  no folder. */
  folderId?: string | null;
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
  /** True when the user cancelled (desktop: save dialog cancel).
   *  Callers should then not show an "export saved" toast. */
  cancelled: boolean;
  /** Absolute path on desktop, null in the browser. */
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

  // ===== Export (delegates internally to PlatformAdapter) =====
  exportPdf(input: ExportPdfRequest): Promise<ExportResult>;
  exportPlaintext(input: ExportPlaintextRequest): Promise<ExportResult>;
  /** Writes the script as a .scriptz file (blob download on web,
   *  save dialog on desktop). Phase G. */
  exportScriptz(scriptId: string): Promise<ExportResult>;
  /** Reads a .scriptz file from the user (open dialog) and creates a new
   *  script from it. Returns null if the user cancels. */
  importScriptz(): Promise<{ scriptId: string; title: string } | null>;

  // ===== Ideas inbox =====
  listIdeas(): Promise<Idea[]>;
  createIdea(input: CreateIdeaInput): Promise<Idea>;
  updateIdea(input: UpdateIdeaInput): Promise<Idea>;
  deleteIdea(id: string): Promise<void>;
  /** Moves an idea into a folder (or out of any folder when null).
   *  Shares the same folders as scripts. */
  moveIdea(ideaId: string, folderId: string | null): Promise<void>;
  convertIdeaToScript(
    input: ConvertIdeaInput,
  ): Promise<{ idea: Idea; script: ScriptSummary }>;

  // ===== Writing statistics =====
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
