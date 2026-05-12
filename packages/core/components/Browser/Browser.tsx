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
import type { Folder, ScriptSummary } from "../../lib/types";
import { stripeBackground } from "../../lib/stripe";
import { api } from "../../lib/api";
import { runtimeLabelFromStats } from "../../lib/runtime";
import { tabsStore } from "../../stores/tabs";
import { settingsStore } from "../../stores/settings";
import { pushToast } from "../../stores/toasts";
import { K } from "../../lib/keys";
import {
  relativeTime,
  debounce,
} from "../../lib/format";
import { t, tPlural } from "../../i18n";

/** Spielzeit-Label aus den persistierten Eingangswerten - dieselbe Formel
 *  wie in der Editor-Rail, gerendert über `runtimeLabelFromStats`.
 *  Sentinel/leere Skripte ergeben null, damit der Aufrufer das Feld
 *  ausblenden kann. */
function runtimeLabelFor(script: ScriptSummary, wpm: number): string | null {
  return runtimeLabelFromStats(
    {
      dialogWords: script.dialog_word_count,
      directionBlocks: script.direction_block_count,
    },
    wpm,
  );
}
import { ScriptContextMenu, type ContextMenuItem } from "./ScriptContextMenu";
import { TrashView } from "./TrashView";
import { Modal } from "../Common/Modal";
import { ConfirmDialog } from "../Common/ConfirmDialog";
import { scriptsBus } from "../../lib/scriptsBus";
import { foldersBus } from "../../lib/foldersBus";
import { FolderChips } from "./FolderChips";
import { MomentumStrip } from "./MomentumStrip";
import "./Browser.css";

/** Tageszeitabhängige Begrüßung. Greift bewusst NICHT auf einen
 *  Vornamen zu (kein Onboarding mit Namensabfrage). */
function greeting(): string {
  const h = new Date().getHours();
  if (h < 5)  return t("greeting.lateNight");
  if (h < 11) return t("greeting.morning");
  if (h < 14) return t("greeting.noon");
  if (h < 18) return t("greeting.day");
  if (h < 22) return t("greeting.evening");
  return t("greeting.lateHour");
}

type Region = "scripts" | "trash";
type SortKey = "updated" | "created" | "title";
type ViewMode = "grid" | "list";

const VIEW_STATE_KEY = "browser.view_mode";
const ACTIVE_FOLDER_STATE_KEY = "browser.active_folder";
const PAGE_SIZE = 200;

/** Zeit-Buckets für die Gruppierung der Liste — übersetzt aus dem Design
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
  // Kalendertag-basiertes Bucketing: vergleicht zwei Daten an
  // lokaler Mitternacht, damit ein gestern Abend bearbeitetes Skript
  // heute Vormittag tatsächlich unter "Gestern" steht und nicht erst
  // nach 24 Stunden umspringt.
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

function sorts(): { id: SortKey; label: string }[] {
  return [
    { id: "updated", label: t("browser.sort.updated") },
    { id: "created", label: t("browser.sort.created") },
    { id: "title",   label: t("browser.sort.title") },
  ];
}

export interface BrowserProps {
  /** Called with the currently active folder filter so the App-level
   * NewScriptDialog can pre-select it. */
  onNewScript?: (folderId: string | null) => void;
  /** Opens the global command palette (⌘K). */
  onOpenCmdK?: () => void;
}

/**
 * Home / Browser — komplett überarbeitet nach Re-Design `home.jsx`:
 *
 *   1. Greeting (tageszeitabhängig + "Was schreibst du heute?")
 *   2. MomentumStrip (Weiterschreiben + Streak + Heute + Aktivität ↗)
 *   3. Header-Zeile: runde Suche · Liste/Raster-Toggle · Trash-Icon ·
 *      Settings-Icon · "+ Neu" Primary-Button
 *   4. Folder-Chips (Alle | divider | User-Folders | + Ordner)
 *   5. Sortbar (Count links, Sortierung rechts)
 *   6. Body: EINE Liste/Grid, gruppiert nach Heute/Gestern/Diese Woche/
 *      Diesen Monat/Älter (kein "Recent + Older"-Split mehr)
 *   7. Liste ist Default — Grid via Toggle
 *
 * Die alte `browser-topbar` (ScriptZ-Brand + Search + Actions) ist raus —
 * Brand und Status liegen jetzt in der TabBar oben.
 */
export function Browser(props: BrowserProps = {}) {
  const [activeRegion, setActiveRegion] = createSignal<Region>("scripts");
  const [searchInput, setSearchInput] = createSignal("");
  const [debouncedSearch, setDebouncedSearch] = createSignal("");
  const [sort, setSort] = createSignal<SortKey>("updated");
  const [viewMode, setViewMode] = createSignal<ViewMode>("list"); // Liste ist Default
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
      if (!result) return; // User hat abgebrochen
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

  // Falls aktiver Ordner gelöscht wurde → "Alle".
  createEffect(() => {
    const id = activeFolderId();
    const list = folders() ?? [];
    if (id && !folders.loading && list.length >= 0) {
      if (!list.find((f) => f.id === id)) {
        setActiveFolderId(null);
      }
    }
  });

  // Skripte, deren Archive-Call gerade läuft. Werden aus `list()`
  // optimistisch ausgeblendet, damit MomentumStrip + Liste nicht mehr
  // den gerade getrashten Titel als „Weiterschreiben"-Geist zeigen,
  // bevor der Refetch durch ist. Muss VOR `list` deklariert sein, weil
  // die createMemo-Callback liest pendingArchive(), und das Signal sonst
  // beim ersten Tracking-Run noch im TDZ-Status wäre.
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

  /** Gruppiert die Liste in Zeit-Buckets. Nur wenn nach `updated`
   *  sortiert wird; bei anderen Sortierungen eine Gruppe. */
  const groups = createMemo(() => {
    const items = list();
    if (sort() !== "updated" || isSearching()) {
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
    // Leere Titel werden weder gespeichert noch schließen sie still den
    // Dialog - sonst wirkt es, als hätte der User den Titel gelöscht.
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
        <div class="home-header">
          <div class="home-greet">
            <h1 class="home-greet-h">{greeting()}.</h1>
            <p class="home-greet-sub">{t("greeting.sub")}</p>
          </div>

          <MomentumStrip
            lastScript={list()[0] ?? null}
            onContinue={(s) => openScript(s)}
          />

          <div class="home-header-row">
            <label class="home-search">
              <span class="home-search-ic" aria-hidden="true"><SearchIcon /></span>
              <input
                ref={searchInputRef}
                type="search"
                placeholder={t("browser.search.placeholder")}
                value={searchInput()}
                onInput={(e) => setSearchInput(e.currentTarget.value)}
                spellcheck={false}
                autocomplete="off"
              />
              <button
                class="home-search-kbd"
                title={t("browser.commands.title", { hotkey: K("Mod+K") })}
                onClick={(e) => {
                  e.preventDefault();
                  props.onOpenCmdK?.();
                }}
              >
                {K("Mod+K")}
              </button>
            </label>

            <div class="viewseg" role="group" aria-label={t("browser.view")}>
              <button
                type="button"
                classList={{ "is-on": viewMode() === "list" }}
                onClick={() => setViewMode("list")}
                title={t("browser.view.list")}
                aria-label={t("browser.view.list")}
              >
                <ListIcon />
              </button>
              <button
                type="button"
                classList={{ "is-on": viewMode() === "grid" }}
                onClick={() => setViewMode("grid")}
                title={t("browser.view.grid")}
                aria-label={t("browser.view.grid")}
              >
                <GridIcon />
              </button>
            </div>

            <button
              class="icon-btn"
              onClick={onImportScriptz}
              title={t("browser.import.title")}
              aria-label={t("browser.import.aria")}
              type="button"
            >
              <ImportIcon />
            </button>

            <button
              class="icon-btn"
              classList={{ "is-active": activeRegion() === "trash" }}
              onClick={() => setActiveRegion((r) => (r === "trash" ? "scripts" : "trash"))}
              title={t("browser.trash")}
              aria-label={t("browser.trash")}
              type="button"
            >
              <TrashIcon />
            </button>

            <button
              class="btn btn-primary home-new"
              onClick={() => openNewScript()}
              type="button"
            >
              <span class="home-new-plus" aria-hidden="true">+</span>
              <span>{t("browser.new")}</span>
            </button>
          </div>
        </div>

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
          <div class="home-sortbar">
            <span class="home-count-line">
              {tPlural("units.scripts", list().length)}
              <Show when={activeFolderName()}> · {activeFolderName()}</Show>
              <Show when={isSearching()}> · „{debouncedSearch()}"</Show>
            </span>
            <button
              type="button"
              class="home-sort"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setSortMenuOpen({ x: r.right - 200, y: r.bottom + 4 });
              }}
            >
              <SortIcon />
              <span>{t("browser.sort.label", { value: sorts().find((x) => x.id === sort())?.label ?? "" })}</span>
              <ChevronDownIcon />
            </button>
          </div>

          <div class="home-body">
            <Show when={isEmptyFolder()} fallback={
              <Show when={list().length > 0 || isSearching()}>
                <Show when={list().length > 0} fallback={
                  <div class="home-empty">
                    <div class="home-empty-mark home-empty-mark-search"><SearchIcon /></div>
                    <div class="home-empty-h">{t("browser.empty.search.title", { query: debouncedSearch() })}</div>
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
                        <Show when={viewMode() === "list"} fallback={
                          <div class="home-cards">
                            <For each={g.items}>
                              {(s) => (
                                <ScriptCard
                                  script={s}
                                  folderName={
                                    folders()?.find((f) => f.id === s.folder_id)?.name ?? ""
                                  }
                                  onClick={() => openScript(s)}
                                  onContextMenu={(e) => {
                                    e.preventDefault();
                                    setContextMenu({
                                      x: e.clientX, y: e.clientY,
                                      items: ctxMenuItems(s),
                                    });
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
                                  onOpen={() => openScript(s)}
                                  onMore={(e) => {
                                    const r = e.currentTarget.getBoundingClientRect();
                                    setContextMenu({
                                      x: r.right - 240, y: r.bottom + 4,
                                      items: ctxMenuItems(s),
                                    });
                                  }}
                                  onContextMenu={(e) => {
                                    e.preventDefault();
                                    setContextMenu({
                                      x: e.clientX, y: e.clientY,
                                      items: ctxMenuItems(s),
                                    });
                                  }}
                                />
                              )}
                            </For>
                          </div>
                        </Show>
                      </section>
                    )}
                  </For>

                  <Show when={hasMore()}>
                    <div class="home-loadmore-row">
                      <button
                        class="btn btn-ghost"
                        onClick={() => setPageLimit((n) => n + PAGE_SIZE)}
                      >
                        {t("browser.loadMore", { n: PAGE_SIZE })}
                      </button>
                    </div>
                  </Show>
                </Show>
              </Show>
            }>
              <div class="home-empty">
                <div class="home-empty-h">{t("browser.empty.folder.title", { folder: activeFolderName() ?? "" })}</div>
                <div class="home-empty-sub">
                  {t("browser.empty.folder.hint")}
                </div>
              </div>
            </Show>
          </div>
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

      <Modal
        open={renameTarget() !== null}
        onClose={() => setRenameTarget(null)}
        title={t("script.renameTitle")}
        footer={
          <>
            <button class="btn" onClick={() => setRenameTarget(null)}>
              {t("common.cancel")}
            </button>
            <button
              class="btn btn-primary"
              onClick={commitRename}
              disabled={renameValue().trim().length === 0}
            >
              {t("common.save")}
            </button>
          </>
        }
      >
        <Show when={renameTarget()}>
          {(target) => (
            <div class="field">
              <label>{t("script.titleLabel")}</label>
              <input
                type="text"
                value={renameValue()}
                autofocus
                aria-invalid={renameValue().trim().length === 0}
                aria-describedby={
                  renameValue().trim().length === 0 ? "rename-empty-hint" : undefined
                }
                onInput={(e) => setRenameValue(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void commitRename();
                }}
              />
              <Show
                when={renameValue().trim().length === 0}
                fallback={
                  <div class="muted small">
                    {t("common.current", { value: target().title })}
                  </div>
                }
              >
                <div id="rename-empty-hint" class="field-hint field-hint-warn">
                  {t("script.renameEmptyHint")}
                </div>
              </Show>
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
        title={t("folder.createTitle")}
        footer={
          <>
            <button class="btn" onClick={() => {
              setFolderCreateOpen(false);
              setPendingMoveAfterCreate(null);
            }}>
              {t("common.cancel")}
            </button>
            <button class="btn btn-primary" onClick={commitFolderCreate}>
              {t("folder.createSubmit")}
            </button>
          </>
        }
      >
        <div class="field">
          <label>{t("common.name")}</label>
          <input
            type="text"
            value={folderCreateValue()}
            placeholder={t("folder.placeholder")}
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
        title={t("folder.renameTitle")}
        footer={
          <>
            <button class="btn" onClick={() => setFolderRenameTarget(null)}>
              {t("common.cancel")}
            </button>
            <button class="btn btn-primary" onClick={commitFolderRename}>
              {t("common.save")}
            </button>
          </>
        }
      >
        <Show when={folderRenameTarget()}>
          {(target) => (
            <div class="field">
              <label>{t("folder.renameLabel")}</label>
              <input
                type="text"
                value={folderRenameValue()}
                autofocus
                onInput={(e) => setFolderRenameValue(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void commitFolderRename();
                }}
              />
              <div class="muted small">{t("common.current", { value: target().name })}</div>
            </div>
          )}
        </Show>
      </Modal>

      <Show when={folderDeleteTarget()}>
        {(target) => (
          <ConfirmDialog
            open={true}
            title={t("folder.deleteTitle", { name: target().name })}
            body={
              target().script_count === 0
                ? t("folder.deleteBody.empty")
                : target().script_count === 1
                ? t("folder.deleteBody.one")
                : t("folder.deleteBody.many", { count: target().script_count })
            }
            confirmLabel={t("common.delete")}
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

/* ---------- Sort-Popover ---------- */

function SortPopover(props: {
  x: number; y: number;
  current: SortKey;
  onPick: (id: SortKey) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div class="popover-scrim" onClick={() => props.onClose()} />
      <div class="popover-menu" style={`left:${props.x}px;top:${props.y}px;`}>
        <For each={sorts()}>
          {(o) => (
            <button
              type="button"
              class="popover-item"
              onClick={() => props.onPick(o.id)}
            >
              <span class="popover-ic">
                <Show when={props.current === o.id}><CheckIcon /></Show>
              </span>
              <span>{o.label}</span>
            </button>
          )}
        </For>
      </div>
    </>
  );
}

/* ---------- Script-Card (Grid) ---------- */

interface ScriptCardProps {
  script: ScriptSummary;
  folderName: string;
  onClick: () => void;
  onContextMenu: (e: MouseEvent) => void;
}
function ScriptCard(props: ScriptCardProps) {
  const bg = () => stripeBackground(props.script.characters, "to right");
  return (
    <article
      class="card-v2"
      role="button"
      onClick={props.onClick}
      onContextMenu={props.onContextMenu}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          props.onClick();
        }
      }}
      tabIndex={0}
      aria-label={props.script.title || t("common.untitled")}
    >
      <div
        class="card-v2-strip"
        classList={{ "is-empty": bg() === null }}
        style={bg() ? `background: ${bg()};` : ""}
        aria-hidden="true"
      />
      <div class="card-v2-body">
        <div class="card-v2-head">
          <div class="card-v2-folder">{props.folderName}</div>
        </div>
        <div class="card-v2-title">{props.script.title || t("common.untitled")}</div>
        <div class="card-v2-meta-row">
          <span class="card-v2-meta">
            {relativeTime(props.script.updated_at)}
            {(() => {
              const rt = runtimeLabelFor(props.script, settingsStore.dialogWpm());
              return rt ? ` · ${rt}` : "";
            })()}
          </span>
          <span class="card-v2-cast">
            <For each={props.script.characters.slice(0, 4)}>
              {(c) => (
                <span class="cast-dot" title={c.name} style={`background:${c.color};`} />
              )}
            </For>
            <Show when={props.script.characters.length === 0}>
              <span class="card-v2-meta-faint">{t("browser.notes")}</span>
            </Show>
          </span>
        </div>
      </div>
    </article>
  );
}

/* ---------- Script-Row (List) ---------- */

interface ScriptRowProps {
  script: ScriptSummary;
  isContext: boolean;
  onOpen: () => void;
  onMore: (e: MouseEvent & { currentTarget: HTMLElement }) => void;
  onContextMenu: (e: MouseEvent) => void;
}
function ScriptRow(props: ScriptRowProps) {
  const bg = () => stripeBackground(props.script.characters, "to bottom");
  return (
    <div
      class="row-v2"
      role="button"
      classList={{ "is-context": props.isContext }}
      onClick={props.onOpen}
      onContextMenu={props.onContextMenu}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          props.onOpen();
        }
      }}
      aria-label={props.script.title || t("common.untitled")}
    >
      <div
        class="row-stripe"
        classList={{ "row-stripe-empty": bg() === null }}
        style={bg() ? `background: ${bg()};` : ""}
      />
      <div class="row-v2-title">{props.script.title || t("common.untitled")}</div>
      <div class="row-v2-chars">
        <For each={props.script.characters.slice(0, 2)}>
          {(c) => (
            <span class="char-pill" style={`color:${c.color};--char-color:${c.color};`}>
              {c.name}
            </span>
          )}
        </For>
        <Show when={props.script.characters.length > 2}>
          <span class="row-v2-chars-more">
            +{props.script.characters.length - 2}
          </span>
        </Show>
      </div>
      <div class="row-v2-meta">{relativeTime(props.script.updated_at)}</div>
      <div class="row-v2-pages">
        {(() => {
          const rt = runtimeLabelFor(props.script, settingsStore.dialogWpm());
          return rt ?? "—";
        })()}
      </div>
      <button
        class="row-v2-more"
        aria-label={t("browser.rowMore")}
        onClick={(e) => {
          e.stopPropagation();
          props.onMore(e as MouseEvent & { currentTarget: HTMLElement });
        }}
      >
        <MoreIcon />
      </button>
    </div>
  );
}

/* ---------- Icons ---------- */

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
function ImportIcon() {
  // Download-Pfeil ins Tablett - signalisiert "Datei reinholen".
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
function ListIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}
function GridIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}
function MoreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="6" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="18" r="1" />
    </svg>
  );
}
function SortIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="11 9 8 6 5 9" />
      <polyline points="19 15 16 18 13 15" />
      <line x1="8" y1="6" x2="8" y2="18" />
      <line x1="16" y1="18" x2="16" y2="6" />
    </svg>
  );
}
function ChevronDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
