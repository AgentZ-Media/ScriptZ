import { createSignal } from "solid-js";

/**
 * Global "scripts changed" version. Anything that mutates the script
 * list (create / archive / restore / duplicate / purge / rename) bumps
 * the version. The Browser reads it as part of its query key so the
 * list refetches no matter which view triggered the change.
 */
const [version, setVersion] = createSignal(0);

export const scriptsBus = {
  version,
  bump() {
    // Funktionaler Updater - siehe dailyStatsBus.ts für Details. `version()`
    // hier zu lesen würde den Aufrufer (falls innerhalb einer Effect)
    // auf das Versionssignal selbst subscriben und mit dem direkt
    // folgenden Write eine Endlosrekursion auslösen.
    setVersion((v) => v + 1);
  },
};
