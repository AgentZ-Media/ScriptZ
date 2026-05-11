// In-Memory-StorageAdapter fuer die Web-Variante (Phase D - Skelett).
//
// Phase D verlangt explizit eine RAM-Map als Stub. Reload = Daten weg.
// Phase E zieht spaeter Dexie/IndexedDB an, indem dieser Adapter durch
// einen mit identischem Interface ersetzt wird - die Komponenten in
// @scriptz/core und die App-Shell kennen den Unterschied nicht, sie
// gehen ueber den `api`-Proxy aus @scriptz/core/lib/api.
//
// Wir reusen die reinen Helper aus core (lex, runtime, characterColors)
// fuer Verhaltens-Paritaet bei Reconciliation und Spielzeit - so sieht
// das Pillbar-Verhalten im Web genauso aus wie im Desktop.

import { setStorageAdapter, type StorageAdapter } from "@scriptz/core/lib/storage";
import {
  DEFAULT_PALETTE,
  eqIgnoreAsciiCase,
} from "@scriptz/core/lib/characterColors";
import { getPlatformAdapter } from "@scriptz/core/lib/platform";
import {
  dialogWordsByCharacter,
  extractBlocks,
  extractCharacterNames,
} from "@scriptz/core/lib/lex";
import { runtimeStatsFromContent } from "@scriptz/core/lib/runtime";
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
} from "@scriptz/core/lib/types";

const MAX_SNAPSHOTS_PER_SCRIPT = 50;

function emptyLexicalState(): string {
  return JSON.stringify({
    root: {
      children: [
        {
          type: "scriptz-character",
          version: 1,
          characterName: "",
          direction: null,
          format: "",
          indent: 0,
          children: [],
        },
      ],
      direction: null,
      format: "",
      indent: 0,
      type: "root",
      version: 1,
    },
  });
}

function countWords(contentJson: string): number {
  let total = 0;
  for (const b of extractBlocks(contentJson)) {
    const t = b.text.trim();
    if (!t) continue;
    total += t.split(/\s+/).filter(Boolean).length;
  }
  return total;
}

interface MemScript extends Script {
  // alle Script-Felder + content_json
}

interface MemCharColor {
  name: string;
  default_color: string | null;
  override_color: string | null;
  updated_at: number;
}

// Reconcile-Logik 1:1 wie in @scriptz/core/lib/scripts.ts, nur ohne SQL.
function reconcileChars(
  existing: ScriptCharacter[],
  contentJson: string,
  colors: Map<string, MemCharColor>,
): { chars: ScriptCharacter[]; newDefaults: [string, string][] } {
  const names = extractCharacterNames(contentJson);
  const wordsByChar = dialogWordsByCharacter(contentJson);
  let totalDialog = 0;
  for (const v of Object.values(wordsByChar)) totalDialog += v;
  const out: ScriptCharacter[] = [];
  const newDefaults: [string, string][] = [];
  for (const name of names) {
    const upper = name.toUpperCase();
    const rec = colors.get(upper);
    let chosen: string;
    const override = rec?.override_color ?? null;
    if (override !== null) {
      chosen = override;
    } else {
      const stuck = existing.find((c) => eqIgnoreAsciiCase(c.name, name));
      if (stuck) {
        chosen = stuck.color;
      } else {
        const fallback = rec?.default_color ?? null;
        if (fallback !== null) {
          chosen = fallback;
        } else {
          const used = new Set<string>();
          for (const c of out) used.add(c.color);
          const usedExisting = new Set<string>();
          for (const c of existing) usedExisting.add(c.color);
          const pick = DEFAULT_PALETTE.find(
            (p) => !used.has(p) && !usedExisting.has(p),
          );
          chosen = pick ?? DEFAULT_PALETTE[0];
        }
      }
    }
    const needsDefault = rec ? rec.default_color === null : true;
    if (
      needsDefault &&
      !newDefaults.some(([n]) => eqIgnoreAsciiCase(n, upper))
    ) {
      newDefaults.push([upper, chosen]);
    }
    const words = wordsByChar[name.toUpperCase()] ?? 0;
    const share = totalDialog > 0 ? words / totalDialog : 0;
    out.push({ name, color: chosen, share });
  }
  return { chars: out, newDefaults };
}

class MemoryStorage implements StorageAdapter {
  private scripts = new Map<string, MemScript>();
  private folders = new Map<string, Folder>();
  private snapshots = new Map<string, Snapshot>();
  private ideas = new Map<string, Idea>();
  private settings = new Map<string, string>();
  private appState = new Map<string, string>();
  private colors = new Map<string, MemCharColor>();

  // ===== Scripts =====
  async createScript(input: {
    title?: string;
    initialContentJson?: string;
    folderId?: string | null;
  }): Promise<ScriptSummary> {
    const id = crypto.randomUUID();
    const now = Date.now();
    const finalTitle = input.title ?? "Unbenannt";
    const contentJson = input.initialContentJson ?? emptyLexicalState();
    const folderId = input.folderId ?? null;
    if (folderId !== null && !this.folders.has(folderId)) {
      throw new Error(`not found: folder ${folderId}`);
    }
    const { chars, newDefaults } = reconcileChars([], contentJson, this.colors);
    for (const [n, c] of newDefaults) {
      const existing = this.colors.get(n);
      this.colors.set(n, {
        name: n,
        default_color: c,
        override_color: existing?.override_color ?? null,
        updated_at: now,
      });
    }
    const runtime = runtimeStatsFromContent(contentJson);
    const script: MemScript = {
      id,
      title: finalTitle,
      highlighting_enabled: null,
      content_json: contentJson,
      characters: chars,
      created_at: now,
      updated_at: now,
      archived_at: null,
      page_count: 1,
      word_count: countWords(contentJson),
      dialog_word_count: runtime.dialogWords,
      direction_block_count: runtime.directionBlocks,
      folder_id: folderId,
    };
    this.scripts.set(id, script);
    return this.toSummary(script);
  }

  async getScript(id: string): Promise<Script> {
    const s = this.scripts.get(id);
    if (!s) throw new Error(`not found: script ${id}`);
    return { ...s };
  }

  async updateScript(input: {
    id: string;
    title?: string;
    highlightingEnabled?: number | null;
    contentJson?: string;
    characters?: ScriptCharacter[];
  }): Promise<ScriptSummary> {
    const s = this.scripts.get(input.id);
    if (!s) throw new Error(`not found: script ${input.id}`);
    const now = Date.now();
    if (input.title !== undefined) {
      s.title = input.title;
      s.updated_at = now;
    }
    if (input.highlightingEnabled !== undefined) {
      s.highlighting_enabled = input.highlightingEnabled;
      s.updated_at = now;
    }
    if (input.contentJson !== undefined) {
      const { chars, newDefaults } = reconcileChars(
        s.characters,
        input.contentJson,
        this.colors,
      );
      for (const [n, c] of newDefaults) {
        const existing = this.colors.get(n);
        this.colors.set(n, {
          name: n,
          default_color: c,
          override_color: existing?.override_color ?? null,
          updated_at: now,
        });
      }
      const runtime = runtimeStatsFromContent(input.contentJson);
      s.content_json = input.contentJson;
      s.characters = chars;
      s.word_count = countWords(input.contentJson);
      s.dialog_word_count = runtime.dialogWords;
      s.direction_block_count = runtime.directionBlocks;
      s.updated_at = now;
    }
    if (input.characters !== undefined && input.contentJson === undefined) {
      s.characters = input.characters;
      s.updated_at = now;
    }
    return this.toSummary(s);
  }

  async listScripts(query: {
    includeArchived?: boolean;
    onlyArchived?: boolean;
    sort?: "updated" | "created" | "title";
    query?: string;
    limit?: number;
    offset?: number;
    folderId?: string | null;
  } = {}): Promise<ScriptSummary[]> {
    let list = [...this.scripts.values()];
    const onlyArchived = query.onlyArchived ?? false;
    const includeArchived = query.includeArchived ?? false;
    if (onlyArchived) {
      list = list.filter((s) => s.archived_at !== null);
    } else if (!includeArchived) {
      list = list.filter((s) => s.archived_at === null);
    }
    const q = query.query?.trim();
    if (q) {
      const needle = q.toLowerCase();
      list = list.filter((s) => s.title.toLowerCase().includes(needle));
    }
    if (query.folderId !== undefined && query.folderId !== null) {
      list = list.filter((s) => s.folder_id === query.folderId);
    }
    const sort = query.sort ?? "updated";
    list.sort((a, b) => {
      if (sort === "created") return b.created_at - a.created_at;
      if (sort === "title") return a.title.localeCompare(b.title, "de", { sensitivity: "base" });
      return b.updated_at - a.updated_at;
    });
    if (query.limit !== undefined) {
      const offset = query.offset ?? 0;
      list = list.slice(offset, offset + query.limit);
    }
    return list.map((s) => this.toSummary(s));
  }

  async archiveScript(id: string): Promise<void> {
    const s = this.scripts.get(id);
    if (s) s.archived_at = Date.now();
  }

  async restoreScript(id: string): Promise<void> {
    const s = this.scripts.get(id);
    if (s) s.archived_at = null;
  }

  async purgeScript(id: string): Promise<void> {
    this.scripts.delete(id);
    // Snapshots cascade
    for (const [sid, snap] of this.snapshots) {
      if (snap.script_id === id) this.snapshots.delete(sid);
    }
  }

  async emptyTrash(): Promise<void> {
    const archived = [...this.scripts.values()].filter((s) => s.archived_at !== null);
    for (const s of archived) await this.purgeScript(s.id);
  }

  async duplicateScript(id: string): Promise<ScriptSummary> {
    const src = this.scripts.get(id);
    if (!src) throw new Error(`not found: script ${id}`);
    return this.createScript({
      title: `${src.title} (Kopie)`,
      initialContentJson: src.content_json,
      folderId: src.folder_id,
    });
  }

  async renameScript(id: string, title: string): Promise<ScriptSummary> {
    const s = this.scripts.get(id);
    if (!s) throw new Error(`not found: script ${id}`);
    s.title = title;
    s.updated_at = Date.now();
    return this.toSummary(s);
  }

  async backfillRuntimeStats(): Promise<void> {
    // No-op: alle Memory-Skripte werden direkt mit gueltigen Stats angelegt.
  }

  // ===== Folders =====
  async listFolders(): Promise<Folder[]> {
    const list = [...this.folders.values()].map((f) => ({
      ...f,
      script_count: [...this.scripts.values()].filter(
        (s) => s.folder_id === f.id && s.archived_at === null,
      ).length,
    }));
    list.sort((a, b) => a.name.localeCompare(b.name, "de", { sensitivity: "base" }));
    return list;
  }

  async countLiveScripts(): Promise<number> {
    return [...this.scripts.values()].filter((s) => s.archived_at === null).length;
  }

  async createFolder(name: string): Promise<Folder> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("folder name must not be empty");
    const id = crypto.randomUUID();
    const now = Date.now();
    const f: Folder = {
      id,
      name: trimmed,
      created_at: now,
      updated_at: now,
      script_count: 0,
    };
    this.folders.set(id, f);
    return f;
  }

  async renameFolder(id: string, name: string): Promise<Folder> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("folder name must not be empty");
    const f = this.folders.get(id);
    if (!f) throw new Error(`not found: folder ${id}`);
    f.name = trimmed;
    f.updated_at = Date.now();
    f.script_count = [...this.scripts.values()].filter(
      (s) => s.folder_id === f.id && s.archived_at === null,
    ).length;
    return { ...f };
  }

  async deleteFolder(id: string): Promise<void> {
    if (!this.folders.delete(id)) throw new Error(`not found: folder ${id}`);
    // ON DELETE SET NULL semantik: Skripte behalten, folder_id leeren.
    for (const s of this.scripts.values()) {
      if (s.folder_id === id) s.folder_id = null;
    }
  }

  async moveScript(scriptId: string, folderId: string | null): Promise<void> {
    if (folderId !== null && !this.folders.has(folderId)) {
      throw new Error(`not found: folder ${folderId}`);
    }
    const s = this.scripts.get(scriptId);
    if (!s) throw new Error(`not found: script ${scriptId}`);
    s.folder_id = folderId;
    s.updated_at = Date.now();
  }

  async moveScripts(scriptIds: string[], folderId: string | null): Promise<void> {
    if (folderId !== null && !this.folders.has(folderId)) {
      throw new Error(`not found: folder ${folderId}`);
    }
    const missing: string[] = [];
    const now = Date.now();
    for (const sid of scriptIds) {
      const s = this.scripts.get(sid);
      if (!s) {
        missing.push(sid);
        continue;
      }
      s.folder_id = folderId;
      s.updated_at = now;
    }
    if (missing.length > 0) throw new Error(`not found: script(s) ${missing.join(", ")}`);
  }

  // ===== Snapshots =====
  async createSnapshot(scriptId: string, trigger: "auto" | "manual"): Promise<SnapshotMeta> {
    const s = this.scripts.get(scriptId);
    if (!s) throw new Error(`not found: script ${scriptId}`);
    const id = crypto.randomUUID();
    const now = Date.now();
    const snap: Snapshot = {
      id,
      script_id: scriptId,
      content_json: s.content_json,
      trigger,
      created_at: now,
    };
    this.snapshots.set(id, snap);
    this.trimSnapshots(scriptId);
    return { id, script_id: scriptId, trigger, created_at: now };
  }

  async listSnapshots(scriptId: string): Promise<SnapshotMeta[]> {
    return [...this.snapshots.values()]
      .filter((s) => s.script_id === scriptId)
      .sort((a, b) => b.created_at - a.created_at)
      .map(({ id, script_id, trigger, created_at }) => ({
        id, script_id, trigger, created_at,
      }));
  }

  async getSnapshot(id: string): Promise<Snapshot> {
    const s = this.snapshots.get(id);
    if (!s) throw new Error(`not found: snapshot ${id}`);
    return { ...s };
  }

  async restoreSnapshot(snapshotId: string): Promise<void> {
    const snap = this.snapshots.get(snapshotId);
    if (!snap) throw new Error(`not found: snapshot ${snapshotId}`);
    const script = this.scripts.get(snap.script_id);
    if (!script) throw new Error(`not found: script ${snap.script_id}`);
    const now = Date.now();
    // Backup-Snapshot des aktuellen Stands, identisch zum Desktop-Verhalten.
    const backupId = crypto.randomUUID();
    this.snapshots.set(backupId, {
      id: backupId,
      script_id: script.id,
      content_json: script.content_json,
      trigger: "auto",
      created_at: now,
    });
    this.trimSnapshots(script.id);
    script.content_json = snap.content_json;
    script.updated_at = now;
  }

  async deleteSnapshot(id: string): Promise<void> {
    this.snapshots.delete(id);
  }

  private trimSnapshots(scriptId: string): void {
    const all = [...this.snapshots.values()]
      .filter((s) => s.script_id === scriptId)
      .sort((a, b) => b.created_at - a.created_at);
    for (const old of all.slice(MAX_SNAPSHOTS_PER_SCRIPT)) {
      this.snapshots.delete(old.id);
    }
  }

  // ===== Search =====
  async globalSearch(query: string, limit = 50): Promise<SearchHit[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const hits: SearchHit[] = [];
    for (const s of this.scripts.values()) {
      if (s.archived_at !== null) continue;
      const inTitle = s.title.toLowerCase().includes(q);
      const text = extractBlocks(s.content_json).map((b) => b.text).join(" ");
      const inBody = text.toLowerCase().includes(q);
      if (!inTitle && !inBody) continue;
      const snippet = this.makeSnippet(text, q);
      hits.push({
        kind: "script",
        id: s.id,
        title: s.title,
        snippet,
        meta: {},
      });
      if (hits.length >= limit) break;
    }
    return hits;
  }

  private makeSnippet(text: string, needle: string): string {
    const lower = text.toLowerCase();
    const idx = lower.indexOf(needle);
    if (idx === -1) return text.slice(0, 120);
    const start = Math.max(0, idx - 40);
    const end = Math.min(text.length, idx + needle.length + 80);
    const slice = text.slice(start, end);
    return slice.replace(
      new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"),
      (m) => `<mark>${m}</mark>`,
    );
  }

  // ===== Settings / App-State =====
  async getSetting(key: string): Promise<string | null> {
    return this.settings.get(key) ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    this.settings.set(key, value);
  }

  async getAppState(key: string): Promise<string | null> {
    return this.appState.get(key) ?? null;
  }

  async setAppState(key: string, value: string): Promise<void> {
    this.appState.set(key, value);
  }

  // ===== Character-Colors =====
  async listCharacterColors(): Promise<CharacterColorRecord[]> {
    return [...this.colors.values()]
      .map((c) => ({ ...c }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async setCharacterColor(name: string, color: string): Promise<string[]> {
    const upper = name.toUpperCase();
    const now = Date.now();
    const existing = this.colors.get(upper);
    this.colors.set(upper, {
      name: upper,
      default_color: existing?.default_color ?? null,
      override_color: color,
      updated_at: now,
    });
    return this.applyColorToScripts(upper, color);
  }

  async clearCharacterColor(name: string, activeScriptId?: string): Promise<string[]> {
    const upper = name.toUpperCase();
    const existing = this.colors.get(upper);
    if (!existing) return [];
    // Default ableiten, falls noch nicht gesetzt: erste freie Farbe im aktiven
    // Skript-Kontext (gleiche Idee wie im Desktop, dort gegen DB).
    let nextDefault = existing.default_color;
    if (nextDefault === null) {
      let used = new Set<string>();
      if (activeScriptId) {
        const s = this.scripts.get(activeScriptId);
        if (s) used = new Set(s.characters.map((c) => c.color));
      }
      nextDefault = DEFAULT_PALETTE.find((p) => !used.has(p)) ?? DEFAULT_PALETTE[0];
    }
    this.colors.set(upper, {
      name: upper,
      default_color: nextDefault,
      override_color: null,
      updated_at: Date.now(),
    });
    return this.applyColorToScripts(upper, nextDefault);
  }

  private applyColorToScripts(upper: string, color: string): string[] {
    const affected: string[] = [];
    for (const s of this.scripts.values()) {
      let changed = false;
      const next = s.characters.map((c) => {
        if (c.name.toUpperCase() === upper && c.color !== color) {
          changed = true;
          return { ...c, color };
        }
        return c;
      });
      if (changed) {
        s.characters = next;
        s.updated_at = Date.now();
        affected.push(s.id);
      }
    }
    return affected;
  }

  // ===== Export =====
  async exportPdf(input: {
    scriptId: string;
    path: string;
    includeHighlighting: boolean;
    includeTitlePage: boolean;
  }): Promise<{ path: string }> {
    return getPlatformAdapter().exportPdf(input, async (id) => {
      const s = await this.getScript(id);
      return { title: s.title, contentJson: s.content_json, characters: s.characters };
    });
  }

  async exportPlaintext(input: { scriptId: string; path: string }): Promise<{ path: string }> {
    return getPlatformAdapter().exportPlaintext(input, async (id) => {
      const s = await this.getScript(id);
      return s.content_json;
    });
  }

  // ===== Ideas =====
  async listIdeas(): Promise<Idea[]> {
    return [...this.ideas.values()]
      .sort((a, b) => b.created_at - a.created_at)
      .map((i) => ({ ...i }));
  }

  async createIdea(input: { title: string; notes?: string }): Promise<Idea> {
    const title = input.title.trim();
    if (!title) throw new Error("Idea title must not be empty");
    const id = crypto.randomUUID();
    const now = Date.now();
    const idea: Idea = {
      id,
      title,
      notes: input.notes ?? "",
      created_at: now,
      used_at: null,
      script_id: null,
    };
    this.ideas.set(id, idea);
    return { ...idea };
  }

  async updateIdea(input: { id: string; title?: string; notes?: string }): Promise<Idea> {
    const i = this.ideas.get(input.id);
    if (!i) throw new Error(`not found: idea ${input.id}`);
    if (input.title !== undefined) {
      const t = input.title.trim();
      if (!t) throw new Error("Idea title must not be empty");
      i.title = t;
    }
    if (input.notes !== undefined) i.notes = input.notes;
    return { ...i };
  }

  async deleteIdea(id: string): Promise<void> {
    this.ideas.delete(id);
  }

  async convertIdeaToScript(input: {
    ideaId: string;
    folderId?: string | null;
    notesAsAction?: boolean;
  }): Promise<{ idea: Idea; script: ScriptSummary }> {
    const i = this.ideas.get(input.ideaId);
    if (!i) throw new Error(`not found: idea ${input.ideaId}`);
    if (i.used_at !== null) throw new Error("Idee wurde bereits konvertiert.");
    const notesAsAction = input.notesAsAction ?? true;
    const seed = buildScriptSeed({ notes: notesAsAction ? i.notes : "" });
    const script = await this.createScript({
      title: i.title,
      initialContentJson: seed,
      folderId: input.folderId ?? null,
    });
    i.used_at = Date.now();
    i.script_id = script.id;
    return { idea: { ...i }, script };
  }

  // ===== Schreibstatistik =====
  async loadDailyWords(days = 365): Promise<DailyWordEntry[]> {
    // Phase D: keine Tageshistorie - die Memory-Variante toleriert das,
    // weil Heatmap/Streak einfach leer bleiben. In Phase F kommt eine
    // echte Persistenz, sobald IndexedDB drin ist.
    const today = new Date();
    const out: DailyWordEntry[] = [];
    const start = new Date(today);
    start.setDate(start.getDate() - (days - 1));
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      out.push({ date: localDateKey(d), words_added: 0 });
    }
    return out;
  }

  async loadDailyStats(): Promise<DailyStatsSummary> {
    return {
      wordsToday: 0,
      wordsThisWeek: 0,
      streakDays: 0,
      dailyWords: new Array(365).fill(0),
      activeDays: 0,
      totalWords: 0,
    };
  }

  // ===== helpers =====
  private toSummary(s: MemScript): ScriptSummary {
    const {
      id, title, highlighting_enabled, characters, created_at, updated_at,
      archived_at, page_count, word_count, dialog_word_count,
      direction_block_count, folder_id,
    } = s;
    return {
      id, title, highlighting_enabled,
      characters: characters.map((c) => ({ ...c })),
      created_at, updated_at, archived_at, page_count,
      word_count, dialog_word_count, direction_block_count, folder_id,
    };
  }
}

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// Spiegel von ideas.ts::buildScriptSeed, hier inline gehalten damit die
// Memory-Conversion ohne SQL-Round-trip auskommt.
function buildScriptSeed(opts: { notes: string }): string {
  const trimmed = opts.notes.trim();
  if (!trimmed) {
    return JSON.stringify({
      root: {
        type: "root", version: 1, direction: null, format: "", indent: 0,
        children: [
          {
            type: "scriptz-character", version: 1,
            characterName: "", direction: null, format: "", indent: 0,
            children: [],
          },
        ],
      },
    });
  }
  return JSON.stringify({
    root: {
      type: "root", version: 1, direction: null, format: "", indent: 0,
      children: [
        {
          type: "scriptz-action", version: 1,
          direction: null, format: "", indent: 0,
          children: [
            {
              detail: 0, format: 0, mode: "normal", style: "",
              text: trimmed, type: "text", version: 1,
            },
          ],
        },
        {
          type: "scriptz-character", version: 1,
          characterName: "", direction: null, format: "", indent: 0,
          children: [],
        },
      ],
    },
  });
}

// Slot-Registrierung beim Modul-Load. WICHTIG: muss NACH dem Import von
// @scriptz/core/lib/api passieren (api.ts registriert den SQL-basierten
// Default-Adapter beim Modul-Load - wir ueberschreiben den Slot direkt
// danach). main.tsx ordnet die Imports entsprechend.
setStorageAdapter(new MemoryStorage());
