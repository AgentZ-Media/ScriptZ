import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Browser-Variante der ScriptZ-App. Eigener Vite-Stack, voellig getrennt
// vom Desktop-Vite (Port 5173 statt 1420), damit beide Dev-Server
// parallel laufen koennen.
//
// Versions-Sync: die Web-App muss immer dieselbe Version wie die
// Desktop-App melden (Settings-Dialog rendert "ScriptZ · v{Version}").
// Wir lesen `apps/desktop/package.json` zum Build-Zeitpunkt und injecten
// die Version als Build-Konstante, damit `apps/web/package.json` keine
// zweite Version-Stelle wird, die mitgepflegt werden muss. Mit dem
// naechsten Tag-Push bekommt der Web-Build automatisch die richtige
// Version - voellig ohne Eingriff in den Release-Workflow.
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
