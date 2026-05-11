// Platform abstraction layer.
//
// Everything in @scriptz/core is platform-neutral TypeScript. Anything that
// needs native capabilities - SQLite, file dialogs, file system writes,
// reveal-in-folder, app version, open-external-URL - goes through this
// adapter interface. The desktop app registers a Tauri-backed adapter at
// startup; a future web app would register an IndexedDB + Blob-download
// adapter.
//
// IMPORTANT: do not add @tauri-apps/* imports here. This file must stay
// platform-neutral so the web build can include it without pulling Tauri.

import type { ScriptCharacter } from "./types";

// ===== Host platform =====
//
// The three OS families we care about. iOS / Android map to "linux"
// for now (their webview behaviour is closer to linux than to macos
// from the editor's perspective). Stays sync for the app's lifetime.

export type Platform = "macos" | "windows" | "linux";

// ===== Database connection =====
//
// Structural interface - Tauri's @tauri-apps/plugin-sql Database class
// satisfies this directly, so the desktop adapter can pass its Database
// instance without any wrapper. A future web adapter would implement
// these two methods on top of IndexedDB or sql.js.
export interface DbConnection {
  select<T>(query: string, bindValues?: unknown[]): Promise<T>;
  execute(
    query: string,
    bindValues?: unknown[],
  ): Promise<{ lastInsertId?: number; rowsAffected: number }>;
}

// ===== Export pipeline =====
//
// The export functions live in the host app (they need plugin-fs to write
// the actual bytes), but their interface is shared so api.ts in core can
// call them via the adapter.

export interface ExportPdfInput {
  scriptId: string;
  path: string;
  includeHighlighting: boolean;
  includeTitlePage: boolean;
}

export interface ExportPdfDeps {
  title: string;
  contentJson: string;
  characters: ScriptCharacter[];
}

export interface ExportPlaintextInput {
  scriptId: string;
  path: string;
}

// ===== Save dialog =====

export interface SaveDialogFilter {
  name: string;
  extensions: string[];
}

export interface SaveDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: SaveDialogFilter[];
}

// ===== Adapter interface =====

export interface PlatformAdapter {
  /** Operating system this app runs on. Synchronous and static for the
   * app's lifetime - host detects once at startup. */
  platform: Platform;

  /** Return a live database connection. May be lazy. */
  getDb(): Promise<DbConnection>;

  /** Read the running app version (e.g. "0.7.3"). */
  getVersion(): Promise<string>;

  /** Open an external URL in the user's default browser. */
  openUrl(url: string): Promise<void>;

  /** Reveal the given absolute path in Finder/Explorer. No-op on web. */
  revealInFolder(path: string): Promise<void>;

  /** Native save dialog. Returns the chosen path or null if cancelled. */
  saveDialog(opts: SaveDialogOptions): Promise<string | null>;

  /** Build a PDF for the given script and write it to the chosen path. */
  exportPdf(
    input: ExportPdfInput,
    loadDeps: (scriptId: string) => Promise<ExportPdfDeps>,
  ): Promise<{ path: string }>;

  /** Write a teleprompter plaintext for the given script. */
  exportPlaintext(
    input: ExportPlaintextInput,
    loadContent: (scriptId: string) => Promise<string>,
  ): Promise<{ path: string }>;
}

let adapter: PlatformAdapter | null = null;

export function setPlatformAdapter(p: PlatformAdapter): void {
  adapter = p;
}

export function getPlatformAdapter(): PlatformAdapter {
  if (!adapter) {
    throw new Error(
      "Platform adapter not set. The host app must call setPlatformAdapter() before rendering.",
    );
  }
  return adapter;
}

/** Write the host platform onto `<html data-platform="...">` so plattform-
 * spezifische CSS-Regeln (Trafficlight-Padding etc.) greifen koennen.
 * No-op in non-DOM environments. Hosts rufen das am Ende ihrer
 * platform.ts auf, nachdem `setPlatformAdapter()` durch ist. */
export function applyPlatformToDocument(): void {
  if (typeof document === "undefined" || !adapter) return;
  document.documentElement.dataset.platform = adapter.platform;
}
