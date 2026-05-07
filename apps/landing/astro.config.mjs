import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://getscriptz.app",
  trailingSlash: "never",
  build: {
    format: "file",
  },
});
