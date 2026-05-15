import { createMemo, For, Show } from "solid-js";
import type { Folder, ScriptSummary } from "../../lib/types";
import { t, tPlural } from "../../i18n";
import { ScriptCard } from "./ScriptCard";
import { ScriptRow } from "./ScriptRow";
import { SearchIcon, SortIcon, ChevronDownIcon } from "./BrowserIcons";
import { sortOptions, type SortKey } from "./SortPopover";

export type ViewMode = "grid" | "list";

/** Time buckets for grouping the list — ported from the design
 *  (`bucket()` in `data.jsx`). */
type BucketKey = "heute" | "gestern" | "diese-woche" | "diesen-monat" | "aelter";
const BUCKET_ORDER: BucketKey[] = [
  "heute",
  "gestern",
  "diese-woche",
  "diesen-monat",
  "aelter",
];
function bucketLabel(k: BucketKey): string {
  switch (k) {
    case "heute": return t("bucket.today");
    case "gestern": return t("bucket.yesterday");
    case "diese-woche": return t("bucket.thisWeek");
    case "diesen-monat": return t("bucket.thisMonth");
    case "aelter": return t("bucket.older");
  }
}

function bucketOf(updatedAt: number): BucketKey {
  // Calendar-day-based bucketing: compares two dates at
  // local midnight so a script edited yesterday evening is
  // actually shown under "Yesterday" this morning and doesn't
  // only flip over after 24 hours.
  const startOfDay = (ms: number) => {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const dayDiff = Math.floor(
    (startOfDay(Date.now()) - startOfDay(updatedAt)) / 86_400_000,
  );
  if (dayDiff <= 0)  return "heute";
  if (dayDiff === 1) return "gestern";
  if (dayDiff < 7)   return "diese-woche";
  if (dayDiff < 31)  return "diesen-monat";
  return "aelter";
}

export interface BrowserListProps {
  items: ScriptSummary[];
  folders: Folder[];
  sort: SortKey;
  viewMode: ViewMode;
  isSearching: boolean;
  searchQuery: string;
  activeFolderName: string | null;
  hasMore: boolean;
  pageSize: number;
  onLoadMore: () => void;
  onOpenSortMenu: (x: number, y: number) => void;
  onOpenScript: (s: ScriptSummary) => void;
  onScriptContextMenu: (s: ScriptSummary, e: MouseEvent) => void;
  onScriptMore: (s: ScriptSummary, e: MouseEvent & { currentTarget: HTMLElement }) => void;
  /** Renders the "empty folder" placeholder when there are no items
   *  in the currently selected user folder. */
  isEmptyFolder: boolean;
}

/** Sort bar + script list/grid + load-more — rendered when the
 *  browser has any data to show (or is in a non-empty search state).
 *
 *  The parent (`Browser`) decides whether this is rendered at all,
 *  e.g. it hides the whole block for the welcome state. */
export function BrowserList(props: BrowserListProps) {
  const groups = createMemo(() => {
    const items = props.items;
    if (props.sort !== "updated" || props.isSearching) {
      return [{ key: "all" as const, label: null, items }];
    }
    const buckets: Record<BucketKey, ScriptSummary[]> = {
      "heute": [], "gestern": [], "diese-woche": [], "diesen-monat": [], "aelter": [],
    };
    for (const s of items) buckets[bucketOf(s.updated_at)].push(s);
    return BUCKET_ORDER
      .map((k) => ({ key: k as string, label: bucketLabel(k), items: buckets[k] }))
      .filter((g) => g.items.length > 0);
  });

  const folderNameFor = (folderId: string | null) =>
    props.folders.find((f) => f.id === folderId)?.name ?? "";

  return (
    <>
      <div class="home-sortbar">
        <span class="home-count-line">
          {tPlural("units.scripts", props.items.length)}
          <Show when={props.activeFolderName}>
            {t("browser.count.folderSegment", { folder: props.activeFolderName ?? "" })}
          </Show>
          <Show when={props.isSearching}>
            {t("browser.count.searchSegment", { query: props.searchQuery })}
          </Show>
        </span>
        <button
          type="button"
          class="home-sort"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            props.onOpenSortMenu(r.right - 200, r.bottom + 4);
          }}
        >
          <SortIcon />
          <span>{t("browser.sort.label", { value: sortOptions().find((x) => x.id === props.sort)?.label ?? "" })}</span>
          <ChevronDownIcon />
        </button>
      </div>

      <div class="home-body">
        <Show when={props.isEmptyFolder} fallback={
          <Show when={props.items.length > 0 || props.isSearching}>
            <Show when={props.items.length > 0} fallback={
              <div class="home-empty">
                <div class="home-empty-mark home-empty-mark-search"><SearchIcon /></div>
                <div class="home-empty-h">{t("browser.empty.search.title", { query: props.searchQuery })}</div>
                <div class="home-empty-sub">
                  {t("browser.empty.search.hint")}
                </div>
              </div>
            }>
              <For each={groups()}>
                {(g) => (
                  <section class="home-group">
                    <Show when={g.label}>
                      <div class="home-group-label">{g.label}</div>
                    </Show>
                    <Show when={props.viewMode === "list"} fallback={
                      <div class="home-cards">
                        <For each={g.items}>
                          {(s) => (
                            <ScriptCard
                              script={s}
                              folderName={folderNameFor(s.folder_id)}
                              onClick={() => props.onOpenScript(s)}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                props.onScriptContextMenu(s, e);
                              }}
                            />
                          )}
                        </For>
                      </div>
                    }>
                      <div class="home-list">
                        <For each={g.items}>
                          {(s) => (
                            <ScriptRow
                              script={s}
                              isContext={false}
                              onOpen={() => props.onOpenScript(s)}
                              onMore={(e) => props.onScriptMore(s, e)}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                props.onScriptContextMenu(s, e);
                              }}
                            />
                          )}
                        </For>
                      </div>
                    </Show>
                  </section>
                )}
              </For>

              <Show when={props.hasMore}>
                <div class="home-loadmore-row">
                  <button
                    class="btn btn-ghost"
                    onClick={props.onLoadMore}
                  >
                    {t("browser.loadMore", { n: props.pageSize })}
                  </button>
                </div>
              </Show>
            </Show>
          </Show>
        }>
          <div class="home-empty">
            <div class="home-empty-h">{t("browser.empty.folder.title", { folder: props.activeFolderName ?? "" })}</div>
            <div class="home-empty-sub">
              {t("browser.empty.folder.hint")}
            </div>
          </div>
        </Show>
      </div>
    </>
  );
}
