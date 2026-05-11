// Tauri-backed implementation of @scriptz/core's PlatformAdapter.
//
// This file is imported once at app startup (from index.tsx) and
// registers a concrete adapter so the core code - which only sees the
// abstract DbConnection / SaveDialogOptions / etc. - has a working
// implementation to call into.
//
// All @tauri-apps/* imports live in this file (and in the few other
// remaining desktop-only files: updates.ts, UpdateIndicator.tsx,
// exportPdf.ts, exportPlaintext.ts, tauri.ts, App.tsx's close-handler).

import Database from "@tauri-apps/plugin-sql";
import { save } from "@tauri-apps/plugin-dialog";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { getVersion } from "@tauri-apps/api/app";
import { platform as osPlatform } from "@tauri-apps/plugin-os";
import {
  applyPlatformToDocument,
  setPlatformAdapter,
  type DbConnection,
  type Platform,
  type PlatformAdapter,
} from "@scriptz/core/lib/platform";
import { exportPdf as runExportPdf } from "./exportPdf";
import { exportPlaintext as runExportPlaintext } from "./exportPlaintext";

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
    // Dev-mode without Tauri (pure `vite dev`): default to macos so
    // the keyboard handling matches the historical behaviour. The
    // host process always has Tauri in production builds.
    return "macos";
  }
}

// Lazy plugin-sql connection. Cached, with reset-on-failure so a
// transient open failure (file locked mid-write, plugin not yet ready)
// doesn't poison every subsequent DB call.
let dbPromise: Promise<Database> | null = null;
function loadDesktopDb(): Promise<DbConnection> {
  if (!dbPromise) {
    const p = Database.load("sqlite:scriptz.db");
    p.catch(() => {
      if (dbPromise === p) dbPromise = null;
    });
    dbPromise = p;
  }
  // Tauri's Database class satisfies DbConnection structurally
  // (select<T> + execute returning {lastInsertId, rowsAffected}).
  return dbPromise as Promise<DbConnection>;
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
  exportPdf: runExportPdf,
  exportPlaintext: runExportPlaintext,
};

setPlatformAdapter(tauriAdapter);
applyPlatformToDocument();
