import { createSignal, For, Show } from "solid-js";
import type { ScriptSummary } from "../../lib/types";
import { stripeBackground } from "../../lib/stripe";
import { relativeTime } from "../../lib/format";
import { runtimeLabelFromStats } from "../../lib/runtime";
import { settingsStore } from "../../stores/settings";
import { t } from "../../i18n";
import { SCRIPT_DRAG_MIME } from "./FolderChips";

function runtimeLabelFor(script: ScriptSummary, wpm: number): string | null {
  return runtimeLabelFromStats(
    {
      dialogWords: script.dialog_word_count,
      directionBlocks: script.direction_block_count,
    },
    wpm,
  );
}

export interface ScriptCardProps {
  script: ScriptSummary;
  folderName: string;
  onClick: () => void;
  onContextMenu: (e: MouseEvent) => void;
  /** When true, a click toggles selection instead of opening the script. */
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}

/** Grid view card — visual variant used when `viewMode === "grid"`. */
export function ScriptCard(props: ScriptCardProps) {
  const bg = () => stripeBackground(props.script.characters, "to right");
  const [dragging, setDragging] = createSignal(false);
  const activate = () => (props.selectMode ? props.onToggleSelect?.() : props.onClick());
  return (
    <article
      class="card-v2"
      classList={{
        "is-dragging": dragging(),
        "is-selectable": props.selectMode,
        "is-selected": props.selectMode && props.selected,
      }}
      role="button"
      draggable={!props.selectMode}
      onDragStart={(e) => {
        if (props.selectMode || !e.dataTransfer) return;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData(SCRIPT_DRAG_MIME, props.script.id);
        e.dataTransfer.setData("text/plain", props.script.title);
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      onClick={activate}
      onContextMenu={props.onContextMenu}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate();
        }
      }}
      tabIndex={0}
      aria-label={props.script.title || t("common.untitled")}
    >
      <Show when={props.selectMode}>
        <span class="sel-check" aria-hidden="true">✓</span>
      </Show>
      <div
        class="card-v2-strip"
        classList={{ "is-empty": bg() === null }}
        style={bg() ? `background: ${bg()};` : ""}
        aria-hidden="true"
      />
      <div class="card-v2-body">
        <div class="card-v2-head">
          <div class="card-v2-folder">{props.folderName}</div>
        </div>
        <div class="card-v2-title">{props.script.title || t("common.untitled")}</div>
        <div class="card-v2-meta-row">
          <span class="card-v2-meta">
            {relativeTime(props.script.updated_at)}
            {(() => {
              const rt = runtimeLabelFor(props.script, settingsStore.dialogWpm());
              return rt ? ` · ${rt}` : "";
            })()}
          </span>
          <span class="card-v2-cast">
            <For each={props.script.characters.slice(0, 4)}>
              {(c) => (
                <span class="cast-dot" title={c.name} style={`background:${c.color};`} />
              )}
            </For>
            <Show when={props.script.characters.length === 0}>
              <span class="card-v2-meta-faint">{t("browser.notes")}</span>
            </Show>
          </span>
        </div>
      </div>
    </article>
  );
}
