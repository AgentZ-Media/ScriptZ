/**
 * `/rss.xml` - deutscher RSS-Feed des Blogs.
 *
 * Liefert die letzten Posts in DE als Atom-/RSS-konformes XML, das
 * Reader wie NetNewsWire, Reeder, Feedly o.ae. abonnieren koennen.
 */
import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { getPosts, postPath } from "../lib/blog";
import { t } from "../i18n";
import { site } from "../data/site";

export async function GET(context: APIContext) {
  const lang = "de" as const;
  const posts = await getPosts(lang);
  return rss({
    title: t(lang, "blog.rss.title"),
    description: t(lang, "blog.rss.description"),
    site: context.site ?? site.url,
    items: posts.map((entry) => {
      const slug = entry.id.replace(/\/(de|en)$/, "");
      return {
        title: entry.data.title,
        description: entry.data.description,
        pubDate: entry.data.date,
        link: postPath(slug, lang),
        author: entry.data.author,
        categories: entry.data.tags,
      };
    }),
    customData: `<language>de-DE</language>`,
    trailingSlash: false,
  });
}
