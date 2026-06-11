// Studio implementation of @scriptz/core's PlatformAdapter.
//
// Same shape as apps/web/src/lib/platform.ts (no @tauri-apps/* imports).
// Studio persists through Convex (see ../adapters/convex.ts), so the SQL
// path is unused and getDb() throws on purpose. File export uses blob
// download, exactly like the web shell.
//
// Imported once at app start from main.tsx; registers itself via
// setPlatformAdapter() before any core module accesses the slot.

import {
  applyPlatformToDocument,
  setPlatformAdapter,
  type HttpPostResult,
  type OpenFileResult,
  type Platform,
  type PlatformAdapter,
  type SaveAsOptions,
  type SaveAsResult,
} from "@scriptz/core/lib/platform";

function detectPlatform(): Platform {
  const uaData = (
    navigator as Navigator & {
      userAgentData?: { platform?: string };
    }
  ).userAgentData;
  const raw = (uaData?.platform || navigator.userAgent || "").toLowerCase();
  if (raw.includes("mac")) return "macos";
  if (raw.includes("win")) return "windows";
  return "linux";
}

// Blob download via <a download>. The browser decides where the file
// ends up - hence path: null in SaveAsResult.
function blobDownload(name: string, mimeType: string, bytes: Uint8Array): void {
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

// File open via a hidden <input type="file">. Cancel detection via window
// focus: `change` only fires on a real selection. We wait 250ms after
// focus returns; if no change arrived, resolve with null.
function inputFileOpen(accept: string): Promise<OpenFileResult | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    document.body.appendChild(input);

    let settled = false;
    const cleanup = () => {
      window.removeEventListener("focus", onFocus);
      input.remove();
    };
    const settle = (v: OpenFileResult | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(v);
    };

    const onFocus = () => {
      setTimeout(() => settle(null), 250);
    };
    window.addEventListener("focus", onFocus, { once: true });

    input.addEventListener("change", async () => {
      const file = input.files?.[0] ?? null;
      if (!file) {
        settle(null);
        return;
      }
      try {
        const buf = await file.arrayBuffer();
        settle({ name: file.name, bytes: new Uint8Array(buf) });
      } catch {
        settle(null);
      }
    });
    input.click();
  });
}

const studioAdapter: PlatformAdapter = {
  platform: detectPlatform(),
  supportsDirectoryWrite: false,
  async getDb() {
    throw new Error(
      "Studio-Build: getDb() ist nicht verfügbar. Der ConvexStorageAdapter " +
        "(src/adapters/convex.ts) ersetzt die SQL-Schicht komplett.",
    );
  },
  async getVersion() {
    return __APP_VERSION__;
  },
  async openUrl(url) {
    window.open(url, "_blank", "noopener,noreferrer");
  },
  async revealInFolder() {
    // No Finder-style reveal in the browser. No-op.
  },
  async saveDialog() {
    // No native save dialog in the browser - callers use saveAs.
    return null;
  },
  async saveAs(opts: SaveAsOptions, bytes: Uint8Array): Promise<SaveAsResult> {
    blobDownload(opts.suggestedName, opts.mimeType, bytes);
    return { cancelled: false, path: null };
  },
  openFile: inputFileOpen,
  async httpPostJson(url, token, jsonBody): Promise<HttpPostResult> {
    // Studio is the receiver, not a sender, so this is unused in practice -
    // implemented to satisfy the interface (and harmless if ever called).
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: jsonBody,
      });
      return { status: res.status, ok: res.ok, body: await res.text() };
    } catch {
      return { status: 0, ok: false, body: "" };
    }
  },
  async httpGetJson(url, token): Promise<HttpPostResult> {
    // Unused in Studio (it is the receiver) - implemented for the interface.
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      return { status: res.status, ok: res.ok, body: await res.text() };
    } catch {
      return { status: 0, ok: false, body: "" };
    }
  },
  async pickDirectory() {
    return null;
  },
  async writeFileTo() {
    throw new Error("writeFileTo is not available in the Studio build");
  },
};

setPlatformAdapter(studioAdapter);
applyPlatformToDocument();

if (typeof document !== "undefined") {
  document.documentElement.dataset.shell = "web";
}
