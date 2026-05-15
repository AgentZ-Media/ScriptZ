import { For, Show } from "solid-js";
import { t } from "../../i18n";
import { CheckIcon } from "./BrowserIcons";

export type SortKey = "updated" | "created" | "title";

export function sortOptions(): { id: SortKey; label: string }[] {
  return [
    { id: "updated", label: t("browser.sort.updated") },
    { id: "created", label: t("browser.sort.created") },
    { id: "title",   label: t("browser.sort.title") },
  ];
}

export interface SortPopoverProps {
  x: number;
  y: number;
  current: SortKey;
  onPick: (id: SortKey) => void;
  onClose: () => void;
}

/** Floating popover for choosing the sort key. Anchored absolutely
 *  to the click position handed in via `x` / `y`. */
export function SortPopover(props: SortPopoverProps) {
  return (
    <>
      <div class="popover-scrim" onClick={() => props.onClose()} />
      <div class="popover-menu" style={`left:${props.x}px;top:${props.y}px;`}>
        <For each={sortOptions()}>
          {(o) => (
            <button
              type="button"
              class="popover-item"
              onClick={() => props.onPick(o.id)}
            >
              <span class="popover-ic">
                <Show when={props.current === o.id}><CheckIcon /></Show>
              </span>
              <span>{o.label}</span>
            </button>
          )}
        </For>
      </div>
    </>
  );
}
