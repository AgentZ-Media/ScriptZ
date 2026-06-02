import { createEffect, createSignal, Show } from "solid-js";
import { useParams, useNavigate, A } from "@solidjs/router";
import { convex, createQuery } from "../lib/convex";
import { api } from "../../convex/_generated/api";
import { useStudio } from "../context";
import { LoadingBlock, StatusBadge } from "../components/ui";
import { WorkflowBar } from "../components/WorkflowBar";
import { CommentsPanel } from "../components/CommentsPanel";
import { withToast, statusLabel } from "../lib/ui";

export function IdeaDetail() {
  const params = useParams();
  const navigate = useNavigate();
  const { isAgency } = useStudio();
  const idea = createQuery(api.ideas.get, () => ({ ideaId: params.ideaId as never }));

  const [title, setTitle] = createSignal("");
  const [notes, setNotes] = createSignal("");
  const [seeded, setSeeded] = createSignal<string | null>(null);
  createEffect(() => {
    const d = idea.data();
    if (d && seeded() !== d.id) {
      setTitle(d.title);
      setNotes(d.notes);
      setSeeded(d.id);
    }
  });

  const dirty = () => {
    const d = idea.data();
    return d ? title() !== d.title || notes() !== d.notes : false;
  };

  const save = async () => {
    await withToast(
      () =>
        convex.mutation(api.ideas.update, {
          ideaId: params.ideaId as never,
          title: title().trim(),
          notes: notes(),
        }),
      "Gespeichert",
    );
  };

  const convert = async () => {
    const scriptId = await withToast(
      () => convex.mutation(api.ideas.convertToScript, { ideaId: params.ideaId as never }),
      "Skript aus Idee erstellt",
    );
    if (scriptId) navigate(`/c/${params.clientId}/script/${scriptId}`);
  };

  const del = async () => {
    if (!confirm("Diese Idee löschen?")) return;
    const ok = await withToast(
      () => convex.mutation(api.ideas.remove, { ideaId: params.ideaId as never }),
      "Idee gelöscht",
    );
    if (ok !== undefined) navigate(`/c/${params.clientId}`);
  };

  return (
    <main class="page">
      <Show when={!idea.loading() && idea.data()} fallback={<LoadingBlock />}>
        {(d) => (
          <>
            <div class="crumbs" style="margin-bottom:1rem;">
              <A href="/">Kunden</A>
              <span class="sep">/</span>
              <A href={`/c/${params.clientId}`}>zurück</A>
              <span class="sep">/</span>
              <span class="cur">Idee</span>
            </div>

            <div class="detail-grid">
              <div class="detail-main card">
                <div class="row" style="margin-bottom:0.75rem;">
                  <StatusBadge status={d().status} />
                  <span class="spacer" />
                  <Show when={isAgency()}>
                    <button class="btn btn-ghost btn-sm" onClick={() => void del()}>
                      Löschen
                    </button>
                  </Show>
                </div>

                <Show
                  when={isAgency()}
                  fallback={
                    <>
                      <h1 class="detail-title-static">{d().title}</h1>
                      <p class="detail-notes-static">{d().notes || "Keine Notizen."}</p>
                    </>
                  }
                >
                  <label class="field">
                    <span class="field-label">Titel</span>
                    <input class="input" value={title()} onInput={(e) => setTitle(e.currentTarget.value)} />
                  </label>
                  <label class="field" style="margin-top:0.75rem;">
                    <span class="field-label">Notizen</span>
                    <textarea
                      class="textarea"
                      style="min-height:10rem;"
                      value={notes()}
                      onInput={(e) => setNotes(e.currentTarget.value)}
                    />
                  </label>
                  <div class="row" style="margin-top:0.75rem;">
                    <button class="btn btn-primary btn-sm" disabled={!dirty()} onClick={() => void save()}>
                      Speichern
                    </button>
                    <span class="spacer" />
                    <Show when={d().scriptId} fallback={
                      <button class="btn btn-sm" onClick={() => void convert()}>
                        In Skript überführen
                      </button>
                    }>
                      <button class="btn btn-sm" onClick={() => navigate(`/c/${params.clientId}/script/${d().scriptId}`)}>
                        Zum Skript →
                      </button>
                    </Show>
                  </div>
                </Show>
              </div>

              <aside class="detail-side">
                <div class="card detail-workflow">
                  <h3 class="detail-side-head">Status: {statusLabel(d().status)}</h3>
                  <Show when={d().decisionNote}>
                    <p class="decision-note">„{d().decisionNote}"</p>
                  </Show>
                  <WorkflowBar targetType="idea" id={d().id} status={d().status} isAgency={isAgency()} />
                </div>
                <div class="card">
                  <CommentsPanel targetType="idea" targetId={d().id} />
                </div>
              </aside>
            </div>
          </>
        )}
      </Show>
    </main>
  );
}
