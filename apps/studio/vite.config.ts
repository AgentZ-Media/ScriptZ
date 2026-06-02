import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ScriptZ Studio frontend. Own Vite stack on port 5174, separate from the
// web app (5173) and desktop (1420), so all dev servers can run in parallel.
//
// Version sync: Studio reuses the core editor, so it reports the same app
// version as the existing apps. We read apps/desktop/package.json at build
// time and inject it as __APP_VERSION__ (same pattern as apps/web).
const desktopPkg = JSON.parse(
  readFileSync(resolve(__dirname, "../desktop/package.json"), "utf8"),
) as { version: string };

export default defineConfig({
  plugins: [solid()],
  clearScreen: false,
  server: {
    port: 5174,
    strictPort: false,
  },
  resolve: {
    alias: {
      "~": resolve(__dirname, "./src"),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(desktopPkg.version),
  },
  build: {
    target: "es2022",
    minify: "esbuild",
    sourcemap: false,
  },
});
