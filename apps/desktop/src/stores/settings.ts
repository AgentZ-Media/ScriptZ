import { createSignal, createEffect } from "solid-js";
import { api } from "~/lib/api";

export type Theme = "dark" | "light" | "auto";

const [theme, setTheme] = createSignal<Theme>("light");
const [highlightingDefault, setHighlightingDefault] = createSignal<boolean>(false);
const [updateCheckEnabled, setUpdateCheckEnabled] = createSignal<boolean>(true);
const [hourlyUpdateCheck, setHourlyUpdateCheck] = createSignal<boolean>(true);
// In-app print uses these as overrides on top of the default (false/false).
// Defaults match what most writers want when hitting ⌘P from the editor:
// neither title page nor character tinting.
const [printTitlePage, setPrintTitlePage] = createSignal<boolean>(false);
const [printHighlighting, setPrintHighlighting] = createSignal<boolean>(false);
// Auto-flip quick mode on whenever a script has exactly two characters.
// Per-script manual toggle still wins — once the writer overrides it on a
// script, that decision sticks across character-count changes.
const [quickModeAutoEnable, setQuickModeAutoEnable] = createSignal<boolean>(false);
const [loaded, setLoaded] = createSignal(false);

export const settingsStore = {
  theme,
  setTheme: async (v: Theme) => {
    setTheme(v);
    document.documentElement.dataset.theme = v;
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
  printTitlePage,
  setPrintTitlePage: async (v: boolean) => {
    setPrintTitlePage(v);
    await api.setSetting("print_title_page", v ? "1" : "0");
  },
  printHighlighting,
  setPrintHighlighting: async (v: boolean) => {
    setPrintHighlighting(v);
    await api.setSetting("print_highlighting", v ? "1" : "0");
  },
  quickModeAutoEnable,
  setQuickModeAutoEnable: async (v: boolean) => {
    setQuickModeAutoEnable(v);
    await api.setSetting("quick_mode_auto_enable", v ? "1" : "0");
  },
  loaded,
  async load() {
    const [t, hd, uce, huc, ptp, ph, qmae] = await Promise.all([
      api.getSetting("theme"),
      api.getSetting("highlighting_default"),
      api.getSetting("update_check_enabled"),
      api.getSetting("hourly_update_check"),
      api.getSetting("print_title_page"),
      api.getSetting("print_highlighting"),
      api.getSetting("quick_mode_auto_enable"),
    ]);
    if (t === "dark" || t === "light" || t === "auto") setTheme(t);
    if (hd) setHighlightingDefault(hd === "1");
    if (uce) setUpdateCheckEnabled(uce === "1");
    if (huc) setHourlyUpdateCheck(huc === "1");
    if (ptp) setPrintTitlePage(ptp === "1");
    if (ph) setPrintHighlighting(ph === "1");
    if (qmae) setQuickModeAutoEnable(qmae === "1");
    setLoaded(true);
    document.documentElement.dataset.theme = theme();
  },
};

createEffect(() => {
  if (loaded()) {
    document.documentElement.dataset.theme = theme();
  }
});
