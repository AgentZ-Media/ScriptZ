// Tauri-backed implementation of @scriptz/core's PlatformAdapter.
//
// Wird einmal beim App-Start aus index.tsx importiert und registriert
// einen konkreten Adapter, sodass der Core-Code - der nur das abstrakte
// DbConnection / SaveDialogOptions / saveAs etc. kennt - eine echte
// Implementierung zum Aufrufen hat.
//
// Alle @tauri-apps/*-Importe leben in dieser Datei (plus die wenigen
// anderen verbleibenden Desktop-only-Files: updates.ts,
// UpdateIndicator.tsx, tauri.ts, App.tsx's close-handler).
//
// Seit Phase 2F: keine eigenen exportPdf.ts / exportPlaintext.ts mehr.
// Die PDF-Bytes baut packages/core/lib/exportPdf.ts, der Plaintext
// kommt aus packages/core/lib/lex::extractTeleprompterText. Hier nur
// noch der "Bytes auf Disk"-Teil via saveAs.

import Database from "@tauri-apps/plugin-sql";
import { open as openDialog, save } from "@tauri-apps/plugin-dialog";
import { mkdir, readFile, writeFile } from "@tauri-apps/plugin-fs";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { getVersion } from "@tauri-apps/api/app";
import { platform as osPlatform } from "@tauri-apps/plugin-os";
import {
  applyPlatformToDocument,
  setPlatformAdapter,
  type DbConnection,
  type OpenFileResult,
  type Platform,
  type PlatformAdapter,
  type SaveAsOptions,
  type SaveAsResult,
} from "@scriptz/core/lib/platform";

// Map Tauri's OS string to our three-bucket Platform. iOS / Android
// would arrive on Tauri Mobile; for the desktop bundle we collapse
// anything non-Mac/Windows to "linux" so the keyboard + chrome path
// degrades sensibly.
function detectPlatform(): Platform {
  try {
    const p = osPlatform();
    if (p === "macos") return "macos";
    if (p === "windows") return "windows";
    return "linux";
  } catch {
    return "macos";
  }
}

// Lazy plugin-sql connection. Cached, with reset-on-failure so a
// transient open failure doesn't poison every subsequent DB call.
let dbPromise: Promise<Database> | null = null;
function loadDesktopDb(): Promise<DbConnection> {
  if (!dbPromise) {
    const p = Database.load("sqlite:scriptz.db");
    p.catch(() => {
      if (dbPromise === p) dbPromise = null;
    });
    dbPromise = p;
  }
  return dbPromise as Promise<DbConnection>;
}

function parentDir(path: string): string | null {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (i <= 0) return null;
  return path.slice(0, i);
}

function isAlreadyExistsError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /already exists|EEXIST|file exists/i.test(msg);
}

async function desktopSaveAs(
  opts: SaveAsOptions,
  bytes: Uint8Array,
): Promise<SaveAsResult> {
  const path = await save({
    defaultPath: opts.suggestedName,
    filters: opts.filters,
  });
  if (!path) {
    return { cancelled: true, path: null };
  }
  const parent = parentDir(path);
  if (parent) {
    try {
      await mkdir(parent, { recursive: true });
    } catch (err) {
      // `recursive: true` sollte das idempotent machen, aber plugin-fs
      // surfacet "already exists" auf manchen OS-Varianten. Alles andere
      // (Permission denied etc.) wollen wir sehen - der writeFile unten
      // wuerde sonst mit einer weniger hilfreichen Meldung scheitern.
      if (!isAlreadyExistsError(err)) throw err;
    }
  }
  await writeFile(path, bytes);
  return { cancelled: false, path };
}

async function desktopOpenFile(accept: string): Promise<OpenFileResult | null> {
  // `accept` ist Web-syntax (z.B. ".scriptz,application/x-scriptz+json").
  // Wir extrahieren die Extension-Liste als Filter, MIME-Eintraege ignorieren
  // wir - Tauris Dialog kennt nur Extension-Filter.
  const exts = accept
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("."))
    .map((s) => s.slice(1));
  const filters = exts.length > 0 ? [{ name: "Datei", extensions: exts }] : undefined;
  const path = await openDialog({ multiple: false, filters });
  if (!path || Array.isArray(path)) return null;
  const bytes = await readFile(path);
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  const name = i >= 0 ? path.slice(i + 1) : path;
  return { name, bytes };
}

const tauriAdapter: PlatformAdapter = {
  platform: detectPlatform(),
  getDb: loadDesktopDb,
  getVersion: () => getVersion(),
  openUrl: (url) => openUrl(url),
  revealInFolder: (path) => revealItemInDir(path),
  saveDialog: async (opts) => {
    const result = await save(opts);
    return result ?? null;
  },
  saveAs: desktopSaveAs,
  openFile: desktopOpenFile,
};

setPlatformAdapter(tauriAdapter);
applyPlatformToDocument();
