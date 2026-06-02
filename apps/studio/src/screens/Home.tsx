import { createSignal, For, Show } from "solid-js";
import { useNavigate, A } from "@solidjs/router";
import { convex, createQuery } from "../lib/convex";
import { api } from "../../convex/_generated/api";
import { useStudio } from "../context";
import { LoadingBlock, Empty, Modal } from "../components/ui";
import { withToast } from "../lib/ui";

export function Home() {
  const { isAgency } = useStudio();
  const navigate = useNavigate();
  const clients = createQuery(api.clients.list, {});
  const [newOpen, setNewOpen] = createSignal(false);
  const [name, setName] = createSignal("");
  const [busy, setBusy] = createSignal(false);

  const createClient = async () => {
    if (!name().trim()) return;
    setBusy(true);
    const id = await withToast(
      () => convex.mutation(api.clients.create, { name: name().trim() }),
      "Kunde angelegt",
    );
    setBusy(false);
    if (id) {
      setNewOpen(false);
      setName("");
      navigate(`/c/${id}`);
    }
  };

  return (
    <main class="page">
      <div class="page-head">
        <div>
          <h1 class="page-title">{isAgency() ? "Kunden" : "Meine Projekte"}</h1>
          <p class="page-sub">
            {isAgency()
              ? "Wähle einen Kunden, um Ideen und Skripte zu verwalten."
              : "Wähle einen Kunden, um freigegebene Inhalte zu sehen."}
          </p>
        </div>
        <div class="spacer" />
        <Show when={isAgency()}>
          <A class="btn" href="/admin">
            Verwaltung
          </A>
          <button class="btn btn-primary" onClick={() => setNewOpen(true)}>
            Neuer Kunde
          </button>
        </Show>
      </div>

      <Show when={!clients.loading()} fallback={<LoadingBlock />}>
        <Show
          when={(clients.data()?.length ?? 0) > 0}
          fallback={
            <Empty title={isAgency() ? "Noch keine Kunden" : "Noch keine Projekte freigegeben"}>
              <Show when={isAgency()}>
                <button class="btn btn-primary" onClick={() => setNewOpen(true)}>
                  Ersten Kunden anlegen
                </button>
              </Show>
            </Empty>
          }
        >
          <div class="card-grid">
            <For each={clients.data()}>
              {(c) => (
                <button class="client-card card" onClick={() => navigate(`/c/${c.id}`)}>
                  <span class="client-card-name">{c.name}</span>
                  <span class="client-card-counts">
                    {c.ideaCount} Ideen · {c.scriptCount} Skripte
                  </span>
                  <div class="client-card-flags">
                    <Show when={c.inReview > 0}>
                      <span class="badge badge-in_review">
                        {c.inReview} {isAgency() ? "beim Kunden" : "wartet auf dich"}
                      </span>
                    </Show>
                    <Show when={c.changesRequested > 0}>
                      <span class="badge badge-changes_requested">
                        {c.changesRequested} Änderungswunsch
                      </span>
                    </Show>
                  </div>
                </button>
              )}
            </For>
          </div>
        </Show>
      </Show>

      <Modal open={newOpen()} title="Neuer Kunde" onClose={() => setNewOpen(false)}>
        <label class="field">
          <span class="field-label">Name</span>
          <input
            class="input"
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && void createClient()}
            placeholder="z. B. Müller GmbH"
            autofocus
          />
        </label>
        <div class="modal-actions">
          <button class="btn" onClick={() => setNewOpen(false)}>
            Abbrechen
          </button>
          <button class="btn btn-primary" disabled={busy() || !name().trim()} onClick={() => void createClient()}>
            Anlegen
          </button>
        </div>
      </Modal>
    </main>
  );
}
