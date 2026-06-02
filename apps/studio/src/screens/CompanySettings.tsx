import { createEffect, createSignal, For, Show } from "solid-js";
import { A, useParams, useNavigate } from "@solidjs/router";
import { convex, createQuery } from "../lib/convex";
import { api } from "../../convex/_generated/api";
import { useStudio } from "../context";
import { LoadingBlock, Empty, Modal } from "../components/ui";
import { withToast, formatDate } from "../lib/ui";

export function CompanySettings() {
  const params = useParams();
  const navigate = useNavigate();
  const { isAgency } = useStudio();
  const clientId = () => params.clientId;

  createEffect(() => {
    if (!isAgency()) navigate(`/c/${clientId()}`, { replace: true });
  });

  const client = createQuery(api.clients.get, () => ({ clientId: clientId() as never }));
  const people = createQuery(api.users.listByClient, () => ({ clientId: clientId() as never }));

  // ---- company master data ----
  const [name, setName] = createSignal("");
  const [address, setAddress] = createSignal("");
  const [phone, setPhone] = createSignal("");
  const [website, setWebsite] = createSignal("");
  const [notes, setNotes] = createSignal("");
  const [seeded, setSeeded] = createSignal(false);
  createEffect(() => {
    const c = client.data();
    if (c && !seeded()) {
      setName(c.name);
      setAddress(c.address ?? "");
      setPhone(c.phone ?? "");
      setWebsite(c.website ?? "");
      setNotes(c.notes ?? "");
      setSeeded(true);
    }
  });
  const [saving, setSaving] = createSignal(false);
  const saveCompany = async () => {
    if (!name().trim()) return;
    setSaving(true);
    await withToast(
      () =>
        convex.mutation(api.clients.update, {
          clientId: clientId() as never,
          name: name().trim(),
          address: address(),
          phone: phone(),
          website: website(),
          notes: notes(),
        }),
      "Firmendaten gespeichert",
    );
    setSaving(false);
  };

  // ---- people ----
  const [addOpen, setAddOpen] = createSignal(false);
  const [pName, setPName] = createSignal("");
  const [pEmail, setPEmail] = createSignal("");
  const [pPw, setPPw] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const genPw = () =>
    setPPw(Math.random().toString(36).slice(2, 10) + "-" + Math.random().toString(36).slice(2, 6));
  const addPerson = async () => {
    if (!pName().trim() || !pEmail().trim() || pPw().length < 8) return;
    setBusy(true);
    const ok = await withToast(
      () =>
        convex.mutation(api.users.provision, {
          email: pEmail().trim(),
          password: pPw(),
          name: pName().trim(),
          role: "client",
          clientIds: [clientId() as never],
        }),
      "Zugang angelegt",
    );
    setBusy(false);
    if (ok !== undefined) {
      setAddOpen(false);
      setPName("");
      setPEmail("");
      setPPw("");
    }
  };

  const [renameOf, setRenameOf] = createSignal<{ id: string; name: string } | null>(null);
  const saveRename = async () => {
    const r = renameOf();
    if (!r || !r.name.trim()) return;
    await withToast(
      () => convex.mutation(api.users.updateName, { userId: r.id as never, name: r.name.trim() }),
      "Gespeichert",
    );
    setRenameOf(null);
  };
  const removePerson = async (id: string, name: string) => {
    if (!confirm(`Zugang von ${name} entziehen? Die Person kann sich dann nicht mehr einloggen.`)) return;
    await withToast(
      () => convex.mutation(api.users.removeAccess, { userId: id as never }),
      "Zugang entzogen",
    );
  };

  const deleteCompany = async () => {
    if (!confirm("Diese Firma mit allen Ordnern, Ideen und Skripten löschen? Das kann nicht rückgängig gemacht werden.")) return;
    const ok = await withToast(
      () => convex.mutation(api.clients.remove, { clientId: clientId() as never }),
      "Firma gelöscht",
    );
    if (ok !== undefined) navigate("/");
  };

  return (
    <main class="page" style="max-width:760px;">
      <Show when={!client.loading() && client.data()} fallback={<LoadingBlock />}>
        <div class="crumbs" style="margin-bottom:1rem;">
          <A href="/">Kunden</A>
          <span class="sep">/</span>
          <A href={`/c/${clientId()}`}>{client.data()?.name}</A>
          <span class="sep">/</span>
          <span class="cur">Einstellungen</span>
        </div>
        <div class="page-head">
          <div>
            <h1 class="page-title">{client.data()?.name}</h1>
            <p class="page-sub">Firmendaten und Zugänge verwalten.</p>
          </div>
        </div>

        <div class="settings-stack">
          <section class="card settings-card">
            <h2 class="settings-head">Firmendaten</h2>
            <label class="field">
              <span class="field-label">Firmenname *</span>
              <input class="input" value={name()} onInput={(e) => setName(e.currentTarget.value)} />
            </label>
            <label class="field" style="margin-top:0.6rem;">
              <span class="field-label">Anschrift</span>
              <textarea class="textarea" style="min-height:4rem;" value={address()} onInput={(e) => setAddress(e.currentTarget.value)} />
            </label>
            <div class="row" style="margin-top:0.6rem;align-items:flex-start;">
              <label class="field" style="flex:1;">
                <span class="field-label">Telefon</span>
                <input class="input" value={phone()} onInput={(e) => setPhone(e.currentTarget.value)} />
              </label>
              <label class="field" style="flex:1;">
                <span class="field-label">Webseite</span>
                <input class="input" value={website()} onInput={(e) => setWebsite(e.currentTarget.value)} />
              </label>
            </div>
            <label class="field" style="margin-top:0.6rem;">
              <span class="field-label">Notizen</span>
              <textarea class="textarea" value={notes()} onInput={(e) => setNotes(e.currentTarget.value)} />
            </label>
            <div class="row" style="margin-top:0.75rem;justify-content:flex-end;">
              <button class="btn btn-primary" disabled={saving() || !name().trim()} onClick={() => void saveCompany()}>
                Speichern
              </button>
            </div>
          </section>

          <section class="card settings-card">
            <div class="row">
              <h2 class="settings-head" style="margin:0;">Personen &amp; Zugänge</h2>
              <span class="spacer" />
              <button class="btn btn-primary btn-sm" onClick={() => { genPw(); setAddOpen(true); }}>
                + Person
              </button>
            </div>
            <Show
              when={(people.data()?.length ?? 0) > 0}
              fallback={<p class="settings-hint" style="margin-top:0.75rem;">Noch keine Zugänge für diese Firma.</p>}
            >
              <ul class="people-list">
                <For each={people.data()}>
                  {(p) => (
                    <li class="people-row">
                      <div class="user-main">
                        <span class="user-name">{p.name}</span>
                        <span class="user-email">{p.email}</span>
                      </div>
                      <span class="spacer" />
                      <span class="user-date">{formatDate(p.createdAt)}</span>
                      <button class="btn btn-ghost btn-sm" onClick={() => setRenameOf({ id: p.id, name: p.name })}>
                        Umbenennen
                      </button>
                      <button class="btn btn-ghost btn-sm" onClick={() => void removePerson(p.id, p.name)}>
                        Entziehen
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </section>

          <section class="card settings-card danger-zone">
            <h2 class="settings-head">Firma löschen</h2>
            <p class="settings-hint">Entfernt die Firma samt aller Ordner, Ideen, Skripte und Kommentare.</p>
            <div class="row" style="margin-top:0.5rem;">
              <button class="btn btn-danger" onClick={() => void deleteCompany()}>
                Firma löschen
              </button>
            </div>
          </section>
        </div>
      </Show>

      <Modal open={addOpen()} title="Person / Zugang anlegen" onClose={() => setAddOpen(false)}>
        <label class="field">
          <span class="field-label">Name</span>
          <input class="input" value={pName()} onInput={(e) => setPName(e.currentTarget.value)} autofocus />
        </label>
        <label class="field">
          <span class="field-label">E-Mail</span>
          <input class="input" type="email" value={pEmail()} onInput={(e) => setPEmail(e.currentTarget.value)} />
        </label>
        <label class="field">
          <span class="field-label">Passwort (mind. 8 Zeichen)</span>
          <div class="row">
            <input class="input" value={pPw()} onInput={(e) => setPPw(e.currentTarget.value)} />
            <button class="btn btn-sm" type="button" onClick={genPw}>
              Zufällig
            </button>
          </div>
        </label>
        <div class="modal-actions">
          <button class="btn" onClick={() => setAddOpen(false)}>
            Abbrechen
          </button>
          <button
            class="btn btn-primary"
            disabled={busy() || !pName().trim() || !pEmail().trim() || pPw().length < 8}
            onClick={() => void addPerson()}
          >
            Anlegen
          </button>
        </div>
      </Modal>

      <Modal open={renameOf() !== null} title="Person umbenennen" onClose={() => setRenameOf(null)}>
        <label class="field">
          <span class="field-label">Name</span>
          <input
            class="input"
            value={renameOf()?.name ?? ""}
            onInput={(e) => setRenameOf((r) => (r ? { ...r, name: e.currentTarget.value } : r))}
            autofocus
          />
        </label>
        <div class="modal-actions">
          <button class="btn" onClick={() => setRenameOf(null)}>
            Abbrechen
          </button>
          <button class="btn btn-primary" onClick={() => void saveRename()}>
            Speichern
          </button>
        </div>
      </Modal>
    </main>
  );
}
