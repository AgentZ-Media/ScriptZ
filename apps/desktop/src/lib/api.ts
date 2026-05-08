import { invoke } from "./tauri";
import {
  getAppState as dbGetAppState,
  getSetting as dbGetSetting,
  setAppState as dbSetAppState,
  setSetting as dbSetSetting,
} from "./db";
import type {
  AiModelInfo,
  AiState,
  CharacterColorRecord,
  Folder,
  Script,
  ScriptCharacter,
  ScriptSummary,
  SearchHit,
  Snapshot,
  SnapshotMeta,
} from "./types";

export const api = {
  // Scripts
  async createScript(input: {
    title?: string;
    initialContentJson?: string;
    folderId?: string | null;
  }): Promise<ScriptSummary> {
    return invoke("create_script", {
      input: {
        title: input.title ?? null,
        initial_content_json: input.initialContentJson ?? null,
        folder_id: input.folderId ?? null,
      },
    });
  },
  async getScript(id: string): Promise<Script> {
    return invoke("get_script", { id });
  },
  async updateScript(input: {
    id: string;
    title?: string;
    highlightingEnabled?: number | null;
    contentJson?: string;
    pageCount?: number;
    characters?: ScriptCharacter[];
  }): Promise<ScriptSummary> {
    const payload: Record<string, unknown> = { id: input.id };
    if (input.title !== undefined) payload.title = input.title;
    if (input.highlightingEnabled !== undefined)
      payload.highlighting_enabled = input.highlightingEnabled;
    if (input.contentJson !== undefined) payload.content_json = input.contentJson;
    if (input.pageCount !== undefined) payload.page_count = input.pageCount;
    if (input.characters !== undefined) payload.characters = input.characters;
    return invoke("update_script", { input: payload });
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
    return invoke("list_scripts", {
      query: {
        includeArchived: query.includeArchived ?? null,
        onlyArchived: query.onlyArchived ?? null,
        sort: query.sort ?? null,
        query: query.query ?? null,
        limit: query.limit ?? null,
        offset: query.offset ?? null,
        folderId: query.folderId ?? null,
      },
    });
  },
  async archiveScript(id: string): Promise<void> {
    return invoke("archive_script", { id });
  },
  async restoreScript(id: string): Promise<void> {
    return invoke("restore_script", { id });
  },
  async purgeScript(id: string): Promise<void> {
    return invoke("purge_script", { id });
  },
  async emptyTrash(): Promise<void> {
    return invoke("empty_trash", {});
  },
  async duplicateScript(id: string): Promise<ScriptSummary> {
    return invoke("duplicate_script", { id });
  },
  async renameScript(id: string, title: string): Promise<ScriptSummary> {
    return invoke("rename_script", { id, title });
  },

  // Folders
  async listFolders(): Promise<Folder[]> {
    return invoke("list_folders", {});
  },
  async countLiveScripts(): Promise<number> {
    return invoke("count_live_scripts", {});
  },
  async createFolder(name: string): Promise<Folder> {
    return invoke("create_folder", { name });
  },
  async renameFolder(id: string, name: string): Promise<Folder> {
    return invoke("rename_folder", { id, name });
  },
  async deleteFolder(id: string): Promise<void> {
    return invoke("delete_folder", { id });
  },
  async moveScript(scriptId: string, folderId: string | null): Promise<void> {
    return invoke("move_script", { scriptId, folderId });
  },
  async moveScripts(scriptIds: string[], folderId: string | null): Promise<void> {
    return invoke("move_scripts", { scriptIds, folderId });
  },

  // Snapshots
  async createSnapshot(scriptId: string, trigger: "auto" | "manual"): Promise<SnapshotMeta> {
    return invoke("create_snapshot", { scriptId, trigger });
  },
  async listSnapshots(scriptId: string): Promise<SnapshotMeta[]> {
    return invoke("list_snapshots", { scriptId });
  },
  async getSnapshot(id: string): Promise<Snapshot> {
    return invoke("get_snapshot", { id });
  },
  async restoreSnapshot(snapshotId: string): Promise<void> {
    return invoke("restore_snapshot", { snapshotId });
  },
  async deleteSnapshot(id: string): Promise<void> {
    return invoke("delete_snapshot", { id });
  },

  // Search
  async globalSearch(query: string, limit = 50): Promise<SearchHit[]> {
    return invoke("global_search", { query, limit });
  },

  // Settings — TS-side via plugin-sql since Migration Phase 2.
  async getSetting(key: string): Promise<string | null> {
    return dbGetSetting(key);
  },
  async setSetting(key: string, value: string): Promise<void> {
    return dbSetSetting(key, value);
  },

  // App-State — TS-side via plugin-sql since Migration Phase 2.
  async getAppState(key: string): Promise<string | null> {
    return dbGetAppState(key);
  },
  async setAppState(key: string, value: string): Promise<void> {
    return dbSetAppState(key, value);
  },

  // Character-colour records (app-wide)
  async listCharacterColors(): Promise<CharacterColorRecord[]> {
    return invoke("list_character_colors", {});
  },
  async setCharacterColor(name: string, color: string): Promise<string[]> {
    return invoke("set_character_color", { name, color });
  },
  /** Clear the manual override and fall back to the recorded default. The
   * `activeScriptId` is the palette context used when no default has been
   * recorded yet — so the freshly-picked colour avoids colliding with
   * other characters in the script the writer is currently looking at. */
  async clearCharacterColor(
    name: string,
    activeScriptId?: string,
  ): Promise<string[]> {
    return invoke("clear_character_color", {
      name,
      activeScriptId: activeScriptId ?? null,
    });
  },

  // Export
  async exportPdf(input: {
    scriptId: string;
    path: string;
    includeHighlighting: boolean;
    includeTitlePage: boolean;
  }): Promise<{ path: string }> {
    return invoke("export_pdf", {
      input: {
        script_id: input.scriptId,
        path: input.path,
        include_highlighting: input.includeHighlighting,
        include_title_page: input.includeTitlePage,
      },
    });
  },
  async exportPlaintext(input: { scriptId: string; path: string }): Promise<{ path: string }> {
    return invoke("export_plaintext", {
      input: { script_id: input.scriptId, path: input.path },
    });
  },

  // AI / OpenRouter (opt-in)
  async aiGetState(): Promise<AiState> {
    return invoke("ai_get_state", {});
  },
  async aiSetApiKey(key: string): Promise<void> {
    return invoke("ai_set_api_key", { key });
  },
  async aiClearApiKey(): Promise<void> {
    return invoke("ai_clear_api_key", {});
  },
  async aiSetEnabled(enabled: boolean): Promise<void> {
    return invoke("ai_set_enabled", { enabled });
  },
  async aiSetModel(modelId: string): Promise<void> {
    return invoke("ai_set_model", { modelId });
  },
  async aiListModels(refresh = false): Promise<AiModelInfo[]> {
    return invoke("ai_list_models", { refresh });
  },
  async aiTestConnection(): Promise<string> {
    return invoke("ai_test_connection", {});
  },
  async aiGenerateSummary(scriptId: string, force = false): Promise<string | null> {
    return invoke("ai_generate_summary", { scriptId, force });
  },
};
