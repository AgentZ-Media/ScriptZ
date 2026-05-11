/// <reference types="vite/client" />

// Vom Vite-Build via `define` injectete Konstanten. Werden zur Build-
// Zeit aus apps/desktop/package.json gelesen - siehe ../vite.config.ts.
declare const __APP_VERSION__: string;
