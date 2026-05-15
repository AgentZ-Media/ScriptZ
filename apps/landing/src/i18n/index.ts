/**
 * i18n helpers for the landing.
 *
 * Unlike the app, language is determined here by URL path ("/" = DE,
 * "/en" = EN), not via a settings store. Each `.astro` receives
 * `lang` as a prop and calls `t(lang, key)`.
 */
import { de } from "./de";
import { en } from "./en";

export const LANGS = ["de", "en"] as const;
export type Lang = (typeof LANGS)[number];

export const DEFAULT_LANG: Lang = "de";

const catalogs: Record<Lang, Record<string, string>> = {
  de,
  en,
};

export type StringKey = keyof typeof de;

/**
 * Translates a key to the chosen language. Falls back to German as
 * a safety net - but the `Record<keyof typeof de, ...>` constraint
 * in en.ts already prevents missing keys at build time.
 */
export function t(lang: Lang, key: StringKey): string {
  const value = catalogs[lang]?.[key];
  return value ?? catalogs[DEFAULT_LANG][key] ?? String(key);
}

/**
 * Like `t`, but also replaces `{placeholder}` slots in the translated
 * string. Example: `tFormat("de", "blog.publishedOn", { date: "13. Mai 2026" })`.
 */
export function tFormat(
  lang: Lang,
  key: StringKey,
  vars: Record<string, string | number>,
): string {
  const raw = t(lang, key);
  return raw.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const v = vars[name];
    return v === undefined ? `{${name}}` : String(v);
  });
}

/**
 * Plural-rule helper: picks between `<key>_one` and `<key>_other` and
 * replaces `{n}` with the count. English and German share the plural
 * heuristic (n === 1 → one), so the simple scheme is enough.
 */
export function tPlural(
  lang: Lang,
  baseKey: string,
  n: number,
  vars: Record<string, string | number> = {},
): string {
  const suffix = n === 1 ? "_one" : "_other";
  const key = `${baseKey}${suffix}` as StringKey;
  return tFormat(lang, key, { n, ...vars });
}

/**
 * Content tab routes. Each language has its own slugs so the URL
 * itself is keyword-relevant (DE "/keine-ki" instead of "/no-ai",
 * EN "/en/compare" instead of "/en/vergleich"). The tab ID (`warum`,
 * `quickmodus`, ...) is language-independent and matches the
 * `data-tab` attributes in the chrome component.
 */
export const ROUTES = {
  home: { de: "/", en: "/en" },
  warum: { de: "/warum-scriptz", en: "/en/why-scriptz" },
  quickmodus: { de: "/quickmodus", en: "/en/quick-mode" },
  "no-ai": { de: "/keine-ki", en: "/en/no-ai" },
  vergleich: { de: "/vergleich", en: "/en/compare" },
  download: { de: "/download", en: "/en/download" },
  ideen: { de: "/ideen", en: "/en/ideas" },
  // Blog: index at `/blog` and `/en/blog`. Individual posts
  // (`/blog/<slug>`) are dynamic sub-routes that don't exist as a
  // separate key here - the language toggle on post pages comes via
  // an override in BlogShell, not via `switchLangPath`.
  blog: { de: "/blog", en: "/en/blog" },
} as const;

export type RouteKey = keyof typeof ROUTES;

/**
 * Path helper for a tab route in the desired language.
 */
export function routePath(lang: Lang, key: RouteKey): string {
  return ROUTES[key][lang];
}

/**
 * Path helper: appends the language prefix to a local path when
 * `en` is active. For DE the path stays as-is (DE is the default).
 *
 * Examples:
 *   localePath("de", "/")           → "/"
 *   localePath("en", "/")           → "/en"
 *   localePath("de", "/impressum")  → "/impressum"
 *   localePath("en", "/impressum")  → "/impressum"  (legal stays DE-only)
 */
export function localePath(lang: Lang, path: string): string {
  if (lang === DEFAULT_LANG) return path;
  // Only the landing page has an EN variant. Legal pages stay DE.
  if (path === "/" || path === "") return "/en";
  return path;
}

/**
 * Path-to-RouteKey lookup. For a given path (e.g. "/quickmodus" or
 * "/en/quick-mode"), the corresponding route ID is found. Returns
 * `null` if the path doesn't belong to a tab route (legal pages and
 * the like).
 */
export function routeKeyFromPath(path: string): RouteKey | null {
  const normalized = path.replace(/\.html$/, "").replace(/\/$/, "") || "/";
  for (const [key, paths] of Object.entries(ROUTES)) {
    if (paths.de === normalized || paths.en === normalized) {
      return key as RouteKey;
    }
  }
  return null;
}

/**
 * Returns the "sister URL" for a language switch. Used by the DE/EN
 * toggle to jump between routes.
 */
export function switchLangPath(currentLang: Lang, targetLang: Lang, currentPath: string): string {
  const normalized = currentPath.replace(/\.html$/, "").replace(/\/$/, "") || "/";
  // Legal paths stay DE in both languages - the toggle brings the
  // user back to the landing in the desired language.
  const isLegal = normalized === "/impressum" || normalized === "/datenschutz";
  if (isLegal) {
    return targetLang === DEFAULT_LANG ? "/" : "/en";
  }
  // Tab route found? Then follow the mirrored language URL.
  const key = routeKeyFromPath(normalized);
  if (key) {
    return ROUTES[key][targetLang];
  }
  // Fallback: swap language prefix as before.
  if (targetLang === DEFAULT_LANG) {
    return normalized.replace(/^\/en\/?$/, "/").replace(/^\/en\//, "/");
  }
  if (currentLang === DEFAULT_LANG) {
    return normalized === "/" ? "/en" : `/en${normalized}`;
  }
  return normalized;
}
