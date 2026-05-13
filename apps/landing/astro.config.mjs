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
    // Skript-Optik: Blockquotes der Form `> **NAME:** Text` werden in
    // semantische <Dialogue>-Blocks verwandelt. Klassische Quotes
    // (ohne Charakter-Praefix) bleiben unangetastet und rendern als
    // editorial Zitat im Stylesheet.
    remarkPlugins: [remarkDialogue],
    shikiConfig: {
      // Heller Code-Block-Look, passt zum Brutalist-Light-Theme.
      theme: "github-light",
    },
  },
  integrations: [
    mdx(),
    // Erzeugt /sitemap-index.xml + /sitemap-0.xml. robots.txt verweist
    // bereits darauf. Bewusst ohne i18n-Config: die EN-Variante existiert
    // nur fuer ausgewaehlte Pfade - eine pauschale i18n-Mapping wuerde
    // `/en/impressum` o.ae. erfinden. Hreflang-Annotationen liefert
    // ohnehin schon `Base.astro` per <link>.
    sitemap(),
  ],
});
