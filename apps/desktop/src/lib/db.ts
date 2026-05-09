// TypeScript-side SQLite access via @tauri-apps/plugin-sql.
//
// Phase 11 end-state: TS owns the database completely. plugin-sql opens
// `<app_data_dir>/scriptz.db` and runs the migration list registered in
// src-tauri/src/lib.rs. WAL + foreign_keys=ON are sqlx-sqlite defaults,
// matching what the old Rust bootstrap used to set explicitly.

import Database from "@tauri-apps/plugin-sql";

let dbPromise: Promise<Database> | null = null;

/** Lazily open (and cache) the connection to scriptz.db. */
export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:scriptz.db");
  }
  return dbPromise;
}

// ===== settings =====
//
// Free-form string key-value store backing user preferences (theme,
// highlighting default, update-check flags, etc.). The Rust side used
// to expose get_setting/set_setting commands; since Migration Phase 2
// the frontend writes directly via plugin-sql.

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{ value: string }[]>(
    "SELECT value FROM settings WHERE key = $1",
    [key],
  );
  return rows.length > 0 ? rows[0].value : null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO settings (key, value) VALUES ($1, $2) " +
      "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value],
  );
}

// ===== app_state =====
//
// Same shape as settings but reserved for runtime state the user does
// not directly configure: open tabs, last-active folder, per-script
// quick-mode flags, welcome-script seed marker.

export async function getAppState(key: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{ value: string }[]>(
    "SELECT value FROM app_state WHERE key = $1",
    [key],
  );
  return rows.length > 0 ? rows[0].value : null;
}

export async function setAppState(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO app_state (key, value) VALUES ($1, $2) " +
      "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value],
  );
}

