import { settingsStore, type Theme } from "../../../stores/settings";
import { K } from "../../../lib/keys";
import { t, type LanguagePref } from "../../../i18n";
import { Toggle } from "./icons";

export function SettingsAppearance() {
  return (
    <>
      <h3>{t("settings.section.appearance")}</h3>
      <div class="settings-pane-sub">{t("settings.appearance.sub")}</div>
      <div class="settings-row">
        <div class="settings-row-label">
          <div class="row-label">{t("lang.label")}</div>
          <div class="row-help">{t("lang.help")}</div>
        </div>
        <div class="seg" role="group" aria-label={t("settings.section.language")}>
          {(["de", "en", "auto"] as LanguagePref[]).map((value) => (
            <button
              type="button"
              classList={{ "is-on": settingsStore.language() === value }}
              onClick={() => void settingsStore.setLanguage(value)}
            >
              {value === "de" ? t("lang.de") : value === "en" ? t("lang.en") : t("lang.auto")}
            </button>
          ))}
        </div>
      </div>
      <div class="settings-row">
        <div class="settings-row-label">
          <div class="row-label">{t("settings.theme.label")}</div>
          <div class="row-help">{t("settings.theme.help")}</div>
        </div>
        <div class="seg" role="group" aria-label={t("settings.theme.aria")}>
          {(["light", "dark", "auto"] as Theme[]).map((value) => (
            <button
              type="button"
              classList={{ "is-on": settingsStore.theme() === value }}
              onClick={() => void settingsStore.setTheme(value)}
            >
              {value === "light" ? t("theme.light") : value === "dark" ? t("theme.dark") : t("theme.auto")}
            </button>
          ))}
        </div>
      </div>

      <div class="settings-row">
        <div class="settings-row-label">
          <div class="row-label">{t("settings.darkPaper.label")}</div>
          <div class="row-help">{t("settings.darkPaper.help")}</div>
        </div>
        <Toggle
          checked={settingsStore.darkPaper()}
          onChange={(v) => void settingsStore.setDarkPaper(v)}
          disabled={settingsStore.resolvedTheme() !== "dark"}
          label={t("settings.darkPaper.aria")}
        />
      </div>

      <div class="settings-row">
        <div class="settings-row-label">
          <div class="row-label">{t("settings.focusDefault.label")}</div>
          <div class="row-help">{t("settings.focusDefault.help", { hotkey: K("Mod+Shift+F") })}</div>
        </div>
        <Toggle
          checked={settingsStore.focusModeDefault()}
          onChange={(v) => void settingsStore.setFocusModeDefault(v)}
          label={t("settings.focusDefault.aria")}
        />
      </div>

      <div class="settings-row">
        <div class="settings-row-label">
          <div class="row-label">{t("settings.ideasBadge.label")}</div>
          <div class="row-help">{t("settings.ideasBadge.help")}</div>
        </div>
        <Toggle
          checked={settingsStore.showIdeasBadge()}
          onChange={(v) => void settingsStore.setShowIdeasBadge(v)}
          label={t("settings.ideasBadge.aria")}
        />
      </div>
    </>
  );
}
