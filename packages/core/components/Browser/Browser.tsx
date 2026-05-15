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
import { t } from "../../i18n";
import { ScriptContextMenu, type ContextMenuItem } from "./ScriptContextMenu";
import { TrashView } from "./TrashView";
import { scriptsBus } from "../../lib/scriptsBus";
import { foldersBus } from "../../lib/foldersBus";
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

  // If the active folder was deleted → "All".
  createEffect(() => {
    const id = activeFolderId();
    const list = folders() ?? [];
    if (id && !folders.loading && list.length >= 0) {
      if (!list.find((f) => f.id === id)) {
        setActiveFolderId(null);
      }
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
    return folders()?.find((f) => f.id === id)?.name ?? null;
  });

  // ---- Row actions ----
  function openScript(s: ScriptSummary, newTab = false) {
    tabsStore.openScript(s.id, s.title, { newTab });
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

  return (
    <div class="home">
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
    </div>
  );
}

export default Browser;
