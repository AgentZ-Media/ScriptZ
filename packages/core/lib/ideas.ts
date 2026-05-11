// Ideen-Inbox - eigenständige CRUD-Schicht.
//
// Eine Idee ist ein leichtgewichtiger Container ("Worüber will ich
// schreiben?") - kein Skript, kein Editor. Konvertieren wandelt sie
// in ein neues Skript um, behält die Idee aber als „verwendet" mit
// Verweis auf die Skript-ID. Löschen einer Idee greift den
// dazugehörigen Skript-Inhalt nicht an; das Skript steht weiter im
// Browser. Wird das Skript gelöscht, setzt der ON DELETE SET NULL FK
// die script_id der Idee zurück - die Idee bleibt im „Verwendet"-Tab
// stehen, nur ohne klickbaren Link.

import { createScript } from "./scripts";
import { getDb } from "./db";
import { ideasBus } from "./ideasBus";
import { scriptsBus } from "./scriptsBus";
import { foldersBus } from "./foldersBus";
import type { Idea, ScriptSummary } from "./types";

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

/** Wandelt eine Idee in ein neues Skript um. Die Idee bleibt erhalten
 *  und wird mit `used_at` + `script_id` markiert. Optional kann der
 *  Aufrufer einen Folder mitgeben. */
export async function convertIdeaToScript(input: {
  ideaId: string;
  folderId?: string | null;
  /** Wenn true (default), wird die Notiz als erste Action in das neue
   *  Skript übernommen. */
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
    throw new Error("Idee wurde bereits konvertiert.");
  }

  // Schritt 1: Idee per CAS reservieren, BEVOR ein Skript angelegt
  // wird. Plugin-sql kennt keine Transaktionen, also serialisieren wir
  // konkurrierende Conversions über ein bedingtes UPDATE - nur einer
  // gewinnt. Verlierer bekommen einen Error statt Duplikat-Skripten.
  const claimedAt = Date.now();
  const claim = await db.execute(
    `UPDATE ideas SET used_at = $1 WHERE id = $2 AND used_at IS NULL`,
    [claimedAt, ideaRow.id],
  );
  if (claim.rowsAffected !== 1) {
    throw new Error("Idee wurde bereits konvertiert.");
  }

  const notesAsAction = input.notesAsAction ?? true;
  const seedJson = buildScriptSeed({
    notes: notesAsAction ? ideaRow.notes : "",
  });

  // Schritt 2: Skript anlegen. Schlägt das fehl, geben wir die
  // Reservierung wieder frei, damit die Idee nicht für immer als
  // "verwendet" ohne Link feststeckt.
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

  // Schritt 3: script_id nachtragen. Falls dieser Update fehlschlägt,
  // bleibt das Skript erhalten - die Idee zeigt im "Verwendet"-Tab
  // einfach keinen Link (siehe Migration 003-Doku, ON DELETE SET NULL).
  try {
    await db.execute(
      `UPDATE ideas SET script_id = $1 WHERE id = $2`,
      [script.id, ideaRow.id],
    );
  } catch (err) {
    console.warn("[scriptz] convertIdeaToScript: script_id-Backref fehlgeschlagen", err);
  }

  // Bump beider Busse: das neue Skript taucht in der Browser-Liste
  // auf, die Idee verschwindet aus „Offen" und erscheint in „Verwendet".
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

/** Erzeugt einen Lexical-State, der das neue Skript mit einem leeren
 *  Charakter-Block (Standard) ODER mit einem Action-Block startet,
 *  wenn die Idee Notizen liefert. Mirror der Welcome-Seed-Struktur,
 *  damit bestehende Plugins (allcaps, smartEnter etc.) funktionieren. */
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
