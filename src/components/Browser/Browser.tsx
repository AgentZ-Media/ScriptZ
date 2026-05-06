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
import {
  relativeTime,
  formatAbsolute,
  formatPageCount,
  debounce,
} from "~/lib/format";
import { UpdateIndicator } from "~/components/Common/UpdateIndicator";
import { ScriptContextMenu, type ContextMenuItem } from "./ScriptContextMenu";
import { TrashView } from "./TrashView";
import { Modal } from "~/components/Common/Modal";
import { scriptsBus } from "~/lib/scriptsBus";
import "./Browser.css";

type Region = "scripts" | "trash";
type SortKey = "updated" | "created" | "title";
type ViewMode = "grid" | "list";

const VIEW_STATE_KEY = "browser.view_mode";
const RECENT_GRID_COUNT = 4;
// Page size for the older-scripts list. We page in 200-script chunks so
// the Browser stays snappy even with thousands of scripts on disk —
// CLAUDE.md mentions ">80 cards virtualised" but the actual rendering
// has always been a flat For. A LIMIT + "load more" button is the
// minimum-viable scaling fix.
const PAGE_SIZE = 200;

export interface BrowserProps {
  onNewScript?: () => void;
  onOpenSettings?: () => void;
}

export function Browser(props: BrowserProps = {}) {
  const [activeRegion, setActiveRegion] = createSignal<Region>("scripts");
  const [searchInput, setSearchInput] = createSignal("");
  const [debouncedSearch, setDebouncedSearch] = createSignal("");
  const [sort, setSort] = createSignal<SortKey>("updated");
  const [viewMode, setViewMode] = createSignal<ViewMode>("grid");

  const [contextMenu, setContextMenu] = createSignal<{
    x: number;
    y: number;
    script: ScriptSummary;
  } | null>(null);
  const [renameTarget, setRenameTarget] = createSignal<ScriptSummary | null>(null);
  const [renameValue, setRenameValue] = createSignal("");

  // Restore persisted view mode.
  onMount(async () => {
    try {
      const v = await api.getAppState(VIEW_STATE_KEY);
      if (v === "list" || v === "grid") setViewMode(v);
    } catch {}
  });
  createEffect(() => {
    const v = viewMode();
    void api.setAppState(VIEW_STATE_KEY, v).catch(() => {});
  });

  function openNewScript() {
    props.onNewScript?.();
  }

  const debouncedSetSearch = debounce((v: string) => setDebouncedSearch(v), 350);
  createEffect(() => {
    const v = searchInput();
    debouncedSetSearch(v);
  });
  onCleanup(() => debouncedSetSearch.cancel());

  const [pageLimit, setPageLimit] = createSignal(PAGE_SIZE);

  // Reset paging whenever the query changes — a search shouldn't inherit
  // the last "load more" cursor from the unfiltered list.
  createEffect(() => {
    void debouncedSearch();
    void sort();
    setPageLimit(PAGE_SIZE);
  });

  const queryKey = createMemo(() => ({
    query: debouncedSearch(),
    sort: sort(),
    version: scriptsBus.version(),
    limit: pageLimit(),
  }));

  const [scripts] = createResource(
    queryKey,
    (q) =>
      api.listScripts({
        query: q.query || undefined,
        sort: q.sort,
        limit: q.limit,
      }),
    { initialValue: [] },
  );

  const list = createMemo(() => scripts() ?? []);

  // The backend doesn't return a total count — we infer "there's more"
  // from the page being completely full. False positive on the boundary
  // is fine; clicking "load more" then yields zero new entries.
  const hasMore = createMemo(() => list().length >= pageLimit());

  const isSearching = createMemo(() => debouncedSearch().trim().length > 0);

  const recent = createMemo(() => {
    if (isSearching()) return [];
    return list().slice(0, RECENT_GRID_COUNT);
  });
  const older = createMemo(() => {
    if (isSearching()) return list();
    return list().slice(RECENT_GRID_COUNT);
  });

  // ---- Row actions ----
  function openScript(s: ScriptSummary, newTab = false) {
    tabsStore.openScript(s.id, s.title, { newTab });
  }

  async function archive(s: ScriptSummary) {
    try {
      await api.archiveScript(s.id);
      pushToast(`"${s.title}" in den Papierkorb verschoben`, "ok");
      scriptsBus.bump();
    } catch (e) {
      pushToast(`Fehler: ${(e as Error).message}`, "error");
    }
  }
  async function duplicate(s: ScriptSummary) {
    try {
      const dup = await api.duplicateScript(s.id);
      pushToast("Skript dupliziert", "ok");
      scriptsBus.bump();
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
      scriptsBus.bump();
    } catch (e) {
      pushToast(`Fehler: ${(e as Error).message}`, "error");
    } finally {
      setRenameTarget(null);
    }
  }

  function ctxMenuItems(s: ScriptSummary): ContextMenuItem[] {
    return [
      { label: "Öffnen", onClick: () => openScript(s) },
      { label: "In neuem Tab öffnen", onClick: () => openScript(s, true) },
      { label: "Umbenennen", onClick: () => startRename(s) },
      { label: "Duplizieren", onClick: () => void duplicate(s) },
      {
        label: "In Papierkorb verschieben",
        onClick: () => void archive(s),
        danger: true,
      },
    ];
  }

  function isWelcome() {
    return !scripts.loading && !isSearching() && list().length === 0;
  }

  let searchInputRef: HTMLInputElement | undefined;
  onMount(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchInputRef?.focus();
        searchInputRef?.select();
      }
    };
    window.addEventListener("keydown", handler);
    onCleanup(() => window.removeEventListener("keydown", handler));
  });

  return (
    <div class="browser-root">
      <header class="browser-topbar">
        <div class="browser-brand">
          <span class="browser-brand-icon" aria-hidden="true">
            <BrandIcon />
          </span>
          <span class="browser-brand-name">ScriptZ</span>
        </div>

        <div class="browser-search-wrap">
          <span class="browser-search-icon" aria-hidden="true">
            <SearchIcon />
          </span>
          <input
            ref={searchInputRef}
            type="search"
            class="browser-search-input"
            placeholder="Skripte suchen…"
            value={searchInput()}
            onInput={(e) => setSearchInput(e.currentTarget.value)}
            spellcheck={false}
            autocomplete="off"
          />
          <kbd class="browser-search-kbd" aria-hidden="true">⌘F</kbd>
        </div>

        <div class="browser-topbar-actions">
          <UpdateIndicator />
          <button
            class="btn btn-primary browser-new"
            onClick={() => openNewScript()}
          >
            <span class="browser-new-plus" aria-hidden="true">+</span>
            <span>Neues Skript</span>
          </button>
          <button
            class="icon-btn"
            classList={{ "is-active": activeRegion() === "trash" }}
            onClick={() =>
              setActiveRegion((r) => (r === "trash" ? "scripts" : "trash"))
            }
            title={activeRegion() === "trash" ? "Skripte" : "Papierkorb"}
            aria-label="Papierkorb"
          >
            <TrashIcon />
          </button>
          <button
            class="icon-btn"
            onClick={() => props.onOpenSettings?.()}
            title="Einstellungen"
            aria-label="Einstellungen"
          >
            <GearIcon />
          </button>
        </div>
      </header>

      <Show when={activeRegion() === "scripts"}>
        <div class="browser-body">
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
                  <span class="kbd">⌘</span>
                  <span class="kbd">N</span> für ein neues Skript
                </div>
              </div>
            }
          >
            <Show when={list().length > 0 || scripts.loading}>
              <Show when={!isSearching() && recent().length > 0}>
                <section class="browser-section">
                  <div class="browser-section-head">
                    <h2 class="browser-section-title">Zuletzt bearbeitet</h2>
                    <div class="browser-section-tools">
                      <select
                        class="browser-sort"
                        value={sort()}
                        onChange={(e) =>
                          setSort(e.currentTarget.value as SortKey)
                        }
                        title="Sortierung"
                      >
                        <option value="updated">Letzte Bearbeitung</option>
                        <option value="created">Erstelldatum</option>
                        <option value="title">Alphabetisch</option>
                      </select>
                      <ViewToggle value={viewMode()} onChange={setViewMode} />
                    </div>
                  </div>

                  <Show
                    when={viewMode() === "grid"}
                    fallback={
                      <ScriptList
                        items={recent()}
                        onOpen={openScript}
                        onMore={(s, e) =>
                          setContextMenu({ x: e.clientX, y: e.clientY, script: s })
                        }
                      />
                    }
                  >
                    <div class="card-grid">
                      <For each={recent()}>
                        {(s) => (
                          <ScriptCard
                            script={s}
                            onClick={() => openScript(s)}
                            onMiddleClick={() => openScript(s, true)}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setContextMenu({
                                x: e.clientX,
                                y: e.clientY,
                                script: s,
                              });
                            }}
                            onMore={(e) =>
                              setContextMenu({
                                x: e.clientX,
                                y: e.clientY,
                                script: s,
                              })
                            }
                          />
                        )}
                      </For>
                    </div>
                  </Show>
                </section>
              </Show>

              <Show when={older().length > 0 || isSearching()}>
                <section class="browser-section">
                  <div class="browser-section-head">
                    <h2 class="browser-section-title">
                      {isSearching() ? "Suchergebnisse" : "Ältere Skripte"}
                    </h2>
                    <Show when={isSearching()}>
                      <div class="browser-section-tools">
                        <span class="muted small">
                          {list().length}{" "}
                          {list().length === 1 ? "Treffer" : "Treffer"}
                        </span>
                      </div>
                    </Show>
                  </div>
                  <Show
                    when={older().length > 0}
                    fallback={
                      <div class="empty-state muted">
                        Keine Skripte gefunden.
                      </div>
                    }
                  >
                    <ScriptList
                      items={older()}
                      onOpen={openScript}
                      onMore={(s, e) =>
                        setContextMenu({ x: e.clientX, y: e.clientY, script: s })
                      }
                      withHeader
                    />
                  </Show>
                </section>
              </Show>

              <Show when={list().length > 0}>
                <div class="browser-footer muted small">
                  <span>
                    {list().length}{" "}
                    {list().length === 1 ? "Skript" : "Skripte"}
                  </span>
                  <Show when={hasMore()}>
                    <button
                      class="btn btn-ghost browser-load-more"
                      onClick={() => setPageLimit((n) => n + PAGE_SIZE)}
                    >
                      {PAGE_SIZE} weitere laden
                    </button>
                  </Show>
                </div>
              </Show>
            </Show>
          </Show>
        </div>
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

      <Modal
        open={renameTarget() !== null}
        onClose={() => setRenameTarget(null)}
        title="Umbenennen"
        footer={
          <>
            <button class="btn" onClick={() => setRenameTarget(null)}>
              Abbrechen
            </button>
            <button class="btn btn-primary" onClick={commitRename}>
              Speichern
            </button>
          </>
        }
      >
        <Show when={renameTarget()}>
          {(t) => (
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
          )}
        </Show>
      </Modal>
    </div>
  );
}

export default Browser;

// ---- Card grid ----

interface ScriptCardProps {
  script: ScriptSummary;
  onClick: () => void;
  onMiddleClick: () => void;
  onContextMenu: (e: MouseEvent) => void;
  onMore: (e: MouseEvent) => void;
}

function ScriptCard(props: ScriptCardProps) {
  return (
    <article
      class="card"
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey) props.onMiddleClick();
        else props.onClick();
      }}
      onAuxClick={(e) => {
        if (e.button === 1) props.onMiddleClick();
      }}
      onContextMenu={props.onContextMenu}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") props.onClick();
      }}
    >
      <div class="card-head">
        <span class="card-icon" aria-hidden="true">
          <DocIcon />
        </span>
        <button
          class="card-more"
          aria-label="Mehr Aktionen"
          onClick={(e) => {
            e.stopPropagation();
            props.onMore(e);
          }}
        >
          ⋯
        </button>
      </div>
      <h3 class="card-title">{props.script.title}</h3>
      <Show
        when={props.script.characters.length > 0}
        fallback={<div class="card-chars muted small">Keine Charaktere</div>}
      >
        <div class="card-chars">
          <For each={props.script.characters}>
            {(c, i) => (
              <Show when={i() < 4}>
                <span class="card-char">{c.name}</span>
              </Show>
            )}
          </For>
          <Show when={props.script.characters.length > 4}>
            <span class="card-char muted">
              +{props.script.characters.length - 4}
            </span>
          </Show>
        </div>
      </Show>
      <div class="card-meta">
        <span class="card-time">
          <ClockIcon /> {relativeTime(props.script.updated_at)}
        </span>
        <span class="card-pages muted">
          {formatPageCount(props.script.page_count)}
        </span>
      </div>
      <p class="card-summary">
        <Show
          when={props.script.summary && props.script.summary.length > 0}
          fallback={
            <span class="card-summary-placeholder muted small">
              Beschreibung wird beim nächsten Speichern erstellt.
            </span>
          }
        >
          {props.script.summary}
        </Show>
      </p>
    </article>
  );
}

// ---- List ----

function ScriptList(props: {
  items: ScriptSummary[];
  onOpen: (s: ScriptSummary, newTab?: boolean) => void;
  onMore: (s: ScriptSummary, e: MouseEvent) => void;
  withHeader?: boolean;
}) {
  return (
    <div class="list-table" role="table">
      <Show when={props.withHeader}>
        <div class="list-row list-head" role="row">
          <span class="list-col list-col-title" role="columnheader">
            Titel
          </span>
          <span class="list-col list-col-time" role="columnheader">
            Zuletzt bearbeitet
          </span>
          <span class="list-col list-col-pages" role="columnheader">
            Seiten
          </span>
          <span class="list-col list-col-more" />
        </div>
      </Show>
      <For each={props.items}>
        {(s) => (
          <ListRow
            script={s}
            onOpen={(e) => props.onOpen(s, e.metaKey || e.ctrlKey)}
            onMore={(e) => props.onMore(s, e)}
          />
        )}
      </For>
    </div>
  );
}

function ListRow(props: {
  script: ScriptSummary;
  onOpen: (e: MouseEvent) => void;
  onMore: (e: MouseEvent) => void;
}) {
  const charSummary = () => {
    const cs = props.script.characters;
    if (cs.length === 0) return "Keine Charaktere";
    return cs
      .slice(0, 5)
      .map((c) => c.name)
      .join(" · ");
  };
  return (
    <div
      class="list-row"
      role="row"
      tabIndex={0}
      onClick={(e) => props.onOpen(e)}
      onKeyDown={(e) => {
        if (e.key === "Enter") props.onOpen(e as unknown as MouseEvent);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        props.onMore(e);
      }}
    >
      <span class="list-col list-col-title" role="cell">
        <span class="list-icon" aria-hidden="true">
          <DocIcon />
        </span>
        <span class="list-text">
          <span class="list-title">{props.script.title}</span>
          <span class="list-sub muted">{charSummary()}</span>
        </span>
      </span>
      <span class="list-col list-col-time muted" role="cell">
        {formatAbsolute(props.script.updated_at)}
      </span>
      <span class="list-col list-col-pages muted" role="cell">
        {props.script.page_count}
      </span>
      <span class="list-col list-col-more" role="cell">
        <button
          class="icon-btn icon-btn-ghost"
          aria-label="Mehr Aktionen"
          onClick={(e) => {
            e.stopPropagation();
            props.onMore(e);
          }}
        >
          ⋯
        </button>
      </span>
    </div>
  );
}

// ---- View toggle ----

function ViewToggle(props: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  return (
    <div class="view-toggle" role="tablist" aria-label="Ansicht">
      <button
        class="view-toggle-btn"
        classList={{ "is-active": props.value === "grid" }}
        onClick={() => props.onChange("grid")}
        title="Karten"
        aria-label="Karten"
      >
        <GridIcon />
      </button>
      <button
        class="view-toggle-btn"
        classList={{ "is-active": props.value === "list" }}
        onClick={() => props.onChange("list")}
        title="Liste"
        aria-label="Liste"
      >
        <ListIcon />
      </button>
    </div>
  );
}

// ---- Icons ----

function BrandIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M5 4h10l4 4v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
      <path d="M15 4v4h4" />
      <path d="M8 13l3-3 3 3" />
      <path d="M11 10v6" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor"
         stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M5 3h7l3 3v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M12 3v3h3" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
         stroke-width="1.5">
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
         stroke-width="1.5" stroke-linecap="round">
      <path d="M3 4h10" />
      <path d="M3 8h10" />
      <path d="M3 12h10" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor"
         stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 5v3l2 1.5" />
    </svg>
  );
}
