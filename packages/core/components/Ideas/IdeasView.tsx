import { For, Show, createSignal } from "solid-js";
import { ideasStore } from "../../stores/ideas";
import { foldersBus } from "../../lib/foldersBus";
import { tabsStore } from "../../stores/tabs";
import { pushToast } from "../../stores/toasts";
import { ConfirmDialog } from "../Common/ConfirmDialog";
import { t } from "../../i18n";
import type { Idea } from "../../lib/types";
import { useIdeasFilters, type IdeasSort } from "./hooks/useIdeasFilters";
import { IdeaCard } from "./parts/IdeaCard";
import { IdeasViewEmpty } from "./parts/IdeasViewEmpty";
import { SearchIcon } from "./parts/icons";
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
    counts, filtered, scriptIndex,
  } = useIdeasFilters();

  const [draft, setDraft] = createSignal("");
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [pendingDelete, setPendingDelete] = createSignal<Idea | null>(null);
  let captureRef: HTMLInputElement | undefined;

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

export default IdeasView;
