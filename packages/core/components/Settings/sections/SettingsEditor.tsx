import { Show } from "solid-js";
import { settingsStore } from "../../../stores/settings";
import { t } from "../../../i18n";
import { Toggle } from "./icons";

export function SettingsEditor() {
  return (
    <>
      <h3>{t("settings.section.editor")}</h3>
      <div class="settings-pane-sub">{t("settings.editor.sub")}</div>

      <div class="settings-row">
        <div class="settings-row-label">
          <div class="row-label">{t("settings.writingStats.label")}</div>
          <div class="row-help">{t("settings.writingStats.help")}</div>
        </div>
        <Toggle
          checked={settingsStore.showWritingStats()}
          onChange={(v) => void settingsStore.setShowWritingStats(v)}
          label={t("settings.writingStats.label")}
        />
      </div>

      <Show when={settingsStore.showWritingStats()}>
        <div class="settings-row">
          <div class="settings-row-label">
            <div class="row-label">{t("settings.weeklyGoal.label")}</div>
            <div class="row-help">{t("settings.weeklyGoal.help")}</div>
          </div>
          <div class="settings-goal-input">
            <input
              type="number"
              min={settingsStore.WEEKLY_WORD_GOAL_MIN}
              max={settingsStore.WEEKLY_WORD_GOAL_MAX}
              step={100}
              value={settingsStore.weeklyWordGoal()}
              onChange={(e) => {
                const n = Number(e.currentTarget.value);
                if (Number.isFinite(n)) void settingsStore.setWeeklyWordGoal(n);
              }}
            />
            <span class="settings-goal-unit">{t("settings.weeklyGoal.unit")}</span>
          </div>
        </div>
      </Show>

      <div class="settings-row">
        <div class="settings-row-label">
          <div class="row-label">{t("settings.wpm.label")}</div>
          <div class="row-help">{t("settings.wpm.help")}</div>
        </div>
        <div class="settings-goal-input">
          <input
            type="number"
            min={settingsStore.DIALOG_WPM_MIN}
            max={settingsStore.DIALOG_WPM_MAX}
            step={10}
            value={settingsStore.dialogWpm()}
            onChange={(e) => {
              const n = Number(e.currentTarget.value);
              if (Number.isFinite(n)) void settingsStore.setDialogWpm(n);
            }}
          />
          <span class="settings-goal-unit">{t("settings.wpm.unit")}</span>
        </div>
      </div>

      <div class="settings-row">
        <div class="settings-row-label">
          <div class="row-label">{t("settings.highlighting.label")}</div>
        </div>
        <Toggle
          checked={settingsStore.highlightingDefault()}
          onChange={(v) => void settingsStore.setHighlightingDefault(v)}
          label={t("settings.highlighting.aria")}
        />
      </div>

      <div class="settings-row">
        <div class="settings-row-label">
          <div class="row-label">{t("settings.quickMode.label")}</div>
          <div class="row-help">{t("settings.quickMode.help")}</div>
        </div>
        <Toggle
          checked={settingsStore.quickModeAutoEnable()}
          onChange={(v) => void settingsStore.setQuickModeAutoEnable(v)}
          label={t("settings.quickMode.aria")}
        />
      </div>
    </>
  );
}
