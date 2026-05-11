import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { resolve } from "node:path";

// Browser-Variante der ScriptZ-App (Phase D - Skelett). Eigener Vite-
// Stack, voellig getrennt vom Desktop-Vite (Port 5173 statt 1420), damit
// beide Dev-Server parallel laufen koennen.
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
  build: {
    target: "es2022",
    minify: "esbuild",
    sourcemap: false,
  },
});
