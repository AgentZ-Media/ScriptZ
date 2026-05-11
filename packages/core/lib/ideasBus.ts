import { createSignal } from "solid-js";

/** Versionssignal für die Ideen-Liste. Wird gebumpt, sobald irgendeine
 *  Ideen-Mutation (create / update / convert / delete) durch ist. */
const [version, setVersion] = createSignal(0);

export const ideasBus = {
  version,
  bump() {
    // Funktionaler Updater - siehe dailyStatsBus.ts.
    setVersion((v) => v + 1);
  },
};
