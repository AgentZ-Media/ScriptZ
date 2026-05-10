import {
  For,
  Show,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { api } from "~/lib/api";
import { ideasStore } from "~/stores/ideas";
import { ideasBus } from "~/lib/ideasBus";
import { scriptsBus } from "~/lib/scriptsBus";
import { foldersBus } from "~/lib/foldersBus";
import { tabsStore } from "~/stores/tabs";
import { pushToast } from "~/stores/toasts";
import { relativeTime } from "~/lib/format";
import type { Idea } from "~/lib/types";
import "./IdeasDrawer.css";

export interface IdeasDrawerProps {
  open: boolean;
  onClose(): void;
  /** Slide-Richtung: vom rechten oder linken Rand. Spiegelt die
   *  IdeasToggle-Position. */
  position?: "left" | "right";
}

type Tab = "open" | "all" | "used";

export function IdeasDrawer(props: IdeasDrawerProps) {
  const [tab, setTab] = createSignal<Tab>("open");
  const [draft, setDraft] = createSignal("");
  const [editingId, setEditingId] = createSignal<string | null>(null);
  let captureRef: HTMLInputElement | undefined;

  const ideas = () => ideasStore.ideas() ?? [];

  // Skript-Titel-Lookup für die „Verwendet"-Tab. Wird nur geladen,
  // wenn der Drawer offen ist - sonst kein Roundtrip.
  const [scriptIndex] = createResource(
    () => ({ open: props.open, v: scriptsBus.version() }),
    async ({ open }) => {
      if (!open) return new Map<string, string>();
      try {
        const list = await api.listScripts({ limit: 500 });
        return new Map(list.map((s) => [s.id, s.title]));
      } catch {
        return new Map<string, string>();
      }
    },
    { initialValue: new Map<string, string>() },
  );

  // Capture-Feld fokussieren, sobald der Drawer aufgeht.
  let lastOpen = false;
  const focusCapture = () => {
    if (props.open && !lastOpen) {
      setTimeout(() => captureRef?.focus(), 220);
    }
    lastOpen = props.open;
  };

  const counts = createMemo(() => ({
    all: ideas().length,
    open: ideas().filter((i) => !i.used_at).length,
    used: ideas().filter((i) => i.used_at).length,
  }));

  const groups = createMemo(() => {
    const t = tab();
    const list = (() => {
      if (t === "open") return ideas().filter((i) => !i.used_at);
      if (t === "used") return ideas().filter((i) => i.used_at);
      return ideas().slice();
    })();
    if (t === "used") {
      return [{ key: "used", label: "Verwendet", items: list }];
    }
    const buckets: Record<string, Idea[]> = { heute: [], gestern: [], woche: [], aelter: [] };
    const now = Date.now();
    for (const idea of list) {
      const ageDays = (now - idea.created_at) / 86_400_000;
      if (ageDays < 1) buckets.heute.push(idea);
      else if (ageDays < 2) buckets.gestern.push(idea);
      else if (ageDays < 7) buckets.woche.push(idea);
      else buckets.aelter.push(idea);
    }
    const order: Array<{ key: string; label: string }> = [
      { key: "heute", label: "Heute" },
      { key: "gestern", label: "Gestern" },
      { key: "woche", label: "Diese Woche" },
      { key: "aelter", label: "Älter" },
    ];
    return order
      .map((g) => ({ ...g, items: buckets[g.key] }))
      .filter((g) => g.items.length > 0);
  });

  async function commitDraft() {
    const t = draft().trim();
    if (!t) return;
    try {
      await ideasStore.createIdea({ title: t });
      setDraft("");
    } catch (err) {
      pushToast(`Fehler: ${(err as Error).message ?? err}`, "error");
    }
  }

  async function convert(idea: Idea) {
    try {
      const { script } = await ideasStore.convertIdeaToScript({
        ideaId: idea.id,
        notesAsAction: true,
      });
      pushToast(`„${script.title}" angelegt`, "ok");
      // Direkt das neue Skript öffnen.
      tabsStore.openScript(script.id, script.title);
      props.onClose();
    } catch (err) {
      pushToast(`Fehler: ${(err as Error).message ?? err}`, "error");
    }
  }

  async function remove(idea: Idea) {
    try {
      await ideasStore.deleteIdea(idea.id);
      pushToast(`„${idea.title}" gelöscht`, "ok");
    } catch (err) {
      pushToast(`Fehler: ${(err as Error).message ?? err}`, "error");
    }
  }

  function openLinkedScript(idea: Idea) {
    if (!idea.script_id) return;
    const title = scriptIndex().get(idea.script_id) ?? idea.title;
    tabsStore.openScript(idea.script_id, title);
    props.onClose();
  }

  // Esc schließt den Drawer (auch im Editor-Modus, weil er als Overlay
  // über dem Skript liegen kann).
  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!props.open) return;
      if (e.key !== "Escape") return;
      const target = e.target as HTMLElement | null;
      // Wenn der Cursor in einem Eingabefeld steht, lassen wir Esc
      // erst die lokale Aktion (Bearbeitung abbrechen) erledigen.
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        if (editingId()) return;
        if (draft().length > 0) {
          setDraft("");
          return;
        }
      }
      e.preventDefault();
      props.onClose();
    };
    document.addEventListener("keydown", onKey);
    onCleanup(() => document.removeEventListener("keydown", onKey));
    void ideasBus.version(); // Subscribe-Dummy.
  });

  return (
    <>
      {focusCapture()}
      <div
        class="ideas-scrim"
        classList={{ "is-on": props.open }}
        onClick={props.onClose}
      />
      <aside
        class="ideas-drawer"
        classList={{
          "is-open": props.open,
          "ideas-drawer-left": (props.position ?? "right") === "left",
          "ideas-drawer-right": (props.position ?? "right") === "right",
        }}
        aria-hidden={!props.open}
      >
        <div class="ideas-head">
          <div class="ideas-head-title">
            <span class="ideas-bulb"><BulbIcon /></span>
            <h2>Ideen</h2>
            <span class="ideas-head-count">{counts().open}</span>
          </div>
          <button class="icon-btn" onClick={props.onClose} title="Schließen (Esc)">×</button>
        </div>

        <div class="ideas-capture">
          <span class="ideas-capture-plus" aria-hidden="true">+</span>
          <input
            ref={captureRef}
            value={draft()}
            onInput={(e) => setDraft(e.currentTarget.value)}
            placeholder="Was schreibst du als Nächstes?"
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
              class="ideas-capture-go"
              onClick={() => void commitDraft()}
              title="Speichern (⏎)"
            >
              ✓
            </button>
          </Show>
        </div>

        <div class="ideas-segs" role="tablist">
          <button role="tab" classList={{ "is-on": tab() === "open" }} onClick={() => setTab("open")}>
            Offen <span class="ideas-seg-n">{counts().open}</span>
          </button>
          <button role="tab" classList={{ "is-on": tab() === "all" }} onClick={() => setTab("all")}>
            Alle <span class="ideas-seg-n">{counts().all}</span>
          </button>
          <button role="tab" classList={{ "is-on": tab() === "used" }} onClick={() => setTab("used")}>
            Verwendet <span class="ideas-seg-n">{counts().used}</span>
          </button>
        </div>

        <div class="ideas-body">
          <Show
            when={groups().length > 0}
            fallback={
              <IdeasEmpty
                tab={tab()}
                onFocusCapture={() => captureRef?.focus()}
              />
            }
          >
            <For each={groups()}>
              {(group) => (
                <section class="ideas-group">
                  <div class="ideas-group-label">{group.label}</div>
                  <div class="ideas-list">
                    <For each={group.items}>
                      {(idea) => (
                        <IdeaRow
                          idea={idea}
                          editing={editingId() === idea.id}
                          onStartEdit={() => setEditingId(idea.id)}
                          onCancelEdit={() => setEditingId(null)}
                          onConvert={() => void convert(idea)}
                          onDelete={() => void remove(idea)}
                          onOpenScript={() => openLinkedScript(idea)}
                          linkedScriptTitle={
                            idea.script_id ? scriptIndex().get(idea.script_id) ?? null : null
                          }
                        />
                      )}
                    </For>
                  </div>
                </section>
              )}
            </For>
          </Show>
        </div>

        <div class="ideas-foot">
          <span class="ideas-foot-hint">
            Schnell erfassen <span class="kbd kbd-inline">⌘I</span>
          </span>
        </div>
      </aside>
    </>
  );
}

function IdeasEmpty(props: { tab: Tab; onFocusCapture(): void }) {
  return (
    <div class="ideas-empty">
      <div class="ideas-empty-mark"><BulbIcon /></div>
      <Show
        when={props.tab !== "used"}
        fallback={
          <>
            <div class="ideas-empty-h">Noch keine Idee verwendet.</div>
            <div class="ideas-empty-sub">
              Wenn du aus einer Idee ein Skript machst, landet sie hier.
            </div>
          </>
        }
      >
        <div class="ideas-empty-h">Noch keine Ideen.</div>
        <div class="ideas-empty-sub">
          Tipp ein, was dir gerade einfällt — auch halbfertig.
        </div>
        <button
          class="btn ideas-empty-cta"
          onClick={props.onFocusCapture}
        >
          + Erste Idee
        </button>
      </Show>
    </div>
  );
}

function IdeaRow(props: {
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

  // Drafts werden aus den Props gespeist, solange wir NICHT im Edit-
  // Modus sind. Dadurch reagiert die Zeile auch auf externe Updates
  // (Bus-Refresh, parallele Conversion) und nicht nur auf einen
  // ID-Wechsel.
  createEffect(() => {
    if (!props.editing) {
      setTitleDraft(props.idea.title);
      setNotesDraft(props.idea.notes);
    }
  });

  async function save() {
    const t = titleDraft().trim();
    if (!t) {
      props.onCancelEdit();
      setTitleDraft(props.idea.title);
      return;
    }
    try {
      await ideasStore.updateIdea({ id: props.idea.id, title: t, notes: notesDraft() });
      props.onCancelEdit();
    } catch (err) {
      pushToast(`Fehler: ${(err as Error).message ?? err}`, "error");
    }
  }

  return (
    <>
      <Show
        when={!props.editing}
        fallback={
          <div class="idea-row idea-row-editing">
            <input
              class="idea-row-title-input"
              autofocus
              value={titleDraft()}
              onInput={(e) => setTitleDraft(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void save(); }
                if (e.key === "Escape") { e.preventDefault(); props.onCancelEdit(); }
              }}
              placeholder="Titel"
            />
            <textarea
              class="idea-row-notes-input"
              rows={3}
              value={notesDraft()}
              onInput={(e) => setNotesDraft(e.currentTarget.value)}
              placeholder="Stichpunkte, Hook, Setting … (optional)"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void save(); }
                if (e.key === "Escape") { e.preventDefault(); props.onCancelEdit(); }
              }}
            />
            <div class="idea-row-edit-foot">
              <button class="idea-row-edit-del" onClick={() => props.onDelete()} title="Löschen">
                Löschen
              </button>
              <div style="flex:1" />
              <button class="btn" onClick={() => props.onCancelEdit()}>Abbrechen</button>
              <button class="btn btn-primary" onClick={() => void save()}>Speichern</button>
            </div>
          </div>
        }
      >
        <div
          class="idea-row"
          classList={{ "is-used": used() }}
          onClick={() => !used() && props.onStartEdit()}
          onContextMenu={(e) => {
            e.preventDefault();
            if (!used()) props.onStartEdit();
          }}
        >
          <div class="idea-row-main">
            <div class="idea-row-text">
              <div class="idea-row-title">
                <Show when={used()}>
                  <span class="idea-row-check" aria-label="Verwendet">✓</span>
                </Show>
                {props.idea.title}
              </div>
              <Show when={used() && props.linkedScriptTitle}>
                <button
                  class="idea-row-link"
                  onClick={(e) => { e.stopPropagation(); props.onOpenScript(); }}
                  title="Verbundenes Skript öffnen"
                >
                  <DocIcon /> {props.linkedScriptTitle}
                </button>
              </Show>
              <Show when={!used() && props.idea.notes.trim()}>
                <div class="idea-row-preview">{props.idea.notes}</div>
              </Show>
              <Show when={!used()}>
                <div class="idea-row-meta">{relativeTime(props.idea.created_at)}</div>
              </Show>
            </div>
            <Show when={!used()}>
              <button
                class="idea-row-cta"
                onClick={(e) => { e.stopPropagation(); props.onConvert(); }}
                title="Aus Idee ein Skript machen"
              >
                Skript →
              </button>
            </Show>
          </div>
        </div>
      </Show>
    </>
  );
}

function BulbIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
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

// Verhindert dead-code-Warnungen für `foldersBus`-Bumps (kommen
// indirekt über convert-/delete-API). Die Datei selbst tut nichts mit
// `foldersBus`, aber die Konvertierung im Backend bumpt ihn.
void foldersBus;
