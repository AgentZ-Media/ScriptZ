import { Show, createSignal, onMount } from "solid-js";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getVersion } from "@tauri-apps/api/app";
import { check } from "@tauri-apps/plugin-updater";
import { Modal } from "~/components/Common/Modal";
import { settingsStore, type Theme } from "~/stores/settings";
import "./SettingsDialog.css";

const REPO_URL = "https://github.com/ibimspumo/ScriptZ";

type CheckResult =
  | { kind: "uptodate" }
  | { kind: "available"; version: string }
  | { kind: "error" };

export interface SettingsDialogProps {
  open: boolean;
  onClose(): void;
}

export function SettingsDialog(props: SettingsDialogProps) {
  const [appVersion, setAppVersion] = createSignal("0.1.0");
  const [updateChecking, setUpdateChecking] = createSignal(false);
  const [updateResult, setUpdateResult] = createSignal<CheckResult | null>(null);

  onMount(async () => {
    try {
      setAppVersion(await getVersion());
    } catch {
      /* dev mode without Tauri */
    }
  });

  const onCheckUpdate = async () => {
    setUpdateChecking(true);
    setUpdateResult(null);
    try {
      const update = await check();
      setUpdateResult(update ? { kind: "available", version: update.version } : { kind: "uptodate" });
    } catch {
      setUpdateResult({ kind: "error" });
    } finally {
      setUpdateChecking(false);
    }
  };

  const openRepo = async () => {
    try {
      await openUrl(REPO_URL);
    } catch {}
  };
  const openLatestRelease = async () => {
    try {
      await openUrl(`${REPO_URL}/releases/latest`);
    } catch {}
  };

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title="Einstellungen"
      footer={
        <button class="btn" onClick={() => props.onClose()}>
          Schließen
        </button>
      }
    >
      <div class="settings-sections">
        <section class="settings-section">
          <h3>Erscheinungsbild</h3>
          <div class="field">
            <label>Theme</label>
            <div class="settings-radio-row">
              {(["dark", "light", "auto"] as Theme[]).map((value) => (
                <label class="settings-radio">
                  <input
                    type="radio"
                    name="theme"
                    value={value}
                    checked={settingsStore.theme() === value}
                    onChange={() => void settingsStore.setTheme(value)}
                  />
                  <span>
                    {value === "dark" ? "Dark" : value === "light" ? "Light" : "Auto"}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </section>

        <section class="settings-section">
          <h3>Editor</h3>
          <Toggle
            label="Charakter-Highlighting standardmäßig aktiviert"
            checked={settingsStore.highlightingDefault()}
            onChange={(v) => void settingsStore.setHighlightingDefault(v)}
          />
        </section>

        <section class="settings-section">
          <h3>Updates</h3>
          <Toggle
            label="Auf Updates prüfen"
            checked={settingsStore.updateCheckEnabled()}
            onChange={(v) => void settingsStore.setUpdateCheckEnabled(v)}
          />
          <Toggle
            label="Stündlich automatisch prüfen"
            checked={settingsStore.hourlyUpdateCheck()}
            disabled={!settingsStore.updateCheckEnabled()}
            onChange={(v) => void settingsStore.setHourlyUpdateCheck(v)}
          />
          <div class="settings-update-row">
            <button
              class="btn"
              onClick={onCheckUpdate}
              disabled={updateChecking()}
            >
              {updateChecking() ? "Prüfe…" : "Jetzt prüfen"}
            </button>
            <Show when={updateResult()}>
              {(res) => (
                <span class="settings-update-result">
                  <Show
                    when={res().kind !== "error"}
                    fallback={<span style="color:var(--status-err);">Fehler beim Prüfen</span>}
                  >
                    <Show
                      when={res().kind === "available"}
                      fallback={<span class="muted">Du hast die neueste Version</span>}
                    >
                      <>
                        <span>
                          Update verfügbar: v
                          {(res() as { kind: "available"; version: string }).version}
                        </span>
                        <button class="link-like" onClick={openLatestRelease}>
                          Auf GitHub anzeigen
                        </button>
                      </>
                    </Show>
                  </Show>
                </span>
              )}
            </Show>
          </div>
        </section>

        <section class="settings-section">
          <h3>Über</h3>
          <div class="settings-about">
            <div>
              <strong>ScriptZ</strong>
              <span class="muted"> · v{appVersion()}</span>
            </div>
            <div class="muted">Lizenz: MIT</div>
            <div>
              <button class="link-like" onClick={openRepo}>
                {REPO_URL}
              </button>
            </div>
          </div>
        </section>
      </div>
    </Modal>
  );
}

function Toggle(props: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange(v: boolean): void;
}) {
  return (
    <label class={`settings-toggle${props.disabled ? " is-disabled" : ""}`}>
      <input
        type="checkbox"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.currentTarget.checked)}
      />
      <span>{props.label}</span>
    </label>
  );
}
