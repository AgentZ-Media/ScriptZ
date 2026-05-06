import { invoke } from "./tauri";
import type {
  Script,
  ScriptCharacter,
  ScriptSummary,
  SearchHit,
  Snapshot,
  SnapshotMeta,
  UpdateInfo,
} from "./types";

export const api = {
  // Scripts
  async createScript(input: {
    title?: string;
    initialContentJson?: string;
  }): Promise<ScriptSummary> {
    return invoke("create_script", {
      input: {
        title: input.title ?? null,
        initial_content_json: input.initialContentJson ?? null,
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
  } = {}): Promise<ScriptSummary[]> {
    return invoke("list_scripts", {
      query: {
        includeArchived: query.includeArchived ?? null,
        onlyArchived: query.onlyArchived ?? null,
        sort: query.sort ?? null,
        query: query.query ?? null,
        limit: query.limit ?? null,
        offset: query.offset ?? null,
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

  // Settings
  async getSetting(key: string): Promise<string | null> {
    return invoke("get_setting", { key });
  },
  async setSetting(key: string, value: string): Promise<void> {
    return invoke("set_setting", { key, value });
  },

  // App-State
  async getAppState(key: string): Promise<string | null> {
    return invoke("get_app_state", { key });
  },
  async setAppState(key: string, value: string): Promise<void> {
    return invoke("set_app_state", { key, value });
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

  // Updates
  async checkForUpdate(current: string): Promise<UpdateInfo> {
    return invoke("check_for_update", { current });
  },
};
