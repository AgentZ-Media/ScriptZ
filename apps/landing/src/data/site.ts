/**
 * Zentrale Quelle für Site-Metadaten und dynamische Build-Zeit-Daten
 * (z.B. die aktuelle ScriptZ-Version, Plattform-spezifische Download-URLs).
 *
 * Die Version + Asset-URLs werden zur Build-Zeit von der GitHub-Releases-
 * API geholt, damit jede Veroeffentlichung der Desktop-App automatisch
 * in der Landing landet, ohne hier irgendetwas anpassen zu müssen.
 *
 * Asset-Erkennung:
 *  - `.dmg`     -> macOS Apple Silicon
 *  - `-setup.exe` oder `_x64-setup.exe` -> Windows NSIS Installer
 *    (Match ausschliesslich `.exe` am Ende, damit das parallele
 *    `.nsis.zip`-Updater-Asset nicht versehentlich gewinnt.)
 */

export const site = {
  name: "ScriptZ",
  domain: "write-scriptz.com",
  url: "https://write-scriptz.com",
  description:
    "Skripte schreiben, ohne dass die App im Weg steht. Lokal, kostenlos, Open Source. Für Creators, die viele Skripte am Tag schreiben.",
  github: "https://github.com/AgentZ-Media/ScriptZ",
  releasesPage: "https://github.com/AgentZ-Media/ScriptZ/releases/latest",
  // Browser-Test-Editor (Phase 2 H). Subdomain hosted Vercel-side.
  webAppUrl: "https://app.write-scriptz.com",
  // Fallback, wenn die GitHub-API beim Build nicht erreichbar ist.
  fallbackVersion: "0.7.11",
  contactEmail: "kontakt@agent-z.de",
} as const;

export interface ReleaseInfo {
  version: string;       // ohne fuehrendes "v"
  tag: string;           // wie auf GitHub, z.B. "v0.3.2"
  publishedAt: string;   // ISO-String, "" wenn unbekannt
  /** macOS Apple Silicon .dmg - direkter Download-Link. */
  dmgUrl: string;
  /** Windows x64 NSIS Installer .exe - direkter Download-Link.
   *  Wenn kein Windows-Asset im Release liegt (z.B. Mac-only-Release
   *  vor Windows-Support), zeigt es auf die Releases-Seite, damit der
   *  User dort manuell waehlen kann. */
  exeUrl: string;
  releasePageUrl: string;
  isFallback: boolean;
}

interface GhAsset {
  name: string;
  browser_download_url: string;
}
interface GhRelease {
  tag_name: string;
  name: string;
  published_at: string;
  html_url: string;
  assets: GhAsset[];
}

/** Build-Zeit: holt die aktuelle Release-Info von GitHub. Fail-soft. */
export async function getLatestRelease(): Promise<ReleaseInfo> {
  try {
    const res = await fetch(
      "https://api.github.com/repos/AgentZ-Media/ScriptZ/releases/latest",
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "scriptz-landing-build",
        },
      },
    );
    if (!res.ok) throw new Error(`GitHub API: ${res.status}`);
    const data = (await res.json()) as GhRelease;
    const tag = data.tag_name || `v${site.fallbackVersion}`;
    const version = tag.replace(/^v/, "");
    const assets = data.assets ?? [];
    const dmg = assets.find((a) => a.name.endsWith(".dmg"));
    // Windows NSIS-Installer endet auf `.exe`. Das parallele
    // Updater-Asset endet auf `.nsis.zip` und wird durch das
    // `.exe`-Suffix-Match automatisch ausgeschlossen.
    const exe = assets.find((a) => a.name.toLowerCase().endsWith(".exe"));
    return {
      version,
      tag,
      publishedAt: data.published_at ?? "",
      dmgUrl: dmg?.browser_download_url ?? site.releasesPage,
      exeUrl: exe?.browser_download_url ?? site.releasesPage,
      releasePageUrl: data.html_url ?? site.releasesPage,
      isFallback: false,
    };
  } catch {
    return {
      version: site.fallbackVersion,
      tag: `v${site.fallbackVersion}`,
      publishedAt: "",
      dmgUrl: site.releasesPage,
      exeUrl: site.releasesPage,
      releasePageUrl: site.releasesPage,
      isFallback: true,
    };
  }
}
