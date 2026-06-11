import { For, Show, createSignal, createResource, createEffect } from "solid-js";
import { ideasStore } from "../../stores/ideas";
import { foldersBus } from "../../lib/foldersBus";
import { INBOX_FOLDER_ID } from "../../lib/folders";
import { tabsStore } from "../../stores/tabs";
import { pushToast } from "../../stores/toasts";
import { api } from "../../lib/api";
import { ConfirmDialog } from "../Common/ConfirmDialog";
import { t } from "../../i18n";
import type { Folder, Idea } from "../../lib/types";
import { useIdeasFilters, type IdeasSort } from "./hooks/useIdeasFilters";
import { IdeaCard } from "./parts/IdeaCard";
import { IdeasViewEmpty } from "./parts/IdeasViewEmpty";
import { SearchIcon } from "./parts/icons";
import { ConvertIdeaDialog } from "./ConvertIdeaDialog";
import { FolderChips } from "../Browser/FolderChips";
import { BrowserDialogs } from "../Browser/BrowserDialogs";
import { ScriptContextMenu } from "../Browser/ScriptContextMenu";
import { SelectionBar } from "../Browser/SelectionBar";
import { HandoffDialog } from "../Browser/HandoffDialog";
import { settingsStore } from "../../stores/settings";
import "./IdeasView.css";

function sortOptions(): Array<{ id: IdeasSort; label: string }> {
  return [
    { id: "newest", label: t("ideas.sort.newest") },
    { id: "oldest", label: t("ideas.sort.oldest") },
    { id: "title", label: t("ideas.sort.title") },
  ];
}

export function IdeasView() {
  const {
    filter, setFilter,
    sort, setSort,
    query, setQuery,
    activeFolderId, setActiveFolderId,
    counts, folderCounts, folderAllCount, folderInboxCount,
    filtered, scriptIndex,
  } = useIdeasFilters();

  const [draft, setDraft] = createSignal("");
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [pendingDelete, setPendingDelete] = createSignal<Idea | null>(null);
  const [pendingConvert, setPendingConvert] = createSignal<Idea | null>(null);
  let captureRef: HTMLInputElement | undefined;

  // ---- Multi-select (Studio handoff) ----
  const [selectMode, setSelectMode] = createSignal(false);
  const [selectedIds, setSelectedIds] = createSignal<Set<string>>(new Set());
  const [handoffOpen, setHandoffOpen] = createSignal(false);
  // No connect code -> no Studio surface anywhere (most users have none).
  const studioConnected = () => settingsStore.studioConnectCode() !== "";
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function exitSelect() {
    setSelectMode(false);
    setSelectedIds(new Set<string>());
  }
  // Leaving the current scope drops the selection.
  createEffect(() => {
    void filter();
    void query();
    void activeFolderId();
    setSelectMode(false);
    setSelectedIds(new Set<string>());
  });

  // Folder management state, mirrored from the Browser — folders are
  // shared between scripts and ideas, so they can be created / renamed /
  // deleted from either surface.
  const [folderCreateOpen, setFolderCreateOpen] = createSignal(false);
  const [folderCreateValue, setFolderCreateValue] = createSignal("");
  const [folderRenameTarget, setFolderRenameTarget] = createSignal<Folder | null>(null);
  const [folderRenameValue, setFolderRenameValue] = createSignal("");
  const [folderDeleteTarget, setFolderDeleteTarget] = createSignal<Folder | null>(null);
  const [contextMenu, setContextMenu] = createSignal<
    { x: number; y: number; items: { label: string; onClick?: () => void; danger?: boolean }[] } | null
  >(null);

  // Folder list is queried up-front so the convert flow can skip the
  // dialog when there are no folders to pick.
  const [folders] = createResource(
    () => foldersBus.version(),
    () => api.listFolders(),
    { initialValue: [] },
  );

  // The Inbox chip is hidden when no folders exist; if it was the active
  // selection at that point, fall back to "All".
  createEffect(() => {
    if (folders.loading) return;
    if (activeFolderId() === INBOX_FOLDER_ID && (folders() ?? []).length === 0) {
      setActiveFolderId(null);
    }
  });

  // Folders with idea counts injected into the count slot — the chips
  // show how many ideas (in the current status scope) live in each folder.
  const chipFolders = () =>
    (folders() ?? []).map((f) => ({
      ...f,
      script_count: folderCounts().get(f.id) ?? 0,
    }));

  async function commitDraft() {
    const tx = draft().trim();
    if (!tx) return;
    try {
      // New ideas land in the currently selected folder — the active chip
      // is the folder picker for inline capture. In the virtual Inbox, a new
      // idea is simply ungrouped (folder = null), landing back in the Inbox.
      const fid = activeFolderId();
      await ideasStore.createIdea({
        title: tx,
        folderId: fid === INBOX_FOLDER_ID ? null : fid,
      });
      setDraft("");
      captureRef?.focus();
    } catch (err) {
      pushToast(t("common.errorPrefix", { message: (err as Error).message ?? String(err) }), "error");
    }
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
      return;
    }
    try {
      const created = await api.createFolder(v);
      foldersBus.bump();
      pushToast(t("folder.toast.created", { name: created.name }), "ok");
      // Jump into the freshly created folder so the next idea lands there.
      setActiveFolderId(created.id);
    } catch (e) {
      pushToast(t("common.errorPrefix", { message: (e as Error).message }), "error");
    } finally {
      setFolderCreateOpen(false);
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
      // The ideas list reflects the cleared folder_id (web cascade /
      // desktop FK), so refresh it too.
      ideasStore.refresh();
    } catch (e) {
      pushToast(t("common.errorPrefix", { message: (e as Error).message }), "error");
    } finally {
      setFolderDeleteTarget(null);
    }
  }

  function convert(idea: Idea) {
    if ((folders() ?? []).length > 0) {
      setPendingConvert(idea);
      return;
    }
    void convertInto(idea, null);
  }

  async function convertInto(idea: Idea, folderId: string | null) {
    try {
      const { script } = await ideasStore.convertIdeaToScript({
        ideaId: idea.id,
        folderId,
        notesAsAction: true,
      });
      pushToast(t("script.toast.created", { title: script.title }), "ok");
      tabsStore.openScript(script.id, script.title);
    } catch (err) {
      pushToast(t("common.errorPrefix", { message: (err as Error).message ?? String(err) }), "error");
    }
  }

  async function confirmDelete() {
    const idea = pendingDelete();
    if (!idea) return;
    try {
      await ideasStore.deleteIdea(idea.id);
      pushToast(t("ideas.toast.deleted", { title: idea.title }), "ok");
    } catch (err) {
      pushToast(t("common.errorPrefix", { message: (err as Error).message ?? String(err) }), "error");
    } finally {
      setPendingDelete(null);
    }
  }

  function openLinkedScript(idea: Idea) {
    if (!idea.script_id) return;
    const title = scriptIndex().get(idea.script_id) ?? idea.title;
    tabsStore.openScript(idea.script_id, title);
  }

  void foldersBus; // Conversion bumpt foldersBus indirekt — Subscriber-Hint.

  return (
    <div class="ideas-view">
      <div class="ideas-view-inner">
        <header class="ideas-view-head">
          <div class="ideas-view-greet">
            <h1 class="ideas-view-h">{t("ideas.h1")}</h1>
            <p class="ideas-view-sub">{t("ideas.sub")}</p>
          </div>
        </header>

        <div class="ideas-view-capture">
          <span class="ideas-view-capture-plus" aria-hidden="true">+</span>
          <input
            ref={captureRef}
            class="ideas-view-capture-input"
            value={draft()}
            onInput={(e) => setDraft(e.currentTarget.value)}
            placeholder={t("ideas.capture.placeholder")}
            spellcheck={false}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void commitDraft();
              }
            }}
          />
          <Show when={draft().trim()}>
            <button
              class="ideas-view-capture-go"
              onClick={() => void commitDraft()}
              title={t("ideas.capture.title")}
            >
              {t("ideas.capture.add")}
            </button>
          </Show>
        </div>

        <FolderChips
          folders={chipFolders()}
          activeFolderId={activeFolderId()}
          allCount={folderAllCount()}
          inboxCount={folderInboxCount()}
          onSelect={setActiveFolderId}
          onCreateFolder={() => {
            setFolderCreateValue("");
            setFolderCreateOpen(true);
          }}
          onChipContextMenu={folderChipMenu}
          onDropScript={() => {}}
        />

        <SelectionBar
          active={selectMode()}
          count={selectedIds().size}
          // Ideas multi-select exists solely for the Studio handoff, so the
          // whole entry point disappears without a connect code.
          canEnter={filtered().length > 0 && studioConnected()}
          onEnter={() => setSelectMode(true)}
          onExit={exitSelect}
          onSelectAll={() => setSelectedIds(new Set(filtered().map((i) => i.id)))}
          onClear={() => setSelectedIds(new Set<string>())}
          onSend={studioConnected() ? () => setHandoffOpen(true) : undefined}
        />

        <div class="ideas-view-bar">
          <div class="ideas-view-search">
            <span class="ideas-view-search-ic" aria-hidden="true">
              <SearchIcon />
            </span>
            <input
              value={query()}
              onInput={(e) => setQuery(e.currentTarget.value)}
              placeholder={t("ideas.search.placeholder")}
              spellcheck={false}
            />
            <Show when={query()}>
              <button
                class="ideas-view-search-clear"
                onClick={() => setQuery("")}
                title={t("ideas.search.clear")}
                aria-label={t("ideas.search.clear")}
              >
                ×
              </button>
            </Show>
          </div>

          <div class="ideas-view-segs" role="group" aria-label={t("ideas.filter.aria")}>
            <button
              type="button"
              aria-pressed={filter() === "open"}
              classList={{ "is-on": filter() === "open" }}
              onClick={() => setFilter("open")}
            >
              {t("ideas.filter.open")} <span class="ideas-view-seg-n">{counts().open}</span>
            </button>
            <button
              type="button"
              aria-pressed={filter() === "all"}
              classList={{ "is-on": filter() === "all" }}
              onClick={() => setFilter("all")}
            >
              {t("ideas.filter.all")} <span class="ideas-view-seg-n">{counts().all}</span>
            </button>
            <button
              type="button"
              aria-pressed={filter() === "used"}
              classList={{ "is-on": filter() === "used" }}
              onClick={() => setFilter("used")}
            >
              {t("ideas.filter.used")} <span class="ideas-view-seg-n">{counts().used}</span>
            </button>
          </div>

          <div class="ideas-view-sort">
            <label class="ideas-view-sort-label" for="ideas-sort">{t("ideas.sort.label")}</label>
            <select
              id="ideas-sort"
              value={sort()}
              onChange={(e) => setSort(e.currentTarget.value as IdeasSort)}
            >
              <For each={sortOptions()}>
                {(s) => <option value={s.id}>{s.label}</option>}
              </For>
            </select>
          </div>
        </div>

        <div class="ideas-view-body">
          <Show
            when={filtered().length > 0}
            fallback={
              <IdeasViewEmpty
                filter={filter()}
                query={query()}
                onFocusCapture={() => captureRef?.focus()}
                onClearQuery={() => setQuery("")}
              />
            }
          >
            <ul class="ideas-view-list">
              <For each={filtered()}>
                {(idea) => (
                  <IdeaCard
                    idea={idea}
                    editing={editingId() === idea.id}
                    folders={folders() ?? []}
                    onStartEdit={() => setEditingId(idea.id)}
                    onCancelEdit={() => setEditingId(null)}
                    onConvert={() => void convert(idea)}
                    onDelete={() => setPendingDelete(idea)}
                    onOpenScript={() => openLinkedScript(idea)}
                    linkedScriptTitle={
                      idea.script_id
                        ? scriptIndex().get(idea.script_id) ?? null
                        : null
                    }
                    selectMode={selectMode()}
                    selected={selectedIds().has(idea.id)}
                    onToggleSelect={() => toggleSelect(idea.id)}
                  />
                )}
              </For>
            </ul>
          </Show>
        </div>
      </div>

      <Show when={pendingDelete()}>
        {(idea) => (
          <ConfirmDialog
            open
            title={t("ideas.confirm.delete.title")}
            body={t("ideas.confirm.delete.body", { title: idea().title })}
            confirmLabel={t("common.delete")}
            danger
            onConfirm={() => void confirmDelete()}
            onCancel={() => setPendingDelete(null)}
          />
        )}
      </Show>

      <Show when={pendingConvert()}>
        {(idea) => (
          <ConvertIdeaDialog
            ideaTitle={idea().title}
            defaultFolderId={idea().folder_id}
            onCancel={() => setPendingConvert(null)}
            onConfirm={(folderId) => {
              const target = idea();
              setPendingConvert(null);
              void convertInto(target, folderId);
            }}
          />
        )}
      </Show>

      <BrowserDialogs
        renameTarget={null}
        renameValue=""
        onRenameValue={() => {}}
        onRenameClose={() => {}}
        onRenameCommit={() => {}}
        folderCreateOpen={folderCreateOpen()}
        folderCreateValue={folderCreateValue()}
        onFolderCreateValue={setFolderCreateValue}
        onFolderCreateClose={() => setFolderCreateOpen(false)}
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

      <Show when={contextMenu()}>
        {(menu) => (
          <ScriptContextMenu
            x={menu().x}
            y={menu().y}
            items={menu().items}
            onClose={() => setContextMenu(null)}
          />
        )}
      </Show>

      <HandoffDialog
        open={handoffOpen()}
        scriptIds={[]}
        ideaIds={[...selectedIds()]}
        onClose={() => setHandoffOpen(false)}
        onSent={() => {
          exitSelect();
          ideasStore.refresh();
        }}
      />
    </div>
  );
}

export default IdeasView;
