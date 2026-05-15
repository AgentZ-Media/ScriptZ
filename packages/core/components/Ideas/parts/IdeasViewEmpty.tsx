import { Show } from "solid-js";
import { t } from "../../../i18n";
import { BulbIcon } from "./icons";
import type { IdeasFilter } from "../hooks/useIdeasFilters";

export interface IdeasViewEmptyProps {
  filter: IdeasFilter;
  query: string;
  onFocusCapture(): void;
  onClearQuery(): void;
}

export function IdeasViewEmpty(props: IdeasViewEmptyProps) {
  const hasQuery = () => props.query.trim().length > 0;
  return (
    <div class="ideas-view-empty">
      <div class="ideas-view-empty-mark"><BulbIcon size={28} /></div>
      <Show
        when={!hasQuery()}
        fallback={
          <>
            <div class="ideas-view-empty-h">{t("ideas.empty.search.h")}</div>
            <div class="ideas-view-empty-sub">
              {t("ideas.empty.search.sub", { query: props.query })}
            </div>
            <button
              class="btn ideas-view-empty-cta"
              onClick={props.onClearQuery}
            >
              {t("ideas.search.clear")}
            </button>
          </>
        }
      >
        <Show
          when={props.filter !== "used"}
          fallback={
            <>
              <div class="ideas-view-empty-h">{t("ideas.empty.used.h")}</div>
              <div class="ideas-view-empty-sub">
                {t("ideas.empty.used.sub")}
              </div>
            </>
          }
        >
          <div class="ideas-view-empty-h">{t("ideas.empty.h")}</div>
          <div class="ideas-view-empty-sub">
            {t("ideas.empty.sub")}
          </div>
          <button
            class="btn ideas-view-empty-cta"
            onClick={props.onFocusCapture}
          >
            {t("ideas.empty.cta")}
          </button>
        </Show>
      </Show>
    </div>
  );
}
