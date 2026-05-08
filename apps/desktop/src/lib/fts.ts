// FTS5 helpers — TS-side mirror of src-tauri/src/fts.rs.
//
// During the Rust -> TS migration both sides write to the same
// `scripts_fts` virtual table (DELETE + INSERT). The Rust scripts.rs
// commands still own create/update writes; this module is used by the
// TS-side snapshot restore (Phase 5) and will absorb the rest in
// Phase 7.

import { extractPlainText } from "./lex";
import { getDb } from "./db";

/** Replace the FTS row for one script with the given title + content text.
 *  Mirrors Rust's `upsert_script_fts` — DELETE then INSERT, no UPSERT
 *  because FTS5 contentless tables don't support ON CONFLICT. */
export async function upsertScriptFts(
  scriptId: string,
  title: string,
  contentText: string,
): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM scripts_fts WHERE script_id = $1", [scriptId]);
  await db.execute(
    "INSERT INTO scripts_fts (script_id, title, content_text) VALUES ($1, $2, $3)",
    [scriptId, title, contentText],
  );
}

export async function deleteScriptFts(scriptId: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM scripts_fts WHERE script_id = $1", [scriptId]);
}

/** Convenience: read the script's title and content_json from the DB,
 *  derive plain text via the shared lex walker, and upsert. Same shape
 *  as Rust's `commands::scripts::refresh_fts_for_script`. Silently noops
 *  if the script no longer exists. */
export async function refreshFtsForScript(scriptId: string): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ title: string; content_json: string }[]>(
    "SELECT title, content_json FROM scripts WHERE id = $1",
    [scriptId],
  );
  if (rows.length === 0) return;
  const { title, content_json } = rows[0];
  const contentText = extractPlainText(content_json);
  await upsertScriptFts(scriptId, title, contentText);
}
