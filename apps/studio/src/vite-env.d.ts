/// <reference types="vite/client" />

// Constant injected by the Vite build via `define`. Read at build time
// from apps/desktop/package.json - see ../vite.config.ts.
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Convex deployment URL, written by `npx convex dev` into .env.local. */
  readonly VITE_CONVEX_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
