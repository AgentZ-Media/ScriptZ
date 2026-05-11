// Sprach-Schalter + Übersetzungs-API.
//
// Design: ein Solid-Signal `currentLanguage`, das von Komponenten reaktiv
// gelesen wird. Setting "auto" wird beim Laden in eine konkrete Sprache
// aufgelöst (navigator.language); der eigentliche Signal-Wert ist immer
// "de" oder "en", damit t() nichts nochmal auflösen muss. Persistiert
// wird die User-Wahl ("auto" | "de" | "en") in settings.ts.
//
// Bewusst kein i18next/intl-messageformat: bei ~300 Keys und zwei
// Sprachen ist eine handgeschriebene Implementierung deutlich kleiner
// (kein Bundle-Overhead), typsicher (TS prüft jeden Key gegen den
// kanonischen DE-Katalog) und ohne API-Indirektion sofort lesbar.

import { createSignal } from "solid-js";
import { de } from "./de";
import { en } from "./en";

export type Language = "de" | "en";
/** User-sichtbare Sprach-Präferenz inkl. "auto" (folgt System). */
export type LanguagePref = "auto" | Language;

type Catalog = Record<keyof typeof de, string>;

const CATALOGS: Record<Language, Catalog> = { de, en };

/** Erkennt die System-Sprache via navigator.language. Fällt auf "de"
 *  zurück, weil die App primär deutschsprachig entwickelt wurde und
 *  alle bestehenden User Deutsch erwarten. */
export function detectSystemLanguage(): Language {
  if (typeof navigator === "undefined") return "de";
  const raw = navigator.language || (navigator as { userLanguage?: string }).userLanguage;
  if (!raw) return "de";
  return raw.toLowerCase().startsWith("de") ? "de" : "en";
}

/** Löst die User-Präferenz in die konkrete Sprache auf. */
export function resolveLanguage(pref: LanguagePref): Language {
  return pref === "auto" ? detectSystemLanguage() : pref;
}

const [currentLanguage, setCurrentLanguageSignal] = createSignal<Language>(
  typeof navigator !== "undefined" ? detectSystemLanguage() : "de",
);

/** Reaktiver Reader. Komponenten, die hier subskribieren, rendern bei
 *  Sprach-Wechsel automatisch neu. */
export const language = currentLanguage;

/** Setzt die aufgelöste Sprache. settings.ts ruft das nach jedem
 *  setLanguage()/load() auf. Idempotent. */
export function applyResolvedLanguage(lang: Language): void {
  setCurrentLanguageSignal(lang);
  if (typeof document !== "undefined") {
    document.documentElement.lang = lang;
  }
}

type Params = Record<string, string | number>;
export type TranslationKey = keyof typeof de;

function interpolate(template: string, params: Params | undefined): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (full, name: string) => {
    if (Object.prototype.hasOwnProperty.call(params, name)) {
      return String(params[name]);
    }
    return full;
  });
}

/** Liest eine Übersetzung. Fällt auf den DE-Katalog zurück, falls die
 *  EN-Variante fehlen sollte (TS sollte das verhindern, aber die
 *  Defensive kostet uns nichts). */
export function t(key: TranslationKey, params?: Params): string {
  const cat = CATALOGS[currentLanguage()];
  const raw = cat[key] ?? (de as Catalog)[key] ?? key;
  return interpolate(raw, params);
}

/** Plural-Auswahl per Intl.PluralRules. Erwartet vorhandene `_one` /
 *  `_other`-Suffixe im Katalog (deutsche und englische Pluralregel hat
 *  beide Kategorien). `count` wird automatisch als {count}-Param
 *  interpoliert. */
export function tPlural(
  baseKey: string,
  count: number,
  params?: Params,
): string {
  const lang = currentLanguage();
  const rule = new Intl.PluralRules(getCurrentLocale()).select(count);
  // count zuerst, damit eine vom Aufrufer mitgegebene formatierte
  // Variante (z.B. {count: "1.234"} mit Tausendertrennzeichen) den
  // numerischen Default überschreibt. Die Regel-Auswahl bleibt
  // numerisch korrekt - die Anzeige darf hübscher sein.
  const fullParams: Params = { count, ...(params ?? {}) };
  const pluralKey = `${baseKey}_${rule}` as TranslationKey;
  const otherKey = `${baseKey}_other` as TranslationKey;
  const cat = CATALOGS[lang];
  const raw =
    cat[pluralKey] ??
    cat[otherKey] ??
    (de as Catalog)[pluralKey] ??
    (de as Catalog)[otherKey] ??
    baseKey;
  return interpolate(raw, fullParams);
}

/** BCP-47-Locale für Intl.* APIs (toLocaleDateString, PluralRules, ...). */
export function getCurrentLocale(): string {
  return currentLanguage() === "de" ? "de-DE" : "en-US";
}

/** Localized localeCompare for sort. */
export function localeCompare(a: string, b: string): number {
  return a.localeCompare(b, getCurrentLocale());
}
