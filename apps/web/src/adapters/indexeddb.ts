// Dexie-basierter StorageAdapter (Phase E).
//
// Erfüllt das StorageAdapter-Interface aus @scriptz/core und ersetzt
// damit den In-Memory-Stub aus Phase D. Persistenz via IndexedDB über
// Dexie - dieselben Tabellen wie der SQLite-Stamm der Desktop-App,
// nur ohne FTS5 (kommt in Phase F via MiniSearch) und ohne SQL-
// Transactions-Semantik (Dexie's `transaction("rw", ...)` ist die
// IndexedDB-Variante davon).
//
// Schema bewusst flach indiziert. IndexedDB kann nullable Felder
// schlecht indizieren, und unsere Filter (archiviert ja/nein, folder
// = X / kein Folder) würden mit Indizes kaum schneller sein. Bei
// Datenmengen im persönlichen Drehbuch-Volumen (< 1000 Skripte) ist
// ein Voll-Scan pro Listing irrelevant. Wenn jemand mal 5000 Skripte
// pflegt, machen wir das gezielt schneller.

import Dexie, { type Table } from "dexie";
import MiniSearch from "minisearch";
import {
  DEFAULT_PALETTE,
  eqIgnoreAsciiCase,
} from "@scriptz/core/lib/characterColors";
import { getPlatformAdapter } from "@scriptz/core/lib/platform";
import {
  setStorageAdapter,
  type ExportResult,
  type StorageAdapter,
} from "@scriptz/core/lib/storage";
import {
  defaultScriptzFilename,
  parseScriptzBytes,
  SCRIPTZ_EXTENSION,
  SCRIPTZ_MIME,
  serializeScriptToBytes,
} from "@scriptz/core/lib/scriptzFile";
import {
  dialogWordsByCharacter,
  extractBlocks,
  extractCharacterNames,
  extractTeleprompterText,
} from "@scriptz/core/lib/lex";
import { runtimeStatsFromContent } from "@scriptz/core/lib/runtime";
import { dailyStatsBus } from "@scriptz/core/lib/dailyStatsBus";
import { foldersBus } from "@scriptz/core/lib/foldersBus";
import { localeCompare, t } from "@scriptz/core/i18n";
import { ideasBus } from "@scriptz/core/lib/ideasBus";
import { scriptsBus } from "@scriptz/core/lib/scriptsBus";
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

// ===== Row-Typen (1:1 zur SQLite-Schema, siehe migrations/001 + 003) =====

interface ScriptRow {
  id: string;
  title: string;
  highlighting_enabled: number | null;
  content_json: string;
  characters_meta: string; // JSON ScriptCharacter[]
  created_at: number;
  updated_at: number;
  archived_at: number | null;
  page_count: number;
  last_word_count: number;
  dialog_word_count: number;
  direction_block_count: number;
  folder_id: string | null;
}

interface FolderRow {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
}

interface SnapshotRow {
  id: string;
  script_id: string;
  content_json: string;
  trigger: "auto" | "manual";
  created_at: number;
}

interface IdeaRow {
  id: string;
  title: string;
  notes: string;
  created_at: number;
  used_at: number | null;
  script_id: string | null;
}

interface CharacterColorRow {
  // Per-Konvention immer UPPERCASE - die Desktop-Schema-Spalte verwendet
  // COLLATE NOCASE, im IndexedDB normieren wir explizit.
  name: string;
  default_color: string | null;
  override_color: string | null;
  updated_at: number;
}

interface DailyWordRow {
  date: string; // YYYY-MM-DD, lokale Zeitzone
  words_added: number;
}

interface KvRow {
  key: string;
  value: string;
}

class ScriptzDb extends Dexie {
  scripts!: Table<ScriptRow, string>;
  folders!: Table<FolderRow, string>;
  snapshots!: Table<SnapshotRow, string>;
  ideas!: Table<IdeaRow, string>;
  character_colors!: Table<CharacterColorRow, string>;
  daily_word_log!: Table<DailyWordRow, string>;
  settings!: Table<KvRow, string>;
  app_state!: Table<KvRow, string>;

  constructor() {
    super("scriptz");
    // Schema-Version 1. Sekundär-Indizes minimal halten - was wir oft
    // sortieren (updated_at, created_at) bekommt einen Index, der Rest
    // läuft über den Voll-Scan, der bei den üblichen Datenmengen
    // schneller ist als Index-Maintenance.
    this.version(1).stores({
      scripts: "id, updated_at, created_at",
      folders: "id",
      snapshots: "id, script_id, created_at",
      ideas: "id, created_at",
      character_colors: "name",
      daily_word_log: "date",
      settings: "key",
      app_state: "key",
    });
  }
}

const db = new ScriptzDb();

// ===== Persistenz-Schutz =====
//
// IndexedDB darf vom Browser bei Speicherdruck geräumt werden. Mit
// `navigator.storage.persist()` bitten wir um den "persistent"-Status,
// damit nichts ungefragt gekippt wird. Best-effort: kein User-Dialog,
// kein Throw, kein Retry - wenn der Browser ablehnt (z.B. Safari ITP
// bei nicht installierter Site), lebt die Web-App weiter und der
// Disclaimer in Phase H ist transparent dazu.
let persistRequested = false;
function ensurePersisted(): void {
  if (persistRequested) return;
  persistRequested = true;
  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.storage?.persist
    ) {
      void navigator.storage
        .persist()
        .then((granted) => {
          if (!granted) {
            console.info(
              "[scriptz-web] storage.persist() abgelehnt - Daten könnten bei Speicherdruck geräumt werden",
            );
          }
        })
        .catch(() => {
          /* Best-effort, kein Drama */
        });
    }
  } catch {
    /* Best-effort */
  }
}

// ===== Helper: Lexical-State-Leeres, Wortzählung, Reconcile =====

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

function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function parseChars(meta: string): ScriptCharacter[] {
  try {
    const v = JSON.parse(meta);
    return Array.isArray(v) ? (v as ScriptCharacter[]) : [];
  } catch {
    return [];
  }
}

function serializeChars(list: ScriptCharacter[]): string {
  return JSON.stringify(
    list.map((c) =>
      c.share === undefined
        ? { name: c.name, color: c.color }
        : { name: c.name, color: c.color, share: c.share },
    ),
  );
}

// 1:1 Port von @scriptz/core/lib/scripts.ts::reconcileCharsFromContent,
// nur statt SQL-records-Map nutzen wir die Dexie-Tabelle (wird vorher
// geladen und als Map reingereicht).
function reconcileChars(
  existing: ScriptCharacter[],
  contentJson: string,
  colors: Map<string, CharacterColorRow>,
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

function rowToSummary(r: ScriptRow): ScriptSummary {
  return {
    id: r.id,
    title: r.title,
    highlighting_enabled: r.highlighting_enabled,
    characters: parseChars(r.characters_meta),
    created_at: r.created_at,
    updated_at: r.updated_at,
    archived_at: r.archived_at,
    page_count: r.page_count,
    word_count: r.last_word_count,
    dialog_word_count: r.dialog_word_count,
    direction_block_count: r.direction_block_count,
    folder_id: r.folder_id,
  };
}

function rowToScript(r: ScriptRow): Script {
  return { ...rowToSummary(r), content_json: r.content_json };
}

// Idee-zu-Skript-Seed, Spiegel von @scriptz/core/lib/ideas.ts.
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

// ===== Adapter =====

class IndexedDbStorage implements StorageAdapter {
  // ---------- Scripts ----------
  async createScript(input: {
    title?: string;
    initialContentJson?: string;
    folderId?: string | null;
  }): Promise<ScriptSummary> {
    ensurePersisted();
    const id = crypto.randomUUID();
    const now = Date.now();
    const title = input.title ?? t("common.untitled");
    const contentJson = input.initialContentJson ?? emptyLexicalState();
    const folderId = input.folderId ?? null;

    const summary = await db.transaction(
      "rw",
      db.scripts,
      db.folders,
      db.character_colors,
      async () => {
        if (folderId !== null) {
          const f = await db.folders.get(folderId);
          if (!f) throw new Error(`not found: folder ${folderId}`);
        }
        const colors = await this.loadColorMap();
        const { chars, newDefaults } = reconcileChars([], contentJson, colors);
        for (const [n, c] of newDefaults) {
          const existing = await db.character_colors.get(n);
          await db.character_colors.put({
            name: n,
            default_color: c,
            override_color: existing?.override_color ?? null,
            updated_at: now,
          });
        }
        const runtime = runtimeStatsFromContent(contentJson);
        const initialWordCount = countWords(contentJson);
        const row: ScriptRow = {
          id,
          title,
          highlighting_enabled: null,
          content_json: contentJson,
          characters_meta: serializeChars(chars),
          created_at: now,
          updated_at: now,
          archived_at: null,
          page_count: 1,
          last_word_count: initialWordCount,
          dialog_word_count: runtime.dialogWords,
          direction_block_count: runtime.directionBlocks,
          folder_id: folderId,
        };
        await db.scripts.put(row);
        return rowToSummary(row);
      },
    );
    // Index ausserhalb der Transaktion aktualisieren - Dexie-Transactions
    // sind exklusiv, ein nested await wuerde verhungern. Best-effort: ein
    // Indexier-Fehler darf den Skript-Save nicht killen.
    void this.upsertSearchDoc(id).catch(() => {});
    return summary;
  }

  async getScript(id: string): Promise<Script> {
    const r = await db.scripts.get(id);
    if (!r) throw new Error(`not found: script ${id}`);
    return rowToScript(r);
  }

  async updateScript(input: {
    id: string;
    title?: string;
    highlightingEnabled?: number | null;
    contentJson?: string;
    characters?: ScriptCharacter[];
  }): Promise<ScriptSummary> {
    ensurePersisted();
    const now = Date.now();
    // Wir buchen Wort-Deltas innerhalb derselben Transaktion wie das
    // Skript-Update - daher daily_word_log + character_colors mit drin.
    let delta = 0;
    const result = await db.transaction(
      "rw",
      db.scripts,
      db.character_colors,
      db.daily_word_log,
      async () => {
        const row = await db.scripts.get(input.id);
        if (!row) throw new Error(`not found: script ${input.id}`);
        if (input.title !== undefined) {
          row.title = input.title;
          row.updated_at = now;
        }
        if (input.highlightingEnabled !== undefined) {
          row.highlighting_enabled = input.highlightingEnabled;
          row.updated_at = now;
        }
        if (input.contentJson !== undefined) {
          const newWordCount = countWords(input.contentJson);
          const runtime = runtimeStatsFromContent(input.contentJson);
          const colors = await this.loadColorMap();
          const existing = parseChars(row.characters_meta);
          const { chars, newDefaults } = reconcileChars(
            existing,
            input.contentJson,
            colors,
          );
          for (const [n, c] of newDefaults) {
            const rec = await db.character_colors.get(n);
            await db.character_colors.put({
              name: n,
              default_color: c,
              override_color: rec?.override_color ?? null,
              updated_at: now,
            });
          }
          // Sentinel -1 aus Migration 003: erstes Save normalisiert nur
          // den Count, ohne den Bestand als "heute geschrieben" zu buchen.
          const isFirstMeasurement = row.last_word_count < 0;
          const candidateDelta = isFirstMeasurement
            ? 0
            : newWordCount - row.last_word_count;

          row.content_json = input.contentJson;
          row.characters_meta = serializeChars(chars);
          row.last_word_count = newWordCount;
          row.dialog_word_count = runtime.dialogWords;
          row.direction_block_count = runtime.directionBlocks;
          row.updated_at = now;
          delta = candidateDelta;
        }
        if (input.characters !== undefined && input.contentJson === undefined) {
          row.characters_meta = serializeChars(input.characters);
          row.updated_at = now;
        }
        await db.scripts.put(row);

        if (delta > 0) {
          const date = localDateKey();
          const cur = await db.daily_word_log.get(date);
          await db.daily_word_log.put({
            date,
            words_added: (cur?.words_added ?? 0) + delta,
          });
        }
        return rowToSummary(row);
      },
    );

    if (delta > 0) {
      dailyStatsBus.bump();
    }
    // Index nach erfolgreichem Save aktualisieren - ausserhalb der
    // Transaktion (siehe createScript).
    void this.upsertSearchDoc(input.id).catch(() => {});
    return result;
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
    // Voll-Scan plus In-Memory-Filter. Bei < 1000 Skripten irrelevant -
    // die Sortierung darunter läuft sowieso auf dem JS-Array.
    let list = await db.scripts.toArray();
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
      if (sort === "title") return localeCompare(a.title, b.title);
      return b.updated_at - a.updated_at;
    });
    if (query.limit !== undefined) {
      const offset = query.offset ?? 0;
      list = list.slice(offset, offset + query.limit);
    }
    return list.map(rowToSummary);
  }

  async archiveScript(id: string): Promise<void> {
    await db.scripts.update(id, { archived_at: Date.now() });
    // Archivierte Skripte tauchen in der Suche nicht auf.
    this.removeSearchDoc(id);
  }

  async restoreScript(id: string): Promise<void> {
    await db.scripts.update(id, { archived_at: null });
    void this.upsertSearchDoc(id).catch(() => {});
  }

  async purgeScript(id: string): Promise<void> {
    await db.transaction("rw", db.scripts, db.snapshots, async () => {
      await db.scripts.delete(id);
      await db.snapshots.where("script_id").equals(id).delete();
    });
    this.removeSearchDoc(id);
  }

  async emptyTrash(): Promise<void> {
    const archived = await db.scripts
      .filter((s) => s.archived_at !== null)
      .toArray();
    for (const s of archived) await this.purgeScript(s.id);
  }

  async duplicateScript(id: string): Promise<ScriptSummary> {
    const src = await db.scripts.get(id);
    if (!src) throw new Error(`not found: script ${id}`);
    return this.createScript({
      title: `${src.title}${t("script.duplicateSuffix")}`,
      initialContentJson: src.content_json,
      folderId: src.folder_id,
    });
  }

  async renameScript(id: string, title: string): Promise<ScriptSummary> {
    const now = Date.now();
    await db.scripts.update(id, { title, updated_at: now });
    const r = await db.scripts.get(id);
    if (!r) throw new Error(`not found: script ${id}`);
    void this.upsertSearchDoc(id).catch(() => {});
    return rowToSummary(r);
  }

  async backfillRuntimeStats(): Promise<void> {
    const sentinels = await db.scripts
      .filter((s) => s.dialog_word_count < 0 || s.direction_block_count < 0)
      .toArray();
    for (const r of sentinels) {
      try {
        const stats = runtimeStatsFromContent(r.content_json);
        await db.scripts.update(r.id, {
          dialog_word_count: stats.dialogWords,
          direction_block_count: stats.directionBlocks,
        });
      } catch (err) {
        console.warn("[scriptz-web] runtime-stats backfill failed for", r.id, err);
      }
    }
  }

  // ---------- Folders ----------
  async listFolders(): Promise<Folder[]> {
    const [rows, scripts] = await Promise.all([
      db.folders.toArray(),
      db.scripts.toArray(),
    ]);
    const counts = new Map<string, number>();
    for (const s of scripts) {
      if (s.folder_id && s.archived_at === null) {
        counts.set(s.folder_id, (counts.get(s.folder_id) ?? 0) + 1);
      }
    }
    const list: Folder[] = rows.map((f) => ({
      id: f.id,
      name: f.name,
      created_at: f.created_at,
      updated_at: f.updated_at,
      script_count: counts.get(f.id) ?? 0,
    }));
    list.sort((a, b) => localeCompare(a.name, b.name));
    return list;
  }

  async countLiveScripts(): Promise<number> {
    return db.scripts.filter((s) => s.archived_at === null).count();
  }

  async createFolder(name: string): Promise<Folder> {
    ensurePersisted();
    const trimmed = name.trim();
    if (!trimmed) throw new Error("folder name must not be empty");
    const id = crypto.randomUUID();
    const now = Date.now();
    await db.folders.put({ id, name: trimmed, created_at: now, updated_at: now });
    return { id, name: trimmed, created_at: now, updated_at: now, script_count: 0 };
  }

  async renameFolder(id: string, name: string): Promise<Folder> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("folder name must not be empty");
    const now = Date.now();
    const updated = await db.folders.update(id, { name: trimmed, updated_at: now });
    if (updated === 0) throw new Error(`not found: folder ${id}`);
    const f = (await db.folders.get(id))!;
    const script_count = await db.scripts
      .filter((s) => s.folder_id === id && s.archived_at === null)
      .count();
    return { ...f, script_count };
  }

  async deleteFolder(id: string): Promise<void> {
    return db.transaction("rw", db.folders, db.scripts, async () => {
      const f = await db.folders.get(id);
      if (!f) throw new Error(`not found: folder ${id}`);
      await db.folders.delete(id);
      // ON DELETE SET NULL: Skripte behalten, folder_id leeren.
      const affected = await db.scripts
        .filter((s) => s.folder_id === id)
        .toArray();
      for (const s of affected) {
        await db.scripts.update(s.id, { folder_id: null });
      }
    });
  }

  async moveScript(scriptId: string, folderId: string | null): Promise<void> {
    return db.transaction("rw", db.scripts, db.folders, async () => {
      if (folderId !== null) {
        const f = await db.folders.get(folderId);
        if (!f) throw new Error(`not found: folder ${folderId}`);
      }
      const s = await db.scripts.get(scriptId);
      if (!s) throw new Error(`not found: script ${scriptId}`);
      await db.scripts.update(scriptId, { folder_id: folderId, updated_at: Date.now() });
    });
  }

  async moveScripts(scriptIds: string[], folderId: string | null): Promise<void> {
    if (scriptIds.length === 0) return;
    return db.transaction("rw", db.scripts, db.folders, async () => {
      if (folderId !== null) {
        const f = await db.folders.get(folderId);
        if (!f) throw new Error(`not found: folder ${folderId}`);
      }
      const missing: string[] = [];
      const now = Date.now();
      for (const sid of scriptIds) {
        const s = await db.scripts.get(sid);
        if (!s) { missing.push(sid); continue; }
        await db.scripts.update(sid, { folder_id: folderId, updated_at: now });
      }
      if (missing.length > 0) {
        throw new Error(`not found: script(s) ${missing.join(", ")}`);
      }
    });
  }

  // ---------- Snapshots ----------
  async createSnapshot(scriptId: string, trigger: "auto" | "manual"): Promise<SnapshotMeta> {
    ensurePersisted();
    return db.transaction("rw", db.scripts, db.snapshots, async () => {
      const s = await db.scripts.get(scriptId);
      if (!s) throw new Error(`not found: script ${scriptId}`);
      const id = crypto.randomUUID();
      const now = Date.now();
      await db.snapshots.put({
        id, script_id: scriptId, content_json: s.content_json,
        trigger, created_at: now,
      });
      await this.trimSnapshots(scriptId);
      return { id, script_id: scriptId, trigger, created_at: now };
    });
  }

  async listSnapshots(scriptId: string): Promise<SnapshotMeta[]> {
    const rows = await db.snapshots
      .where("script_id").equals(scriptId)
      .toArray();
    rows.sort((a, b) => b.created_at - a.created_at);
    return rows.map(({ id, script_id, trigger, created_at }) => ({
      id, script_id, trigger, created_at,
    }));
  }

  async getSnapshot(id: string): Promise<Snapshot> {
    const r = await db.snapshots.get(id);
    if (!r) throw new Error(`not found: snapshot ${id}`);
    return { ...r };
  }

  async restoreSnapshot(snapshotId: string): Promise<void> {
    ensurePersisted();
    return db.transaction("rw", db.scripts, db.snapshots, async () => {
      const snap = await db.snapshots.get(snapshotId);
      if (!snap) throw new Error(`not found: snapshot ${snapshotId}`);
      const script = await db.scripts.get(snap.script_id);
      if (!script) throw new Error(`not found: script ${snap.script_id}`);
      const now = Date.now();
      // Backup des aktuellen Stands, identisch zum Desktop.
      const backupId = crypto.randomUUID();
      await db.snapshots.put({
        id: backupId, script_id: script.id,
        content_json: script.content_json,
        trigger: "auto", created_at: now,
      });
      await this.trimSnapshots(script.id);
      await db.scripts.update(script.id, {
        content_json: snap.content_json,
        updated_at: now,
      });
    });
  }

  async deleteSnapshot(id: string): Promise<void> {
    await db.snapshots.delete(id);
  }

  private async trimSnapshots(scriptId: string): Promise<void> {
    const all = await db.snapshots
      .where("script_id").equals(scriptId)
      .toArray();
    all.sort((a, b) => b.created_at - a.created_at);
    const overflow = all.slice(MAX_SNAPSHOTS_PER_SCRIPT);
    if (overflow.length > 0) {
      await db.snapshots.bulkDelete(overflow.map((s) => s.id));
    }
  }

  // ---------- Search ----------
  // MiniSearch-Index, lazy gebaut beim ersten globalSearch-Call und danach
  // inkrementell aktualisiert (createScript/updateScript/purgeScript). BM25-
  // Ranking + Tokenisierung + Diacritic-Folding mit deutscher Norm - deutlich
  // näher an SQLite-FTS5 als die simple Substring-Suche aus Phase E.
  //
  // Ein Re-Build bei Boot wäre ehrlicher (Index synchron zur DB), kostet aber
  // bei 500+ Skripten messbar Boot-Zeit. Inkrementelles Tracking + lazy
  // initial build ist der bessere Trade-off, solange wir innerhalb eines Tabs
  // bleiben (Multi-Tab-Sync braucht eh BroadcastChannel, kommt erst bei
  // tatsächlichem Bedarf).
  private searchIndex: MiniSearch | null = null;
  private searchIndexBuilt = false;
  private buildingIndex: Promise<MiniSearch> | null = null;

  private async ensureSearchIndex(): Promise<MiniSearch> {
    if (this.searchIndexBuilt && this.searchIndex) return this.searchIndex;
    if (this.buildingIndex) return this.buildingIndex;
    this.buildingIndex = (async () => {
      const idx = new MiniSearch({
        fields: ["title", "body"],
        storeFields: ["title", "body"],
        searchOptions: {
          boost: { title: 3 },
          prefix: true,
          fuzzy: 0.15,
          combineWith: "AND",
        },
        // Locale-aware tokenizer: deutsche Umlaute durch ASCII-Aequivalente
        // ersetzen (so dass "schoen" auch "schön" findet) und an Whitespace +
        // Satzzeichen splitten.
        tokenize: (s) =>
          s
            .normalize("NFKD")
            .replace(/[̀-ͯ]/g, "")
            .toLowerCase()
            .split(/[^a-z0-9]+/u)
            .filter(Boolean),
        processTerm: (term) => term.toLowerCase().replace(/[̀-ͯ]/g, ""),
      });
      const all = await db.scripts
        .filter((s) => s.archived_at === null)
        .toArray();
      const docs = all.map((s) => ({
        id: s.id,
        title: s.title,
        body: extractBlocks(s.content_json).map((b) => b.text).join(" "),
      }));
      idx.addAll(docs);
      this.searchIndex = idx;
      this.searchIndexBuilt = true;
      this.buildingIndex = null;
      return idx;
    })();
    return this.buildingIndex;
  }

  private async upsertSearchDoc(scriptId: string): Promise<void> {
    if (!this.searchIndexBuilt) return; // Index wird beim ersten Search aufgebaut
    const s = await db.scripts.get(scriptId);
    if (!s) return;
    const doc = {
      id: s.id,
      title: s.title,
      body: extractBlocks(s.content_json).map((b) => b.text).join(" "),
    };
    if (this.searchIndex?.has(s.id)) {
      this.searchIndex.replace(doc);
    } else {
      this.searchIndex?.add(doc);
    }
  }

  private removeSearchDoc(scriptId: string): void {
    if (!this.searchIndexBuilt) return;
    if (this.searchIndex?.has(scriptId)) {
      this.searchIndex.discard(scriptId);
    }
  }

  async globalSearch(query: string, limit = 50): Promise<SearchHit[]> {
    const q = query.trim();
    if (!q) return [];
    const idx = await this.ensureSearchIndex();
    const results = idx.search(q).slice(0, limit);
    const hits: SearchHit[] = [];
    for (const r of results) {
      const title = (r.title as string | undefined) ?? "";
      const body = (r.body as string | undefined) ?? "";
      hits.push({
        kind: "script",
        id: String(r.id),
        title,
        snippet: this.makeSnippet(body || title, q),
        meta: { score: r.score },
      });
    }
    return hits;
  }

  private makeSnippet(text: string, needle: string): string {
    // Snippet: erstes Vorkommen eines Tokens aus der Query mit ~40/80 Char
    // Kontext links/rechts. Hebt alle Token-Vorkommen mit <mark> hervor.
    const firstToken = needle.toLowerCase().split(/\s+/).filter(Boolean)[0] ?? needle;
    const lower = text.toLowerCase();
    const idx = lower.indexOf(firstToken.toLowerCase());
    if (idx === -1) return text.slice(0, 120);
    const start = Math.max(0, idx - 40);
    const end = Math.min(text.length, idx + firstToken.length + 80);
    const slice = text.slice(start, end);
    const tokens = needle
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    if (tokens.length === 0) return slice;
    const re = new RegExp(`(${tokens.join("|")})`, "ig");
    return slice.replace(re, (m) => `<mark>${m}</mark>`);
  }

  // ---------- Settings / App-State ----------
  async getSetting(key: string): Promise<string | null> {
    const r = await db.settings.get(key);
    return r?.value ?? null;
  }
  async setSetting(key: string, value: string): Promise<void> {
    ensurePersisted();
    await db.settings.put({ key, value });
  }
  async getAppState(key: string): Promise<string | null> {
    const r = await db.app_state.get(key);
    return r?.value ?? null;
  }
  async setAppState(key: string, value: string): Promise<void> {
    ensurePersisted();
    await db.app_state.put({ key, value });
  }

  // ---------- Character-Colors ----------
  async listCharacterColors(): Promise<CharacterColorRecord[]> {
    const rows = await db.character_colors.toArray();
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows.map((r) => ({ ...r }));
  }

  async setCharacterColor(name: string, color: string): Promise<string[]> {
    ensurePersisted();
    const upper = name.toUpperCase();
    const now = Date.now();
    return db.transaction("rw", db.character_colors, db.scripts, async () => {
      const existing = await db.character_colors.get(upper);
      await db.character_colors.put({
        name: upper,
        default_color: existing?.default_color ?? null,
        override_color: color,
        updated_at: now,
      });
      return this.applyColorToScripts(upper, color);
    });
  }

  async clearCharacterColor(name: string, activeScriptId?: string): Promise<string[]> {
    const upper = name.toUpperCase();
    return db.transaction("rw", db.character_colors, db.scripts, async () => {
      const existing = await db.character_colors.get(upper);
      if (!existing) return [];
      let nextDefault = existing.default_color;
      if (nextDefault === null) {
        let used = new Set<string>();
        if (activeScriptId) {
          const s = await db.scripts.get(activeScriptId);
          if (s) used = new Set(parseChars(s.characters_meta).map((c) => c.color));
        }
        nextDefault = DEFAULT_PALETTE.find((p) => !used.has(p)) ?? DEFAULT_PALETTE[0];
      }
      await db.character_colors.put({
        name: upper,
        default_color: nextDefault,
        override_color: null,
        updated_at: Date.now(),
      });
      return this.applyColorToScripts(upper, nextDefault);
    });
  }

  private async applyColorToScripts(upper: string, color: string): Promise<string[]> {
    const all = await db.scripts.toArray();
    const affected: string[] = [];
    const now = Date.now();
    for (const s of all) {
      const chars = parseChars(s.characters_meta);
      let changed = false;
      const next = chars.map((c) => {
        if (c.name.toUpperCase() === upper && c.color !== color) {
          changed = true;
          return { ...c, color };
        }
        return c;
      });
      if (changed) {
        await db.scripts.update(s.id, {
          characters_meta: serializeChars(next),
          updated_at: now,
        });
        affected.push(s.id);
      }
    }
    return affected;
  }

  private async loadColorMap(): Promise<Map<string, CharacterColorRow>> {
    const rows = await db.character_colors.toArray();
    const m = new Map<string, CharacterColorRow>();
    for (const r of rows) m.set(r.name.toUpperCase(), r);
    return m;
  }

  // ---------- Export ----------
  // Identische Logik wie in @scriptz/core/lib/api.ts, nur dass wir hier
  // lokal aus IndexedDB lesen statt aus SQL. Bytes-Erzeugung kommt aus
  // core (buildPdfBytes / extractTeleprompterText / serializeScriptToBytes);
  // saveAs ist der gleiche Platform-Aufruf wie auf Desktop.
  async exportPdf(input: {
    scriptId: string;
    includeHighlighting: boolean;
    includeTitlePage: boolean;
  }): Promise<ExportResult> {
    const s = await this.getScript(input.scriptId);
    // pdf-lib lazy laden - siehe api.ts fuer Begruendung (Bundle-Cost).
    const { buildPdfBytes } = await import("@scriptz/core/lib/exportPdf");
    const bytes = await buildPdfBytes(
      { title: s.title, contentJson: s.content_json, characters: s.characters ?? [] },
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
  }

  async exportPlaintext(input: { scriptId: string }): Promise<ExportResult> {
    const s = await this.getScript(input.scriptId);
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
  }

  async exportScriptz(scriptId: string): Promise<ExportResult> {
    const s = await this.getScript(scriptId);
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
  }

  async importScriptz(): Promise<{ scriptId: string; title: string } | null> {
    const file = await getPlatformAdapter().openFile(
      `.${SCRIPTZ_EXTENSION},${SCRIPTZ_MIME}`,
    );
    if (!file) return null;
    const parsed = parseScriptzBytes(file.bytes);
    const created = await this.createScript({
      title: parsed.script.title,
      initialContentJson: JSON.stringify(parsed.script.contentJson),
    });
    return { scriptId: created.id, title: created.title };
  }

  // ---------- Ideas ----------
  async listIdeas(): Promise<Idea[]> {
    const rows = await db.ideas.toArray();
    rows.sort((a, b) => b.created_at - a.created_at);
    return rows.map((r) => ({
      id: r.id, title: r.title, notes: r.notes ?? "",
      created_at: r.created_at, used_at: r.used_at, script_id: r.script_id,
    }));
  }

  async createIdea(input: { title: string; notes?: string }): Promise<Idea> {
    ensurePersisted();
    const title = input.title.trim();
    if (!title) throw new Error("Idea title must not be empty");
    const id = crypto.randomUUID();
    const now = Date.now();
    const idea: Idea = {
      id, title, notes: input.notes ?? "", created_at: now,
      used_at: null, script_id: null,
    };
    await db.ideas.put(idea);
    ideasBus.bump();
    return idea;
  }

  async updateIdea(input: { id: string; title?: string; notes?: string }): Promise<Idea> {
    const patch: Partial<IdeaRow> = {};
    if (input.title !== undefined) {
      const t = input.title.trim();
      if (!t) throw new Error("Idea title must not be empty");
      patch.title = t;
    }
    if (input.notes !== undefined) patch.notes = input.notes;
    const updated = await db.ideas.update(input.id, patch);
    if (updated === 0) throw new Error(`not found: idea ${input.id}`);
    const r = (await db.ideas.get(input.id))!;
    ideasBus.bump();
    return {
      id: r.id, title: r.title, notes: r.notes ?? "",
      created_at: r.created_at, used_at: r.used_at, script_id: r.script_id,
    };
  }

  async deleteIdea(id: string): Promise<void> {
    await db.ideas.delete(id);
    ideasBus.bump();
  }

  async convertIdeaToScript(input: {
    ideaId: string;
    folderId?: string | null;
    notesAsAction?: boolean;
  }): Promise<{ idea: Idea; script: ScriptSummary }> {
    // Idee reservieren -> Skript anlegen -> script_id zurückschreiben.
    // Schritt 1 + 3 atomar; Schritt 2 (createScript) hat seine eigene
    // Transaktion, weil Dexie keine verschachtelten unterstützt.
    const claimedAt = Date.now();
    const idea = await db.transaction("rw", db.ideas, async () => {
      const i = await db.ideas.get(input.ideaId);
      if (!i) throw new Error(`not found: idea ${input.ideaId}`);
      if (i.used_at !== null) throw new Error(t("error.ideaAlreadyConverted"));
      await db.ideas.update(input.ideaId, { used_at: claimedAt });
      return i;
    });

    const notesAsAction = input.notesAsAction ?? true;
    const seed = buildScriptSeed({ notes: notesAsAction ? idea.notes : "" });
    let script: ScriptSummary;
    try {
      script = await this.createScript({
        title: idea.title,
        initialContentJson: seed,
        folderId: input.folderId ?? null,
      });
    } catch (err) {
      // Rollback: Idee wieder freigeben.
      await db.ideas.update(input.ideaId, { used_at: null, script_id: null });
      throw err;
    }
    await db.ideas.update(input.ideaId, { script_id: script.id });
    const updatedIdea: Idea = {
      id: idea.id, title: idea.title, notes: idea.notes,
      created_at: idea.created_at, used_at: claimedAt, script_id: script.id,
    };
    scriptsBus.bump();
    foldersBus.bump();
    ideasBus.bump();
    return { idea: updatedIdea, script };
  }

  // ---------- Schreibstatistik ----------
  async loadDailyWords(days = 365): Promise<DailyWordEntry[]> {
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - (days - 1));
    const startKey = localDateKey(start);
    const rows = await db.daily_word_log
      .where("date").aboveOrEqual(startKey)
      .toArray();
    const map = new Map(rows.map((r) => [r.date, r.words_added]));
    const out: DailyWordEntry[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const key = localDateKey(d);
      out.push({ date: key, words_added: map.get(key) ?? 0 });
    }
    return out;
  }

  async loadDailyStats(): Promise<DailyStatsSummary> {
    const entries = await this.loadDailyWords(365);
    const series = entries.map((e) => e.words_added);
    const wordsToday = series.length > 0 ? series[series.length - 1] : 0;
    const weekDays = daysSinceMondayInclusive();
    const wordsThisWeek = series.slice(-weekDays).reduce((a, b) => a + b, 0);
    const streakDays = streakFromSeries(series);
    const activeDays = series.filter((w) => w > 0).length;
    const totalWords = series.reduce((a, b) => a + b, 0);
    return {
      wordsToday, wordsThisWeek, streakDays,
      dailyWords: series, activeDays, totalWords,
    };
  }
}

function streakFromSeries(words: number[]): number {
  // Spiegel von core/lib/dailyWords::streakFromSeries.
  if (words.length === 0) return 0;
  const last = words.length - 1;
  let streak = 0;
  let i = words[last] === 0 ? last - 1 : last;
  while (i >= 0 && words[i] > 0) {
    streak++;
    i--;
  }
  return streak;
}

function daysSinceMondayInclusive(d: Date = new Date()): number {
  const iso = d.getDay() === 0 ? 7 : d.getDay();
  return iso;
}

// Slot-Registrierung beim Modul-Load. main.tsx ordnet die Imports so,
// dass der SQL-Default-Adapter aus core/lib/api zuerst greift und hier
// direkt danach überschrieben wird.
setStorageAdapter(new IndexedDbStorage());
