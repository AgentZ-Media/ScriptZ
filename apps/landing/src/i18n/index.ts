/**
 * i18n-Helfer für die Landing.
 *
 * Anders als in der App ist die Sprache hier per URL-Pfad determiniert
 * ("/" = DE, "/en" = EN), nicht über einen Setting-Store. Jede `.astro`
 * bekommt `lang` als Prop und ruft `t(lang, key)`.
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
 * Übersetzt einen Key in die gewählte Sprache. Fällt im Notfall auf
 * Deutsch zurück - wird aber durch den `Record<keyof typeof de, ...>`
 * in en.ts schon zur Build-Zeit verhindert.
 */
export function t(lang: Lang, key: StringKey): string {
  const value = catalogs[lang]?.[key];
  return value ?? catalogs[DEFAULT_LANG][key] ?? String(key);
}

/**
 * Wie `t`, ersetzt zusaetzlich `{placeholder}`-Slots im uebersetzten
 * String. Beispiel: `tFormat("de", "blog.publishedOn", { date: "13. Mai 2026" })`.
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
 * Pluralregel-Helfer: waehlt zwischen `<key>_one` und `<key>_other` und
 * ersetzt `{n}` mit dem Count. Englisch und Deutsch teilen die
 * Plural-Heuristik (n === 1 → one), deshalb reicht das einfache Schema.
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
 * Inhaltliche Tab-Routen. Jede Sprache hat eigene Slugs, damit die URL
 * selbst keyword-relevant ist (DE "/keine-ki" statt "/no-ai", EN
 * "/en/compare" statt "/en/vergleich"). Die Tab-ID (`warum`,
 * `quickmodus`, ...) ist sprach-unabhaengig und entspricht den
 * `data-tab`-Attributen in der Chrome-Komponente.
 */
export const ROUTES = {
  home: { de: "/", en: "/en" },
  warum: { de: "/warum-scriptz", en: "/en/why-scriptz" },
  quickmodus: { de: "/quickmodus", en: "/en/quick-mode" },
  "no-ai": { de: "/keine-ki", en: "/en/no-ai" },
  vergleich: { de: "/vergleich", en: "/en/compare" },
  download: { de: "/download", en: "/en/download" },
  ideen: { de: "/ideen", en: "/en/ideas" },
  // Blog: Index unter `/blog` bzw. `/en/blog`. Einzelne Beitraege
  // (`/blog/<slug>`) sind dynamische Sub-Routen, die hier nicht als
  // separater Key existieren - der Sprach-Toggle auf Post-Pages kommt
  // ueber ein Override im BlogShell, nicht ueber `switchLangPath`.
  blog: { de: "/blog", en: "/en/blog" },
} as const;

export type RouteKey = keyof typeof ROUTES;

/**
 * Pfad-Helfer fuer eine Tab-Route in der gewuenschten Sprache.
 */
export function routePath(lang: Lang, key: RouteKey): string {
  return ROUTES[key][lang];
}

/**
 * Pfad-Helfer: haengt das Sprach-Prefix an einen lokalen Pfad an, wenn
 * `en` aktiv ist. Fuer DE bleibt der Pfad wie er ist (DE ist Default).
 *
 * Beispiele:
 *   localePath("de", "/")           → "/"
 *   localePath("en", "/")           → "/en"
 *   localePath("de", "/impressum")  → "/impressum"
 *   localePath("en", "/impressum")  → "/impressum"  (Legal bleibt DE-only)
 */
export function localePath(lang: Lang, path: string): string {
  if (lang === DEFAULT_LANG) return path;
  // Nur die Landing-Seite hat eine EN-Variante. Legal-Seiten bleiben DE.
  if (path === "/" || path === "") return "/en";
  return path;
}

/**
 * Pfad-zu-RouteKey-Lookup. Fuer einen gegebenen Pfad (z.B.
 * "/quickmodus" oder "/en/quick-mode") wird die zugehoerige Route-ID
 * gefunden. Gibt `null` zurueck, wenn der Pfad nicht zu einer
 * Tab-Route gehoert (Legal-Seiten u.ae.).
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
 * Gibt die "Schwester-URL" fuer einen Sprachwechsel zurueck. Wird vom
 * DE/EN-Toggle benutzt, um zwischen den Routen zu springen.
 */
export function switchLangPath(currentLang: Lang, targetLang: Lang, currentPath: string): string {
  const normalized = currentPath.replace(/\.html$/, "").replace(/\/$/, "") || "/";
  // Legal-Pfade bleiben in beiden Sprachen DE - der Toggle bringt den
  // Nutzer zur Landing in der gewuenschten Sprache zurueck.
  const isLegal = normalized === "/impressum" || normalized === "/datenschutz";
  if (isLegal) {
    return targetLang === DEFAULT_LANG ? "/" : "/en";
  }
  // Tab-Route gefunden? Dann der gespiegelten Sprach-URL folgen.
  const key = routeKeyFromPath(normalized);
  if (key) {
    return ROUTES[key][targetLang];
  }
  // Fallback: Sprach-Prefix tauschen wie frueher.
  if (targetLang === DEFAULT_LANG) {
    return normalized.replace(/^\/en\/?$/, "/").replace(/^\/en\//, "/");
  }
  if (currentLang === DEFAULT_LANG) {
    return normalized === "/" ? "/en" : `/en${normalized}`;
  }
  return normalized;
}
