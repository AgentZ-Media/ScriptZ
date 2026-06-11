import { createEffect, createSignal, For, Show } from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import { convex, createQuery } from "../lib/convex";
import { api } from "../../convex/_generated/api";
import { useStudio } from "../context";
import { LoadingBlock, Empty, Modal } from "../components/ui";
import { EditorConnection } from "../components/EditorConnection";
import { withToast, formatDate } from "../lib/ui";

export function Admin() {
  const { isAgency } = useStudio();
  const navigate = useNavigate();
  // Clients have no business here - send them home.
  createEffect(() => {
    if (!isAgency()) navigate("/", { replace: true });
  });

  const users = createQuery(api.users.list, () => (isAgency() ? {} : "skip"));
  const clients = createQuery(api.clients.list, () => (isAgency() ? {} : "skip"));

  const [open, setOpen] = createSignal(false);
  const [name, setName] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [role, setRole] = createSignal<"agency" | "client">("client");
  const [pickedClients, setPickedClients] = createSignal<string[]>([]);
  const [busy, setBusy] = createSignal(false);

  const toggleClient = (id: string) =>
    setPickedClients((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const genPassword = () =>
    setPassword(Math.random().toString(36).slice(2, 10) + "-" + Math.random().toString(36).slice(2, 6));

  const provision = async () => {
    if (!name().trim() || !email().trim() || password().length < 8) return;
    setBusy(true);
    const ok = await withToast(
      () =>
        convex.mutation(api.users.provision, {
          email: email().trim(),
          password: password(),
          name: name().trim(),
          role: role(),
          clientIds: role() === "client" ? (pickedClients() as never[]) : undefined,
        }),
      "Zugang angelegt",
    );
    setBusy(false);
    if (ok !== undefined) {
      setOpen(false);
      setName("");
      setEmail("");
      setPassword("");
      setRole("client");
      setPickedClients([]);
    }
  };

  // membership editor
  const [memberOf, setMemberOf] = createSignal<{ id: string; name: string; clients: string[] } | null>(null);
  const saveMemberships = async () => {
    const m = memberOf();
    if (!m) return;
    await withToast(
      () =>
        convex.mutation(api.users.setClientMemberships, {
          userId: m.id as never,
          clientIds: m.clients as never[],
        }),
      "Zuordnung gespeichert",
    );
    setMemberOf(null);
  };

  return (
    <main class="page">
      <Show when={isAgency()} fallback={<Empty title="Kein Zugriff" />}>
        <div class="crumbs" style="margin-bottom:1rem;">
          <A href="/">Kunden</A>
          <span class="sep">/</span>
          <span class="cur">Verwaltung</span>
        </div>
        <div class="page-head">
          <div>
            <h1 class="page-title">Verwaltung</h1>
            <p class="page-sub">Zugänge für Agentur-Team und Kunden anlegen.</p>
          </div>
          <div class="spacer" />
          <button class="btn btn-primary" onClick={() => { genPassword(); setOpen(true); }}>
            Neuer Zugang
          </button>
        </div>

        <Show when={!users.loading()} fallback={<LoadingBlock />}>
          <Show when={(users.data()?.length ?? 0) > 0} fallback={<Empty title="Noch keine Nutzer" />}>
            <ul class="user-list">
              <For each={users.data()}>
                {(u) => (
                  <li class="user-row card">
                    <div class="user-main">
                      <span class="user-name">{u.name}</span>
                      <span class="user-email">{u.email}</span>
                    </div>
                    <span class={`badge badge-role`}>{u.role === "agency" ? "Agentur" : "Kunde"}</span>
                    <Show when={u.role === "client"}>
                      <span class="user-clients">
                        {u.clients.length > 0 ? u.clients.map((c) => c.name).join(", ") : "— keine Kunden —"}
                      </span>
                      <button
                        class="btn btn-ghost btn-sm"
                        onClick={() =>
                          setMemberOf({ id: u.id, name: u.name, clients: u.clients.map((c) => c.id) })
                        }
                      >
                        Kunden zuordnen
                      </button>
                    </Show>
                    <span class="spacer" />
                    <span class="user-date">{formatDate(u.createdAt)}</span>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </Show>

        <EditorConnection />
      </Show>

      {/* Provision */}
      <Modal open={open()} title="Neuen Zugang anlegen" onClose={() => setOpen(false)}>
        <label class="field">
          <span class="field-label">Name</span>
          <input class="input" value={name()} onInput={(e) => setName(e.currentTarget.value)} autofocus />
        </label>
        <label class="field">
          <span class="field-label">E-Mail</span>
          <input class="input" type="email" value={email()} onInput={(e) => setEmail(e.currentTarget.value)} />
        </label>
        <label class="field">
          <span class="field-label">Passwort (mind. 8 Zeichen)</span>
          <div class="row">
            <input class="input" value={password()} onInput={(e) => setPassword(e.currentTarget.value)} />
            <button class="btn btn-sm" type="button" onClick={genPassword}>
              Zufällig
            </button>
          </div>
        </label>
        <label class="field">
          <span class="field-label">Rolle</span>
          <select class="select" value={role()} onChange={(e) => setRole(e.currentTarget.value as "agency" | "client")}>
            <option value="client">Kunde</option>
            <option value="agency">Agentur</option>
          </select>
        </label>
        <Show when={role() === "client"}>
          <div class="field">
            <span class="field-label">Kunden-Zuordnung</span>
            <div class="checklist">
              <For each={clients.data() ?? []}>
                {(c) => (
                  <label class="check">
                    <input
                      type="checkbox"
                      checked={pickedClients().includes(c.id)}
                      onChange={() => toggleClient(c.id)}
                    />
                    {c.name}
                  </label>
                )}
              </For>
              <Show when={(clients.data()?.length ?? 0) === 0}>
                <span class="page-sub">Erst einen Kunden anlegen.</span>
              </Show>
            </div>
          </div>
        </Show>
        <div class="modal-actions">
          <button class="btn" onClick={() => setOpen(false)}>
            Abbrechen
          </button>
          <button
            class="btn btn-primary"
            disabled={busy() || !name().trim() || !email().trim() || password().length < 8}
            onClick={() => void provision()}
          >
            Anlegen
          </button>
        </div>
      </Modal>

      {/* Memberships */}
      <Modal open={memberOf() !== null} title={`Kunden für ${memberOf()?.name ?? ""}`} onClose={() => setMemberOf(null)}>
        <div class="checklist">
          <For each={clients.data() ?? []}>
            {(c) => (
              <label class="check">
                <input
                  type="checkbox"
                  checked={memberOf()?.clients.includes(c.id) ?? false}
                  onChange={() =>
                    setMemberOf((m) =>
                      m
                        ? {
                            ...m,
                            clients: m.clients.includes(c.id)
                              ? m.clients.filter((x) => x !== c.id)
                              : [...m.clients, c.id],
                          }
                        : m,
                    )
                  }
                />
                {c.name}
              </label>
            )}
          </For>
        </div>
        <div class="modal-actions">
          <button class="btn" onClick={() => setMemberOf(null)}>
            Abbrechen
          </button>
          <button class="btn btn-primary" onClick={() => void saveMemberships()}>
            Speichern
          </button>
        </div>
      </Modal>
    </main>
  );
}
