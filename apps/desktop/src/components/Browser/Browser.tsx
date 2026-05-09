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
import type { Folder, ScriptSummary } from "~/lib/types";
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
import { ConfirmDialog } from "~/components/Common/ConfirmDialog";
import { scriptsBus } from "~/lib/scriptsBus";
import { foldersBus } from "~/lib/foldersBus";
import { FolderChips, SCRIPT_DRAG_MIME } from "./FolderChips";
import "./Browser.css";

type Region = "scripts" | "trash";
type SortKey = "updated" | "created" | "title";
type ViewMode = "grid" | "list";

const VIEW_STATE_KEY = "browser.view_mode";
const ACTIVE_FOLDER_STATE_KEY = "browser.active_folder";
const RECENT_GRID_COUNT = 4;
const PAGE_SIZE = 200;

export interface BrowserProps {
  /** Called with the currently active folder filter so the App-level
   * NewScriptDialog can pre-select it. */
  onNewScript?: (folderId: string | null) => void;
}

export function Browser(props: BrowserProps = {}) {
  const [activeRegion, setActiveRegion] = createSignal<Region>("scripts");
  const [searchInput, setSearchInput] = createSignal("");
  const [debouncedSearch, setDebouncedSearch] = createSignal("");
  const [sort, setSort] = createSignal<SortKey>("updated");
  const [viewMode, setViewMode] = createSignal<ViewMode>("grid");
  const [activeFolderId, setActiveFolderId] = createSignal<string | null>(null);

  const [contextMenu, setContextMenu] = createSignal<{
    x: number;
    y: number;
    items: ContextMenuItem[];
  } | null>(null);
  const [renameTarget, setRenameTarget] = createSignal<ScriptSummary | null>(null);
  const [renameValue, setRenameValue] = createSignal("");
  const [folderRenameTarget, setFolderRenameTarget] = createSignal<Folder | null>(
    null,
  );
  const [folderRenameValue, setFolderRenameValue] = createSignal("");
  const [folderCreateOpen, setFolderCreateOpen] = createSignal(false);
  const [folderCreateValue, setFolderCreateValue] = createSignal("");
  const [folderDeleteTarget, setFolderDeleteTarget] = createSignal<Folder | null>(
    null,
  );

  // Restore persisted view mode + active folder. Active folder is
  // remembered across launches so the user lands in the same place; if
  // the folder was deleted we fall back to "Alle".
  onMount(async () => {
    try {
      const v = await api.getAppState(VIEW_STATE_KEY);
      if (v === "list" || v === "grid") setViewMode(v);
    } catch {}
    try {
      const f = await api.getAppState(ACTIVE_FOLDER_STATE_KEY);
      if (typeof f === "string" && f.length > 0) setActiveFolderId(f);
    } catch {}
  });
  createEffect(() => {
    const v = viewMode();
    void api.setAppState(VIEW_STATE_KEY, v).catch(() => {});
  });
  createEffect(() => {
    const f = activeFolderId();
    void api.setAppState(ACTIVE_FOLDER_STATE_KEY, f ?? "").catch(() => {});
  });

  function openNewScript() {
    props.onNewScript?.(activeFolderId());
  }

  const debouncedSetSearch = debounce((v: string) => setDebouncedSearch(v), 350);
  createEffect(() => {
    const v = searchInput();
    debouncedSetSearch(v);
  });
  onCleanup(() => debouncedSetSearch.cancel());

  const [pageLimit, setPageLimit] = createSignal(PAGE_SIZE);

  // Reset paging whenever the query, sort or folder changes.
  createEffect(() => {
    void debouncedSearch();
    void sort();
    void activeFolderId();
    setPageLimit(PAGE_SIZE);
  });

  const queryKey = createMemo(() => ({
    query: debouncedSearch(),
    sort: sort(),
    folderId: activeFolderId(),
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
        folderId: q.folderId,
      }),
    { initialValue: [] },
  );

  // Folders + total count for the "Alle" chip. Both refetch whenever
  // folders OR scripts change (counts move when scripts are added,
  // archived, moved or purged).
  const folderKey = createMemo(() => ({
    fv: foldersBus.version(),
    sv: scriptsBus.version(),
  }));
  const [folders] = createResource(folderKey, () => api.listFolders(), {
    initialValue: [],
  });
  const [allCount] = createResource(folderKey, () => api.countLiveScripts(), {
    initialValue: 0,
  });

  // If the active folder was deleted out from under us, fall back to "Alle".
  createEffect(() => {
    const id = activeFolderId();
    const list = folders() ?? [];
    if (id && !folders.loading && list.length >= 0) {
      if (!list.find((f) => f.id === id)) {
        setActiveFolderId(null);
      }
    }
  });

  const list = createMemo(() => scripts() ?? []);

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

  const activeFolderName = createMemo(() => {
    const id = activeFolderId();
    if (!id) return null;
    return folders()?.find((f) => f.id === id)?.name ?? null;
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
      foldersBus.bump();
    } catch (e) {
      pushToast(`Fehler: ${(e as Error).message}`, "error");
    }
  }
  async function duplicate(s: ScriptSummary) {
    try {
      const dup = await api.duplicateScript(s.id);
      pushToast("Skript dupliziert", "ok");
      scriptsBus.bump();
      foldersBus.bump();
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

  async function moveScriptTo(s: ScriptSummary, folderId: string | null) {
    try {
      await api.moveScript(s.id, folderId);
      const fname =
        folderId === null
          ? "Alle"
          : folders()?.find((f) => f.id === folderId)?.name ?? "Ordner";
      pushToast(`Verschoben nach „${fname}"`, "ok");
      scriptsBus.bump();
      foldersBus.bump();
    } catch (e) {
      pushToast(`Fehler: ${(e as Error).message}`, "error");
    }
  }

  function ctxMenuItems(s: ScriptSummary): ContextMenuItem[] {
    const moveChildren: ContextMenuItem[] = [];
    moveChildren.push({
      label: "Kein Ordner",
      onClick: () => void moveScriptTo(s, null),
      disabled: s.folder_id === null,
    });
    const fs = folders() ?? [];
    if (fs.length > 0) {
      for (const f of fs) {
        moveChildren.push({
          label: f.name,
          onClick: () => void moveScriptTo(s, f.id),
          disabled: s.folder_id === f.id,
        });
      }
    }
    moveChildren.push({
      label: "Neuer Ordner…",
      onClick: () => {
        // Open the create-folder modal; once created, move the script there.
        // We thread the script through a one-shot pending state so the
        // create flow knows what to do next.
        setPendingMoveAfterCreate(s);
        setFolderCreateValue("");
        setFolderCreateOpen(true);
      },
    });

    return [
      { label: "Öffnen", onClick: () => openScript(s) },
      { label: "In neuem Tab öffnen", onClick: () => openScript(s, true) },
      { label: "Umbenennen", onClick: () => startRename(s) },
      { label: "Duplizieren", onClick: () => void duplicate(s) },
      { label: "In Ordner verschieben", children: moveChildren },
      {
        label: "In Papierkorb verschieben",
        onClick: () => void archive(s),
        danger: true,
      },
    ];
  }

  // Right-click on a folder chip → rename / delete.
  function folderChipMenu(folder: Folder, ev: MouseEvent) {
    setContextMenu({
      x: ev.clientX,
      y: ev.clientY,
      items: [
        {
          label: "Umbenennen",
          onClick: () => {
            setFolderRenameTarget(folder);
            setFolderRenameValue(folder.name);
          },
        },
        {
          label: "Ordner löschen",
          onClick: () => setFolderDeleteTarget(folder),
          danger: true,
        },
      ],
    });
  }

  const [pendingMoveAfterCreate, setPendingMoveAfterCreate] =
    createSignal<ScriptSummary | null>(null);

  async function commitFolderCreate() {
    const v = folderCreateValue().trim();
    if (!v) {
      setFolderCreateOpen(false);
      setPendingMoveAfterCreate(null);
      return;
    }
    try {
      const created = await api.createFolder(v);
      foldersBus.bump();
      const pending = pendingMoveAfterCreate();
      if (pending) {
        await api.moveScript(pending.id, created.id);
        scriptsBus.bump();
        foldersBus.bump();
        pushToast(`Verschoben nach „${created.name}"`, "ok");
      } else {
        pushToast(`Ordner „${created.name}" angelegt`, "ok");
      }
    } catch (e) {
      pushToast(`Fehler: ${(e as Error).message}`, "error");
    } finally {
      setFolderCreateOpen(false);
      setPendingMoveAfterCreate(null);
    }
  }

  async function commitFolderRename() {
    const target = folderRenameTarget();
    if (!target) return;
    const v = folderRenameValue().trim();
    if (!v || v === target.name) {
      setFolderRenameTarget(null);
      return;
    }
    try {
      await api.renameFolder(target.id, v);
      pushToast("Ordner umbenannt", "ok");
      foldersBus.bump();
    } catch (e) {
      pushToast(`Fehler: ${(e as Error).message}`, "error");
    } finally {
      setFolderRenameTarget(null);
    }
  }

  async function commitFolderDelete() {
    const target = folderDeleteTarget();
    if (!target) return;
    try {
      await api.deleteFolder(target.id);
      pushToast(`Ordner „${target.name}" gelöscht`, "ok");
      // ON DELETE SET NULL leaves scripts intact in "Alle" — refresh both.
      if (activeFolderId() === target.id) setActiveFolderId(null);
      foldersBus.bump();
      scriptsBus.bump();
    } catch (e) {
      pushToast(`Fehler: ${(e as Error).message}`, "error");
    } finally {
      setFolderDeleteTarget(null);
    }
  }

  function isWelcome() {
    return (
      !scripts.loading &&
      !isSearching() &&
      list().length === 0 &&
      activeFolderId() === null &&
      (folders() ?? []).length === 0
    );
  }

  function isEmptyFolder() {
    return (
      !scripts.loading &&
      !isSearching() &&
      list().length === 0 &&
      activeFolderId() !== null
    );
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
        </div>
      </header>

      <Show when={activeRegion() === "scripts"}>
        <FolderChips
          folders={folders() ?? []}
          activeFolderId={activeFolderId()}
          allCount={allCount() ?? 0}
          onSelect={(id) => setActiveFolderId(id)}
          onCreateFolder={() => {
            setPendingMoveAfterCreate(null);
            setFolderCreateValue("");
            setFolderCreateOpen(true);
          }}
          onChipContextMenu={folderChipMenu}
          onDropScript={(folderId, scriptId) => {
            const s = list().find((x) => x.id === scriptId);
            if (s && s.folder_id !== folderId) {
              void moveScriptTo(s, folderId);
            }
          }}
        />

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
            <Show
              when={!isEmptyFolder()}
              fallback={
                <div class="empty-folder">
                  <p class="muted">
                    „{activeFolderName()}" ist leer.
                  </p>
                  <p class="muted small">
                    Skripte hierher ziehen oder per Rechtsklick „In Ordner
                    verschieben" zuweisen.
                  </p>
                </div>
              }
            >
              <Show when={list().length > 0 || scripts.loading}>
                <Show when={!isSearching() && recent().length > 0}>
                  <section class="browser-section">
                    <div class="browser-section-head">
                      <h2 class="browser-section-title">
                        <Show
                          when={activeFolderName()}
                          fallback={"Zuletzt bearbeitet"}
                        >
                          Zuletzt in „{activeFolderName()}"
                        </Show>
                      </h2>
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
                            setContextMenu({
                              x: e.clientX,
                              y: e.clientY,
                              items: ctxMenuItems(s),
                            })
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
                                  items: ctxMenuItems(s),
                                });
                              }}
                              onMore={(e) =>
                                setContextMenu({
                                  x: e.clientX,
                                  y: e.clientY,
                                  items: ctxMenuItems(s),
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
                          setContextMenu({
                            x: e.clientX,
                            y: e.clientY,
                            items: ctxMenuItems(s),
                          })
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
                      <Show when={activeFolderName()}>
                        {" "}
                        in „{activeFolderName()}"
                      </Show>
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
            items={cm().items}
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

      <Modal
        open={folderCreateOpen()}
        onClose={() => {
          setFolderCreateOpen(false);
          setPendingMoveAfterCreate(null);
        }}
        title="Neuer Ordner"
        footer={
          <>
            <button
              class="btn"
              onClick={() => {
                setFolderCreateOpen(false);
                setPendingMoveAfterCreate(null);
              }}
            >
              Abbrechen
            </button>
            <button class="btn btn-primary" onClick={commitFolderCreate}>
              Anlegen
            </button>
          </>
        }
      >
        <div class="field">
          <label>Name</label>
          <input
            type="text"
            value={folderCreateValue()}
            placeholder="z. B. TikTok"
            autofocus
            onInput={(e) => setFolderCreateValue(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commitFolderCreate();
            }}
          />
        </div>
      </Modal>

      <Modal
        open={folderRenameTarget() !== null}
        onClose={() => setFolderRenameTarget(null)}
        title="Ordner umbenennen"
        footer={
          <>
            <button class="btn" onClick={() => setFolderRenameTarget(null)}>
              Abbrechen
            </button>
            <button class="btn btn-primary" onClick={commitFolderRename}>
              Speichern
            </button>
          </>
        }
      >
        <Show when={folderRenameTarget()}>
          {(t) => (
            <div class="field">
              <label>Neuer Name</label>
              <input
                type="text"
                value={folderRenameValue()}
                autofocus
                onInput={(e) => setFolderRenameValue(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void commitFolderRename();
                }}
              />
              <div class="muted small">Aktuell: {t().name}</div>
            </div>
          )}
        </Show>
      </Modal>

      <Show when={folderDeleteTarget()}>
        {(t) => (
          <ConfirmDialog
            open={true}
            title={`„${t().name}" löschen?`}
            body={
              t().script_count === 0
                ? "Der Ordner ist leer."
                : t().script_count === 1
                ? `Das eine Skript darin bleibt erhalten und ist danach unter „Alle" zu finden.`
                : `Die ${t().script_count} Skripte darin bleiben erhalten und sind danach unter „Alle" zu finden.`
            }
            confirmLabel="Löschen"
            danger
            onCancel={() => setFolderDeleteTarget(null)}
            onConfirm={() => void commitFolderDelete()}
          />
        )}
      </Show>
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
  const [dragging, setDragging] = createSignal(false);
  return (
    <article
      class="card"
      classList={{ "is-dragging": dragging() }}
      draggable={true}
      onDragStart={(e) => {
        if (!e.dataTransfer) return;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData(SCRIPT_DRAG_MIME, props.script.id);
        // Plain-text fallback so OS-level drop feedback isn't empty.
        e.dataTransfer.setData("text/plain", props.script.title);
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
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
  const [dragging, setDragging] = createSignal(false);
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
      classList={{ "is-dragging": dragging() }}
      role="row"
      tabIndex={0}
      draggable={true}
      onDragStart={(e) => {
        if (!e.dataTransfer) return;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData(SCRIPT_DRAG_MIME, props.script.id);
        e.dataTransfer.setData("text/plain", props.script.title);
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
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
