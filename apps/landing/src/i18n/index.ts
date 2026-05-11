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
 * Pfad-Helfer: hängt das Sprach-Prefix an einen lokalen Pfad an, wenn
 * `en` aktiv ist. Für DE bleibt der Pfad wie er ist (DE ist Default).
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
 * Gibt die "Schwester-URL" für einen Sprachwechsel zurück. Wird vom
 * DE/EN-Toggle benutzt, um zwischen den Routen zu springen.
 */
export function switchLangPath(currentLang: Lang, targetLang: Lang, currentPath: string): string {
  // Legal-Pfade bleiben in beiden Sprachen DE - der Toggle bringt den
  // Nutzer zur Landing in der gewünschten Sprache zurück.
  const isLegal = currentPath === "/impressum" || currentPath === "/datenschutz";
  if (isLegal) {
    return targetLang === DEFAULT_LANG ? "/" : "/en";
  }
  // Sonst: Sprach-Prefix tauschen.
  if (targetLang === DEFAULT_LANG) {
    return currentPath.replace(/^\/en\/?$/, "/").replace(/^\/en\//, "/");
  }
  if (currentLang === DEFAULT_LANG) {
    return currentPath === "/" ? "/en" : `/en${currentPath}`;
  }
  return currentPath;
}
