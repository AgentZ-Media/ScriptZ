import { createSignal, createEffect } from "solid-js";
import { api } from "../lib/api";
import {
  applyResolvedLanguage,
  detectSystemLanguage,
  resolveLanguage,
  type Language,
  type LanguagePref,
} from "../i18n";

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
// Zähler-Badge am Ideen-Tab anzeigen (Anzahl offener Ideen). Wer eine
// große Idee-Sammlung hat, mag die Zahl ggf. nicht ständig sehen.
const [showIdeasBadge, setShowIdeasBadge] = createSignal<boolean>(true);
// Volle Dark-Immersion: Skript-Sheet auch im Dark-Mode dunkel statt hell.
// Default off — die meisten User mögen den "beleuchtetes-Blatt"-Look, aber
// für OLED-/Late-Night-Schreiben wird das Sheet als zu hell empfunden.
// Greift nur, wenn das aufgelöste Theme tatsächlich "dark" ist (Light-
// Mode ignoriert die Einstellung, im Auto-Mode hängt's am System).
const [darkPaper, setDarkPaper] = createSignal<boolean>(false);
// Wochenziel in Wörtern. Default 1500 - kalibriert auf 7 Skripte à
// ~200 Wörter (Short-Form-Schnitt) plus ein bisschen Puffer. Wird vom
// Momentum-Strip auf der Home-Seite und vom Status-Strip in der Tab-
// Bar gelesen. Wochen- statt Tagesgranularität, weil Creator selten
// jeden Tag ein Skript schreiben - tägliche "0 / 250 W"-Counter
// erzeugen Druck statt Motivation.
const WEEKLY_WORD_GOAL_DEFAULT = 1500;
const WEEKLY_WORD_GOAL_MIN = 200;
const WEEKLY_WORD_GOAL_MAX = 50000;
const [weeklyWordGoal, setWeeklyWordGoal] = createSignal<number>(WEEKLY_WORD_GOAL_DEFAULT);

// Wörter pro Minute für die Spielzeit-Schätzung in der Cast-Rail.
// Default 210 ist auf TikTok-/Sketch-Tempo kalibriert (siehe EditorRail.tsx).
// Klassische Drehbuch-Pace liegt bei 150, schnelles Reden bei ~250.
const DIALOG_WPM_DEFAULT = 210;
const DIALOG_WPM_MIN = 80;
const DIALOG_WPM_MAX = 400;
const [dialogWpm, setDialogWpm] = createSignal<number>(DIALOG_WPM_DEFAULT);

// Sprach-Präferenz "auto" | "de" | "en". "auto" folgt navigator.language.
// Default "auto" - neue User landen sprachlich da, wo ihr System steht.
// Die aufgelöste Sprache wird nicht hier persistiert, nur die User-Wahl;
// das i18n-Modul resolved bei jedem Load erneut, sodass ein System-
// Wechsel nicht in einer veralteten Cache-Sprache hängenbleibt.
const [language, setLanguagePref] = createSignal<LanguagePref>("auto");

const [loaded, setLoaded] = createSignal(false);

// matchMedia + aufgelöstes Theme - früh deklariert, damit settingsStore.resolvedTheme
// in der Store-Definition unten ohne Forward-Reference funktioniert.
const prefersDark =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;

function resolveTheme(t: Theme): "dark" | "light" {
  if (t === "auto") return prefersDark?.matches ? "dark" : "light";
  return t;
}

// Reaktives "ist die App gerade dark?" - UI-Komponenten brauchen das,
// um z.B. die darkPaper-Option zu (de-)aktivieren. Bleibt im Auto-
// Modus auf dem aktuellen System-Stand (Listener weiter unten).
const [resolvedTheme, setResolvedTheme] = createSignal<"dark" | "light">(
  resolveTheme(theme()),
);

function clampGoal(n: number): number {
  if (!Number.isFinite(n)) return WEEKLY_WORD_GOAL_DEFAULT;
  return Math.max(WEEKLY_WORD_GOAL_MIN, Math.min(WEEKLY_WORD_GOAL_MAX, Math.round(n)));
}

function clampWpm(n: number): number {
  if (!Number.isFinite(n)) return DIALOG_WPM_DEFAULT;
  return Math.max(DIALOG_WPM_MIN, Math.min(DIALOG_WPM_MAX, Math.round(n)));
}

function applyLanguage(pref: LanguagePref): void {
  const lang: Language = resolveLanguage(pref);
  applyResolvedLanguage(lang);
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
  showIdeasBadge,
  setShowIdeasBadge: async (v: boolean) => {
    setShowIdeasBadge(v);
    await api.setSetting("show_ideas_badge", v ? "1" : "0");
  },
  darkPaper,
  setDarkPaper: async (v: boolean) => {
    setDarkPaper(v);
    await api.setSetting("dark_paper", v ? "1" : "0");
  },
  resolvedTheme,
  weeklyWordGoal,
  setWeeklyWordGoal: async (v: number) => {
    const next = clampGoal(v);
    setWeeklyWordGoal(next);
    await api.setSetting("weekly_word_goal", String(next));
  },
  WEEKLY_WORD_GOAL_MIN,
  WEEKLY_WORD_GOAL_MAX,
  WEEKLY_WORD_GOAL_DEFAULT,
  dialogWpm,
  setDialogWpm: async (v: number) => {
    const next = clampWpm(v);
    setDialogWpm(next);
    await api.setSetting("dialog_wpm", String(next));
  },
  DIALOG_WPM_MIN,
  DIALOG_WPM_MAX,
  DIALOG_WPM_DEFAULT,
  /** Aktuelle User-Wahl "auto" | "de" | "en". */
  language,
  setLanguage: async (v: LanguagePref) => {
    setLanguagePref(v);
    applyLanguage(v);
    await api.setSetting("language", v);
  },
  loaded,
  async load() {
    const [t, hd, uce, huc, qmae, wwg, dwgLegacy, wpm, fmd, sib, dp, lang] = await Promise.all([
      api.getSetting("theme"),
      api.getSetting("highlighting_default"),
      api.getSetting("update_check_enabled"),
      api.getSetting("hourly_update_check"),
      api.getSetting("quick_mode_auto_enable"),
      api.getSetting("weekly_word_goal"),
      api.getSetting("daily_word_goal"),
      api.getSetting("dialog_wpm"),
      api.getSetting("focus_mode_default"),
      api.getSetting("show_ideas_badge"),
      api.getSetting("dark_paper"),
      api.getSetting("language"),
    ]);
    if (t === "dark" || t === "light" || t === "auto") setTheme(t);
    if (hd) setHighlightingDefault(hd === "1");
    if (uce) setUpdateCheckEnabled(uce === "1");
    if (huc) setHourlyUpdateCheck(huc === "1");
    if (qmae) setQuickModeAutoEnable(qmae === "1");
    if (fmd) setFocusModeDefault(fmd === "1");
    if (sib) setShowIdeasBadge(sib === "1");
    if (dp) setDarkPaper(dp === "1");
    // Sprache: persistierter Wert hat Vorrang, sonst Default "auto".
    // Bestandsuser bekommen so ohne explizite Migration ihre System-
    // Sprache (Auto-Detection beim ersten Resolve).
    if (lang === "auto" || lang === "de" || lang === "en") {
      setLanguagePref(lang);
    }
    applyLanguage(language());
    // Wochenziel: Vorrang neuer Key. Legacy-Migration aus dem alten
    // Tagesziel ×7, falls noch kein Wochenziel persistiert wurde -
    // dann bleibt der Setup-Aufwand für upgradende User bei Null.
    if (wwg) {
      const parsed = Number(wwg);
      if (Number.isFinite(parsed)) setWeeklyWordGoal(clampGoal(parsed));
    } else if (dwgLegacy) {
      const parsed = Number(dwgLegacy);
      if (Number.isFinite(parsed)) {
        const migrated = clampGoal(parsed * 7);
        setWeeklyWordGoal(migrated);
        // Direkt auch persistieren, damit der Migrate nur einmal passiert
        // (sonst würde der nächste Boot das Legacy-Feld erneut lesen).
        void api.setSetting("weekly_word_goal", String(migrated));
      }
    }
    if (wpm) {
      const parsed = Number(wpm);
      if (Number.isFinite(parsed)) setDialogWpm(clampWpm(parsed));
    }
    setLoaded(true);
  },
};

// Theme aufs Document anwenden. "auto" wird per matchMedia (oben
// deklariert) zu "dark" oder "light" aufgelöst, damit das CSS nur
// zwei Wahrheitsquellen kennt - sonst müsste jeder Dark-Token-Block
// doppelt gepflegt werden (einmal für [data-theme="dark"], einmal
// für @media + auto), was in der Vergangenheit zu unvollständigen
// Auto-Blöcken und Stil-Layer-Bugs geführt hat.
//
// Solid trackt theme() als Dependency und feuert auf jeden Wechsel,
// inkl. dem ersten Lese-Setzen am Ende von load().
//
// Bevor `load()` durchgelaufen ist, schreiben wir nichts - sonst flickert
// der Default ("light") kurz übers persistierte Theme, weil dieser
// Effect schon beim Modul-Import einmal feuert.
// data-paper folgt strikt dem **aufgelösten** Theme: nur wenn das Theme
// (inkl. Auto-Resolution) tatsächlich dark ist, kommt data-paper="dark"
// dran. Im Light-Mode wird das Attribut entfernt, damit die User-
// Einstellung "darkPaper" hier keinen Effekt hat - das Sheet bleibt
// hell. So funktioniert die Auto-Logik out of the box: User stellt
// darkPaper einmal an, und das Sheet wird nur dann dunkel, wenn die
// App gerade im Dark-Look ist.
function applyChrome() {
  const resolved = resolveTheme(theme());
  setResolvedTheme(resolved);
  document.documentElement.dataset.theme = resolved;
  if (resolved === "dark" && darkPaper()) {
    document.documentElement.dataset.paper = "dark";
  } else {
    delete document.documentElement.dataset.paper;
  }
}

createEffect(() => {
  if (!loaded()) return;
  // Tracking auf theme() und darkPaper() — beide triggern applyChrome.
  theme();
  darkPaper();
  applyChrome();
});

// System-Wechsel live mitziehen, solange der User auf "auto" steht.
// Ohne diesen Listener würde der Auto-Modus zwar beim App-Start korrekt
// auflösen, aber nicht reagieren, wenn der User währenddessen das
// System-Theme wechselt. applyChrome() macht auch das darkPaper-Attribut
// in dem Moment richtig - bei System-Wechsel auf dark mit aktivem
// darkPaper geht das Sheet automatisch mit dunkel.
if (prefersDark) {
  prefersDark.addEventListener("change", () => {
    if (!loaded()) return;
    if (theme() === "auto") applyChrome();
  });
}

// Sprache: System-Sprach-Wechsel live mitziehen, solange der User auf
// "auto" steht. Der `languagechange`-Event feuert bei Locale-Wechsel im
// Browser/OS. Selten, aber kostet uns nichts.
if (typeof window !== "undefined") {
  window.addEventListener("languagechange", () => {
    if (!loaded()) return;
    if (language() === "auto") applyLanguage("auto");
  });
}

// Falls ein anderer Modul-Import die UI braucht, bevor settings.load()
// durch ist (z.B. WebDisclaimerBanner liest navigator-Sprache vor dem
// Boot-Promise), die System-Sprache schon mal als Default einspielen.
// settings.load() überschreibt das ggf. mit der persistierten Präferenz.
if (typeof document !== "undefined") {
  applyResolvedLanguage(detectSystemLanguage());
}
