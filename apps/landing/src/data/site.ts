/**
 * Central source for site metadata and dynamic build-time data
 * (e.g. the current ScriptZ version, platform-specific download URLs).
 *
 * Version + asset URLs are fetched at build time from the GitHub
 * Releases API so that every Desktop-app release lands on the landing
 * automatically, without any change here.
 *
 * Asset detection:
 *  - `.dmg`     -> macOS Apple Silicon
 *  - `-setup.exe` or `_x64-setup.exe` -> Windows NSIS installer
 *    (Match strictly `.exe` at the end so the parallel
 *    `.nsis.zip` updater asset doesn't accidentally win.)
 */

export const site = {
  name: "ScriptZ",
  domain: "write-scriptz.com",
  url: "https://write-scriptz.com",
  description:
    "Skripte schreiben, ohne dass die App im Weg steht. Lokal, kostenlos, Open Source. Für Creators, die viele Skripte am Tag schreiben.",
  github: "https://github.com/AgentZ-Media/ScriptZ",
  releasesPage: "https://github.com/AgentZ-Media/ScriptZ/releases/latest",
  // Browser test editor (phase 2 H). Subdomain hosted Vercel-side.
  webAppUrl: "https://app.write-scriptz.com",
  // Fallback when the GitHub API is unreachable at build time.
  fallbackVersion: "0.8.2",
  contactEmail: "kontakt@agent-z.de",
} as const;

export interface ReleaseInfo {
  version: string;       // without leading "v"
  tag: string;           // as on GitHub, e.g. "v0.3.2"
  publishedAt: string;   // ISO string, "" if unknown
  /** macOS Apple Silicon .dmg - direct download link. */
  dmgUrl: string;
  /** Windows x64 NSIS installer .exe - direct download link.
   *  If no Windows asset is in the release (e.g. Mac-only release
   *  before Windows support), this points to the releases page so
   *  the user can pick manually there. */
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

/** Build time: fetches the current release info from GitHub. Fail-soft. */
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
    // Windows NSIS installer ends in `.exe`. The parallel updater
    // asset ends in `.nsis.zip` and is automatically excluded by the
    // `.exe` suffix match.
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
