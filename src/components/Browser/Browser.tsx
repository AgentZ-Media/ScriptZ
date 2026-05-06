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
import { Portal } from "solid-js/web";
import type { ScriptSummary } from "~/lib/types";
import { api } from "~/lib/api";
import { tabsStore } from "~/stores/tabs";
import { settingsStore } from "~/stores/settings";
import { pushToast } from "~/stores/toasts";
import {
  relativeTime,
  formatAbsolute,
  formatPageCount,
  debounce,
} from "~/lib/format";
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
  const [selectedId, setSelectedId] = createSignal<string | null>(null);

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

  const queryKey = createMemo(() => ({
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

  const list = createMemo(() => scripts() ?? []);

  // Keep the selection in sync with the list (default to the first row)
  createEffect(() => {
    const arr = list();
    const cur = selectedId();
    if (arr.length === 0) {
      if (cur !== null) setSelectedId(null);
      return;
    }
    if (!cur || !arr.find((s) => s.id === cur)) {
      setSelectedId(arr[0].id);
    }
  });

  const selected = createMemo(() => {
    const id = selectedId();
    if (!id) return null;
    return list().find((s) => s.id === id) ?? null;
  });

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

  // ---- Row actions ----
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
      { label: "Öffnen", onClick: () => openScript(s) },
      { label: "In neuem Tab öffnen", onClick: () => openScript(s, true) },
      { label: "Umbenennen", onClick: () => startRename(s) },
      { label: "Duplizieren", onClick: () => void duplicate(s) },
      { label: "In Papierkorb verschieben", onClick: () => void archive(s), danger: true },
    ];
  }

  function onRowClick(s: ScriptSummary) {
    setSelectedId(s.id);
  }
  function onRowDouble(s: ScriptSummary, e: MouseEvent) {
    openScript(s, e.metaKey || e.ctrlKey);
  }

  function onRowKey(e: KeyboardEvent) {
    const arr = list();
    if (arr.length === 0) return;
    const idx = arr.findIndex((s) => s.id === selectedId());
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedId(arr[Math.min(arr.length - 1, idx + 1)].id);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedId(arr[Math.max(0, idx - 1)].id);
    } else if (e.key === "Enter") {
      const s = selected();
      if (s) openScript(s);
    }
  }

  function isWelcome() {
    const q = queryKey();
    return !scripts.loading && !q.query && (scripts() ?? []).length === 0;
  }

  return (
    <div class="browser-root">
      <header class="browser-header" data-tauri-drag-region>
        <div class="region-tabs" role="tablist">
          <button
            class="region-tab"
            classList={{ active: activeRegion() === "scripts" }}
            role="tab"
            aria-selected={activeRegion() === "scripts"}
            onClick={() => setActiveRegion("scripts")}
          >
            <span class="region-dot" aria-hidden="true" />
            Skripte
          </button>
          <button
            class="region-tab"
            classList={{ active: activeRegion() === "trash" }}
            role="tab"
            aria-selected={activeRegion() === "trash"}
            onClick={() => setActiveRegion("trash")}
          >
            <span class="region-dot" aria-hidden="true" />
            Papierkorb
          </button>
        </div>
        <div class="header-right">
          <UpdateIndicator />
        </div>
      </header>

      <Show when={activeRegion() === "scripts"}>
        <div class="browser-search">
          <span class="browser-search-icon" aria-hidden="true">⌕</span>
          <input
            type="search"
            class="browser-search-input"
            placeholder="Skripte suchen…"
            value={searchInput()}
            onInput={(e) => setSearchInput(e.currentTarget.value)}
            spellcheck={false}
            autocomplete="off"
          />
          <select
            class="browser-sort"
            value={sort()}
            onChange={(e) => setSort(e.currentTarget.value as SortKey)}
            title="Sortierung"
          >
            <option value="updated">Letzte Bearbeitung</option>
            <option value="created">Erstelldatum</option>
            <option value="title">Alphabetisch</option>
          </select>
        </div>

        <div class="browser-main">
          <div class="browser-list-wrap">
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
                <ul class="script-list" onKeyDown={onRowKey}>
                  <For each={list()}>
                    {(s) => (
                      <ScriptRow
                        script={s}
                        selected={selectedId() === s.id}
                        onClick={() => onRowClick(s)}
                        onDoubleClick={(e) => onRowDouble(s, e)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setSelectedId(s.id);
                          setContextMenu({ x: e.clientX, y: e.clientY, script: s });
                        }}
                        onMore={(e) => {
                          setSelectedId(s.id);
                          setContextMenu({
                            x: e.clientX,
                            y: e.clientY,
                            script: s,
                          });
                        }}
                      />
                    )}
                  </For>
                </ul>

                <div class="list-foot">
                  <button
                    class="btn list-foot-new"
                    onClick={() => openNewScript()}
                  >
                    Neues Skript&nbsp;&nbsp;<span aria-hidden="true">+</span>
                  </button>
                </div>
              </Show>
            </Show>
          </div>

          <Show when={selected()}>
            {(s) => <DetailPane script={s()} onOpen={() => openScript(s())} />}
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

      <Show when={renameTarget()}>
        {(t) => (
          <Portal>
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
                  <button class="btn" onClick={() => setRenameTarget(null)}>
                    Abbrechen
                  </button>
                  <button class="btn btn-primary" onClick={commitRename}>
                    Speichern
                  </button>
                </div>
              </div>
            </div>
          </Portal>
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

interface ScriptRowProps {
  script: ScriptSummary;
  selected: boolean;
  onClick: () => void;
  onDoubleClick: (e: MouseEvent) => void;
  onContextMenu: (e: MouseEvent) => void;
  onMore: (e: MouseEvent) => void;
}

function ScriptRow(props: ScriptRowProps) {
  const charSummary = () => {
    const cs = props.script.characters;
    if (cs.length === 0) return "Keine Charaktere";
    return cs.map((c) => c.name).join(" · ");
  };

  return (
    <li
      class="script-row"
      classList={{ "is-selected": props.selected }}
      tabIndex={0}
      onClick={props.onClick}
      onDblClick={props.onDoubleClick}
      onContextMenu={props.onContextMenu}
    >
      <span class="script-row-icon" aria-hidden="true">
        <DocIcon />
      </span>
      <div class="script-row-text">
        <div class="script-row-title">{props.script.title}</div>
        <div class="script-row-sub muted">{charSummary()}</div>
      </div>
      <button
        class="script-row-more"
        aria-label="Mehr"
        onClick={(e) => {
          e.stopPropagation();
          props.onMore(e);
        }}
      >
        ···
      </button>
      <div class="script-row-time muted">
        {relativeTime(props.script.updated_at)}
      </div>
      <div class="script-row-pages muted">
        {formatPageCount(props.script.page_count)}
      </div>
    </li>
  );
}

function DetailPane(props: { script: ScriptSummary; onOpen: () => void }) {
  const highlightingLabel = () => {
    const v = props.script.highlighting_enabled;
    if (v === 1) return "An";
    if (v === 0) return "Aus";
    return settingsStore.highlightingDefault() ? "An (Standard)" : "Aus (Standard)";
  };
  return (
    <aside class="detail-pane">
      <div class="detail-head">
        <span class="detail-icon" aria-hidden="true"><DocIcon /></span>
        <span class="detail-title">{props.script.title}</span>
      </div>

      <div class="detail-section">
        <div class="detail-label">Titel</div>
        <div class="detail-value">{props.script.title}</div>
      </div>

      <Show when={props.script.characters.length > 0}>
        <div class="detail-section">
          <div class="detail-label">Charaktere</div>
          <div class="detail-chars">
            <For each={props.script.characters}>
              {(c) => (
                <span class="detail-char-pill">
                  <span class="detail-char-dot" style={{ background: c.color }} />
                  {c.name}
                </span>
              )}
            </For>
          </div>
        </div>
      </Show>

      <div class="detail-section">
        <div class="detail-label">Highlighting</div>
        <div class="detail-value">{highlightingLabel()}</div>
      </div>

      <div class="detail-section">
        <div class="detail-label">Seiten</div>
        <div class="detail-value">{props.script.page_count}</div>
      </div>

      <div class="detail-section">
        <div class="detail-label">Zuletzt bearbeitet</div>
        <div class="detail-value">{relativeTime(props.script.updated_at)}</div>
      </div>

      <div class="detail-section">
        <div class="detail-label">Erstellt</div>
        <div class="detail-value">{formatAbsolute(props.script.created_at)}</div>
      </div>

      <div class="detail-actions">
        <button class="btn btn-primary detail-open" onClick={props.onOpen}>
          Skript öffnen
        </button>
      </div>
    </aside>
  );
}

function DocIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M5 3h7l3 3v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M12 3v3h3" />
    </svg>
  );
}
