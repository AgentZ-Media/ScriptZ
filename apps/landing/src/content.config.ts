/**
 * Astro Content Collections - blog posts.
 *
 * Layout: one folder per post under `src/content/blog/<slug>/` with
 * `de.md` and `en.md`. Astro thus delivers entry IDs of the form
 * `<slug>/de` and `<slug>/en` - the `slug`/`lang` split happens in
 * the page routes via helpers in `src/lib/blog.ts`.
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
      // Optional, stored locally in the post folder (e.g. `./cover.jpg`).
      cover: image().optional(),
      coverAlt: z.string().optional(),
      tags: z.array(z.string()).default([]),
      draft: z.boolean().default(false),
    }),
});

export const collections = { blog };
