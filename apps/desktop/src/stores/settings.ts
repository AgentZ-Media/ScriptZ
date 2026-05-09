import { createSignal, createEffect } from "solid-js";
import { api } from "~/lib/api";

export type Theme = "dark" | "light" | "auto";

const [theme, setTheme] = createSignal<Theme>("light");
const [highlightingDefault, setHighlightingDefault] = createSignal<boolean>(false);
const [updateCheckEnabled, setUpdateCheckEnabled] = createSignal<boolean>(true);
const [hourlyUpdateCheck, setHourlyUpdateCheck] = createSignal<boolean>(true);
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
  quickModeAutoEnable,
  setQuickModeAutoEnable: async (v: boolean) => {
    setQuickModeAutoEnable(v);
    await api.setSetting("quick_mode_auto_enable", v ? "1" : "0");
  },
  loaded,
  async load() {
    const [t, hd, uce, huc, qmae] = await Promise.all([
      api.getSetting("theme"),
      api.getSetting("highlighting_default"),
      api.getSetting("update_check_enabled"),
      api.getSetting("hourly_update_check"),
      api.getSetting("quick_mode_auto_enable"),
    ]);
    if (t === "dark" || t === "light" || t === "auto") setTheme(t);
    if (hd) setHighlightingDefault(hd === "1");
    if (uce) setUpdateCheckEnabled(uce === "1");
    if (huc) setHourlyUpdateCheck(huc === "1");
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
