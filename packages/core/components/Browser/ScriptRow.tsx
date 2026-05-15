import { createSignal, For, Show } from "solid-js";
import type { ScriptSummary } from "../../lib/types";
import { stripeBackground } from "../../lib/stripe";
import { relativeTime } from "../../lib/format";
import { runtimeLabelFromStats } from "../../lib/runtime";
import { settingsStore } from "../../stores/settings";
import { t } from "../../i18n";
import { SCRIPT_DRAG_MIME } from "./FolderChips";
import { MoreIcon } from "./BrowserIcons";

function runtimeLabelFor(script: ScriptSummary, wpm: number): string | null {
  return runtimeLabelFromStats(
    {
      dialogWords: script.dialog_word_count,
      directionBlocks: script.direction_block_count,
    },
    wpm,
  );
}

export interface ScriptRowProps {
  script: ScriptSummary;
  isContext: boolean;
  onOpen: () => void;
  onMore: (e: MouseEvent & { currentTarget: HTMLElement }) => void;
  onContextMenu: (e: MouseEvent) => void;
}

/** List view row — visual variant used when `viewMode === "list"`. */
export function ScriptRow(props: ScriptRowProps) {
  const bg = () => stripeBackground(props.script.characters, "to bottom");
  const [dragging, setDragging] = createSignal(false);
  return (
    <div
      class="row-v2"
      role="button"
      classList={{ "is-context": props.isContext, "is-dragging": dragging() }}
      draggable={true}
      onDragStart={(e) => {
        if (!e.dataTransfer) return;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData(SCRIPT_DRAG_MIME, props.script.id);
        e.dataTransfer.setData("text/plain", props.script.title);
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      onClick={props.onOpen}
      onContextMenu={props.onContextMenu}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          props.onOpen();
        }
      }}
      aria-label={props.script.title || t("common.untitled")}
    >
      <div
        class="row-stripe"
        classList={{ "row-stripe-empty": bg() === null }}
        style={bg() ? `background: ${bg()};` : ""}
      />
      <div class="row-v2-title">{props.script.title || t("common.untitled")}</div>
      <div class="row-v2-chars">
        <For each={props.script.characters.slice(0, 2)}>
          {(c) => (
            <span class="char-pill" style={`color:${c.color};--char-color:${c.color};`}>
              {c.name}
            </span>
          )}
        </For>
        <Show when={props.script.characters.length > 2}>
          <span class="row-v2-chars-more">
            +{props.script.characters.length - 2}
          </span>
        </Show>
      </div>
      <div class="row-v2-meta">{relativeTime(props.script.updated_at)}</div>
      <div class="row-v2-pages">
        {(() => {
          const rt = runtimeLabelFor(props.script, settingsStore.dialogWpm());
          return rt ?? t("browser.runtime.unavailable");
        })()}
      </div>
      <button
        class="row-v2-more"
        aria-label={t("browser.rowMore")}
        onClick={(e) => {
          e.stopPropagation();
          props.onMore(e as MouseEvent & { currentTarget: HTMLElement });
        }}
      >
        <MoreIcon />
      </button>
    </div>
  );
}
