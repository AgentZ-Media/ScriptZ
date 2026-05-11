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
// Die PDF-/Plaintext-Generatoren leben jetzt komplett in core
// (siehe ./exportPdf.ts und lex.ts::extractTeleprompterText) und
// produzieren reine Bytes/Strings. Der PlatformAdapter kuemmert sich
// nur noch ums Schreiben der Bytes - Desktop via plugin-fs, Web via
// Blob-Download. Siehe `saveAs` weiter unten.

export interface ExportPdfDeps {
  title: string;
  contentJson: string;
  characters: ScriptCharacter[];
}

// ===== Save / Open Filter =====

export interface SaveDialogFilter {
  name: string;
  extensions: string[];
}

export interface SaveDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: SaveDialogFilter[];
}

// ===== Datei-Persistenz =====
//
// Schmale Abstraktion fuer "Datei rausschreiben" / "Datei lesen". Wird von
// allen Export-Pfaden (PDF, Plaintext, .scriptz) genutzt. Desktop oeffnet
// einen nativen Save/Open-Dialog und schreibt/liest via plugin-fs; Web
// triggert Blob-Download bzw. zeigt `<input type="file">`.

export interface SaveAsOptions {
  /** Vorgeschlagener Dateiname inkl. Endung. Wird bei Desktop in den
   *  Save-Dialog vorbelegt, bei Web als `download`-Attribut gesetzt. */
  suggestedName: string;
  /** MIME-Type fuer Web's Blob; auf Desktop irrelevant. */
  mimeType: string;
  /** Optionale Dateitypen-Filter fuer den nativen Dialog. Web ignoriert. */
  filters?: SaveDialogFilter[];
}

export interface SaveAsResult {
  /** True wenn der User den Save-Dialog (Desktop) abgebrochen hat. */
  cancelled: boolean;
  /** Absoluter Pfad, an den geschrieben wurde - nur Desktop. Web setzt
   *  null, weil der Browser keinen Pfad zurueckgibt. */
  path: string | null;
}

export interface OpenFileResult {
  name: string;
  bytes: Uint8Array;
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

  /** Native save dialog. Returns the chosen path or null if cancelled.
   *  Niedriger-Level-API - wer Bytes schreiben will, nimmt `saveAs`. */
  saveDialog(opts: SaveDialogOptions): Promise<string | null>;

  /** Schreibt die uebergebenen Bytes als Datei raus. Desktop oeffnet
   *  einen Save-Dialog und schreibt via plugin-fs; Web triggert einen
   *  Blob-Download (kein Save-Dialog im Browser). */
  saveAs(opts: SaveAsOptions, bytes: Uint8Array): Promise<SaveAsResult>;

  /** Liest eine vom User ausgewaehlte Datei. Desktop oeffnet Open-Dialog
   *  + plugin-fs::readFile; Web zeigt `<input type="file">`. `accept` ist
   *  die MIME-/Extension-Liste fuer den Filter (z.B. ".scriptz,application/x-scriptz+json").
   *  Returns null wenn der User abbricht. */
  openFile(accept: string): Promise<OpenFileResult | null>;
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
