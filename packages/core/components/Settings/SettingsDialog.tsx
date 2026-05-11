import { Show, createSignal, createMemo, createEffect, onMount, For, type Component } from "solid-js";
import { Modal } from "../Common/Modal";
import { settingsStore, type Theme } from "../../stores/settings";
import { api } from "../../lib/api";
import { scriptsBus } from "../../lib/scriptsBus";
import { pushToast } from "../../stores/toasts";
import { getPlatformAdapter } from "../../lib/platform";
import { getUpdatesStore } from "../../lib/updates";
import { K } from "../../lib/keys";
import { ColorPickerPopover } from "../Editor/ColorPickerPopover";
import type { CharacterColorRecord } from "../../lib/types";
import "./SettingsDialog.css";

const openUrl = (url: string) => getPlatformAdapter().openUrl(url);
const getVersion = () => getPlatformAdapter().getVersion();
const updates = () => getUpdatesStore();

const REPO_URL = "https://github.com/AgentZ-Media/ScriptZ";

type SectionId = "appearance" | "editor" | "characters" | "shortcuts" | "updates" | "about";

interface SectionDef {
  id: SectionId;
  label: string;
  Icon: Component;
}

const ALL_SECTIONS: SectionDef[] = [
  { id: "appearance", label: "Erscheinungsbild", Icon: TypeIcon },
  { id: "editor",     label: "Editor",           Icon: EditIcon },
  { id: "characters", label: "Charaktere",       Icon: PaletteIcon },
  { id: "shortcuts",  label: "Tastatur",         Icon: KbdIcon },
  { id: "updates",    label: "Updates",          Icon: ShieldIcon },
  { id: "about",      label: "Über",             Icon: InfoIcon },
];

interface ShortcutGroup {
  title: string;
  items: Array<{ keys: string; desc: string }>;
}

// Shortcut-Anzeige plattform-aware: K() rendert "⌘N" auf macOS und
// "Ctrl+N" auf Windows/Linux. Eager evaluation am Modul-Load reicht,
// weil die Platform sich zur Laufzeit nicht aendert.
const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Allgemein",
    items: [
      { keys: K("Mod+N"), desc: "Neues Skript anlegen" },
      { keys: K("Mod+T"), desc: "Zur Übersicht" },
      { keys: K("Mod+W"), desc: "Aktiven Tab schließen" },
      { keys: K("Mod+K"), desc: "Skript-Suche öffnen" },
      { keys: K("Mod+F"), desc: "Suchfeld in der Übersicht fokussieren" },
      { keys: K("Mod+,"), desc: "Einstellungen öffnen" },
      { keys: K("Mod+I"), desc: "Idee schnell erfassen" },
      { keys: `${K("Mod+0")}-${K("Mod+9")}`, desc: "Tab per Index aktivieren (0 = Übersicht)" },
      { keys: `${K("Mod+Alt+ArrowLeft")} / ${K("Mod+Alt+ArrowRight")}`, desc: "Zwischen Tabs wechseln" },
    ],
  },
  {
    title: "Editor",
    items: [
      { keys: "Tab", desc: "Block-Typ-Picker öffnen" },
      { keys: K("Mod+1"), desc: "Block-Typ → Action" },
      { keys: K("Mod+2"), desc: "Block-Typ → Charakter" },
      { keys: K("Mod+3"), desc: "Block-Typ → Dialog" },
      { keys: K("Mod+4"), desc: "Block-Typ → Parenthetical" },
      { keys: K("Mod+5"), desc: "Block-Typ → Kamera" },
      { keys: K("Mod+6"), desc: "Block-Typ → Caption" },
      { keys: K("Mod+7"), desc: "Block-Typ → SFX" },
      { keys: K("Enter"), desc: "Smart-Enter: nächster passender Block" },
      { keys: `${K("Mod+B")} / ${K("Mod+I")} / ${K("Mod+U")}`, desc: "Fett / Kursiv / Unterstrichen" },
      { keys: K("Mod+E"), desc: "Skript exportieren" },
      { keys: K("Mod+Shift+F"), desc: "Fokus-Modus an/aus" },
      { keys: K("Mod+Shift+S"), desc: "Manuellen Snapshot anlegen" },
      { keys: K("Mod+Shift+H"), desc: "Snapshot-Verlauf öffnen" },
    ],
  },
];

export interface SettingsDialogProps {
  open: boolean;
  onClose(): void;
  onStartOnboarding?(): void;
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

  // App-weite Charakter-Farb-Overrides. Wir filtern auf Einträge mit
  // gesetztem `override_color` — nur die zählen als "eigene Farbe".
  // Die Liste steuert sowohl die Sichtbarkeit des Charaktere-Tabs als
  // auch den Inhalt des Panes.
  const [overrides, setOverrides] = createSignal<CharacterColorRecord[]>([]);
  const reloadOverrides = async () => {
    try {
      const all = await api.listCharacterColors();
      setOverrides(all.filter((r) => r.override_color !== null));
    } catch {
      setOverrides([]);
    }
  };

  // Popover-State für die Farbänderung in der Liste.
  const [pickerOpen, setPickerOpen] = createSignal(false);
  const [pickerName, setPickerName] = createSignal("");
  const [pickerColor, setPickerColor] = createSignal("#000000");
  const [pickerPos, setPickerPos] = createSignal({ x: 0, y: 0 });

  onMount(async () => {
    try {
      setAppVersion(await getVersion());
    } catch {
      /* dev-mode ohne Tauri */
    }
  });

  // Bei jedem Öffnen des Dialogs frische Liste laden.
  createEffect(() => {
    if (props.open) void reloadOverrides();
  });

  const sections = createMemo<SectionDef[]>(() => {
    let list = ALL_SECTIONS;
    if (overrides().length === 0) list = list.filter((s) => s.id !== "characters");
    // Host platform doesn't provide an auto-updater (e.g. web build):
    // hide the section so users don't see a dead "Updates" tab.
    if (!updates()) list = list.filter((s) => s.id !== "updates");
    return list;
  });

  // Falls die aktive Sektion nicht mehr existiert (letzter Override
  // gerade entfernt), zurück zu Erscheinungsbild fallen.
  createEffect(() => {
    if (!sections().some((s) => s.id === section())) {
      setSection("appearance");
    }
  });

  const openPickerFor = (rec: CharacterColorRecord, ev: MouseEvent) => {
    const target = ev.currentTarget as HTMLElement;
    const r = target.getBoundingClientRect();
    setPickerName(rec.name);
    setPickerColor(rec.override_color ?? "#000000");
    setPickerPos({ x: r.right + 8, y: r.top });
    setPickerOpen(true);
  };

  const onPickColor = async (color: string) => {
    const name = pickerName();
    setPickerOpen(false);
    if (!name) return;
    try {
      await api.setCharacterColor(name, color);
      scriptsBus.bump();
      await reloadOverrides();
    } catch (err) {
      pushToast(`Farbe speichern fehlgeschlagen: ${(err as Error).message ?? err}`, "error");
    }
  };

  const onResetColor = async (name: string) => {
    setPickerOpen(false);
    if (!name) return;
    try {
      await api.clearCharacterColor(name);
      scriptsBus.bump();
      await reloadOverrides();
    } catch (err) {
      pushToast(`Reset fehlgeschlagen: ${(err as Error).message ?? err}`, "error");
    }
  };

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
          <For each={sections()}>
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

            <div class="settings-row">
              <div class="settings-row-label">
                <div class="row-label">Dunkles Skript-Sheet</div>
                <div class="row-help">
                  Im Dark-Modus auch das Skript-Sheet dunkel statt hell.
                  Standardmäßig bleibt das Sheet hell, weil das den
                  Druck-Look spiegelt. Greift nur, wenn das Theme
                  tatsächlich dunkel ist - im Auto-Modus also nur,
                  wenn dein System gerade dunkel ist.
                </div>
              </div>
              <Toggle
                checked={settingsStore.darkPaper()}
                onChange={(v) => void settingsStore.setDarkPaper(v)}
                disabled={settingsStore.resolvedTheme() !== "dark"}
                label="Dunkles Skript-Sheet im Dark-Mode"
              />
            </div>

            <div class="settings-row">
              <div class="settings-row-label">
                <div class="row-label">Fokus-Modus standardmäßig aktiv</div>
                <div class="row-help">
                  Beim Öffnen eines Skripts sind Toolbar und Cast-Leiste
                  ausgeblendet. {K("Mod+Shift+F")} holt sie zurück.
                </div>
              </div>
              <Toggle
                checked={settingsStore.focusModeDefault()}
                onChange={(v) => void settingsStore.setFocusModeDefault(v)}
                label="Fokus-Modus standardmäßig"
              />
            </div>

            <div class="settings-row">
              <div class="settings-row-label">
                <div class="row-label">Zähler am Ideen-Tab</div>
                <div class="row-help">
                  Zeigt die Anzahl offener Ideen als kleines Badge oben am
                  Glühbirnen-Tab. Bei sehr großen Idee-Sammlungen kannst
                  du den Zähler hier abschalten.
                </div>
              </div>
              <Toggle
                checked={settingsStore.showIdeasBadge()}
                onChange={(v) => void settingsStore.setShowIdeasBadge(v)}
                label="Ideen-Zähler im Tab anzeigen"
              />
            </div>
          </Show>

          <Show when={section() === "editor"}>
            <h3>Editor</h3>
            <div class="settings-pane-sub">Verhalten beim Schreiben.</div>

            <div class="settings-row">
              <div class="settings-row-label">
                <div class="row-label">Wochenziel</div>
                <div class="row-help">
                  Anzahl Wörter pro Woche (seit Montag). Wird in der
                  Statusleiste oben und auf der Startseite angezeigt.
                  1500 entspricht etwa 7 Skripten à 200 Wörter.
                </div>
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

          <Show when={section() === "characters"}>
            <h3>Charaktere</h3>
            <div class="settings-pane-sub">
              Charaktere mit eigener Farbe. Klick auf den Punkt ändert die
              Farbe, „Zurücksetzen" löscht die App-weite Vorgabe.
            </div>
            <For each={overrides()}>
              {(rec) => (
                <div class="settings-row settings-character-row">
                  <button
                    type="button"
                    class="settings-character-swatch scriptz-color-picker-trigger"
                    style={{ background: rec.override_color ?? "#000" }}
                    aria-label={`Farbe von ${rec.name} ändern`}
                    title={`Farbe von ${rec.name} ändern`}
                    onClick={(ev) => openPickerFor(rec, ev)}
                  />
                  <div class="settings-character-name">{rec.name}</div>
                  <button
                    type="button"
                    class="btn btn--sm"
                    onClick={() => void onResetColor(rec.name)}
                  >
                    Zurücksetzen
                  </button>
                </div>
              )}
            </For>
          </Show>

          <Show when={section() === "shortcuts"}>
            <h3>Tastatur</h3>
            <div class="settings-pane-sub">
              Alle Hotkeys auf einen Blick. Anpassen kommt in einer
              späteren Version.
            </div>
            <For each={SHORTCUT_GROUPS}>
              {(group) => (
                <div class="settings-shortcuts-group">
                  <div class="settings-shortcuts-title">{group.title}</div>
                  <ul class="settings-shortcuts-list">
                    <For each={group.items}>
                      {(it) => (
                        <li class="settings-shortcut-row">
                          <span class="settings-shortcut-keys">
                            <span class="kbd kbd-inline">{it.keys}</span>
                          </span>
                          <span class="settings-shortcut-desc">{it.desc}</span>
                        </li>
                      )}
                    </For>
                  </ul>
                </div>
              )}
            </For>
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
                  when={updates()!.stage() === "available"}
                  fallback={
                    <Show
                      when={updates()!.manualCheck()?.kind === "uptodate"}
                      fallback={<div class="row-label">Update-Status</div>}
                    >
                      <div class="row-label">Du hast die neueste Version</div>
                    </Show>
                  }
                >
                  <div class="row-label">
                    Update verfügbar: v{updates()!.available()?.version}
                  </div>
                </Show>
                <Show when={updates()!.stage() === "downloading"}>
                  <div class="row-help">
                    Lade Update… {updates()!.progress()}%
                  </div>
                </Show>
                <Show when={updates()!.stage() === "ready"}>
                  <div class="row-help">Update bereit zum Neustart.</div>
                </Show>
                <Show when={updates()!.manualCheck()?.kind === "error"}>
                  <div class="row-help" style="color:var(--status-err);">
                    Fehler beim Prüfen
                  </div>
                </Show>
              </div>
              <div class="settings-update-actions">
                <Show when={updates()!.stage() === "available"}>
                  <button class="btn btn-primary btn--sm"
                    onClick={() => void onDownloadInstall()}>
                    Herunterladen
                  </button>
                  <button class="link-like" onClick={openLatestRelease}>
                    Auf GitHub
                  </button>
                </Show>
                <Show when={updates()!.stage() === "ready"}>
                  <button class="btn btn-primary btn--sm"
                    onClick={() => void onRestart()}>
                    Neu starten
                  </button>
                </Show>
                <Show when={updates()!.stage() === "error"}>
                  <button class="btn btn--sm" onClick={() => void onDownloadInstall()}>
                    Erneut versuchen
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
            <Show when={props.onStartOnboarding}>
              <div class="settings-row">
                <div class="settings-row-label">
                  <div class="row-label">Onboarding</div>
                  <div class="row-help">
                    Die Kurz-Tour zur App nochmal anzeigen.
                  </div>
                </div>
                <button
                  class="btn btn--sm"
                  onClick={() => props.onStartOnboarding?.()}
                >
                  Nochmal anzeigen
                </button>
              </div>
            </Show>
          </Show>
        </div>
      </div>
      <ColorPickerPopover
        open={pickerOpen()}
        x={pickerPos().x}
        y={pickerPos().y}
        characterName={pickerName()}
        currentColor={pickerColor()}
        onPick={(c) => void onPickColor(c)}
        onReset={() => void onResetColor(pickerName())}
        onClose={() => setPickerOpen(false)}
      />
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
function KbdIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
    </svg>
  );
}
function PaletteIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="13.5" cy="6.5" r=".75" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".75" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".75" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".75" fill="currentColor" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6 0-4.97-4.48-9-10-9z" />
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
