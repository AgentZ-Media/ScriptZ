import { createSignal, createEffect } from "solid-js";
import { api } from "~/lib/api";

export type Theme = "dark" | "light" | "auto";

const [theme, setTheme] = createSignal<Theme>("light");
const [highlightingDefault, setHighlightingDefault] = createSignal<boolean>(false);
const [updateCheckEnabled, setUpdateCheckEnabled] = createSignal<boolean>(true);
const [hourlyUpdateCheck, setHourlyUpdateCheck] = createSignal<boolean>(true);
// Fokus-Modus standardmäßig aktiv: Toolbar + Cast-Rail sind beim Öffnen
// eines Skripts ausgeblendet, ⇧⌘F holt sie zurück. Default true (das ist
// der ruhigere Schreib-Modus, den die meisten Nutzer bevorzugen).
const [focusModeDefault, setFocusModeDefault] = createSignal<boolean>(true);
// Auto-flip quick mode on whenever a script has exactly two characters.
// Per-script manual toggle still wins — once the writer overrides it on a
// script, that decision sticks across character-count changes.
const [quickModeAutoEnable, setQuickModeAutoEnable] = createSignal<boolean>(false);
// Tagesziel in Wörtern. Default 250 (laut Re-Design-Chat). Wird vom
// Momentum-Strip auf der Home-Seite und vom (geplanten) Editor-Ribbon
// gelesen. Bewusst eine zentrale Quelle, damit Home und Editor sich
// nie unterscheiden.
const DAILY_WORD_GOAL_DEFAULT = 250;
const DAILY_WORD_GOAL_MIN = 50;
const DAILY_WORD_GOAL_MAX = 5000;
const [dailyWordGoal, setDailyWordGoal] = createSignal<number>(DAILY_WORD_GOAL_DEFAULT);

// Wörter pro Minute für die Spielzeit-Schätzung in der Cast-Rail.
// Default 210 ist auf TikTok-/Sketch-Tempo kalibriert (siehe EditorRail.tsx).
// Klassische Drehbuch-Pace liegt bei 150, schnelles Reden bei ~250.
const DIALOG_WPM_DEFAULT = 210;
const DIALOG_WPM_MIN = 80;
const DIALOG_WPM_MAX = 400;
const [dialogWpm, setDialogWpm] = createSignal<number>(DIALOG_WPM_DEFAULT);

const [loaded, setLoaded] = createSignal(false);

function clampGoal(n: number): number {
  if (!Number.isFinite(n)) return DAILY_WORD_GOAL_DEFAULT;
  return Math.max(DAILY_WORD_GOAL_MIN, Math.min(DAILY_WORD_GOAL_MAX, Math.round(n)));
}

function clampWpm(n: number): number {
  if (!Number.isFinite(n)) return DIALOG_WPM_DEFAULT;
  return Math.max(DIALOG_WPM_MIN, Math.min(DIALOG_WPM_MAX, Math.round(n)));
}

export const settingsStore = {
  theme,
  setTheme: async (v: Theme) => {
    setTheme(v);
    // dataset.theme wird vom createEffect unten gesetzt — kein redundantes
    // Schreiben hier mehr.
    await api.setSetting("theme", v);
  },
  highlightingDefault,
  setHighlightingDefault: async (v: boolean) => {
    setHighlightingDefault(v);
    await api.setSetting("highlighting_default", v ? "1" : "0");
  },
  updateCheckEnabled,
  setUpdateCheckEnabled: async (v: boolean) => {
    setUpdateCheckEnabled(v);
    await api.setSetting("update_check_enabled", v ? "1" : "0");
  },
  hourlyUpdateCheck,
  setHourlyUpdateCheck: async (v: boolean) => {
    setHourlyUpdateCheck(v);
    await api.setSetting("hourly_update_check", v ? "1" : "0");
  },
  focusModeDefault,
  setFocusModeDefault: async (v: boolean) => {
    setFocusModeDefault(v);
    await api.setSetting("focus_mode_default", v ? "1" : "0");
  },
  quickModeAutoEnable,
  setQuickModeAutoEnable: async (v: boolean) => {
    setQuickModeAutoEnable(v);
    await api.setSetting("quick_mode_auto_enable", v ? "1" : "0");
  },
  dailyWordGoal,
  setDailyWordGoal: async (v: number) => {
    const next = clampGoal(v);
    setDailyWordGoal(next);
    await api.setSetting("daily_word_goal", String(next));
  },
  DAILY_WORD_GOAL_MIN,
  DAILY_WORD_GOAL_MAX,
  DAILY_WORD_GOAL_DEFAULT,
  dialogWpm,
  setDialogWpm: async (v: number) => {
    const next = clampWpm(v);
    setDialogWpm(next);
    await api.setSetting("dialog_wpm", String(next));
  },
  DIALOG_WPM_MIN,
  DIALOG_WPM_MAX,
  DIALOG_WPM_DEFAULT,
  loaded,
  async load() {
    const [t, hd, uce, huc, qmae, dwg, wpm, fmd] = await Promise.all([
      api.getSetting("theme"),
      api.getSetting("highlighting_default"),
      api.getSetting("update_check_enabled"),
      api.getSetting("hourly_update_check"),
      api.getSetting("quick_mode_auto_enable"),
      api.getSetting("daily_word_goal"),
      api.getSetting("dialog_wpm"),
      api.getSetting("focus_mode_default"),
    ]);
    if (t === "dark" || t === "light" || t === "auto") setTheme(t);
    if (hd) setHighlightingDefault(hd === "1");
    if (uce) setUpdateCheckEnabled(uce === "1");
    if (huc) setHourlyUpdateCheck(huc === "1");
    if (qmae) setQuickModeAutoEnable(qmae === "1");
    if (fmd) setFocusModeDefault(fmd === "1");
    if (dwg) {
      const parsed = Number(dwg);
      if (Number.isFinite(parsed)) setDailyWordGoal(clampGoal(parsed));
    }
    if (wpm) {
      const parsed = Number(wpm);
      if (Number.isFinite(parsed)) setDialogWpm(clampWpm(parsed));
    }
    setLoaded(true);
  },
};

// Theme aufs Document anwenden — wir lassen den Effekt das einzige
// Schreib-Target sein (statt zusätzlich in setTheme + load() zu setzen).
// Solid trackt theme() als Dependency und feuert auf jeden Wechsel,
// inkl. dem ersten Lese-Setzen am Ende von load().
//
// Bevor `load()` durchgelaufen ist, schreiben wir nichts - sonst flickert
// der Default ("light") kurz übers persistierte Theme, weil dieser
// Effect schon beim Modul-Import einmal feuert.
createEffect(() => {
  if (!loaded()) return;
  document.documentElement.dataset.theme = theme();
});
