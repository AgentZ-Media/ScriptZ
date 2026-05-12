import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://write-scriptz.com",
  trailingSlash: "never",
  build: {
    format: "file",
  },
  integrations: [
    // Erzeugt /sitemap-index.xml + /sitemap-0.xml. robots.txt verweist
    // bereits darauf. Bewusst ohne i18n-Config: die EN-Variante existiert
    // nur fuer `/`, nicht fuer Impressum/Datenschutz - eine pauschale
    // i18n-Mapping wuerde `/en/impressum` o.ae. erfinden. Hreflang-
    // Annotationen liefert ohnehin schon `Base.astro` per <link>.
    sitemap(),
  ],
});
