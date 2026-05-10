// Script CRUD — full module since Migration Phase 7a-d.
//
// TS port of src-tauri/src/commands/scripts.rs. Replaces the Rust
// implementation entirely as of Phase 7d; scripts.rs is gone.
//
// Reconciliation: every content save walks the JSON for character
// names and picks colours by the override > sticky > default > palette
// priority, back-filling the app-wide default registry for unseen
// names. Identical algorithm to what Rust used to run, so existing
// scripts keep their colour assignments across the migration.
//
// FK behaviour: tauri-plugin-sql opens connections via sqlx-sqlite,
// which sets `PRAGMA foreign_keys = ON` by default. DELETEs on
// `scripts` therefore cascade into `snapshots` (declared ON DELETE
// CASCADE in migration v2) without an explicit pre-delete here.
//
// Transaction caveat: plugin-sql exposes no JS transaction API, so
// multi-statement updates run as independent auto-committed
// statements. For update_script that means a concurrent save can
// interleave field writes — in practice all callers go through the
// debounced save in Editor.tsx, so the race window is small. FTS
// refresh runs after the row update; a search hit landing in the
// micro-window between can show stale snippets, which the next save
// corrects.

import {
  DEFAULT_PALETTE,
  eqIgnoreAsciiCase,
  loadColorRecords,
  parseCharsMeta,
  serializeCharsMeta,
  upsertDefaultColor,
  type ColorRecord,
} from "./characterColors";
import { countWordsInContent, recordWordDelta } from "./dailyWords";
import { getDb } from "./db";
import { deleteScriptFts, refreshFtsForScript } from "./fts";
import { dialogWordsByCharacter, extractCharacterNames } from "./lex";
import type { Script, ScriptCharacter, ScriptSummary } from "./types";

interface SummaryRow {
  id: string;
  title: string;
  highlighting_enabled: number | null;
  characters_meta: string;
  created_at: number;
  updated_at: number;
  archived_at: number | null;
  page_count: number;
  last_word_count: number;
  folder_id: string | null;
}

interface FullRow extends SummaryRow {
  content_json: string;
}

async function rowToSummary(id: string): Promise<ScriptSummary> {
  const db = await getDb();
  const rows = await db.select<SummaryRow[]>(
    `SELECT id, title, highlighting_enabled, characters_meta,
            created_at, updated_at, archived_at, page_count,
            last_word_count, folder_id
     FROM scripts WHERE id = $1`,
    [id],
  );
  if (rows.length === 0) {
    throw new Error(`not found: script ${id}`);
  }
  const r = rows[0];
  return {
    id: r.id,
    title: r.title,
    highlighting_enabled: r.highlighting_enabled,
    characters: parseCharsMeta(r.characters_meta),
    created_at: r.created_at,
    updated_at: r.updated_at,
    archived_at: r.archived_at,
    page_count: r.page_count,
    word_count: r.last_word_count,
    folder_id: r.folder_id,
  };
}

export async function getScript(id: string): Promise<Script> {
  const db = await getDb();
  const rows = await db.select<FullRow[]>(
    `SELECT id, title, highlighting_enabled, content_json, characters_meta,
            created_at, updated_at, archived_at, page_count,
            last_word_count, folder_id
     FROM scripts WHERE id = $1`,
    [id],
  );
  if (rows.length === 0) {
    throw new Error(`not found: script ${id}`);
  }
  const r = rows[0];
  return {
    id: r.id,
    title: r.title,
    highlighting_enabled: r.highlighting_enabled,
    content_json: r.content_json,
    characters: parseCharsMeta(r.characters_meta),
    created_at: r.created_at,
    updated_at: r.updated_at,
    archived_at: r.archived_at,
    page_count: r.page_count,
    word_count: r.last_word_count,
    folder_id: r.folder_id,
  };
}

export interface ListScriptsQuery {
  includeArchived?: boolean | null;
  onlyArchived?: boolean | null;
  sort?: "updated" | "created" | "title" | null;
  query?: string | null;
  limit?: number | null;
  offset?: number | null;
  folderId?: string | null;
}

export async function listScripts(q: ListScriptsQuery): Promise<ScriptSummary[]> {
  const db = await getDb();
  // Single round-trip: alle Spalten in einem SELECT statt N+1
  // (vorher: erst SELECT id …, dann für jede Zeile ein eigenes SELECT
  // via rowToSummary). Bei jedem Boot ging dadurch pro Skript ein
  // Tauri-IPC-Hop drauf — bei 3 Skripten waren das 4 Calls statt 1.
  let sql =
    "SELECT id, title, highlighting_enabled, characters_meta, " +
    "created_at, updated_at, archived_at, page_count, " +
    "last_word_count, folder_id " +
    "FROM scripts WHERE 1=1";
  const args: (string | number)[] = [];
  let p = 1;

  const onlyArchived = q.onlyArchived ?? false;
  const includeArchived = q.includeArchived ?? false;
  if (onlyArchived) {
    sql += " AND archived_at IS NOT NULL";
  } else if (!includeArchived) {
    sql += " AND archived_at IS NULL";
  }

  const trimmedQuery = q.query?.trim();
  if (trimmedQuery && trimmedQuery.length > 0) {
    sql += ` AND title LIKE $${p}`;
    args.push(`%${trimmedQuery}%`);
    p++;
  }

  if (q.folderId !== undefined && q.folderId !== null) {
    sql += ` AND folder_id = $${p}`;
    args.push(q.folderId);
    p++;
  }

  const sort = q.sort ?? "updated";
  if (sort === "created") {
    sql += " ORDER BY created_at DESC";
  } else if (sort === "title") {
    sql += " ORDER BY title COLLATE NOCASE ASC";
  } else {
    sql += " ORDER BY updated_at DESC";
  }

  if (q.limit !== undefined && q.limit !== null) {
    sql += ` LIMIT $${p}`;
    args.push(q.limit);
    p++;
    if (q.offset !== undefined && q.offset !== null) {
      sql += ` OFFSET $${p}`;
      args.push(q.offset);
      p++;
    }
  }

  const rows = await db.select<SummaryRow[]>(sql, args);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    highlighting_enabled: r.highlighting_enabled,
    characters: parseCharsMeta(r.characters_meta),
    created_at: r.created_at,
    updated_at: r.updated_at,
    archived_at: r.archived_at,
    page_count: r.page_count,
    word_count: r.last_word_count,
    folder_id: r.folder_id,
  }));
}

export async function createScript(
  title: string | null,
  initialContentJson: string | null,
  folderId: string | null,
): Promise<ScriptSummary> {
  const db = await getDb();
  const id = crypto.randomUUID();
  const now = Date.now();
  const finalTitle = title ?? "Unbenannt";
  const contentJson = initialContentJson ?? emptyLexicalState();

  const records = await loadColorRecords();
  const { chars, newDefaults } = reconcileCharsFromContent([], contentJson, records);
  for (const [n, c] of newDefaults) {
    await upsertDefaultColor(n, c, now);
  }
  const charsJson = serializeCharsMeta(chars);

  if (folderId !== null) {
    const exists = await db.select<{ n: number }[]>(
      "SELECT COUNT(*) AS n FROM folders WHERE id = $1",
      [folderId],
    );
    if ((exists[0]?.n ?? 0) === 0) {
      throw new Error(`not found: folder ${folderId}`);
    }
  }

  // Initial-Wortcount des Seed-Inhalts. Wir wollen nicht, dass der
  // erste echte Save den vollen Welcome-Text als „heute geschrieben"
  // zählt; deshalb wird last_word_count direkt auf den Wortcount des
  // Seeds gesetzt. Eine Idee-zu-Skript-Konvertierung mit Notiz-Action
  // wird damit auch korrekt eingerechnet (die paar Notiz-Wörter
  // zählen nicht als Schreib-Aktivität, weil sie nicht beim Save
  // hinzukamen).
  const initialWordCount = countWordsInContent(contentJson);

  await db.execute(
    `INSERT INTO scripts (id, title, highlighting_enabled, content_json, characters_meta,
                          created_at, updated_at, page_count, folder_id, last_word_count)
     VALUES ($1, $2, NULL, $3, $4, $5, $5, 1, $6, $7)`,
    [id, finalTitle, contentJson, charsJson, now, folderId, initialWordCount],
  );
  await refreshFtsForScript(id);
  return rowToSummary(id);
}

export async function duplicateScript(id: string): Promise<ScriptSummary> {
  const src = await getScript(id);
  const db = await getDb();
  const newId = crypto.randomUUID();
  const now = Date.now();
  const newTitle = `${src.title} (Kopie)`;
  const charsJson = serializeCharsMeta(src.characters);
  // Duplikat: last_word_count auf den aktuellen Wortcount der Quelle
  // setzen, damit ein direktes Bearbeiten danach nur den Delta zählt
  // (sonst würde die erste Speicherung den ganzen kopierten Text als
  // „heute geschrieben" einrechnen).
  const wc = countWordsInContent(src.content_json);
  await db.execute(
    `INSERT INTO scripts (id, title, highlighting_enabled, content_json, characters_meta,
                          created_at, updated_at, page_count, folder_id, last_word_count)
     VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, $9)`,
    [
      newId,
      newTitle,
      src.highlighting_enabled,
      src.content_json,
      charsJson,
      now,
      src.page_count,
      src.folder_id,
      wc,
    ],
  );
  await refreshFtsForScript(newId);
  return rowToSummary(newId);
}

export async function renameScript(id: string, title: string): Promise<ScriptSummary> {
  const db = await getDb();
  const now = Date.now();
  await db.execute(
    "UPDATE scripts SET title = $1, updated_at = $2 WHERE id = $3",
    [title, now, id],
  );
  await refreshFtsForScript(id);
  return rowToSummary(id);
}

export interface UpdateScriptInput {
  id: string;
  title?: string;
  /** `null` clears the override (= follow global default). `undefined` =
   *  no change. The Rust `Option<Option<i64>>` shape collapses to this
   *  in JS because `undefined` simply isn't sent. */
  highlightingEnabled?: number | null;
  contentJson?: string;
  pageCount?: number;
  /** Caller-supplied override of the per-script character list (e.g.
   *  the user picked a colour). Replaces characters_meta directly,
   *  bypassing the reconcile step. */
  characters?: ScriptCharacter[];
}

export async function updateScript(input: UpdateScriptInput): Promise<ScriptSummary> {
  const db = await getDb();
  const now = Date.now();

  const existRows = await db.select<{ n: number }[]>(
    "SELECT COUNT(*) AS n FROM scripts WHERE id = $1",
    [input.id],
  );
  if ((existRows[0]?.n ?? 0) === 0) {
    throw new Error(`not found: script ${input.id}`);
  }

  if (input.title !== undefined) {
    await db.execute(
      "UPDATE scripts SET title = $1, updated_at = $2 WHERE id = $3",
      [input.title, now, input.id],
    );
  }
  if (input.highlightingEnabled !== undefined) {
    await db.execute(
      "UPDATE scripts SET highlighting_enabled = $1, updated_at = $2 WHERE id = $3",
      [input.highlightingEnabled, now, input.id],
    );
  }
  if (input.contentJson !== undefined) {
    // Compare-and-swap loop um Diff-on-Save: plugin-sql kennt keine
    // Transaktionen, also sichern wir die Wort-Delta-Buchung über ein
    // bedingtes UPDATE ab. Liest zwei parallele Saves denselben
    // last_word_count, würde sonst beider delta in daily_word_log
    // landen - der heutige Bucket ware dann doppelt gezählt.
    const newWordCount = countWordsInContent(input.contentJson);
    const records = await loadColorRecords();
    let delta = 0;
    let attempts = 0;
    while (true) {
      attempts++;
      const metaRows = await db.select<{
        characters_meta: string;
        last_word_count: number | null;
      }[]>(
        "SELECT characters_meta, last_word_count FROM scripts WHERE id = $1",
        [input.id],
      );
      if (metaRows.length === 0) {
        throw new Error(`not found: script ${input.id}`);
      }
      const existing = parseCharsMeta(metaRows[0]?.characters_meta ?? "[]");
      const lastWordCount = metaRows[0]?.last_word_count ?? 0;
      const { chars, newDefaults } = reconcileCharsFromContent(
        existing,
        input.contentJson,
        records,
      );
      for (const [n, c] of newDefaults) {
        await upsertDefaultColor(n, c, now);
      }
      const charsJson = serializeCharsMeta(chars);

      // last_word_count === -1 ist der Sentinel aus Migration 003 für
      // Bestandsskripte: der erste Save nach dem Update normalisiert nur
      // den Count, ohne den ganzen bisherigen Wortbestand als "heute
      // geschrieben" zu buchen.
      const isFirstMeasurement = lastWordCount < 0;
      const candidateDelta = isFirstMeasurement ? 0 : newWordCount - lastWordCount;

      const result = await db.execute(
        `UPDATE scripts
           SET content_json = $1, characters_meta = $2, updated_at = $3, last_word_count = $4
           WHERE id = $5 AND last_word_count = $6`,
        [input.contentJson, charsJson, now, newWordCount, input.id, lastWordCount],
      );
      if (result.rowsAffected === 1) {
        delta = candidateDelta;
        break;
      }
      // Retry-Limit als Notbremse: in der Praxis serialisiert der
      // 250 ms-Debounce in Editor.tsx alle Saves desselben Skripts -
      // ein Konflikt darf hier maximal einmal auftreten.
      if (attempts >= 5) {
        console.warn("[scriptz] CAS-Retry-Limit erreicht beim Save", input.id);
        break;
      }
    }

    if (delta > 0) {
      try {
        await recordWordDelta(delta);
      } catch (err) {
        // Statistik-Schreibfehler dürfen den Save nicht killen.
        console.warn("[scriptz] daily word log update failed", err);
      }
    }
  }
  if (input.pageCount !== undefined) {
    await db.execute(
      "UPDATE scripts SET page_count = $1, updated_at = $2 WHERE id = $3",
      [input.pageCount, now, input.id],
    );
  }
  // characters_meta is already reconciled from input.contentJson above.
  // If a caller passed both, the contentJson reconciliation wins —
  // overwriting it with input.characters here would silently revert the
  // sticky-color logic. Only honour input.characters when no contentJson
  // change accompanies it (e.g. colour-picker edits without body change).
  if (input.characters !== undefined && input.contentJson === undefined) {
    const charsJson = serializeCharsMeta(input.characters);
    await db.execute(
      "UPDATE scripts SET characters_meta = $1, updated_at = $2 WHERE id = $3",
      [charsJson, now, input.id],
    );
  }
  await refreshFtsForScript(input.id);
  return rowToSummary(input.id);
}

export async function archiveScript(id: string): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.execute(
    "UPDATE scripts SET archived_at = $1 WHERE id = $2",
    [now, id],
  );
}

export async function restoreScript(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE scripts SET archived_at = NULL WHERE id = $1",
    [id],
  );
}

/** Hard-delete a script. Snapshots cascade via the FK; FTS row is
 *  removed explicitly because the virtual table has no FK link. */
export async function purgeScript(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM scripts WHERE id = $1", [id]);
  await deleteScriptFts(id);
}

export async function emptyTrash(): Promise<void> {
  const db = await getDb();
  // FTS-Reihen müssen vor dem Skript-DELETE weg, weil die scripts_fts-
  // Tabelle keinen FK-Cascade hat (FTS5 contentless table). Zwei
  // Statements statt N+1: ein DELETE FROM scripts_fts (sub-query gegen
  // scripts), ein DELETE FROM scripts. Bei 50 archivierten Skripten
  // waren das vorher 100 Round-Trips, jetzt sind es 2.
  await db.execute(
    "DELETE FROM scripts_fts WHERE script_id IN " +
      "(SELECT id FROM scripts WHERE archived_at IS NOT NULL)",
  );
  await db.execute("DELETE FROM scripts WHERE archived_at IS NOT NULL");
}

// ---------- internal helpers ----------

/** Lexical state for a brand-new script: a single empty Charakter
 *  block. Mirrors the JSON Rust's `empty_lexical_state` builds. The
 *  exact byte-shape is irrelevant — Lexical re-serialises on the next
 *  save in its own key order. */
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

/** Reconcile the per-script character list with the names actually
 *  present in the latest content. Resolution priority per name:
 *    1. App-wide override (`override_color`)
 *    2. Existing per-script entry (sticky — preserves colours from
 *       before the global registry existed)
 *    3. App-wide default (`default_color`)
 *    4. Next palette colour not already claimed in this script
 *
 *  Returns the new chars list plus a list of `[name, color]` pairs
 *  whose `default_color` is still NULL in the registry alongside the
 *  colour they should be back-filled to. Callers must persist these
 *  so the global default converges. Literal port of Rust's
 *  `reconcile_chars_from_content`. */
function reconcileCharsFromContent(
  existing: ScriptCharacter[],
  contentJson: string,
  records: Map<string, ColorRecord>,
): { chars: ScriptCharacter[]; newDefaults: [string, string][] } {
  const names = extractCharacterNames(contentJson);
  const wordsByChar = dialogWordsByCharacter(contentJson);
  let totalDialog = 0;
  for (const v of Object.values(wordsByChar)) totalDialog += v;
  const out: ScriptCharacter[] = [];
  const newDefaults: [string, string][] = [];
  for (const name of names) {
    const upper = name.toUpperCase();
    const rec = records.get(upper);

    let chosen: string;
    const override = rec?.override_color ?? null;
    if (override !== null) {
      chosen = override;
    } else {
      const stuck = existing.find((c) => eqIgnoreAsciiCase(c.name, name));
      if (stuck) {
        chosen = stuck.color;
      } else {
        const fallbackDefault = rec?.default_color ?? null;
        if (fallbackDefault !== null) {
          chosen = fallbackDefault;
        } else {
          const used = new Set<string>();
          for (const c of out) used.add(c.color);
          const usedExisting = new Set<string>();
          for (const c of existing) usedExisting.add(c.color);
          const palette = DEFAULT_PALETTE.find(
            (p) => !used.has(p) && !usedExisting.has(p),
          );
          chosen = palette ?? DEFAULT_PALETTE[0];
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
    const upperName = name.toUpperCase();
    const words = wordsByChar[upperName] ?? 0;
    const share = totalDialog > 0 ? words / totalDialog : 0;
    out.push({ name, color: chosen, share });
  }
  return { chars: out, newDefaults };
}
