import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://write-scriptz.com",
  trailingSlash: "never",
  build: {
    format: "file",
  },
});
