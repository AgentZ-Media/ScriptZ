import { createSignal } from "solid-js";

/** Versionssignal für die tägliche Schreibstatistik (daily_word_log).
 *  Wird gebumpt, sobald `recordWordDelta` einen positiven Anstieg
 *  geschrieben hat - der Stats-Store invalidiert daraufhin und liest
 *  die Heatmap/Streak-Daten neu. */
const [version, setVersion] = createSignal(0);

export const dailyStatsBus = {
  version,
  bump() {
    // Funktionaler Updater statt `setVersion(version() + 1)`. Sonst würde
    // `version()` die Subscription des Aufrufers (z. B. einer
    // createEffect, die `dailyStatsBus.bump()` callt) auf das
    // Versionssignal selbst legen — und der unmittelbar folgende
    // `setVersion` würde dieselbe Subscription wieder triggern → harte
    // Endlosrekursion über `markDownstream`.
    setVersion((v) => v + 1);
  },
};
