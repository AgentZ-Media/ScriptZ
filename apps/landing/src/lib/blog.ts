/**
 * Helpers around the blog content collection.
 *
 * Astro's `glob` loader delivers entry IDs of the form `<slug>/de`
 * and `<slug>/en`. The functions here split those IDs into (slug,
 * lang), fetch posts per language, and find the sister pair
 * (DE↔EN) for hreflang linking.
 */
import { getCollection, type CollectionEntry } from "astro:content";
import type { Lang } from "../i18n";

export type BlogEntry = CollectionEntry<"blog">;

/** Splits an entry ID `<slug>/<lang>` into its parts. */
export function parseEntryId(id: string): { slug: string; lang: Lang } | null {
  const m = id.match(/^(.+)\/(de|en)$/);
  if (!m) return null;
  return { slug: m[1], lang: m[2] as Lang };
}

/** Date as ISO string for JSON-LD / RSS / `<time datetime=...>`. */
export function isoDate(d: Date): string {
  return d.toISOString();
}

/** Localized date display. DE: 13. Mai 2026, EN: May 13, 2026. */
export function formatDate(d: Date, lang: Lang): string {
  const locale = lang === "en" ? "en-US" : "de-DE";
  return d.toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Reading time from body text. 200 WPM is conservative. Floor at 1. */
export function readingTimeMinutes(body: string | undefined): number {
  if (!body) return 1;
  // rough word count: strip HTML/Markdown markup loosely.
  const stripped = body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/[#>*_`~\-]/g, " ");
  const words = stripped.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** All posts in a language, sorted by date (newest first).
 *  Drafts are filtered out outside of `dev`. */
export async function getPosts(lang: Lang): Promise<BlogEntry[]> {
  const all = await getCollection("blog");
  const filtered = all.filter((entry) => {
    const parsed = parseEntryId(entry.id);
    if (!parsed) return false;
    if (parsed.lang !== lang) return false;
    if (entry.data.draft && !import.meta.env.DEV) return false;
    // Underscore prefix = internal posts (e.g. `_example/`). They appear
    // neither in lists nor under their slug URL.
    if (parsed.slug.startsWith("_")) return false;
    return true;
  });
  return filtered.sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime(),
  );
}

/** A single post by slug + language. */
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

/** Does a translation of this post exist in the other language? */
export async function hasTranslation(
  slug: string,
  otherLang: Lang,
): Promise<boolean> {
  const sister = await getPost(slug, otherLang);
  return !!sister && !(sister.data.draft && !import.meta.env.DEV);
}

/** URL path for a post (language-dependent). */
export function postPath(slug: string, lang: Lang): string {
  return lang === "de" ? `/blog/${slug}` : `/en/blog/${slug}`;
}

/** URL path for the blog index. */
export function blogIndexPath(lang: Lang): string {
  return lang === "de" ? "/blog" : "/en/blog";
}
