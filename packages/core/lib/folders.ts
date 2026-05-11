// Folders + script-to-folder moves.
//
// TS port of src-tauri/src/commands/folders.rs (Migration Phase 4).
// Schema is unchanged: `folders(id, name, created_at, updated_at)` plus the
// `scripts.folder_id` FK. Deleting a folder relies on `ON DELETE SET NULL`
// to surface its scripts in "Alle" rather than cascading the delete.
//
// Caveat (same as Phase 3): tauri-plugin-sql exposes no transaction API in
// JS, so `moveScripts` issues N independent UPDATEs instead of wrapping
// them in a transaction. A crash mid-loop leaves a partial move; the user
// can re-issue the action with no data damage. The original Rust used a
// transaction here only for atomicity, not for correctness - every UPDATE
// is independent.

import { getDb } from "./db";
import type { Folder } from "./types";

interface FolderRow {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
  script_count: number;
}

/** Total count of live (non-archived) scripts. Drives the "Alle" chip in
 *  the Browser, where summing per-folder counts would miss the
 *  ungrouped-script case. */
export async function countLiveScripts(): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ n: number }[]>(
    "SELECT COUNT(*) AS n FROM scripts WHERE archived_at IS NULL",
  );
  return rows[0]?.n ?? 0;
}

export async function listFolders(): Promise<Folder[]> {
  const db = await getDb();
  return db.select<FolderRow[]>(
    `SELECT f.id, f.name, f.created_at, f.updated_at,
            (SELECT COUNT(*) FROM scripts s
              WHERE s.folder_id = f.id AND s.archived_at IS NULL) AS script_count
     FROM folders f
     ORDER BY f.name COLLATE NOCASE ASC`,
  );
}

export async function createFolder(name: string): Promise<Folder> {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error("folder name must not be empty");
  }
  const db = await getDb();
  const id = crypto.randomUUID();
  const now = Date.now();
  await db.execute(
    "INSERT INTO folders (id, name, created_at, updated_at) VALUES ($1, $2, $3, $3)",
    [id, trimmed, now],
  );
  return {
    id,
    name: trimmed,
    created_at: now,
    updated_at: now,
    script_count: 0,
  };
}

export async function renameFolder(id: string, name: string): Promise<Folder> {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error("folder name must not be empty");
  }
  const db = await getDb();
  const now = Date.now();
  const res = await db.execute(
    "UPDATE folders SET name = $1, updated_at = $2 WHERE id = $3",
    [trimmed, now, id],
  );
  if (res.rowsAffected === 0) {
    throw new Error(`not found: folder ${id}`);
  }
  const cntRows = await db.select<{ n: number }[]>(
    "SELECT COUNT(*) AS n FROM scripts WHERE folder_id = $1 AND archived_at IS NULL",
    [id],
  );
  const createdRows = await db.select<{ created_at: number }[]>(
    "SELECT created_at FROM folders WHERE id = $1",
    [id],
  );
  return {
    id,
    name: trimmed,
    created_at: createdRows[0]?.created_at ?? now,
    updated_at: now,
    script_count: cntRows[0]?.n ?? 0,
  };
}

/** FK ON DELETE SET NULL takes care of orphaned scripts - they reappear
 *  in "Alle" without their folder_id. Scripts are never auto-deleted with
 *  the folder; that would be confusing and there's no UNDO. */
export async function deleteFolder(id: string): Promise<void> {
  const db = await getDb();
  const res = await db.execute("DELETE FROM folders WHERE id = $1", [id]);
  if (res.rowsAffected === 0) {
    throw new Error(`not found: folder ${id}`);
  }
}

export async function moveScript(
  scriptId: string,
  folderId: string | null,
): Promise<void> {
  const db = await getDb();
  if (folderId !== null) {
    const exists = await db.select<{ n: number }[]>(
      "SELECT COUNT(*) AS n FROM folders WHERE id = $1",
      [folderId],
    );
    if ((exists[0]?.n ?? 0) === 0) {
      throw new Error(`not found: folder ${folderId}`);
    }
  }
  const now = Date.now();
  const res = await db.execute(
    "UPDATE scripts SET folder_id = $1, updated_at = $2 WHERE id = $3",
    [folderId, now, scriptId],
  );
  if (res.rowsAffected === 0) {
    throw new Error(`not found: script ${scriptId}`);
  }
}

export async function moveScripts(
  scriptIds: string[],
  folderId: string | null,
): Promise<void> {
  if (scriptIds.length === 0) return;
  const db = await getDb();
  if (folderId !== null) {
    const exists = await db.select<{ n: number }[]>(
      "SELECT COUNT(*) AS n FROM folders WHERE id = $1",
      [folderId],
    );
    if ((exists[0]?.n ?? 0) === 0) {
      throw new Error(`not found: folder ${folderId}`);
    }
  }
  const now = Date.now();
  const missing: string[] = [];
  for (const sid of scriptIds) {
    const res = await db.execute(
      "UPDATE scripts SET folder_id = $1, updated_at = $2 WHERE id = $3",
      [folderId, now, sid],
    );
    if ((res.rowsAffected ?? 0) === 0) missing.push(sid);
  }
  if (missing.length > 0) {
    throw new Error(`not found: script(s) ${missing.join(", ")}`);
  }
}
