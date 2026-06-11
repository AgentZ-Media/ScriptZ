import { Show, createSignal, createMemo, createEffect, For, type Component } from "solid-js";
import { Modal } from "../Common/Modal";
import { api } from "../../lib/api";
import { getUpdatesStore } from "../../lib/updates";
import { t } from "../../i18n";
import {
  TypeIcon, EditIcon, PaletteIcon, KbdIcon, SendIcon, ShieldIcon, InfoIcon,
} from "./sections/icons";
import { SettingsAppearance } from "./sections/SettingsAppearance";
import { SettingsEditor } from "./sections/SettingsEditor";
import { SettingsCharacters } from "./sections/SettingsCharacters";
import { SettingsShortcuts } from "./sections/SettingsShortcuts";
import { SettingsStudio } from "./sections/SettingsStudio";
import { SettingsUpdates } from "./sections/SettingsUpdates";
import { SettingsAbout } from "./sections/SettingsAbout";
import "./SettingsDialog.css";

const updates = () => getUpdatesStore();

type SectionId =
  | "appearance"
  | "editor"
  | "characters"
  | "shortcuts"
  | "studio"
  | "updates"
  | "about";

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
    { id: "studio",     label: t("settings.section.studio"),     Icon: SendIcon },
    { id: "updates",    label: t("settings.section.updates"),    Icon: ShieldIcon },
    { id: "about",      label: t("settings.section.about"),      Icon: InfoIcon },
  ];
}

export interface SettingsDialogProps {
  open: boolean;
  onClose(): void;
  onStartOnboarding?(): void;
}

export function SettingsDialog(props: SettingsDialogProps) {
  const [section, setSection] = createSignal<SectionId>("appearance");

  // Characters section is hidden when no override exists. We track the
  // count here so the nav can react, and bump a tick whenever the dialog
  // opens to make the section refresh itself.
  const [overrideCount, setOverrideCount] = createSignal(0);
  const [reloadTick, setReloadTick] = createSignal(0);

  // Refresh whenever the dialog opens. We also load the count once here so
  // the nav decision is correct before the Characters section ever mounts.
  createEffect(() => {
    if (!props.open) return;
    setReloadTick((n) => n + 1);
    void (async () => {
      try {
        const all = await api.listCharacterColors();
        setOverrideCount(all.filter((r) => r.override_color !== null).length);
      } catch {
        setOverrideCount(0);
      }
    })();
  });

  const sections = createMemo<SectionDef[]>(() => {
    let list = allSections();
    if (overrideCount() === 0) list = list.filter((s) => s.id !== "characters");
    if (!updates()) list = list.filter((s) => s.id !== "updates");
    return list;
  });

  createEffect(() => {
    if (!sections().some((s) => s.id === section())) {
      setSection("appearance");
    }
  });

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
            <SettingsAppearance />
          </Show>
          <Show when={section() === "editor"}>
            <SettingsEditor />
          </Show>
          <Show when={section() === "characters"}>
            <SettingsCharacters
              reloadTick={reloadTick()}
              onCountChange={setOverrideCount}
            />
          </Show>
          <Show when={section() === "shortcuts"}>
            <SettingsShortcuts />
          </Show>
          <Show when={section() === "studio"}>
            <SettingsStudio />
          </Show>
          <Show when={section() === "updates"}>
            <SettingsUpdates />
          </Show>
          <Show when={section() === "about"}>
            <SettingsAbout onStartOnboarding={props.onStartOnboarding} />
          </Show>
        </div>
      </div>
    </Modal>
  );
}
