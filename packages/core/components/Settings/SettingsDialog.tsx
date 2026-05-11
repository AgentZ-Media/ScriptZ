import { Show, createSignal, createMemo, createEffect, onMount, For, type Component } from "solid-js";
import { Modal } from "../Common/Modal";
import { settingsStore, type Theme } from "../../stores/settings";
import { api } from "../../lib/api";
import { scriptsBus } from "../../lib/scriptsBus";
import { pushToast } from "../../stores/toasts";
import { getPlatformAdapter } from "../../lib/platform";
import { getUpdatesStore } from "../../lib/updates";
import { K } from "../../lib/keys";
import { t, type LanguagePref } from "../../i18n";
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

function allSections(): SectionDef[] {
  return [
    { id: "appearance", label: t("settings.section.appearance"), Icon: TypeIcon },
    { id: "editor",     label: t("settings.section.editor"),     Icon: EditIcon },
    { id: "characters", label: t("settings.section.characters"), Icon: PaletteIcon },
    { id: "shortcuts",  label: t("settings.section.shortcuts"),  Icon: KbdIcon },
    { id: "updates",    label: t("settings.section.updates"),    Icon: ShieldIcon },
    { id: "about",      label: t("settings.section.about"),      Icon: InfoIcon },
  ];
}

interface ShortcutGroup {
  title: string;
  items: Array<{ keys: string; desc: string }>;
}

// Shortcut-Anzeige plattform-aware: K() rendert "⌘N" auf macOS und
// "Ctrl+N" auf Windows/Linux. Per-Call-Build damit Sprach-Wechsel die
// Beschreibungen sofort aktualisiert.
function shortcutGroups(): ShortcutGroup[] {
  return [
    {
      title: t("shortcuts.group.general"),
      items: [
        { keys: K("Mod+N"), desc: t("shortcut.newScript") },
        { keys: K("Mod+T"), desc: t("shortcut.toOverview") },
        { keys: K("Mod+W"), desc: t("shortcut.closeTab") },
        { keys: K("Mod+K"), desc: t("shortcut.openSearch") },
        { keys: K("Mod+F"), desc: t("shortcut.focusSearch") },
        { keys: K("Mod+,"), desc: t("shortcut.openSettings") },
        { keys: K("Mod+I"), desc: t("shortcut.captureIdea") },
        { keys: `${K("Mod+0")}-${K("Mod+9")}`, desc: t("shortcut.tabByIndex") },
        { keys: `${K("Mod+Alt+ArrowLeft")} / ${K("Mod+Alt+ArrowRight")}`, desc: t("shortcut.cycleTabs") },
      ],
    },
    {
      title: t("shortcuts.group.editor"),
      items: [
        { keys: "Tab", desc: t("shortcut.blockPicker") },
        { keys: K("Mod+1"), desc: t("shortcut.blockAction") },
        { keys: K("Mod+2"), desc: t("shortcut.blockCharacter") },
        { keys: K("Mod+3"), desc: t("shortcut.blockDialog") },
        { keys: K("Mod+4"), desc: t("shortcut.blockParenthetical") },
        { keys: K("Mod+5"), desc: t("shortcut.blockCamera") },
        { keys: K("Mod+6"), desc: t("shortcut.blockCaption") },
        { keys: K("Mod+7"), desc: t("shortcut.blockSfx") },
        { keys: K("Enter"), desc: t("shortcut.smartEnter") },
        { keys: `${K("Mod+B")} / ${K("Mod+I")} / ${K("Mod+U")}`, desc: t("shortcut.formatting") },
        { keys: K("Mod+E"), desc: t("shortcut.exportScript") },
        { keys: K("Mod+Shift+F"), desc: t("shortcut.focusMode") },
        { keys: K("Mod+Shift+S"), desc: t("shortcut.snapshotCreate") },
        { keys: K("Mod+Shift+H"), desc: t("shortcut.snapshotHistory") },
      ],
    },
  ];
}

export interface SettingsDialogProps {
  open: boolean;
  onClose(): void;
  onStartOnboarding?(): void;
}

export function SettingsDialog(props: SettingsDialogProps) {
  const [section, setSection] = createSignal<SectionId>("appearance");
  const [appVersion, setAppVersion] = createSignal("0.6.0");

  const [overrides, setOverrides] = createSignal<CharacterColorRecord[]>([]);
  const reloadOverrides = async () => {
    try {
      const all = await api.listCharacterColors();
      setOverrides(all.filter((r) => r.override_color !== null));
    } catch {
      setOverrides([]);
    }
  };

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

  createEffect(() => {
    if (props.open) void reloadOverrides();
  });

  const sections = createMemo<SectionDef[]>(() => {
    let list = allSections();
    if (overrides().length === 0) list = list.filter((s) => s.id !== "characters");
    if (!updates()) list = list.filter((s) => s.id !== "updates");
    return list;
  });

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
      pushToast(t("settings.toast.colorFailed", { message: (err as Error).message ?? String(err) }), "error");
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
      pushToast(t("settings.toast.resetFailed", { message: (err as Error).message ?? String(err) }), "error");
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
      title={t("settings.title")}
      maxWidth={760}
    >
      <div class="settings-grid">
        <nav class="settings-nav" aria-label={t("settings.aria.sections")}>
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
          </Show>

          <Show when={section() === "editor"}>
            <h3>{t("settings.section.editor")}</h3>
            <div class="settings-pane-sub">{t("settings.editor.sub")}</div>

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
          </Show>

          <Show when={section() === "characters"}>
            <h3>{t("settings.section.characters")}</h3>
            <div class="settings-pane-sub">
              {t("settings.characters.sub")}
            </div>
            <For each={overrides()}>
              {(rec) => (
                <div class="settings-row settings-character-row">
                  <button
                    type="button"
                    class="settings-character-swatch scriptz-color-picker-trigger"
                    style={{ background: rec.override_color ?? "#000" }}
                    aria-label={t("settings.characters.colorAria", { name: rec.name })}
                    title={t("settings.characters.colorAria", { name: rec.name })}
                    onClick={(ev) => openPickerFor(rec, ev)}
                  />
                  <div class="settings-character-name">{rec.name}</div>
                  <button
                    type="button"
                    class="btn btn--sm"
                    onClick={() => void onResetColor(rec.name)}
                  >
                    {t("settings.characters.reset")}
                  </button>
                </div>
              )}
            </For>
          </Show>

          <Show when={section() === "shortcuts"}>
            <h3>{t("settings.section.shortcuts")}</h3>
            <div class="settings-pane-sub">
              {t("settings.shortcuts.sub")}
            </div>
            <For each={shortcutGroups()}>
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
          </Show>

          <Show when={section() === "about"}>
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
