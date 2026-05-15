// Ideas inbox - standalone CRUD layer.
//
// An idea is a lightweight container ("What do I want to
// write about?") - not a script, not an editor. Converting transforms it
// into a new script but keeps the idea marked as "used" with
// a reference to the script ID. Deleting an idea does not touch the
// associated script content; the script stays in the
// browser. If the script is deleted, the ON DELETE SET NULL FK resets
// the idea's script_id - the idea stays in the "used" tab,
// just without a clickable link.

import { createScript } from "./scripts";
import { getDb } from "./db";
import { ideasBus } from "./ideasBus";
import { scriptsBus } from "./scriptsBus";
import { foldersBus } from "./foldersBus";
import type { Idea, ScriptSummary } from "./types";
import { t } from "../i18n";

interface IdeaRow {
  id: string;
  title: string;
  notes: string;
  created_at: number;
  used_at: number | null;
  script_id: string | null;
}

function rowToIdea(r: IdeaRow): Idea {
  return {
    id: r.id,
    title: r.title,
    notes: r.notes ?? "",
    created_at: r.created_at,
    used_at: r.used_at,
    script_id: r.script_id,
  };
}

export async function listIdeas(): Promise<Idea[]> {
  const db = await getDb();
  const rows = await db.select<IdeaRow[]>(
    `SELECT id, title, notes, created_at, used_at, script_id
     FROM ideas
     ORDER BY created_at DESC`,
  );
  return rows.map(rowToIdea);
}

export async function createIdea(input: {
  title: string;
  notes?: string;
}): Promise<Idea> {
  const title = input.title.trim();
  if (!title) throw new Error("Idea title must not be empty");
  const id = crypto.randomUUID();
  const now = Date.now();
  const db = await getDb();
  await db.execute(
    `INSERT INTO ideas (id, title, notes, created_at) VALUES ($1, $2, $3, $4)`,
    [id, title, input.notes ?? "", now],
  );
  ideasBus.bump();
  return {
    id, title, notes: input.notes ?? "", created_at: now,
    used_at: null, script_id: null,
  };
}

export async function updateIdea(input: {
  id: string;
  title?: string;
  notes?: string;
}): Promise<Idea> {
  const db = await getDb();
  if (input.title !== undefined) {
    const t = input.title.trim();
    if (!t) throw new Error("Idea title must not be empty");
    await db.execute(`UPDATE ideas SET title = $1 WHERE id = $2`, [t, input.id]);
  }
  if (input.notes !== undefined) {
    await db.execute(`UPDATE ideas SET notes = $1 WHERE id = $2`, [input.notes, input.id]);
  }
  const rows = await db.select<IdeaRow[]>(
    `SELECT id, title, notes, created_at, used_at, script_id FROM ideas WHERE id = $1`,
    [input.id],
  );
  if (rows.length === 0) throw new Error(`not found: idea ${input.id}`);
  ideasBus.bump();
  return rowToIdea(rows[0]);
}

export async function deleteIdea(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(`DELETE FROM ideas WHERE id = $1`, [id]);
  ideasBus.bump();
}

/** Converts an idea into a new script. The idea is kept
 *  and marked with `used_at` + `script_id`. The caller can optionally
 *  pass a folder. */
export async function convertIdeaToScript(input: {
  ideaId: string;
  folderId?: string | null;
  /** If true (default), the note is carried over as the first action
   *  into the new script. */
  notesAsAction?: boolean;
}): Promise<{ idea: Idea; script: ScriptSummary }> {
  const db = await getDb();
  const rows = await db.select<IdeaRow[]>(
    `SELECT id, title, notes, created_at, used_at, script_id FROM ideas WHERE id = $1`,
    [input.ideaId],
  );
  if (rows.length === 0) throw new Error(`not found: idea ${input.ideaId}`);
  const ideaRow = rows[0];
  if (ideaRow.used_at !== null) {
    throw new Error(t("error.ideaAlreadyConverted"));
  }

  // Step 1: reserve the idea via CAS BEFORE creating a script.
  // Plugin-sql has no transactions, so we serialize
  // concurrent conversions via a conditional UPDATE - only one
  // wins. Losers get an error instead of duplicate scripts.
  const claimedAt = Date.now();
  const claim = await db.execute(
    `UPDATE ideas SET used_at = $1 WHERE id = $2 AND used_at IS NULL`,
    [claimedAt, ideaRow.id],
  );
  if (claim.rowsAffected !== 1) {
    throw new Error(t("error.ideaAlreadyConverted"));
  }

  const notesAsAction = input.notesAsAction ?? true;
  const seedJson = buildScriptSeed({
    notes: notesAsAction ? ideaRow.notes : "",
  });

  // Step 2: create the script. If that fails, release the
  // reservation so the idea doesn't stay stuck as
  // "used" without a link forever.
  let script: ScriptSummary;
  try {
    script = await createScript(
      ideaRow.title,
      seedJson,
      input.folderId ?? null,
    );
  } catch (err) {
    await db.execute(
      `UPDATE ideas SET used_at = NULL, script_id = NULL WHERE id = $1 AND used_at = $2`,
      [ideaRow.id, claimedAt],
    );
    throw err;
  }

  // Step 3: backfill script_id. If this update fails,
  // the script is preserved - the idea just shows no link
  // in the "used" tab (see migration 003 docs, ON DELETE SET NULL).
  try {
    await db.execute(
      `UPDATE ideas SET script_id = $1 WHERE id = $2`,
      [script.id, ideaRow.id],
    );
  } catch (err) {
    console.warn("[scriptz] convertIdeaToScript: script_id backref failed", err);
  }

  // Bump both buses: the new script appears in the browser list,
  // the idea disappears from "open" and appears in "used".
  scriptsBus.bump();
  foldersBus.bump();
  ideasBus.bump();

  const updatedIdea: Idea = {
    ...rowToIdea(ideaRow),
    used_at: claimedAt,
    script_id: script.id,
  };
  return { idea: updatedIdea, script };
}

/** Generates a Lexical state that starts the new script with an empty
 *  character block (default) OR with an action block when the
 *  idea provides notes. Mirrors the welcome seed structure
 *  so existing plugins (allcaps, smartEnter etc.) work. */
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
