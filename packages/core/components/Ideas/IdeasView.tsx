import {
  For,
  Show,
  createMemo,
  createResource,
  createSignal,
} from "solid-js";
import { api } from "../../lib/api";
import { ideasStore } from "../../stores/ideas";
import { scriptsBus } from "../../lib/scriptsBus";
import { foldersBus } from "../../lib/foldersBus";
import { tabsStore } from "../../stores/tabs";
import { pushToast } from "../../stores/toasts";
import { relativeTime } from "../../lib/format";
import { ConfirmDialog } from "../Common/ConfirmDialog";
import { t, localeCompare } from "../../i18n";
import type { Idea } from "../../lib/types";
import "./IdeasView.css";

type Filter = "open" | "all" | "used";
type Sort = "newest" | "oldest" | "title";

function sortOptions(): Array<{ id: Sort; label: string }> {
  return [
    { id: "newest", label: t("ideas.sort.newest") },
    { id: "oldest", label: t("ideas.sort.oldest") },
    { id: "title", label: t("ideas.sort.title") },
  ];
}

export function IdeasView() {
  const [filter, setFilter] = createSignal<Filter>("open");
  const [sort, setSort] = createSignal<Sort>("newest");
  const [query, setQuery] = createSignal("");
  const [draft, setDraft] = createSignal("");
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [pendingDelete, setPendingDelete] = createSignal<Idea | null>(null);
  let captureRef: HTMLInputElement | undefined;

  const ideas = () => ideasStore.ideas() ?? [];

  const counts = createMemo(() => ({
    all: ideas().length,
    open: ideas().filter((i) => !i.used_at).length,
    used: ideas().filter((i) => i.used_at).length,
  }));

  const [scriptIndex] = createResource(
    () => scriptsBus.version(),
    async () => {
      try {
        const list = await api.listScripts({ limit: 500 });
        return new Map(list.map((s) => [s.id, s.title]));
      } catch {
        return new Map<string, string>();
      }
    },
    { initialValue: new Map<string, string>() },
  );

  const filtered = createMemo(() => {
    const f = filter();
    const q = query().trim().toLowerCase();
    const list = ideas().filter((i) => {
      if (f === "open" && i.used_at) return false;
      if (f === "used" && !i.used_at) return false;
      if (q) {
        const hay = (i.title + " " + i.notes).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const s = sort();
    list.sort((a, b) => {
      if (s === "title") return localeCompare(a.title, b.title);
      if (s === "oldest") return a.created_at - b.created_at;
      return b.created_at - a.created_at;
    });
    return list;
  });

  async function commitDraft() {
    const tx = draft().trim();
    if (!tx) return;
    try {
      await ideasStore.createIdea({ title: tx });
      setDraft("");
      captureRef?.focus();
    } catch (err) {
      pushToast(t("common.errorPrefix", { message: (err as Error).message ?? String(err) }), "error");
    }
  }

  async function convert(idea: Idea) {
    try {
      const { script } = await ideasStore.convertIdeaToScript({
        ideaId: idea.id,
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
              onChange={(e) => setSort(e.currentTarget.value as Sort)}
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
    </div>
  );
}

function IdeasViewEmpty(props: {
  filter: Filter;
  query: string;
  onFocusCapture(): void;
  onClearQuery(): void;
}) {
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

function IdeaCard(props: {
  idea: Idea;
  editing: boolean;
  onStartEdit(): void;
  onCancelEdit(): void;
  onConvert(): void;
  onDelete(): void;
  onOpenScript(): void;
  linkedScriptTitle: string | null;
}) {
  const [titleDraft, setTitleDraft] = createSignal(props.idea.title);
  const [notesDraft, setNotesDraft] = createSignal(props.idea.notes);
  const used = () => !!props.idea.used_at;

  async function save() {
    const tx = titleDraft().trim();
    if (!tx) {
      props.onCancelEdit();
      setTitleDraft(props.idea.title);
      return;
    }
    try {
      await ideasStore.updateIdea({ id: props.idea.id, title: tx, notes: notesDraft() });
      props.onCancelEdit();
    } catch (err) {
      pushToast(t("common.errorPrefix", { message: (err as Error).message ?? String(err) }), "error");
    }
  }

  function startEdit() {
    if (used()) return;
    setTitleDraft(props.idea.title);
    setNotesDraft(props.idea.notes);
    props.onStartEdit();
  }

  return (
    <li
      class="idea-card"
      classList={{ "is-used": used(), "is-editing": props.editing }}
    >
      <Show
        when={!props.editing}
        fallback={
          <div class="idea-card-edit">
            <input
              class="idea-card-title-input"
              autofocus
              value={titleDraft()}
              onInput={(e) => setTitleDraft(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void save(); }
                if (e.key === "Escape") { e.preventDefault(); props.onCancelEdit(); }
              }}
              placeholder={t("ideas.card.titlePlaceholder")}
            />
            <textarea
              class="idea-card-notes-input"
              rows={4}
              value={notesDraft()}
              onInput={(e) => setNotesDraft(e.currentTarget.value)}
              placeholder={t("ideas.card.notesPlaceholder")}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void save(); }
                if (e.key === "Escape") { e.preventDefault(); props.onCancelEdit(); }
              }}
            />
            <div class="idea-card-edit-foot">
              <button class="idea-card-edit-del" onClick={() => props.onDelete()}>
                {t("common.delete")}
              </button>
              <div style="flex:1" />
              <button class="btn" onClick={() => props.onCancelEdit()}>{t("common.cancel")}</button>
              <button class="btn btn-primary" onClick={() => void save()}>{t("common.save")}</button>
            </div>
          </div>
        }
      >
        <div class="idea-card-row" onClick={startEdit}>
          <div class="idea-card-mark" aria-hidden="true">
            <Show when={used()} fallback={<span class="idea-card-dot" />}>
              <span class="idea-card-check">✓</span>
            </Show>
          </div>
          <div class="idea-card-body">
            <div class="idea-card-title">{props.idea.title}</div>
            <Show when={props.idea.notes.trim()}>
              <div class="idea-card-notes">{props.idea.notes}</div>
            </Show>
            <div class="idea-card-meta">
              <span class="idea-card-meta-time">
                {used() && props.idea.used_at
                  ? t("ideas.card.usedAt", { when: relativeTime(props.idea.used_at) })
                  : relativeTime(props.idea.created_at)}
              </span>
              <Show when={used() && props.linkedScriptTitle}>
                <button
                  class="idea-card-link"
                  onClick={(e) => { e.stopPropagation(); props.onOpenScript(); }}
                  title={t("ideas.card.linked.title")}
                >
                  <DocIcon /> {props.linkedScriptTitle}
                </button>
              </Show>
              <Show when={used() && !props.linkedScriptTitle}>
                <span class="idea-card-link is-stale" title={t("ideas.card.linked.staleTitle")}>
                  <DocIcon /> {t("ideas.card.linked.stale")}
                </span>
              </Show>
            </div>
          </div>
          <div class="idea-card-actions">
            <Show when={!used()}>
              <button
                class="idea-card-cta"
                onClick={(e) => { e.stopPropagation(); props.onConvert(); }}
                title={t("ideas.card.convert.title")}
              >
                {t("ideas.card.convert")}
              </button>
            </Show>
            <button
              class="idea-card-icon-btn"
              onClick={(e) => { e.stopPropagation(); props.onDelete(); }}
              title={t("ideas.card.delete.title")}
              aria-label={t("ideas.card.delete.title")}
            >
              <TrashIcon />
            </button>
          </div>
        </div>
      </Show>
    </li>
  );
}

function BulbIcon(props: { size?: number }) {
  const s = props.size ?? 16;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2V17h6v-.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor"
         stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M5 3h7l3 3v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M12 3v3h3" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

export default IdeasView;
