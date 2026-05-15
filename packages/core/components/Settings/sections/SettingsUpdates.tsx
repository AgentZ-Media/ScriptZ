import { Show } from "solid-js";
import { settingsStore } from "../../../stores/settings";
import { getPlatformAdapter } from "../../../lib/platform";
import { getUpdatesStore } from "../../../lib/updates";
import { t } from "../../../i18n";
import { Toggle } from "./icons";

const openUrl = (url: string) => getPlatformAdapter().openUrl(url);
const updates = () => getUpdatesStore();

const REPO_URL = "https://github.com/AgentZ-Media/ScriptZ";

export function SettingsUpdates() {
  // Caller guarantees the updates store is available (nav hides this
  // section otherwise), so the non-null assertions are safe.
  const onCheckUpdate = async () => {
    await updates()!.checkNow();
  };
  const onDownloadInstall = async () => {
    await updates()!.downloadAndInstall();
  };
  const onRestart = async () => {
    await updates()!.restart();
  };
  const isChecking = () => updates()!.manualCheck()?.kind === "checking";

  const openLatestRelease = async () => {
    try { await openUrl(`${REPO_URL}/releases/latest`); } catch {}
  };

  return (
    <>
      <h3>{t("settings.section.updates")}</h3>
      <div class="settings-pane-sub">{t("settings.updates.sub")}</div>

      <div class="settings-row">
        <div class="settings-row-label">
          <div class="row-label">{t("settings.updates.enabled.label")}</div>
        </div>
        <Toggle
          checked={settingsStore.updateCheckEnabled()}
          onChange={(v) => void settingsStore.setUpdateCheckEnabled(v)}
          label={t("settings.updates.enabled.aria")}
        />
      </div>

      <div class="settings-row">
        <div class="settings-row-label">
          <div class="row-label">{t("settings.updates.hourly.label")}</div>
        </div>
        <Toggle
          checked={settingsStore.hourlyUpdateCheck()}
          disabled={!settingsStore.updateCheckEnabled()}
          onChange={(v) => void settingsStore.setHourlyUpdateCheck(v)}
          label={t("settings.updates.hourly.aria")}
        />
      </div>

      <div class="settings-row">
        <div class="settings-row-label">
          <Show
            when={updates()!.stage() === "available"}
            fallback={
              <Show
                when={updates()!.manualCheck()?.kind === "uptodate"}
                fallback={<div class="row-label">{t("settings.updates.status")}</div>}
              >
                <div class="row-label">{t("settings.updates.upToDate")}</div>
              </Show>
            }
          >
            <div class="row-label">
              {t("settings.updates.available", { version: updates()!.available()?.version ?? "" })}
            </div>
          </Show>
          <Show when={updates()!.stage() === "downloading"}>
            <div class="row-help">
              {t("settings.updates.downloading", { progress: updates()!.progress() })}
            </div>
          </Show>
          <Show when={updates()!.stage() === "ready"}>
            <div class="row-help">{t("settings.updates.ready")}</div>
          </Show>
          <Show when={updates()!.manualCheck()?.kind === "error"}>
            <div class="row-help" style="color:var(--status-err);">
              {t("settings.updates.checkError")}
            </div>
          </Show>
        </div>
        <div class="settings-update-actions">
          <Show when={updates()!.stage() === "available"}>
            <button class="btn btn-primary btn--sm"
              onClick={() => void onDownloadInstall()}>
              {t("settings.updates.action.download")}
            </button>
            <button class="link-like" onClick={openLatestRelease}>
              {t("settings.updates.action.onGithub")}
            </button>
          </Show>
          <Show when={updates()!.stage() === "ready"}>
            <button class="btn btn-primary btn--sm"
              onClick={() => void onRestart()}>
              {t("settings.updates.action.restart")}
            </button>
          </Show>
          <Show when={updates()!.stage() === "error"}>
            <button class="btn btn--sm" onClick={() => void onDownloadInstall()}>
              {t("settings.updates.action.retry")}
            </button>
          </Show>
          <button
            class="btn btn--sm"
            onClick={onCheckUpdate}
            disabled={
              isChecking() ||
              updates()!.stage() === "downloading" ||
              updates()!.stage() === "ready"
            }
          >
            {isChecking() ? t("settings.updates.action.checking") : t("settings.updates.action.check")}
          </button>
        </div>
      </div>
    </>
  );
}
