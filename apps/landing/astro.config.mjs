import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import mdx from "@astrojs/mdx";
import { remarkDialogue } from "./src/lib/remarkDialogue.mjs";

export default defineConfig({
  site: "https://write-scriptz.com",
  trailingSlash: "never",
  build: {
    format: "file",
  },
  markdown: {
    // Script look: blockquotes of the form `> **NAME:** Text` are
    // transformed into semantic <Dialogue> blocks. Classic quotes
    // (without character prefix) stay untouched and render as
    // editorial citation per the stylesheet.
    remarkPlugins: [remarkDialogue],
    shikiConfig: {
      // Light code-block look, matches the brutalist-light theme.
      theme: "github-light",
    },
  },
  integrations: [
    mdx(),
    // Produces /sitemap-index.xml + /sitemap-0.xml. robots.txt already
    // points there. Deliberately without i18n config: the EN variant
    // only exists for selected paths - a blanket i18n mapping would
    // invent `/en/impressum` and similar. Hreflang annotations are
    // already provided by `Base.astro` via <link>.
    sitemap(),
  ],
});
