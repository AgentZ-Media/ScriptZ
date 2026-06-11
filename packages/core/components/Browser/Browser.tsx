import {
  createSignal,
  createMemo,
  createResource,
  createEffect,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import type { Folder, ScriptSummary } from "../../lib/types";
import { api } from "../../lib/api";
import { tabsStore } from "../../stores/tabs";
import { pushToast } from "../../stores/toasts";
import { K } from "../../lib/keys";
import { debounce } from "../../lib/format";
import { exportScriptsToPdf } from "../../lib/exportSelection";
import { t, tPlural } from "../../i18n";
import { ScriptContextMenu, type ContextMenuItem } from "./ScriptContextMenu";
import { SelectionBar } from "./SelectionBar";
import { HandoffDialog } from "./HandoffDialog";
import { settingsStore } from "../../stores/settings";
import { tryParseConnectCode } from "../../lib/handoff";
import { TrashView } from "./TrashView";
import { scriptsBus } from "../../lib/scriptsBus";
import { foldersBus } from "../../lib/foldersBus";
import { INBOX_FOLDER_ID } from "../../lib/folders";
import { FolderChips } from "./FolderChips";
import { BrowserHeader, type ViewMode } from "./BrowserHeader";
import { BrowserList } from "./BrowserList";
import { BrowserDialogs } from "./BrowserDialogs";
import { SortPopover, type SortKey } from "./SortPopover";
import "./Browser.css";

type Region = "scripts" | "trash";

const VIEW_STATE_KEY = "browser.view_mode";
const ACTIVE_FOLDER_STATE_KEY = "browser.active_folder";
const PAGE_SIZE = 200;

export interface BrowserProps {
  /** Called with the currently active folder filter so the App-level
   * NewScriptDialog can pre-select it. */
  onNewScript?: (folderId: string | null) => void;
  /** Opens the global command palette (⌘K). */
  onOpenCmdK?: () => void;
}

/**
 * Home / browser — fully reworked after re-design `home.jsx`:
 *
 *   1. Greeting (time-of-day dependent + "What are you writing today?")
 *   2. MomentumStrip (continue writing + streak + today + activity ↗)
 *   3. Header row: round search · list/grid toggle · trash icon ·
 *      settings icon · "+ New" primary button
 *   4. Folder chips (All | divider | user folders | + folder)
 *   5. Sort bar (count on the left, sort on the right)
 *   6. Body: ONE list/grid, grouped by today/yesterday/this week/
 *      this month/older (no more "recent + older" split)
 *   7. List is the default — grid via toggle
 *
 * Composition: header, list/grid and the modal dialogs live in their
 * own sibling files (`BrowserHeader`, `BrowserList`, `BrowserDialogs`).
 * This file keeps the state, resources and action handlers and wires
 * everything together.
 */
export function Browser(props: BrowserProps = {}) {
  const [activeRegion, setActiveRegion] = createSignal<Region>("scripts");
  const [searchInput, setSearchInput] = createSignal("");
  const [debouncedSearch, setDebouncedSearch] = createSignal("");
  const [sort, setSort] = createSignal<SortKey>("updated");
  const [viewMode, setViewMode] = createSignal<ViewMode>("list"); // List is default
  const [activeFolderId, setActiveFolderId] = createSignal<string | null>(null);
  // Gate persistence until onMount has read the persisted state.
  // Without this the createEffects below fire synchronously on mount with
  // the default values (list / null) and overwrite the persisted state
  // before getAppState resolves — the next visit to the Browser then
  // shows "All" instead of the last open folder.
  const [hydrated, setHydrated] = createSignal(false);

  const [contextMenu, setContextMenu] = createSignal<{
    x: number;
    y: number;
    items: ContextMenuItem[];
  } | null>(null);
  const [renameTarget, setRenameTarget] = createSignal<ScriptSummary | null>(null);
  const [renameValue, setRenameValue] = createSignal("");
  const [folderRenameTarget, setFolderRenameTarget] = createSignal<Folder | null>(null);
  const [folderRenameValue, setFolderRenameValue] = createSignal("");
  const [folderCreateOpen, setFolderCreateOpen] = createSignal(false);
  const [folderCreateValue, setFolderCreateValue] = createSignal("");
  const [folderDeleteTarget, setFolderDeleteTarget] = createSignal<Folder | null>(null);
  const [sortMenuOpen, setSortMenuOpen] = createSignal<{ x: number; y: number } | null>(null);
  const [pendingMoveAfterCreate, setPendingMoveAfterCreate] =
    createSignal<ScriptSummary | null>(null);

  // ---- Multi-select (Studio handoff + multi-PDF) ----
  const [selectMode, setSelectMode] = createSignal(false);
  const [selectedIds, setSelectedIds] = createSignal<Set<string>>(new Set());
  const [handoffOpen, setHandoffOpen] = createSignal(false);
  const selectedCount = createMemo(() => selectedIds().size);
  // No (parseable) connect code -> no Studio surface anywhere (most users
  // have none, and a broken code must behave like none).
  const studioConnected = createMemo(
    () => tryParseConnectCode(settingsStore.studioConnectCode()) !== null,
  );

  // Restore persisted view mode + active folder.
  onMount(async () => {
    try {
      const v = await api.getAppState(VIEW_STATE_KEY);
      if (v === "list" || v === "grid") setViewMode(v);
    } catch {}
    try {
      const f = await api.getAppState(ACTIVE_FOLDER_STATE_KEY);
      if (typeof f === "string" && f.length > 0) setActiveFolderId(f);
    } catch {}
    setHydrated(true);
  });
  createEffect(() => {
    if (!hydrated()) return;
    const v = viewMode();
    void api.setAppState(VIEW_STATE_KEY, v).catch(() => {});
  });
  createEffect(() => {
    if (!hydrated()) return;
    const f = activeFolderId();
    void api.setAppState(ACTIVE_FOLDER_STATE_KEY, f ?? "").catch(() => {});
  });

  function openNewScript() {
    // In the virtual Inbox, a new script is simply ungrouped (folder = null),
    // which lands it right back in the Inbox.
    const fid = activeFolderId();
    props.onNewScript?.(fid === INBOX_FOLDER_ID ? null : fid);
  }

  async function onImportScriptz() {
    try {
      const result = await api.importScriptz();
      if (!result) return; // User cancelled
      scriptsBus.bump();
      foldersBus.bump();
      tabsStore.openScript(result.scriptId, result.title);
      pushToast(t("script.toast.imported"), "ok");
    } catch (e) {
      pushToast(t("script.toast.importFailed", { message: (e as Error).message ?? String(e) }), "error");
    }
  }

  const debouncedSetSearch = debounce((v: string) => setDebouncedSearch(v), 350);
  createEffect(() => {
    const v = searchInput();
    debouncedSetSearch(v);
  });
  onCleanup(() => debouncedSetSearch.cancel());

  const [pageLimit, setPageLimit] = createSignal(PAGE_SIZE);

  createEffect(() => {
    void debouncedSearch();
    void sort();
    void activeFolderId();
    setPageLimit(PAGE_SIZE);
  });

  // Leaving the current scope (folder switch, search, region change) drops any
  // in-progress selection so the user never sends items from another context.
  createEffect(() => {
    void activeFolderId();
    void debouncedSearch();
    void activeRegion();
    setSelectMode(false);
    setSelectedIds(new Set<string>());
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

  // Inbox = live scripts that sit in no folder. Each item is in exactly one
  // folder or none, so allCount minus the sum of per-folder counts is the
  // ungrouped remainder — no extra query needed.
  const inboxCount = createMemo(() => {
    const grouped = (folders() ?? []).reduce((n, f) => n + f.script_count, 0);
    return Math.max(0, (allCount() ?? 0) - grouped);
  });

  // If the active folder was deleted → "All". The Inbox sentinel is not a
  // real folder, so exempt it — but if folders are gone entirely (the Inbox
  // chip is then hidden), fall back to "All".
  createEffect(() => {
    const id = activeFolderId();
    if (!id || folders.loading) return;
    const list = folders() ?? [];
    if (id === INBOX_FOLDER_ID) {
      if (list.length === 0) setActiveFolderId(null);
      return;
    }
    if (!list.find((f) => f.id === id)) {
      setActiveFolderId(null);
    }
  });

  // Scripts whose archive call is currently in flight. Optimistically
  // hidden from `list()` so MomentumStrip + the list no longer show
  // the just-trashed title as a "continue writing" ghost
  // before the refetch is done. Must be declared BEFORE `list` because
  // the createMemo callback reads pendingArchive(), and the signal
  // would otherwise still be in TDZ on the first tracking run.
  const [pendingArchive, setPendingArchive] = createSignal<Set<string>>(new Set());
  const list = createMemo(() => {
    const all = scripts() ?? [];
    const archiving = pendingArchive();
    if (archiving.size === 0) return all;
    return all.filter((s) => !archiving.has(s.id));
  });
  const hasMore = createMemo(() => list().length >= pageLimit());
  const isSearching = createMemo(() => debouncedSearch().trim().length > 0);
  const activeFolderName = createMemo(() => {
    const id = activeFolderId();
    if (!id) return null;
    if (id === INBOX_FOLDER_ID) return t("folder.inbox");
    return folders()?.find((f) => f.id === id)?.name ?? null;
  });

  // ---- Row actions ----
  function openScript(s: ScriptSummary, newTab = false) {
    tabsStore.openScript(s.id, s.title, { newTab });
  }

  // ---- Selection actions ----
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAllVisible() {
    setSelectedIds(new Set(list().map((s) => s.id)));
  }
  function exitSelect() {
    setSelectMode(false);
    setSelectedIds(new Set<string>());
  }
  async function exportSelectedPdf() {
    const ids = [...selectedIds()];
    if (ids.length === 0) {
      pushToast(t("select.empty"), "info");
      return;
    }
    try {
      const res = await exportScriptsToPdf(ids, {
        includeHighlighting: false,
        includeTitlePage: true,
      });
      if (res.cancelled) return;
      pushToast(tPlural("select.pdf.toast", res.count), "ok");
    } catch (e) {
      pushToast(t("select.pdf.failed", { message: (e as Error).message ?? String(e) }), "error");
    }
  }
  function onHandoffSent() {
    exitSelect();
    scriptsBus.bump();
    foldersBus.bump();
  }

  async function archive(s: ScriptSummary) {
    setPendingArchive((prev) => {
      const next = new Set(prev);
      next.add(s.id);
      return next;
    });
    try {
      await api.archiveScript(s.id);
      pushToast(t("script.toast.archived", { title: s.title }), "ok");
      scriptsBus.bump();
      foldersBus.bump();
    } catch (e) {
      pushToast(t("common.errorPrefix", { message: (e as Error).message }), "error");
    } finally {
      setPendingArchive((prev) => {
        if (!prev.has(s.id)) return prev;
        const next = new Set(prev);
        next.delete(s.id);
        return next;
      });
    }
  }
  async function duplicate(s: ScriptSummary) {
    try {
      const dup = await api.duplicateScript(s.id);
      pushToast(t("script.toast.duplicated"), "ok");
      scriptsBus.bump();
      foldersBus.bump();
      tabsStore.openScript(dup.id, dup.title, { newTab: true });
    } catch (e) {
      pushToast(t("common.errorPrefix", { message: (e as Error).message }), "error");
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
    // Empty titles are neither saved nor silently close the
    // dialog - otherwise it would feel like the user deleted the title.
    if (!v) return;
    if (v === target.title) {
      setRenameTarget(null);
      return;
    }
    try {
      const updated = await api.renameScript(target.id, v);
      tabsStore.setScriptTitle(target.id, updated.title);
      pushToast(t("script.toast.renamed"), "ok");
      scriptsBus.bump();
    } catch (e) {
      pushToast(t("common.errorPrefix", { message: (e as Error).message }), "error");
    } finally {
      setRenameTarget(null);
    }
  }

  async function moveScriptTo(s: ScriptSummary, folderId: string | null) {
    try {
      await api.moveScript(s.id, folderId);
      const fname =
        folderId === null
          ? t("folder.all")
          : folders()?.find((f) => f.id === folderId)?.name ?? t("folder.new");
      pushToast(t("folder.toast.movedTo", { name: fname }), "ok");
      scriptsBus.bump();
      foldersBus.bump();
    } catch (e) {
      pushToast(t("common.errorPrefix", { message: (e as Error).message }), "error");
    }
  }

  function ctxMenuItems(s: ScriptSummary): ContextMenuItem[] {
    const moveChildren: ContextMenuItem[] = [];
    moveChildren.push({
      label: t("folder.none"),
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
      label: t("folder.newDots"),
      onClick: () => {
        setPendingMoveAfterCreate(s);
        setFolderCreateValue("");
        setFolderCreateOpen(true);
      },
    });

    return [
      { label: t("script.menu.open"), onClick: () => openScript(s) },
      { label: t("script.menu.openNewTab"), onClick: () => openScript(s, true) },
      { label: t("script.menu.rename"), onClick: () => startRename(s) },
      { label: t("script.menu.duplicate"), onClick: () => void duplicate(s) },
      { label: t("script.menu.move"), children: moveChildren },
      {
        label: t("script.menu.trash"),
        onClick: () => void archive(s),
        danger: true,
      },
    ];
  }

  function folderChipMenu(folder: Folder, ev: MouseEvent) {
    setContextMenu({
      x: ev.clientX,
      y: ev.clientY,
      items: [
        {
          label: t("folder.menu.rename"),
          onClick: () => {
            setFolderRenameTarget(folder);
            setFolderRenameValue(folder.name);
          },
        },
        {
          label: t("folder.menu.delete"),
          onClick: () => setFolderDeleteTarget(folder),
          danger: true,
        },
      ],
    });
  }

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
        pushToast(t("folder.toast.movedTo", { name: created.name }), "ok");
      } else {
        pushToast(t("folder.toast.created", { name: created.name }), "ok");
      }
    } catch (e) {
      pushToast(t("common.errorPrefix", { message: (e as Error).message }), "error");
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
      pushToast(t("folder.toast.renamed"), "ok");
      foldersBus.bump();
    } catch (e) {
      pushToast(t("common.errorPrefix", { message: (e as Error).message }), "error");
    } finally {
      setFolderRenameTarget(null);
    }
  }

  async function commitFolderDelete() {
    const target = folderDeleteTarget();
    if (!target) return;
    try {
      await api.deleteFolder(target.id);
      pushToast(t("folder.toast.deleted", { name: target.name }), "ok");
      if (activeFolderId() === target.id) setActiveFolderId(null);
      foldersBus.bump();
      scriptsBus.bump();
    } catch (e) {
      pushToast(t("common.errorPrefix", { message: (e as Error).message }), "error");
    } finally {
      setFolderDeleteTarget(null);
    }
  }

  function isWelcome() {
    return (
      !isSearching() &&
      list().length === 0 &&
      activeFolderId() === null &&
      (folders() ?? []).length === 0
    );
  }
  function isEmptyFolder() {
    return (
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

  // Right-click on empty area of the overview → quick-create menu.
  // Inner handlers (script rows, folder chips) call preventDefault first,
  // so we only show the canvas menu when nothing else handled it.
  function onHomeContextMenu(e: MouseEvent) {
    if (e.defaultPrevented) return;
    if (activeRegion() !== "scripts") return;
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: t("browser.canvas.newScript"),
          onClick: () => openNewScript(),
        },
        {
          label: t("browser.canvas.newFolder"),
          onClick: () => {
            setPendingMoveAfterCreate(null);
            setFolderCreateValue("");
            setFolderCreateOpen(true);
          },
        },
      ],
    });
  }

  return (
    <div class="home" onContextMenu={onHomeContextMenu}>
      <Show when={activeRegion() === "scripts"}>
        <BrowserHeader
          searchInput={searchInput()}
          onSearchInput={setSearchInput}
          searchInputRef={(el) => (searchInputRef = el)}
          viewMode={viewMode()}
          onViewMode={setViewMode}
          isTrashActive={activeRegion() === "trash"}
          onToggleTrash={() => setActiveRegion((r) => (r === "trash" ? "scripts" : "trash"))}
          onImport={onImportScriptz}
          onNewScript={openNewScript}
          onOpenCmdK={props.onOpenCmdK}
          lastScript={list()[0] ?? null}
          onContinueScript={(s) => openScript(s)}
        />

        <FolderChips
          folders={folders() ?? []}
          activeFolderId={activeFolderId()}
          allCount={allCount() ?? 0}
          inboxCount={inboxCount()}
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

        <Show when={!isWelcome()}>
          <div class="home-selbar">
            <SelectionBar
              active={selectMode()}
              count={selectedCount()}
              canEnter={list().length > 0}
              onEnter={() => setSelectMode(true)}
              onExit={exitSelect}
              onSelectAll={selectAllVisible}
              onClear={() => setSelectedIds(new Set<string>())}
              onSend={studioConnected() ? () => setHandoffOpen(true) : undefined}
              onExportPdf={() => void exportSelectedPdf()}
            />
          </div>
        </Show>

        <Show when={!isWelcome()} fallback={
          <div class="home-welcome">
            <div class="home-empty-mark">z</div>
            <div class="home-empty-h">{t("browser.welcome.title")}</div>
            <div class="home-empty-sub">
              {t("browser.welcome.body")}
            </div>
            <div class="home-empty-actions">
              <button class="btn btn-primary" onClick={() => openNewScript()}>
                <span aria-hidden="true">+</span> {t("browser.newScript")}
              </button>
            </div>
            <div class="home-empty-hint">
              {(() => {
                const parts = t("browser.welcome.hint").split("{key}");
                return (
                  <>
                    {parts[0]}
                    <span class="kbd kbd-inline">{K("Mod+N")}</span>
                    {parts[1] ?? ""}
                  </>
                );
              })()}
            </div>
          </div>
        }>
          <BrowserList
            items={list()}
            folders={folders() ?? []}
            sort={sort()}
            viewMode={viewMode()}
            isSearching={isSearching()}
            searchQuery={debouncedSearch()}
            activeFolderName={activeFolderName()}
            hasMore={hasMore()}
            pageSize={PAGE_SIZE}
            onLoadMore={() => setPageLimit((n) => n + PAGE_SIZE)}
            onOpenSortMenu={(x, y) => setSortMenuOpen({ x, y })}
            onOpenScript={(s) => openScript(s)}
            onScriptContextMenu={(s, e) => setContextMenu({
              x: e.clientX, y: e.clientY,
              items: ctxMenuItems(s),
            })}
            onScriptMore={(s, e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setContextMenu({
                x: r.right - 240, y: r.bottom + 4,
                items: ctxMenuItems(s),
              });
            }}
            isEmptyFolder={isEmptyFolder()}
            selectMode={selectMode()}
            selectedIds={selectedIds()}
            onToggleSelect={toggleSelect}
          />
        </Show>
      </Show>

      <Show when={activeRegion() === "trash"}>
        <div class="trash-header">
          <button class="btn btn-ghost" onClick={() => setActiveRegion("scripts")}>
            {t("browser.backToOverview")}
          </button>
        </div>
        <TrashView onTrashEmptiedByRestore={() => setActiveRegion("scripts")} />
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

      <Show when={sortMenuOpen()}>
        {(at) => (
          <SortPopover
            x={at().x}
            y={at().y}
            current={sort()}
            onPick={(id) => { setSort(id); setSortMenuOpen(null); }}
            onClose={() => setSortMenuOpen(null)}
          />
        )}
      </Show>

      <BrowserDialogs
        renameTarget={renameTarget()}
        renameValue={renameValue()}
        onRenameValue={setRenameValue}
        onRenameClose={() => setRenameTarget(null)}
        onRenameCommit={() => void commitRename()}
        folderCreateOpen={folderCreateOpen()}
        folderCreateValue={folderCreateValue()}
        onFolderCreateValue={setFolderCreateValue}
        onFolderCreateClose={() => {
          setFolderCreateOpen(false);
          setPendingMoveAfterCreate(null);
        }}
        onFolderCreateCommit={() => void commitFolderCreate()}
        folderRenameTarget={folderRenameTarget()}
        folderRenameValue={folderRenameValue()}
        onFolderRenameValue={setFolderRenameValue}
        onFolderRenameClose={() => setFolderRenameTarget(null)}
        onFolderRenameCommit={() => void commitFolderRename()}
        folderDeleteTarget={folderDeleteTarget()}
        onFolderDeleteCancel={() => setFolderDeleteTarget(null)}
        onFolderDeleteConfirm={() => void commitFolderDelete()}
      />

      <HandoffDialog
        open={handoffOpen()}
        scriptIds={[...selectedIds()]}
        ideaIds={[]}
        onClose={() => setHandoffOpen(false)}
        onSent={onHandoffSent}
      />
    </div>
  );
}

export default Browser;
