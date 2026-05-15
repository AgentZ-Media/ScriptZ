import { For, createEffect, createSignal } from "solid-js";
import { api } from "../../../lib/api";
import { scriptsBus } from "../../../lib/scriptsBus";
import { pushToast } from "../../../stores/toasts";
import { t } from "../../../i18n";
import { ColorPickerPopover } from "../../Editor/ColorPickerPopover";
import type { CharacterColorRecord } from "../../../lib/types";

export interface SettingsCharactersProps {
  // Trigger to reload overrides when the dialog opens. Bumped by the parent
  // every time it becomes visible.
  reloadTick: number;
  // Reports the current override count back to the parent so the nav entry
  // can disappear when the list is empty.
  onCountChange(n: number): void;
}

export function SettingsCharacters(props: SettingsCharactersProps) {
  const [overrides, setOverrides] = createSignal<CharacterColorRecord[]>([]);
  const [pickerOpen, setPickerOpen] = createSignal(false);
  const [pickerName, setPickerName] = createSignal("");
  const [pickerColor, setPickerColor] = createSignal("#000000");
  const [pickerPos, setPickerPos] = createSignal({ x: 0, y: 0 });

  const reloadOverrides = async () => {
    try {
      const all = await api.listCharacterColors();
      const filtered = all.filter((r) => r.override_color !== null);
      setOverrides(filtered);
      props.onCountChange(filtered.length);
    } catch {
      setOverrides([]);
      props.onCountChange(0);
    }
  };

  createEffect(() => {
    // Re-fetch whenever the parent bumps reloadTick.
    void props.reloadTick;
    void reloadOverrides();
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

  return (
    <>
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
    </>
  );
}
