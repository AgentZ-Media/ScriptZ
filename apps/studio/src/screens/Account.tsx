import { createEffect, createSignal, Show } from "solid-js";
import { A } from "@solidjs/router";
import { convex } from "../lib/convex";
import { api } from "../../convex/_generated/api";
import { useStudio } from "../context";
import { changeEmail, changePassword } from "../lib/convexAuth";
import { withToast, pushToast } from "../lib/ui";

export function Account() {
  const { me } = useStudio();

  const [name, setName] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [seeded, setSeeded] = createSignal(false);
  createEffect(() => {
    const m = me();
    if (m && !seeded()) {
      setName(m.name);
      setEmail(m.email);
      setSeeded(true);
    }
  });

  const [savingName, setSavingName] = createSignal(false);
  const saveName = async () => {
    if (!name().trim()) return;
    setSavingName(true);
    await withToast(
      () => convex.mutation(api.users.updateOwnProfile, { name: name().trim() }),
      "Name gespeichert",
    );
    setSavingName(false);
  };

  const [savingEmail, setSavingEmail] = createSignal(false);
  const saveEmail = async () => {
    const next = email().trim().toLowerCase();
    if (!next || next === me()?.email) return;
    setSavingEmail(true);
    const err = await changeEmail(next);
    if (err) {
      pushToast(err, "error");
      setSavingEmail(false);
      return;
    }
    await convex.mutation(api.users.updateOwnProfile, { email: next });
    pushToast("E-Mail geändert", "ok");
    setSavingEmail(false);
  };

  const [curPw, setCurPw] = createSignal("");
  const [newPw, setNewPw] = createSignal("");
  const [savingPw, setSavingPw] = createSignal(false);
  const savePassword = async () => {
    if (newPw().length < 8 || !curPw()) return;
    setSavingPw(true);
    const err = await changePassword(curPw(), newPw());
    setSavingPw(false);
    if (err) {
      pushToast(err, "error");
      return;
    }
    setCurPw("");
    setNewPw("");
    pushToast("Passwort geändert", "ok");
  };

  return (
    <main class="page" style="max-width:640px;">
      <div class="crumbs" style="margin-bottom:1rem;">
        <A href="/">Start</A>
        <span class="sep">/</span>
        <span class="cur">Mein Konto</span>
      </div>
      <div class="page-head">
        <div>
          <h1 class="page-title">Mein Konto</h1>
          <p class="page-sub">Name, E-Mail und Passwort verwalten.</p>
        </div>
      </div>

      <div class="settings-stack">
        <section class="card settings-card">
          <h2 class="settings-head">Name</h2>
          <div class="row">
            <input class="input" value={name()} onInput={(e) => setName(e.currentTarget.value)} />
            <button
              class="btn btn-primary"
              disabled={savingName() || !name().trim() || name().trim() === me()?.name}
              onClick={() => void saveName()}
            >
              Speichern
            </button>
          </div>
        </section>

        <section class="card settings-card">
          <h2 class="settings-head">E-Mail</h2>
          <p class="settings-hint">Wird auch zum Anmelden verwendet.</p>
          <div class="row">
            <input class="input" type="email" value={email()} onInput={(e) => setEmail(e.currentTarget.value)} />
            <button
              class="btn btn-primary"
              disabled={savingEmail() || !email().trim() || email().trim().toLowerCase() === me()?.email}
              onClick={() => void saveEmail()}
            >
              Ändern
            </button>
          </div>
        </section>

        <section class="card settings-card">
          <h2 class="settings-head">Passwort</h2>
          <label class="field">
            <span class="field-label">Aktuelles Passwort</span>
            <input class="input" type="password" autocomplete="current-password" value={curPw()} onInput={(e) => setCurPw(e.currentTarget.value)} />
          </label>
          <label class="field" style="margin-top:0.6rem;">
            <span class="field-label">Neues Passwort (mind. 8 Zeichen)</span>
            <input class="input" type="password" autocomplete="new-password" value={newPw()} onInput={(e) => setNewPw(e.currentTarget.value)} />
          </label>
          <div class="row" style="margin-top:0.75rem;justify-content:flex-end;">
            <button
              class="btn btn-primary"
              disabled={savingPw() || newPw().length < 8 || !curPw()}
              onClick={() => void savePassword()}
            >
              Passwort ändern
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
