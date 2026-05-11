// Web-Implementierung von @scriptz/core's PlatformAdapter.
//
// Spiegelbild zu apps/desktop/src/lib/platform.ts, aber ohne jegliche
// @tauri-apps/*-Importe. Wird einmal beim App-Start aus main.tsx
// importiert; registriert sich via setPlatformAdapter() bevor irgendein
// core-Modul auf das Slot zugreift.
//
// getDb() wirft hier bewusst - die Web-App registriert einen eigenen
// StorageAdapter (apps/web/src/adapters/indexeddb.ts), der die SQL-Schicht
// vollständig ersetzt. getDb() darf entsprechend nie aufgerufen werden.
// Falls doch, ist das ein Hinweis darauf, dass irgendwo im core noch ein
// direkter DB-Aufruf statt eines Adapter-Calls erfolgt.
//
// Seit Phase 2F: saveAs (Blob-Download) und openFile (<input type="file">)
// liefern die Datei-Persistenz. Export-Dialog kann damit PDF + Plaintext +
// .scriptz im Web rausschreiben, ohne dass Pfade modelliert werden.

import {
  applyPlatformToDocument,
  setPlatformAdapter,
  type OpenFileResult,
  type Platform,
  type PlatformAdapter,
  type SaveAsOptions,
  type SaveAsResult,
} from "@scriptz/core/lib/platform";

function detectPlatform(): Platform {
  // userAgentData ist die zukunftssichere Variante (Chromium-only,
  // 2025+). Wenn nicht verfügbar: aus userAgent ableiten - dort ist
  // der Plattform-String stabil seit Jahren.
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

// Blob-Download via <a download>. Browser fragt - je nach Setting -
// den User noch nach dem Speicherort (Chrome/Edge mit "ask where to
// save"-Einstellung, Safari per Default). Den endgültigen Pfad sehen
// wir nicht - deshalb path: null in SaveAsResult.
function blobDownload(name: string, mimeType: string, bytes: Uint8Array): void {
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    // Manche Browser brauchen den Anker im DOM, damit click() triggert.
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Mit Delay, damit der Download-Stream nicht abreisst, bevor der
    // Browser die Bytes wirklich gesnapshottet hat. Der Browser hält
    // die Blob-Referenz parallel selbst.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

// File-Open via versteckten <input type="file">. Cancel-Detection
// über window-focus: `change` feuert nur bei tatsächlicher Auswahl,
// nicht bei Abbruch des Dialogs. Wir warten 250 ms nach focus zurück,
// und falls bis dahin kein change kam, lösen wir mit null auf.
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

const webAdapter: PlatformAdapter = {
  platform: detectPlatform(),
  async getDb() {
    throw new Error(
      "Web-Build: getDb() ist nicht verfügbar. Der Storage-Adapter " +
        "(apps/web/src/adapters/indexeddb.ts) ersetzt die SQL-Schicht komplett.",
    );
  },
  async getVersion() {
    // Auto-synchron mit apps/desktop/package.json - vite.config.ts liest
    // den Wert dort zum Build-Zeitpunkt und injectet ihn als
    // __APP_VERSION__. Settings rendert "ScriptZ · v{appVersion()}", und
    // die soll auf Web und Desktop identisch sein - jede Tag-Push-Release
    // zieht die Web-Anzeige damit ohne Extra-Aufwand mit.
    return __APP_VERSION__;
  },
  async openUrl(url) {
    window.open(url, "_blank", "noopener,noreferrer");
  },
  async revealInFolder() {
    // Im Browser gibt es kein Finder-Reveal. No-op, damit Aufrufer
    // (z.B. nach einem Export) nicht abbricht.
  },
  async saveDialog() {
    // Kein nativer Save-Dialog im Browser. Wer Bytes schreiben will,
    // nimmt saveAs - das löst per Blob-Download aus.
    return null;
  },
  async saveAs(opts: SaveAsOptions, bytes: Uint8Array): Promise<SaveAsResult> {
    blobDownload(opts.suggestedName, opts.mimeType, bytes);
    // Browser entscheidet, wo die Datei landet (oft Downloads/-Ordner).
    // cancelled bleibt false - wir können den Download nicht synchron
    // abbrechen.
    return { cancelled: false, path: null };
  },
  openFile: inputFileOpen,
};

setPlatformAdapter(webAdapter);
applyPlatformToDocument();

// Markiere die Browser-Shell explizit. Das `data-platform`-Attribut bleibt
// auf dem echten OS (damit Mac-User im Browser weiter ⌘-Labels sehen und
// `isMac()` korrekt funktioniert), aber `data-shell="web"` schaltet die
// macOS-Trafficlight-Padding in tokens.css ab - im Browser gibt's keine
// Trafficlights, also auch keinen Spacer dafür.
if (typeof document !== "undefined") {
  document.documentElement.dataset.shell = "web";
}
