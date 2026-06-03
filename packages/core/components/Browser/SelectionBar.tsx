import { Show } from "solid-js";
import { t } from "../../i18n";

export interface SelectionBarProps {
  active: boolean;
  count: number;
  /** Whether the idle "Select" entry button may be shown (there is content). */
  canEnter: boolean;
  onEnter: () => void;
  onExit: () => void;
  onSelectAll: () => void;
  onClear: () => void;
  onSend: () => void;
  /** Only scripts can be PDF-exported; omit for the ideas surface. */
  onExportPdf?: () => void;
}

/** Slim bar that toggles a multi-select mode. Idle: a single "Select" button.
 *  Active: count + select all / clear + the export/send actions. Shared by the
 *  Browser (scripts) and the Ideas view. */
export function SelectionBar(props: SelectionBarProps) {
  return (
    <Show
      when={props.active}
      fallback={
        <Show when={props.canEnter}>
          <div class="selbar selbar-idle">
            <button class="btn btn-ghost" onClick={props.onEnter}>
              {t("select.enter")}
            </button>
          </div>
        </Show>
      }
    >
      <div class="selbar selbar-active">
        <span class="selbar-count">{t("select.count", { count: props.count })}</span>
        <div class="selbar-actions">
          <button class="btn btn-ghost" onClick={props.onSelectAll}>
            {t("select.selectAll")}
          </button>
          <button class="btn btn-ghost" onClick={props.onClear} disabled={props.count === 0}>
            {t("select.clear")}
          </button>
          <Show when={props.onExportPdf}>
            <button class="btn" onClick={() => props.onExportPdf?.()} disabled={props.count === 0}>
              {t("select.action.pdf")}
            </button>
          </Show>
          <button class="btn btn-primary" onClick={props.onSend} disabled={props.count === 0}>
            {t("select.action.send")}
          </button>
          <button class="btn btn-ghost" onClick={props.onExit}>
            {t("select.exit")}
          </button>
        </div>
      </div>
    </Show>
  );
}
