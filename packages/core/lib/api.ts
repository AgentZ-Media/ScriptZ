import {
  clearCharacterColor as ccClear,
  listCharacterColors as ccList,
  setCharacterColor as ccSet,
} from "./characterColors";
import { extractTeleprompterText } from "./lex";
import { getPlatformAdapter } from "./platform";
import {
  defaultScriptzFilename,
  parseScriptzBytes,
  SCRIPTZ_EXTENSION,
  SCRIPTZ_MIME,
  serializeScriptToBytes,
} from "./scriptzFile";
import {
  getStorageAdapter,
  setStorageAdapter,
  type ExportResult,
  type StorageAdapter,
} from "./storage";
import {
  getAppState as dbGetAppState,
  getSetting as dbGetSetting,
  setAppState as dbSetAppState,
  setSetting as dbSetSetting,
} from "./db";
import {
  countLiveScripts as foldersCountLive,
  createFolder as foldersCreate,
  deleteFolder as foldersDelete,
  listFolders as foldersList,
  moveScript as foldersMoveScript,
  moveScripts as foldersMoveScripts,
  renameFolder as foldersRename,
} from "./folders";
import {
  convertIdeaToScript as ideasConvert,
  createIdea as ideasCreate,
  deleteIdea as ideasDelete,
  listIdeas as ideasList,
  updateIdea as ideasUpdate,
} from "./ideas";
import {
  loadDailyWords as dwLoadEntries,
  loadStats as dwLoadStats,
} from "./dailyWords";
import { globalSearch as searchGlobal } from "./search";
import { t } from "../i18n";
import {
  archiveScript as scriptsArchive,
  backfillRuntimeStats as scriptsBackfillRuntime,
  createScript as scriptsCreate,
  duplicateScript as scriptsDuplicate,
  emptyTrash as scriptsEmptyTrash,
  getScript as scriptsGet,
  listScripts as scriptsList,
  purgeScript as scriptsPurge,
  renameScript as scriptsRename,
  restoreScript as scriptsRestore,
  updateScript as scriptsUpdate,
} from "./scripts";
import {
  createSnapshot as snapsCreate,
  deleteSnapshot as snapsDelete,
  getSnapshot as snapsGet,
  listSnapshots as snapsList,
  restoreSnapshot as snapsRestore,
} from "./snapshots";
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

// SQL-basierte Default-Implementierung des StorageAdapter. Geht ueber
// die lib/*-Module, die via DbConnection (siehe ./platform.ts) Tauris
// plugin-sql bzw. eine sql.js-Instanz im Web ansprechen.
//
// Bei Modul-Load wird sie via `setStorageAdapter()` als aktiver Adapter
// registriert. Der `api`-Export unten ist ein Proxy auf
// `getStorageAdapter()`, damit ein spaeterer `setStorageAdapter(dexieImpl)`
// auf der Web-Seite sofort durchgreift, ohne die 19 Call-Sites von `api`
// einzeln umstellen zu muessen.
const sqlBackedAdapter: StorageAdapter = {
  // Scripts - fully TS-side since Migration Phase 7d.
  async createScript(input: {
    title?: string;
    initialContentJson?: string;
    folderId?: string | null;
  }): Promise<ScriptSummary> {
    return scriptsCreate(
      input.title ?? null,
      input.initialContentJson ?? null,
      input.folderId ?? null,
    );
  },
  async getScript(id: string): Promise<Script> {
    return scriptsGet(id);
  },
  async updateScript(input: {
    id: string;
    title?: string;
    highlightingEnabled?: number | null;
    contentJson?: string;
    characters?: ScriptCharacter[];
  }): Promise<ScriptSummary> {
    return scriptsUpdate(input);
  },
  async listScripts(query: {
    includeArchived?: boolean;
    onlyArchived?: boolean;
    sort?: "updated" | "created" | "title";
    query?: string;
    limit?: number;
    offset?: number;
    folderId?: string | null;
  } = {}): Promise<ScriptSummary[]> {
    return scriptsList({
      includeArchived: query.includeArchived ?? null,
      onlyArchived: query.onlyArchived ?? null,
      sort: query.sort ?? null,
      query: query.query ?? null,
      limit: query.limit ?? null,
      offset: query.offset ?? null,
      folderId: query.folderId ?? null,
    });
  },
  async archiveScript(id: string): Promise<void> {
    return scriptsArchive(id);
  },
  async restoreScript(id: string): Promise<void> {
    return scriptsRestore(id);
  },
  async purgeScript(id: string): Promise<void> {
    return scriptsPurge(id);
  },
  async emptyTrash(): Promise<void> {
    return scriptsEmptyTrash();
  },
  async duplicateScript(id: string): Promise<ScriptSummary> {
    return scriptsDuplicate(id);
  },
  async renameScript(id: string, title: string): Promise<ScriptSummary> {
    return scriptsRename(id, title);
  },
  async backfillRuntimeStats(): Promise<void> {
    return scriptsBackfillRuntime();
  },

  // Folders - TS-side via plugin-sql since Migration Phase 4.
  async listFolders(): Promise<Folder[]> {
    return foldersList();
  },
  async countLiveScripts(): Promise<number> {
    return foldersCountLive();
  },
  async createFolder(name: string): Promise<Folder> {
    return foldersCreate(name);
  },
  async renameFolder(id: string, name: string): Promise<Folder> {
    return foldersRename(id, name);
  },
  async deleteFolder(id: string): Promise<void> {
    return foldersDelete(id);
  },
  async moveScript(scriptId: string, folderId: string | null): Promise<void> {
    return foldersMoveScript(scriptId, folderId);
  },
  async moveScripts(scriptIds: string[], folderId: string | null): Promise<void> {
    return foldersMoveScripts(scriptIds, folderId);
  },

  // Snapshots - TS-side via plugin-sql since Migration Phase 5.
  async createSnapshot(scriptId: string, trigger: "auto" | "manual"): Promise<SnapshotMeta> {
    return snapsCreate(scriptId, trigger);
  },
  async listSnapshots(scriptId: string): Promise<SnapshotMeta[]> {
    return snapsList(scriptId);
  },
  async getSnapshot(id: string): Promise<Snapshot> {
    return snapsGet(id);
  },
  async restoreSnapshot(snapshotId: string): Promise<void> {
    return snapsRestore(snapshotId);
  },
  async deleteSnapshot(id: string): Promise<void> {
    return snapsDelete(id);
  },

  // Search - TS-side via plugin-sql since Migration Phase 6.
  async globalSearch(query: string, limit = 50): Promise<SearchHit[]> {
    return searchGlobal(query, limit);
  },

  // Settings - TS-side via plugin-sql since Migration Phase 2.
  async getSetting(key: string): Promise<string | null> {
    return dbGetSetting(key);
  },
  async setSetting(key: string, value: string): Promise<void> {
    return dbSetSetting(key, value);
  },

  // App-State - TS-side via plugin-sql since Migration Phase 2.
  async getAppState(key: string): Promise<string | null> {
    return dbGetAppState(key);
  },
  async setAppState(key: string, value: string): Promise<void> {
    return dbSetAppState(key, value);
  },

  // Character-colour records (app-wide) - TS-side via plugin-sql since
  // Migration Phase 3.
  async listCharacterColors(): Promise<CharacterColorRecord[]> {
    return ccList();
  },
  async setCharacterColor(name: string, color: string): Promise<string[]> {
    return ccSet(name, color);
  },
  /** Clear the manual override and fall back to the recorded default. The
   * `activeScriptId` is the palette context used when no default has been
   * recorded yet - so the freshly-picked colour avoids colliding with
   * other characters in the script the writer is currently looking at. */
  async clearCharacterColor(
    name: string,
    activeScriptId?: string,
  ): Promise<string[]> {
    return ccClear(name, activeScriptId ?? null);
  },

  // Export - seit Phase 2F vollstaendig in core: PDF-Bytes-Build via
  // pdf-lib (browser-tauglich, siehe ./exportPdf.ts), Plaintext via
  // extractTeleprompterText. Der PlatformAdapter schreibt die Bytes
  // raus - Desktop via Save-Dialog + plugin-fs, Web via Blob-Download.
  async exportPdf(input: {
    scriptId: string;
    includeHighlighting: boolean;
    includeTitlePage: boolean;
  }): Promise<ExportResult> {
    const s = await scriptsGet(input.scriptId);
    // pdf-lib + fontkit sind ~1 MB Bundle - lazy laden, damit der
    // App-Start nicht damit belastet wird. Nur wer wirklich PDF
    // exportiert, zahlt den Roundtrip einmal.
    const { buildPdfBytes } = await import("./exportPdf");
    const bytes = await buildPdfBytes(
      {
        title: s.title,
        contentJson: s.content_json,
        characters: s.characters ?? [],
      },
      {
        includeHighlighting: input.includeHighlighting,
        includeTitlePage: input.includeTitlePage,
      },
    );
    return getPlatformAdapter().saveAs(
      {
        suggestedName: `${s.title || t("common.untitled")}.pdf`,
        mimeType: "application/pdf",
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      },
      bytes,
    );
  },
  async exportPlaintext(input: { scriptId: string }): Promise<ExportResult> {
    const s = await scriptsGet(input.scriptId);
    const text = extractTeleprompterText(s.content_json);
    const bytes = new TextEncoder().encode(text);
    return getPlatformAdapter().saveAs(
      {
        suggestedName: `${s.title || t("common.untitled")}.txt`,
        mimeType: "text/plain;charset=utf-8",
        filters: [{ name: "Plain Text", extensions: ["txt"] }],
      },
      bytes,
    );
  },

  // .scriptz-Container (Phase 2G). Reine Pure-Function fuers Serialisieren
  // sitzt in ./scriptzFile.ts; hier nur die "Skript laden -> Bytes -> saveAs"-
  // Komposition. Importer-Pendant siehe importScriptz unten.
  async exportScriptz(scriptId: string): Promise<ExportResult> {
    const s = await scriptsGet(scriptId);
    const bytes = serializeScriptToBytes({
      title: s.title,
      content_json: s.content_json,
      characters: s.characters ?? [],
      highlighting_enabled: s.highlighting_enabled,
      created_at: s.created_at,
      updated_at: s.updated_at,
    });
    return getPlatformAdapter().saveAs(
      {
        suggestedName: defaultScriptzFilename(s.title),
        mimeType: SCRIPTZ_MIME,
        filters: [{ name: "ScriptZ-Datei", extensions: [SCRIPTZ_EXTENSION] }],
      },
      bytes,
    );
  },

  async importScriptz(): Promise<{ scriptId: string; title: string } | null> {
    const file = await getPlatformAdapter().openFile(
      `.${SCRIPTZ_EXTENSION},${SCRIPTZ_MIME}`,
    );
    if (!file) return null;
    const parsed = parseScriptzBytes(file.bytes);
    // contentJson kommt als Objekt zurueck (kein doppeltes Stringify im
    // Format), wir packen sie fuer createScript wieder in einen String -
    // die Skript-Tabelle haelt sie als TEXT.
    const created = await scriptsCreate(
      parsed.script.title,
      JSON.stringify(parsed.script.contentJson),
      null,
    );
    return { scriptId: created.id, title: created.title };
  },

  // Ideen-Inbox - eigenständige Tabelle, keine Berührung der Skript-CRUD.
  async listIdeas(): Promise<Idea[]> {
    return ideasList();
  },
  async createIdea(input: { title: string; notes?: string }): Promise<Idea> {
    return ideasCreate(input);
  },
  async updateIdea(input: { id: string; title?: string; notes?: string }): Promise<Idea> {
    return ideasUpdate(input);
  },
  async deleteIdea(id: string): Promise<void> {
    return ideasDelete(id);
  },
  async convertIdeaToScript(input: {
    ideaId: string;
    folderId?: string | null;
    notesAsAction?: boolean;
  }): Promise<{ idea: Idea; script: ScriptSummary }> {
    return ideasConvert(input);
  },

  // Tägliche Schreibstatistik (Streak / Heatmap / Tagesziel-Fortschritt).
  async loadDailyWords(days?: number): Promise<DailyWordEntry[]> {
    return dwLoadEntries(days);
  },
  async loadDailyStats(): Promise<DailyStatsSummary> {
    return dwLoadStats();
  },
};

// Default-Registrierung beim Modul-Load. Web-Builds koennen nach diesem
// Punkt `setStorageAdapter(webImpl)` aufrufen, um die SQL-Impl zu
// ersetzen - `api` (siehe unten) liest immer ueber `getStorageAdapter()`,
// also greift der Tausch sofort.
setStorageAdapter(sqlBackedAdapter);

// Proxy-Facade fuer Drop-in-Kompatibilitaet. Aelterer Code, der `import
// { api } from "@scriptz/core/lib/api"` macht und `api.getScript(id)`
// aufruft, geht hier durch zu `getStorageAdapter()` - also immer auf
// den aktuell registrierten Adapter. Funktionen werden an den Adapter
// gebunden, damit eventuelle `this`-Referenzen in einer custom-Impl
// funktionieren.
export const api: StorageAdapter = new Proxy({} as StorageAdapter, {
  get(_target, prop: string | symbol) {
    const a = getStorageAdapter() as unknown as Record<string | symbol, unknown>;
    const value = a[prop];
    return typeof value === "function" ? value.bind(a) : value;
  },
});
