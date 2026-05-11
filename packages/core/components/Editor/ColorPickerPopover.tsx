// Shared colour-picker popover used by all three character-colour entry
// points: the marge swatch, the right-click menu on a character block, and
// the colour dot in the character autocomplete dropdown. Single visual
// language and single network call — every "pick" ends up calling
// `api.setCharacterColor` (or `clearCharacterColor` for "Standard").

import { Show, For, createSignal, createEffect, onCleanup } from "solid-js";
import {
  CHARACTER_PALETTE,
  isValidHexColor,
  normalizeHexColor,
} from "../../lib/colors";

export interface ColorPickerPopoverProps {
  open: boolean;
  /** Viewport-relative anchor point. The popover positions itself near
   * (x, y) and clamps inside the window so it never sits off-screen. */
  x: number;
  y: number;
  /** Display-only — the character whose colour is being changed. */
  characterName: string;
  currentColor: string;
  onPick: (color: string) => void;
  onReset: () => void;
  onClose: () => void;
}

const POPOVER_WIDTH = 220;
const POPOVER_EST_HEIGHT = 150;

export function ColorPickerPopover(props: ColorPickerPopoverProps) {
  const [hex, setHex] = createSignal(props.currentColor);

  // Re-seed the hex input whenever the popover (re-)opens for a different
  // character — otherwise a previous edit's text would leak across.
  createEffect(() => {
    if (props.open) {
      setHex(props.currentColor);
    }
  });

  // Close on Escape or any click outside. We listen on `mousedown` (capture)
  // so the popover closes BEFORE the swatch's click reopens it — without
  // capture, a click on the same swatch would close-then-reopen.
  createEffect(() => {
    if (!props.open) return;
    const onDown = (ev: MouseEvent) => {
      const t = ev.target as HTMLElement | null;
      if (t?.closest(".scriptz-color-popover")) return;
      if (t?.closest(".scriptz-color-picker-trigger")) return;
      props.onClose();
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        props.onClose();
      }
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey);
    onCleanup(() => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey);
    });
  });

  const clampedPos = () => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const x = Math.max(8, Math.min(props.x, vw - POPOVER_WIDTH - 8));
    const y = Math.max(8, Math.min(props.y, vh - POPOVER_EST_HEIGHT - 8));
    return { x, y };
  };

  const submitHex = () => {
    const v = hex();
    if (!isValidHexColor(v)) return;
    props.onPick(normalizeHexColor(v));
  };

  return (
    <Show when={props.open}>
      <div
        class="scriptz-color-popover"
        style={{
          position: "fixed",
          left: `${clampedPos().x}px`,
          top: `${clampedPos().y}px`,
          width: `${POPOVER_WIDTH}px`,
        }}
        role="dialog"
        aria-label={`Farbe für ${props.characterName}`}
        onMouseDown={(ev) => ev.stopPropagation()}
      >
        <div class="scriptz-color-popover-title">{props.characterName}</div>
        <div class="scriptz-color-swatches">
          <For each={CHARACTER_PALETTE}>
            {(c) => (
              <button
                type="button"
                class="scriptz-color-swatch"
                classList={{
                  "is-current":
                    c.toLowerCase() === props.currentColor.toLowerCase(),
                }}
                style={{ background: c }}
                aria-label={c}
                onClick={() => props.onPick(c)}
              />
            )}
          </For>
        </div>
        <div class="scriptz-color-hex-row">
          <input
            class="scriptz-color-hex-input"
            type="text"
            value={hex()}
            spellcheck={false}
            onInput={(ev) => setHex(ev.currentTarget.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter") {
                ev.preventDefault();
                submitHex();
              }
            }}
            placeholder="#rrggbb"
          />
          <button
            type="button"
            class="scriptz-color-hex-apply"
            disabled={!isValidHexColor(hex())}
            onClick={submitHex}
          >
            OK
          </button>
        </div>
        <button
          type="button"
          class="scriptz-color-reset"
          onClick={props.onReset}
          title="App-weiten Override löschen — die Farbe fällt auf den nächsten freien Palette-Slot zurück."
        >
          Auf Standard zurücksetzen
        </button>
      </div>
    </Show>
  );
}
