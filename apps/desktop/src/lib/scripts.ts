// Script CRUD — read paths plus create/duplicate/rename.
//
// TS port of src-tauri/src/commands/scripts.rs (Migration Phase 7a + 7b).
// Phase 7c will absorb update_script and Phase 7d the archive/restore/
// purge/trash handlers; until then those still live in Rust and write
// the same tables this module reads.
//
// Reconciliation parity: every save (create here, update on the Rust
// side) walks the content for character names, picks colours by the
// override > sticky > default > palette priority, and back-fills the
// app-wide default registry for unseen names. The two sides MUST agree
// on this logic byte-for-byte, otherwise the same name could land on
// different colours depending on which path saved last. The TS
// reconcile is a literal port of `reconcile_chars_from_content` so
// either side produces the same output for the same inputs.

import {
  DEFAULT_PALETTE,
  eqIgnoreAsciiCase,
  loadColorRecords,
  parseCharsMeta,
  serializeCharsMeta,
  upsertDefaultColor,
  type ColorRecord,
} from "./characterColors";
import { getDb } from "./db";
import { refreshFtsForScript } from "./fts";
import { extractCharacterNames } from "./lex";
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
  summary: string | null;
  folder_id: string | null;
}

interface FullRow extends SummaryRow {
  content_json: string;
}

async function rowToSummary(id: string): Promise<ScriptSummary> {
  const db = await getDb();
  const rows = await db.select<SummaryRow[]>(
    `SELECT id, title, highlighting_enabled, characters_meta,
            created_at, updated_at, archived_at, page_count, summary, folder_id
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
    summary: r.summary,
    folder_id: r.folder_id,
  };
}

export async function getScript(id: string): Promise<Script> {
  const db = await getDb();
  const rows = await db.select<FullRow[]>(
    `SELECT id, title, highlighting_enabled, content_json, characters_meta,
            created_at, updated_at, archived_at, page_count, summary, folder_id
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
    summary: r.summary,
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
  let sql = "SELECT id FROM scripts WHERE 1=1";
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

  const idRows = await db.select<{ id: string }[]>(sql, args);
  const out: ScriptSummary[] = [];
  // N+1 mirrors the Rust path. With the 200-row UI cap and SQLite WAL
  // this is fine; can be folded into one SELECT later if it becomes a
  // bottleneck.
  for (const { id } of idRows) {
    out.push(await rowToSummary(id));
  }
  return out;
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

  await db.execute(
    `INSERT INTO scripts (id, title, highlighting_enabled, content_json, characters_meta,
                          created_at, updated_at, page_count, folder_id)
     VALUES ($1, $2, NULL, $3, $4, $5, $5, 1, $6)`,
    [id, finalTitle, contentJson, charsJson, now, folderId],
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
  await db.execute(
    `INSERT INTO scripts (id, title, highlighting_enabled, content_json, characters_meta,
                          created_at, updated_at, page_count, folder_id)
     VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8)`,
    [
      newId,
      newTitle,
      src.highlighting_enabled,
      src.content_json,
      charsJson,
      now,
      src.page_count,
      src.folder_id,
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
    out.push({ name, color: chosen });
  }
  return { chars: out, newDefaults };
}
