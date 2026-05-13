/**
 * Astro Content Collections - Blog-Posts.
 *
 * Layout: ein Ordner pro Beitrag unter `src/content/blog/<slug>/` mit
 * `de.md` und `en.md`. Astro liefert daher Entry-IDs der Form
 * `<slug>/de` und `<slug>/en` - die `slug`-/`lang`-Aufteilung passiert
 * in den Page-Routen via Helper in `src/lib/blog.ts`.
 */
import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const blog = defineCollection({
  loader: glob({
    base: "./src/content/blog",
    pattern: ["**/de.{md,mdx}", "**/en.{md,mdx}"],
  }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      date: z.coerce.date(),
      updated: z.coerce.date().optional(),
      author: z.string().default("Timo"),
      // Optional, lokal im Post-Ordner abgelegt (z.B. `./cover.jpg`).
      cover: image().optional(),
      coverAlt: z.string().optional(),
      tags: z.array(z.string()).default([]),
      draft: z.boolean().default(false),
    }),
});

export const collections = { blog };
