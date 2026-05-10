import { createResource } from "solid-js";
import { api } from "~/lib/api";
import { dailyStatsBus } from "~/lib/dailyStatsBus";
import type { DailyStatsSummary } from "~/lib/types";

// Heatmap und Streak-Bar erwarten dailyWords mit fester Länge 365
// (ein Eintrag pro Tag der letzten 12 Monate). Ein leerer Array würde
// das Heatmap-Grid auf 0 Zellen reduzieren und beim Refetch wieder
// "wachsen lassen" - kosmetisch unsauber, deshalb Fallback mit Nullen.
const EMPTY: DailyStatsSummary = {
  wordsToday: 0,
  wordsThisWeek: 0,
  streakDays: 0,
  dailyWords: Array(365).fill(0),
  activeDays: 0,
  totalWords: 0,
};

// Globaler Resource-Slot. createResource lebt am Modul-Top-Level, damit
// Subscribenten sich denselben Cache teilen - jede Komponente, die die
// Statistik braucht, ruft `dailyStats()` auf, ohne den Roundtrip neu
// auszulösen. Bei einem Bus-Bump (siehe lib/dailyStatsBus.ts) refetcht
// der Resource transparent.
const [stats] = createResource(
  () => dailyStatsBus.version(),
  async () => {
    try {
      return await api.loadDailyStats();
    } catch (err) {
      console.warn("[scriptz] daily stats load failed", err);
      return EMPTY;
    }
  },
  { initialValue: EMPTY },
);

export const dailyStatsStore = {
  /** Aktuelle Statistik. Liefert `EMPTY` solange der erste Roundtrip
   *  läuft - die UI zeigt einfach 0/0 statt zu blockieren. */
  stats,
  /** Manueller Trigger - z. B. nach Re-Hydrate beim App-Start. */
  refresh() {
    dailyStatsBus.bump();
  },
};
