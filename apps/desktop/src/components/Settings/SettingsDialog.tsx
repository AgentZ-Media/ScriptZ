import { Show, createSignal, onMount, For, type Component } from "solid-js";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getVersion } from "@tauri-apps/api/app";
import { Modal } from "~/components/Common/Modal";
import { settingsStore, type Theme } from "~/stores/settings";
import { updatesStore } from "~/stores/updates";
import "./SettingsDialog.css";

const REPO_URL = "https://github.com/AgentZ-Media/ScriptZ";

type SectionId = "appearance" | "editor" | "updates" | "about";

interface SectionDef {
  id: SectionId;
  label: string;
  Icon: Component;
}

const SECTIONS: SectionDef[] = [
  { id: "appearance", label: "Erscheinungsbild", Icon: TypeIcon },
  { id: "editor",     label: "Editor",           Icon: EditIcon },
  { id: "updates",    label: "Updates",          Icon: ShieldIcon },
  { id: "about",      label: "Über",             Icon: InfoIcon },
];

export interface SettingsDialogProps {
  open: boolean;
  onClose(): void;
}

/**
 * 2-spaltiges Settings-Modal nach Re-Design (`modals.jsx::SettingsModal`):
 * linke Nav (180 px) + rechtes Pane mit `settings-row`-Pattern.
 * Sektionen: Erscheinungsbild · Editor · Updates · Über.
 *
 * Die "Drucken"-Sektion aus dem Design-Mock fehlt bewusst — das Print-
 * Feature ist im Repo entfernt (Commit a3b016c, 2026-05). Tags-Section
 * und KI-Sektion gibt es im Design ebenfalls nicht (bewusste Auslassungen).
 */
export function SettingsDialog(props: SettingsDialogProps) {
  const [section, setSection] = createSignal<SectionId>("appearance");
  const [appVersion, setAppVersion] = createSignal("0.6.0");

  onMount(async () => {
    try {
      setAppVersion(await getVersion());
    } catch {
      /* dev-mode ohne Tauri */
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
      maxWidth={760}
    >
      <div class="settings-grid">
        <nav class="settings-nav" aria-label="Abschnitte">
          <For each={SECTIONS}>
            {(s) => (
              <button
                type="button"
                class="settings-nav-btn"
                classList={{ "is-active": section() === s.id }}
                onClick={() => setSection(s.id)}
              >
                <span class="settings-nav-ic"><s.Icon /></span>
                <span>{s.label}</span>
              </button>
            )}
          </For>
        </nav>

        <div class="settings-pane">
          <Show when={section() === "appearance"}>
            <h3>Erscheinungsbild</h3>
            <div class="settings-pane-sub">Theme der App.</div>
            <div class="settings-row">
              <div class="settings-row-label">
                <div class="row-label">Theme</div>
                <div class="row-help">Hell, Dunkel oder dem System folgen.</div>
              </div>
              <div class="seg" role="group" aria-label="Theme">
                {(["light", "dark", "auto"] as Theme[]).map((value) => (
                  <button
                    type="button"
                    classList={{ "is-on": settingsStore.theme() === value }}
                    onClick={() => void settingsStore.setTheme(value)}
                  >
                    {value === "light" ? "Light" : value === "dark" ? "Dark" : "Auto"}
                  </button>
                ))}
              </div>
            </div>
          </Show>

          <Show when={section() === "editor"}>
            <h3>Editor</h3>
            <div class="settings-pane-sub">Verhalten beim Schreiben.</div>

            <div class="settings-row">
              <div class="settings-row-label">
                <div class="row-label">Tagesziel</div>
                <div class="row-help">
                  Anzahl Wörter pro Tag. Wird in der Statusleiste oben und
                  auf der Startseite angezeigt.
                </div>
              </div>
              <div class="settings-goal-input">
                <input
                  type="number"
                  min={settingsStore.DAILY_WORD_GOAL_MIN}
                  max={settingsStore.DAILY_WORD_GOAL_MAX}
                  step={50}
                  value={settingsStore.dailyWordGoal()}
                  onChange={(e) => {
                    const n = Number(e.currentTarget.value);
                    if (Number.isFinite(n)) void settingsStore.setDailyWordGoal(n);
                  }}
                />
                <span class="settings-goal-unit">Wörter</span>
              </div>
            </div>

            <div class="settings-row">
              <div class="settings-row-label">
                <div class="row-label">Sprech-Tempo</div>
                <div class="row-help">
                  Wörter pro Minute für die Spielzeit-Schätzung in der
                  Cast-Leiste. Default 210 ist auf TikTok-/Sketch-Tempo
                  kalibriert; klassisches Drehbuch liegt bei ~150,
                  schnelles Reden bei ~250.
                </div>
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
                <span class="settings-goal-unit">WPM</span>
              </div>
            </div>

            <div class="settings-row">
              <div class="settings-row-label">
                <div class="row-label">Charakter-Highlighting standardmäßig aktiviert</div>
              </div>
              <Toggle
                checked={settingsStore.highlightingDefault()}
                onChange={(v) => void settingsStore.setHighlightingDefault(v)}
                label="Charakter-Highlighting standardmäßig"
              />
            </div>

            <div class="settings-row">
              <div class="settings-row-label">
                <div class="row-label">Quick-Modus automatisch aktivieren bei genau 2 Charakteren</div>
                <div class="row-help">
                  Greift pro Skript nur, solange du den Toggle nicht selbst
                  angefasst hast. Sobald du Quick-Modus in einem Skript
                  manuell ein- oder ausschaltest, bleibt diese Wahl in dem
                  Skript bestehen.
                </div>
              </div>
              <Toggle
                checked={settingsStore.quickModeAutoEnable()}
                onChange={(v) => void settingsStore.setQuickModeAutoEnable(v)}
                label="Quick-Modus auto"
              />
            </div>
          </Show>

          <Show when={section() === "updates"}>
            <h3>Updates</h3>
            <div class="settings-pane-sub">Bezogen über GitHub Releases. Keine Telemetrie.</div>

            <div class="settings-row">
              <div class="settings-row-label">
                <div class="row-label">Auf Updates prüfen</div>
              </div>
              <Toggle
                checked={settingsStore.updateCheckEnabled()}
                onChange={(v) => void settingsStore.setUpdateCheckEnabled(v)}
                label="Auf Updates prüfen"
              />
            </div>

            <div class="settings-row">
              <div class="settings-row-label">
                <div class="row-label">Stündlich automatisch prüfen</div>
              </div>
              <Toggle
                checked={settingsStore.hourlyUpdateCheck()}
                disabled={!settingsStore.updateCheckEnabled()}
                onChange={(v) => void settingsStore.setHourlyUpdateCheck(v)}
                label="Stündlich prüfen"
              />
            </div>

            <div class="settings-row">
              <div class="settings-row-label">
                <Show
                  when={updatesStore.stage() === "available"}
                  fallback={
                    <Show
                      when={updatesStore.manualCheck()?.kind === "uptodate"}
                      fallback={<div class="row-label">Update-Status</div>}
                    >
                      <div class="row-label">Du hast die neueste Version</div>
                    </Show>
                  }
                >
                  <div class="row-label">
                    Update verfügbar: v{updatesStore.available()?.version}
                  </div>
                </Show>
                <Show when={updatesStore.stage() === "downloading"}>
                  <div class="row-help">
                    Lade Update… {updatesStore.progress()}%
                  </div>
                </Show>
                <Show when={updatesStore.stage() === "ready"}>
                  <div class="row-help">Update bereit zum Neustart.</div>
                </Show>
                <Show when={updatesStore.manualCheck()?.kind === "error"}>
                  <div class="row-help" style="color:var(--status-err);">
                    Fehler beim Prüfen
                  </div>
                </Show>
              </div>
              <div class="settings-update-actions">
                <Show when={updatesStore.stage() === "available"}>
                  <button class="btn btn-primary btn--sm"
                    onClick={() => void onDownloadInstall()}>
                    Herunterladen
                  </button>
                  <button class="link-like" onClick={openLatestRelease}>
                    Auf GitHub
                  </button>
                </Show>
                <Show when={updatesStore.stage() === "ready"}>
                  <button class="btn btn-primary btn--sm"
                    onClick={() => void onRestart()}>
                    Neu starten
                  </button>
                </Show>
                <Show when={updatesStore.stage() === "error"}>
                  <button class="btn btn--sm" onClick={() => void onDownloadInstall()}>
                    Erneut versuchen
                  </button>
                </Show>
                <button
                  class="btn btn--sm"
                  onClick={onCheckUpdate}
                  disabled={
                    isChecking() ||
                    updatesStore.stage() === "downloading" ||
                    updatesStore.stage() === "ready"
                  }
                >
                  {isChecking() ? "Prüfe…" : "Jetzt prüfen"}
                </button>
              </div>
            </div>
          </Show>

          <Show when={section() === "about"}>
            <h3>Über</h3>
            <div class="settings-pane-sub">Schnell. Lokal. Mac-first.</div>
            <div class="settings-row">
              <div class="settings-row-label">
                <div class="row-label">ScriptZ · v{appVersion()}</div>
                <div class="row-help">Lizenz: MIT</div>
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row-label">
                <div class="row-label">Entwickelt von</div>
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
                <div class="row-label">Repository</div>
              </div>
              <button class="link-like settings-mono" onClick={openRepo}>
                github.com/AgentZ-Media/ScriptZ
              </button>
            </div>
          </Show>
        </div>
      </div>
    </Modal>
  );
}

/* ---- Custom Toggle (Pill mit Knubbel) ---- */
function Toggle(props: {
  checked: boolean;
  disabled?: boolean;
  onChange(v: boolean): void;
  label?: string;
}) {
  return (
    <button
      type="button"
      class="s-toggle"
      classList={{
        "is-on": props.checked,
        "is-disabled": !!props.disabled,
      }}
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      disabled={props.disabled}
      onClick={() => !props.disabled && props.onChange(!props.checked)}
    />
  );
}

/* ---- Icons ---- */
function TypeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  );
}
function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}
function InfoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}
