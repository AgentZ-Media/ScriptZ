import { Show, createSignal } from "solid-js";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Modal } from "~/components/Common/Modal";
import { settingsStore, type Theme } from "~/stores/settings";
import { api } from "~/lib/api";
import type { UpdateInfo } from "~/lib/types";
import "./SettingsDialog.css";

const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "0.1.0";
const REPO_URL = "https://github.com/agent-z-de/scriptz";

export interface SettingsDialogProps {
  open: boolean;
  onClose(): void;
}

export function SettingsDialog(props: SettingsDialogProps) {
  const [updateChecking, setUpdateChecking] = createSignal(false);
  const [updateResult, setUpdateResult] = createSignal<UpdateInfo | null>(null);

  const onCheckUpdate = async () => {
    setUpdateChecking(true);
    setUpdateResult(null);
    try {
      const r = await api.checkForUpdate(APP_VERSION);
      setUpdateResult(r);
    } catch (e) {
      setUpdateResult({
        available: false,
        current: APP_VERSION,
        latest: null,
        url: null,
        published_at: null,
        error: String(e),
      });
    } finally {
      setUpdateChecking(false);
    }
  };

  const openRepo = async () => {
    try {
      await openUrl(REPO_URL);
    } catch {}
  };
  const openUpdateUrl = async () => {
    const url = updateResult()?.url;
    if (url) {
      try {
        await openUrl(url);
      } catch {}
    }
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
                    when={!res().error}
                    fallback={<span style="color:var(--status-err);">Fehler beim Prüfen</span>}
                  >
                    <Show
                      when={res().available && res().latest}
                      fallback={<span class="muted">Du hast die neueste Version</span>}
                    >
                      <>
                        <span>Update verfügbar: v{res().latest}</span>
                        <button class="btn-ghost link-like" onClick={openUpdateUrl}>
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
              <span class="muted"> · v{APP_VERSION}</span>
            </div>
            <div class="muted">Lizenz: MIT</div>
            <div>
              <button class="btn-ghost link-like" onClick={openRepo}>
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
