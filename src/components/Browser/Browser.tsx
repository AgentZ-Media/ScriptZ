import {
  createSignal,
  createMemo,
  createResource,
  createEffect,
  onCleanup,
  onMount,
  For,
  Show,
} from "solid-js";
import type { ScriptSummary } from "~/lib/types";
import { api } from "~/lib/api";
import { tabsStore } from "~/stores/tabs";
import { pushToast } from "~/stores/toasts";
import { relativeTime, formatPageCount, debounce } from "~/lib/format";
import { tint } from "~/lib/colors";
import { UpdateIndicator } from "~/components/Common/UpdateIndicator";
import { ScriptContextMenu, type ContextMenuItem } from "./ScriptContextMenu";
import { NewScriptDialog } from "./NewScriptDialog";
import { TrashView } from "./TrashView";
import "./Browser.css";

type Region = "scripts" | "trash";
type SortKey = "updated" | "created" | "title";

export interface BrowserProps {
  onNewScript?: () => void;
}

const ROW_HEIGHT = 168;
const CARD_MIN_WIDTH = 280;
const VIRTUALIZE_THRESHOLD = 80;
const OVERSCAN_ROWS = 4;

interface ScriptQuery {
  query: string;
  sort: SortKey;
}

export function Browser(props: BrowserProps = {}) {
  const [activeRegion, setActiveRegion] = createSignal<Region>("scripts");
  const [searchInput, setSearchInput] = createSignal("");
  const [debouncedSearch, setDebouncedSearch] = createSignal("");
  const [sort, setSort] = createSignal<SortKey>("updated");

  const [showNewScriptDialog, setShowNewScriptDialog] = createSignal(false);
  const [contextMenu, setContextMenu] = createSignal<{
    x: number;
    y: number;
    script: ScriptSummary;
  } | null>(null);
  const [renameTarget, setRenameTarget] = createSignal<ScriptSummary | null>(null);
  const [renameValue, setRenameValue] = createSignal("");

  function openNewScript() {
    if (props.onNewScript) props.onNewScript();
    else setShowNewScriptDialog(true);
  }

  const debouncedSetSearch = debounce((v: string) => setDebouncedSearch(v), 350);
  createEffect(() => {
    const v = searchInput();
    debouncedSetSearch(v);
  });
  onCleanup(() => debouncedSetSearch.cancel());

  const queryKey = createMemo<ScriptQuery>(() => ({
    query: debouncedSearch(),
    sort: sort(),
  }));

  const [scripts, { refetch: refetchScripts }] = createResource(
    queryKey,
    (q) =>
      api.listScripts({
        query: q.query || undefined,
        sort: q.sort,
      }),
    { initialValue: [] },
  );

  function onWindowKey(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "n" && !e.shiftKey && !e.altKey) {
      if (showNewScriptDialog()) return;
      e.preventDefault();
      openNewScript();
    }
  }
  onMount(() => {
    window.addEventListener("keydown", onWindowKey);
    onCleanup(() => window.removeEventListener("keydown", onWindowKey));
  });

  // ---- Virtualization state for scripts grid ----
  let scrollEl: HTMLDivElement | undefined;
  const [scrollTop, setScrollTop] = createSignal(0);
  const [containerWidth, setContainerWidth] = createSignal(0);
  const [containerHeight, setContainerHeight] = createSignal(0);

  function recomputeContainer() {
    if (!scrollEl) return;
    setContainerWidth(scrollEl.clientWidth);
    setContainerHeight(scrollEl.clientHeight);
  }

  onMount(() => {
    if (!scrollEl) return;
    recomputeContainer();
    const ro = new ResizeObserver(() => recomputeContainer());
    ro.observe(scrollEl);
    onCleanup(() => ro.disconnect());
  });

  const cols = createMemo(() => {
    const w = containerWidth();
    if (w <= 0) return 1;
    return Math.max(1, Math.floor((w + 20) / (CARD_MIN_WIDTH + 20)));
  });
  const list = createMemo(() => scripts() ?? []);
  const totalRows = createMemo(() => Math.ceil(list().length / cols()));
  const totalHeight = createMemo(() => totalRows() * ROW_HEIGHT);

  const virtualize = createMemo(() => list().length > VIRTUALIZE_THRESHOLD);
  const visibleRange = createMemo(() => {
    if (!virtualize()) return { start: 0, end: list().length };
    const startRow = Math.max(0, Math.floor(scrollTop() / ROW_HEIGHT) - OVERSCAN_ROWS);
    const endRow = Math.min(
      totalRows(),
      Math.ceil((scrollTop() + containerHeight()) / ROW_HEIGHT) + OVERSCAN_ROWS,
    );
    return { start: startRow * cols(), end: Math.min(list().length, endRow * cols()) };
  });

  function visibleScripts(): { script: ScriptSummary; index: number }[] {
    const r = visibleRange();
    const out: { script: ScriptSummary; index: number }[] = [];
    const arr = list();
    for (let i = r.start; i < r.end; i++) out.push({ script: arr[i], index: i });
    return out;
  }

  // ---- Card actions ----
  function openScript(s: ScriptSummary, newTab = false) {
    tabsStore.openScript(s.id, s.title, { newTab });
  }

  async function archive(s: ScriptSummary) {
    try {
      await api.archiveScript(s.id);
      pushToast(`"${s.title}" in den Papierkorb verschoben`, "ok");
      void refetchScripts();
    } catch (e) {
      pushToast(`Fehler: ${(e as Error).message}`, "error");
    }
  }
  async function duplicate(s: ScriptSummary) {
    try {
      const dup = await api.duplicateScript(s.id);
      pushToast("Skript dupliziert", "ok");
      void refetchScripts();
      tabsStore.openScript(dup.id, dup.title, { newTab: true });
    } catch (e) {
      pushToast(`Fehler: ${(e as Error).message}`, "error");
    }
  }
  function startRename(s: ScriptSummary) {
    setRenameTarget(s);
    setRenameValue(s.title);
  }
  async function commitRename() {
    const target = renameTarget();
    if (!target) return;
    const v = renameValue().trim();
    if (!v || v === target.title) {
      setRenameTarget(null);
      return;
    }
    try {
      const updated = await api.renameScript(target.id, v);
      tabsStore.setScriptTitle(target.id, updated.title);
      pushToast("Umbenannt", "ok");
      void refetchScripts();
    } catch (e) {
      pushToast(`Fehler: ${(e as Error).message}`, "error");
    } finally {
      setRenameTarget(null);
    }
  }

  function ctxMenuItems(s: ScriptSummary): ContextMenuItem[] {
    return [
      { label: "Umbenennen", onClick: () => startRename(s) },
      { label: "Duplizieren", onClick: () => void duplicate(s) },
      { label: "In Papierkorb verschieben", onClick: () => void archive(s), danger: true },
    ];
  }

  function onCardClick(e: MouseEvent, s: ScriptSummary) {
    if (e.metaKey || e.ctrlKey) {
      openScript(s, true);
      return;
    }
    openScript(s);
  }

  function isWelcome() {
    const q = queryKey();
    return !scripts.loading && !q.query && (scripts() ?? []).length === 0;
  }

  return (
    <div class="browser-root">
      <header class="browser-header" data-tauri-drag-region>
        <div class="region-tabs">
          <button
            class={`region-tab${activeRegion() === "scripts" ? " active" : ""}`}
            onClick={() => setActiveRegion("scripts")}
          >
            Skripte
          </button>
          <button
            class={`region-tab${activeRegion() === "trash" ? " active" : ""}`}
            onClick={() => setActiveRegion("trash")}
          >
            Papierkorb
          </button>
        </div>
        <div class="header-spacer" />
        <div class="header-right">
          <UpdateIndicator />
        </div>
      </header>

      <Show when={activeRegion() === "scripts"}>
        <div class="browser-toolbar">
          <div class="search-wrap">
            <input
              type="search"
              class="search-input"
              placeholder="Suchen…"
              value={searchInput()}
              onInput={(e) => setSearchInput(e.currentTarget.value)}
            />
          </div>
          <div class="filter-bar">
            <select
              class="sort-select"
              value={sort()}
              onChange={(e) => setSort(e.currentTarget.value as SortKey)}
            >
              <option value="updated">Letzte Bearbeitung</option>
              <option value="created">Erstelldatum</option>
              <option value="title">Alphabetisch</option>
            </select>
          </div>
        </div>

        <div class="browser-main">
          <div
            class="grid-scroll"
            ref={(el) => (scrollEl = el)}
            onScroll={(e) => setScrollTop((e.currentTarget as HTMLDivElement).scrollTop)}
          >
            <Show
              when={!isWelcome()}
              fallback={
                <div class="welcome">
                  <button
                    class="btn btn-primary welcome-btn"
                    onClick={() => openNewScript()}
                  >
                    Erstes Skript erstellen
                  </button>
                  <div class="welcome-hint subtle">
                    <kbd class="kbd">⌘</kbd>
                    <kbd class="kbd">N</kbd> für ein neues Skript
                  </div>
                </div>
              }
            >
              <Show
                when={list().length > 0}
                fallback={
                  <Show when={!scripts.loading}>
                    <div class="empty-state muted">
                      Keine Skripte gefunden.
                    </div>
                  </Show>
                }
              >
                <Show
                  when={virtualize()}
                  fallback={
                    <div class="card-grid">
                      <For each={list()}>
                        {(s) => (
                          <ScriptCard
                            script={s}
                            onClick={(e) => onCardClick(e, s)}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setContextMenu({ x: e.clientX, y: e.clientY, script: s });
                            }}
                          />
                        )}
                      </For>
                    </div>
                  }
                >
                  <div
                    class="virtual-spacer"
                    style={`height:${totalHeight()}px;position:relative;`}
                  >
                    <For each={visibleScripts()}>
                      {(item) => {
                        const c = cols();
                        const row = Math.floor(item.index / c);
                        const col = item.index % c;
                        const left = (col * 100) / c;
                        const widthPct = 100 / c;
                        return (
                          <div
                            class="virtual-cell"
                            style={`position:absolute;top:${row * ROW_HEIGHT}px;left:calc(${left}%);width:calc(${widthPct}% - 0px);padding:0 10px;height:${ROW_HEIGHT}px;`}
                          >
                            <ScriptCard
                              script={item.script}
                              onClick={(e) => onCardClick(e, item.script)}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                setContextMenu({
                                  x: e.clientX,
                                  y: e.clientY,
                                  script: item.script,
                                });
                              }}
                            />
                          </div>
                        );
                      }}
                    </For>
                  </div>
                </Show>
              </Show>
            </Show>
          </div>
        </div>

        <button
          class="fab"
          onClick={() => openNewScript()}
          aria-label="Neues Skript erstellen"
        >
          + Neues Skript erstellen
        </button>
      </Show>

      <Show when={activeRegion() === "trash"}>
        <TrashView />
      </Show>

      <Show when={contextMenu()}>
        {(cm) => (
          <ScriptContextMenu
            x={cm().x}
            y={cm().y}
            onClose={() => setContextMenu(null)}
            items={ctxMenuItems(cm().script)}
          />
        )}
      </Show>

      <Show when={renameTarget()}>
        {(t) => (
          <div
            class="modal-backdrop"
            onClick={(e) => {
              if (e.target === e.currentTarget) setRenameTarget(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setRenameTarget(null);
            }}
            tabIndex={-1}
          >
            <div class="modal" role="dialog">
              <h2>Umbenennen</h2>
              <div class="modal-body">
                <div class="field">
                  <label>Neuer Titel</label>
                  <input
                    type="text"
                    value={renameValue()}
                    autofocus
                    onInput={(e) => setRenameValue(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void commitRename();
                    }}
                  />
                  <div class="muted small">Aktuell: {t().title}</div>
                </div>
              </div>
              <div class="modal-footer">
                <button class="btn btn-ghost" onClick={() => setRenameTarget(null)}>
                  Abbrechen
                </button>
                <button class="btn btn-primary" onClick={commitRename}>
                  Speichern
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>

      <Show when={showNewScriptDialog()}>
        <NewScriptDialog
          onClose={() => setShowNewScriptDialog(false)}
          onCreated={() => {
            void refetchScripts();
          }}
        />
      </Show>
    </div>
  );
}

export default Browser;

interface ScriptCardProps {
  script: ScriptSummary;
  onClick: (e: MouseEvent) => void;
  onContextMenu: (e: MouseEvent) => void;
}

function ScriptCard(props: ScriptCardProps) {
  const visibleChars = () => props.script.characters.slice(0, 4);
  const overflow = () => Math.max(0, props.script.characters.length - 4);

  return (
    <article
      class="script-card"
      tabIndex={0}
      onClick={props.onClick}
      onContextMenu={props.onContextMenu}
      onKeyDown={(e) => {
        if (e.key === "Enter") props.onClick(e as unknown as MouseEvent);
      }}
    >
      <div class="card-top">
        <h3 class="card-title">{props.script.title}</h3>
      </div>
      <Show when={props.script.characters.length > 0}>
        <div class="card-chars">
          <For each={visibleChars()}>
            {(c) => (
              <span
                class="char-pill"
                style={`background:${tint(c.color, 0.15)};color:${c.color}`}
              >
                {c.name}
              </span>
            )}
          </For>
          <Show when={overflow() > 0}>
            <span class="char-pill more">+{overflow()}</span>
          </Show>
        </div>
      </Show>
      <div class="card-foot">
        <span class="card-time muted">{relativeTime(props.script.updated_at)}</span>
        <span class="card-pages muted">{formatPageCount(props.script.page_count)}</span>
      </div>
    </article>
  );
}
