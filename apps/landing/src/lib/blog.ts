/**
 * Helfer rund um die Blog-Content-Collection.
 *
 * Astros `glob`-Loader liefert Entry-IDs der Form `<slug>/de` bzw.
 * `<slug>/en`. Hier liegen die Funktionen, die diese IDs in (slug,
 * lang) zerlegen, Posts pro Sprache holen und das Schwestern-Paar
 * (DE↔EN) fuer hreflang-Verlinkung finden.
 */
import { getCollection, type CollectionEntry } from "astro:content";
import type { Lang } from "../i18n";

export type BlogEntry = CollectionEntry<"blog">;

/** Zerlegt eine Entry-ID `<slug>/<lang>` in ihre Bestandteile. */
export function parseEntryId(id: string): { slug: string; lang: Lang } | null {
  const m = id.match(/^(.+)\/(de|en)$/);
  if (!m) return null;
  return { slug: m[1], lang: m[2] as Lang };
}

/** Datum als ISO-String fuer JSON-LD / RSS / `<time datetime=...>`. */
export function isoDate(d: Date): string {
  return d.toISOString();
}

/** Lokalisierte Datums-Anzeige. DE: 13. Mai 2026, EN: May 13, 2026. */
export function formatDate(d: Date, lang: Lang): string {
  const locale = lang === "en" ? "en-US" : "de-DE";
  return d.toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Reading-Time aus Body-Text. 200 WPM ist konservativ. Floor bei 1. */
export function readingTimeMinutes(body: string | undefined): number {
  if (!body) return 1;
  // grobe Wortzaehlung: HTML/Markdown-Markup grob entfernen.
  const stripped = body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/[#>*_`~\-]/g, " ");
  const words = stripped.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** Alle Posts in einer Sprache, sortiert nach Datum (neueste zuerst).
 *  Drafts werden ausserhalb von `dev` weggefiltert. */
export async function getPosts(lang: Lang): Promise<BlogEntry[]> {
  const all = await getCollection("blog");
  const filtered = all.filter((entry) => {
    const parsed = parseEntryId(entry.id);
    if (!parsed) return false;
    if (parsed.lang !== lang) return false;
    if (entry.data.draft && !import.meta.env.DEV) return false;
    // Underscore-Praefix = interne Beitraege (z.B. `_example/`). Erscheinen
    // weder in Listen noch unter ihrer Slug-URL.
    if (parsed.slug.startsWith("_")) return false;
    return true;
  });
  return filtered.sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime(),
  );
}

/** Ein einzelner Post per Slug + Sprache. */
export async function getPost(
  slug: string,
  lang: Lang,
): Promise<BlogEntry | undefined> {
  const all = await getCollection("blog");
  return all.find((entry) => {
    const parsed = parseEntryId(entry.id);
    return parsed?.slug === slug && parsed.lang === lang;
  });
}

/** Existiert eine Uebersetzung dieses Posts in der anderen Sprache? */
export async function hasTranslation(
  slug: string,
  otherLang: Lang,
): Promise<boolean> {
  const sister = await getPost(slug, otherLang);
  return !!sister && !(sister.data.draft && !import.meta.env.DEV);
}

/** URL-Pfad fuer einen Post (sprachabhaengig). */
export function postPath(slug: string, lang: Lang): string {
  return lang === "de" ? `/blog/${slug}` : `/en/blog/${slug}`;
}

/** URL-Pfad fuer die Blog-Uebersicht. */
export function blogIndexPath(lang: Lang): string {
  return lang === "de" ? "/blog" : "/en/blog";
}
