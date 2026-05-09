import { Show, createSignal, onMount } from "solid-js";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getVersion } from "@tauri-apps/api/app";
import { Modal } from "~/components/Common/Modal";
import { settingsStore, type Theme } from "~/stores/settings";
import { updatesStore } from "~/stores/updates";
import "./SettingsDialog.css";

const REPO_URL = "https://github.com/AgentZ-Media/ScriptZ";

export interface SettingsDialogProps {
  open: boolean;
  onClose(): void;
}

export function SettingsDialog(props: SettingsDialogProps) {
  const [appVersion, setAppVersion] = createSignal("0.1.0");

  onMount(async () => {
    try {
      setAppVersion(await getVersion());
    } catch {
      /* dev mode without Tauri */
    }
  });

  const onCheckUpdate = async () => {
    await updatesStore.checkNow();
  };

  const onDownloadInstall = async () => {
    await updatesStore.downloadAndInstall();
  };

  const onRestart = async () => {
    await updatesStore.restart();
  };

  const isChecking = () => updatesStore.manualCheck()?.kind === "checking";

  const openRepo = async () => {
    try { await openUrl(REPO_URL); } catch {}
  };
  const openLatestRelease = async () => {
    try { await openUrl(`${REPO_URL}/releases/latest`); } catch {}
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
          <Toggle
            label="Quick-Modus automatisch aktivieren bei genau 2 Charakteren"
            checked={settingsStore.quickModeAutoEnable()}
            onChange={(v) => void settingsStore.setQuickModeAutoEnable(v)}
          />
          <p class="muted small">
            Greift pro Skript nur, solange du den Toggle nicht selbst
            angefasst hast. Sobald du Quick-Modus in einem Skript einmal
            händisch ein- oder ausschaltest, bleibt diese Wahl in dem
            Skript bestehen — auch wenn die Charakterzahl später wieder
            zwischen 2 und 3+ wechselt.
          </p>
        </section>

        <section class="settings-section">
          <h3>Drucken</h3>
          <p class="muted small">
            Standardmäßig druckt ScriptZ ohne Titelblatt und ohne Highlighting.
            Hier kannst du das pro Druckvorgang erzwingen.
          </p>
          <Toggle
            label="Titelblatt mitdrucken"
            checked={settingsStore.printTitlePage()}
            onChange={(v) => void settingsStore.setPrintTitlePage(v)}
          />
          <Toggle
            label="Charakter-Highlighting mitdrucken"
            checked={settingsStore.printHighlighting()}
            onChange={(v) => void settingsStore.setPrintHighlighting(v)}
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
              disabled={
                isChecking() ||
                updatesStore.stage() === "downloading" ||
                updatesStore.stage() === "ready"
              }
            >
              {isChecking() ? "Prüfe…" : "Jetzt prüfen"}
            </button>

            <Show when={updatesStore.stage() === "available"}>
              <span class="settings-update-result">
                <span>
                  Update verfügbar: v{updatesStore.available()?.version}
                </span>
                <button class="btn btn-primary" onClick={() => void onDownloadInstall()}>
                  Herunterladen & installieren
                </button>
                <button class="link-like" onClick={openLatestRelease}>
                  Auf GitHub anzeigen
                </button>
              </span>
            </Show>

            <Show when={updatesStore.stage() === "downloading"}>
              <span class="settings-update-result">
                <span>Lade Update… {updatesStore.progress()}%</span>
              </span>
            </Show>

            <Show when={updatesStore.stage() === "ready"}>
              <span class="settings-update-result">
                <span>Update bereit.</span>
                <button class="btn btn-primary" onClick={() => void onRestart()}>
                  Jetzt neu starten
                </button>
              </span>
            </Show>

            <Show when={updatesStore.stage() === "error"}>
              <span class="settings-update-result">
                <span style="color:var(--status-err);">
                  Download fehlgeschlagen
                </span>
                <button class="btn" onClick={() => void onDownloadInstall()}>
                  Erneut versuchen
                </button>
              </span>
            </Show>

            <Show when={updatesStore.manualCheck()?.kind === "uptodate"}>
              <span class="settings-update-result">
                <span class="muted">Du hast die neueste Version</span>
              </span>
            </Show>

            <Show when={updatesStore.manualCheck()?.kind === "error"}>
              <span class="settings-update-result">
                <span style="color:var(--status-err);">Fehler beim Prüfen</span>
              </span>
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
            <div class="muted">
              Entwickelt von{" "}
              <button
                class="link-like"
                onClick={() => void openUrl("https://linktr.ee/deragentz").catch(() => {})}
              >
                AgentZ
              </button>
            </div>
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
