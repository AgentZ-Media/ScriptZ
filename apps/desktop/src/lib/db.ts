// TypeScript-side SQLite access via @tauri-apps/plugin-sql.
//
// During the Rust → TS migration this module sits ALONGSIDE the Rust
// db.rs / commands. Both sides open the same SQLite file
// (`<app_data_dir>/scriptz.db`). WAL mode is set on disk by the Rust
// bootstrap pass (db.rs Db::open) and persists across opens, so this
// connection inherits it.
//
// Only Rust writes for now. This module currently exposes a lazy
// getter and a health check used as a smoke test. Per-feature TS
// implementations land here phase by phase.

import Database from "@tauri-apps/plugin-sql";
import { invoke } from "./tauri";

/**
 * Migration-only: forward a message into Rust's `tracing` stream so it
 * lands in the terminal where `tauri:dev` runs. Useful when WebKit
 * DevTools console output is hard to read or filtered.
 */
export async function termLog(
  level: "info" | "warn" | "error",
  message: string,
): Promise<void> {
  try {
    await invoke("frontend_log", { level, message });
  } catch {
    // best-effort; never break callers
  }
}

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

export interface DbHealth {
  userVersion: number;
  scriptCount: number;
  walMode: string;
}

/**
 * Sanity check that TS can see the same DB Rust opened. Read-only.
 * Used once on app start to verify the plugin-sql wiring; safe to call
 * repeatedly.
 */
export async function healthCheck(): Promise<DbHealth> {
  const db = await getDb();
  const versionRows = await db.select<{ user_version: number }[]>(
    "PRAGMA user_version",
  );
  const journalRows = await db.select<{ journal_mode: string }[]>(
    "PRAGMA journal_mode",
  );
  const scriptRows = await db.select<{ n: number }[]>(
    "SELECT COUNT(*) AS n FROM scripts",
  );
  return {
    userVersion: versionRows[0]?.user_version ?? -1,
    scriptCount: scriptRows[0]?.n ?? -1,
    walMode: journalRows[0]?.journal_mode ?? "unknown",
  };
}
