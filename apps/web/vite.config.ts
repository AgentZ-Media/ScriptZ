import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Browser variant of the ScriptZ app. Has its own Vite stack, completely
// separate from the desktop Vite (port 5173 instead of 1420), so both
// dev servers can run in parallel.
//
// Version sync: the web app must always report the same version as the
// desktop app (Settings dialog renders "ScriptZ · v{Version}").
// We read `apps/desktop/package.json` at build time and inject the
// version as a build constant, so `apps/web/package.json` doesn't become
// a second version site that needs to be kept in sync. With the next
// tag push the web build automatically gets the right version - no
// changes to the release workflow needed.
const desktopPkg = JSON.parse(
  readFileSync(resolve(__dirname, "../desktop/package.json"), "utf8"),
) as { version: string };

export default defineConfig({
  plugins: [solid()],
  clearScreen: false,
  server: {
    port: 5173,
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
