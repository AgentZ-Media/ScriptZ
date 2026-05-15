import { Show, createSignal, onMount } from "solid-js";
import { getPlatformAdapter } from "../../../lib/platform";
import { t } from "../../../i18n";

const openUrl = (url: string) => getPlatformAdapter().openUrl(url);
const getVersion = () => getPlatformAdapter().getVersion();

const REPO_URL = "https://github.com/AgentZ-Media/ScriptZ";

export interface SettingsAboutProps {
  onStartOnboarding?(): void;
}

export function SettingsAbout(props: SettingsAboutProps) {
  const [appVersion, setAppVersion] = createSignal("0.6.0");

  onMount(async () => {
    try {
      setAppVersion(await getVersion());
    } catch {
      /* dev mode without Tauri */
    }
  });

  const openRepo = async () => {
    try { await openUrl(REPO_URL); } catch {}
  };

  return (
    <>
      <h3>{t("settings.section.about")}</h3>
      <div class="settings-pane-sub">{t("settings.about.sub")}</div>
      <div class="settings-row">
        <div class="settings-row-label">
          <div class="row-label">{t("settings.about.version", { version: appVersion() })}</div>
          <div class="row-help">{t("settings.about.license")}</div>
        </div>
      </div>
      <div class="settings-row">
        <div class="settings-row-label">
          <div class="row-label">{t("settings.about.developer")}</div>
        </div>
        <button
          class="link-like"
          onClick={() => void openUrl("https://linktr.ee/deragentz").catch(() => {})}
        >
          AgentZ
        </button>
      </div>
      <div class="settings-row">
        <div class="settings-row-label">
          <div class="row-label">{t("settings.about.repository")}</div>
        </div>
        <button class="link-like settings-mono" onClick={openRepo}>
          github.com/AgentZ-Media/ScriptZ
        </button>
      </div>
      <Show when={props.onStartOnboarding}>
        <div class="settings-row">
          <div class="settings-row-label">
            <div class="row-label">{t("settings.about.onboarding.label")}</div>
            <div class="row-help">{t("settings.about.onboarding.help")}</div>
          </div>
          <button
            class="btn btn--sm"
            onClick={() => props.onStartOnboarding?.()}
          >
            {t("settings.about.onboarding.button")}
          </button>
        </div>
      </Show>
    </>
  );
}
