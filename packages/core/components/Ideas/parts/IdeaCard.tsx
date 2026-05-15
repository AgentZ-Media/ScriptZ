import { Show, createSignal } from "solid-js";
import { ideasStore } from "../../../stores/ideas";
import { pushToast } from "../../../stores/toasts";
import { relativeTime } from "../../../lib/format";
import { t } from "../../../i18n";
import type { Idea } from "../../../lib/types";
import { DocIcon, TrashIcon } from "./icons";

export interface IdeaCardProps {
  idea: Idea;
  editing: boolean;
  onStartEdit(): void;
  onCancelEdit(): void;
  onConvert(): void;
  onDelete(): void;
  onOpenScript(): void;
  linkedScriptTitle: string | null;
}

export function IdeaCard(props: IdeaCardProps) {
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
