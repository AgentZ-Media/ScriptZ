// Web-Implementierung von @scriptz/core's PlatformAdapter.
//
// Spiegelbild zu apps/desktop/src/lib/platform.ts, aber ohne jegliche
// @tauri-apps/*-Importe. Wird einmal beim App-Start aus main.tsx
// importiert; registriert sich via setPlatformAdapter() bevor irgendein
// core-Modul auf das Slot zugreift.
//
// getDb() wirft hier bewusst - die Web-App registriert einen eigenen
// StorageAdapter (apps/web/src/lib/storage.ts), der die SQL-Schicht
// vollstaendig ersetzt. getDb() darf entsprechend nie aufgerufen werden.
// Falls doch, ist das ein Hinweis darauf, dass irgendwo im core noch ein
// direkter DB-Aufruf statt eines Adapter-Calls erfolgt.
//
// exportPdf / exportPlaintext werfen ebenfalls bis Phase F (FTS + PDF/
// Plain + Save-Flush im Browser); der Export-Dialog kommt damit aus,
// weil er den Fehler in einen Toast verwandelt.

import {
  applyPlatformToDocument,
  setPlatformAdapter,
  type Platform,
  type PlatformAdapter,
} from "@scriptz/core/lib/platform";

function detectPlatform(): Platform {
  // userAgentData ist die zukunftssichere Variante (Chromium-only,
  // 2025+). Wenn nicht verfuegbar: aus userAgent ableiten - dort ist
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

const webAdapter: PlatformAdapter = {
  platform: detectPlatform(),
  async getDb() {
    throw new Error(
      "Web-Build: getDb() ist nicht verfuegbar. Der Storage-Adapter " +
        "(apps/web/src/lib/storage.ts) ersetzt die SQL-Schicht komplett.",
    );
  },
  async getVersion() {
    // Phase D: Platzhalter-Version. Wird in Phase H aus apps/web/package.json
    // gezogen und im Footer angezeigt.
    return "0.0.0-web";
  },
  async openUrl(url) {
    window.open(url, "_blank", "noopener,noreferrer");
  },
  async revealInFolder() {
    // Im Browser gibt es kein Finder-Reveal. No-op, damit Aufrufer
    // (z.B. nach einem Export) nicht abbricht.
  },
  async saveDialog() {
    // Kein nativer Save-Dialog im Browser. Der Web-Pfad fuer Save-As
    // laeuft ueber Blob + <a download> (Phase F) - kommt erst dort dran.
    return null;
  },
  async exportPdf() {
    throw new Error(
      "PDF-Export im Browser ist noch nicht verfuegbar (geplant fuer Phase F).",
    );
  },
  async exportPlaintext() {
    throw new Error(
      "Plain-Text-Export im Browser ist noch nicht verfuegbar (geplant fuer Phase F).",
    );
  },
};

setPlatformAdapter(webAdapter);
applyPlatformToDocument();

// Markiere die Browser-Shell explizit. Das `data-platform`-Attribut bleibt
// auf dem echten OS (damit Mac-User im Browser weiter ⌘-Labels sehen und
// `isMac()` korrekt funktioniert), aber `data-shell="web"` schaltet die
// macOS-Trafficlight-Padding in tokens.css ab - im Browser gibt's keine
// Trafficlights, also auch keinen Spacer dafuer.
if (typeof document !== "undefined") {
  document.documentElement.dataset.shell = "web";
}
