import { createSignal } from "solid-js";
import { Show } from "solid-js";
import { signIn } from "../lib/convexAuth";

export function Login() {
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);

  const submit = async (e: Event) => {
    e.preventDefault();
    if (busy()) return;
    setBusy(true);
    setError(null);
    const msg = await signIn(email(), password());
    setBusy(false);
    if (msg) setError(msg);
  };

  return (
    <div class="auth-screen">
      <form class="auth-card" onSubmit={submit}>
        <div class="auth-brand">
          <span class="auth-logo">ScriptZ</span>
          <span class="auth-logo-sub">Studio</span>
        </div>
        <p class="auth-tagline">Workspace für Ideen, Skripte und Kunden-Freigaben</p>

        <label class="field">
          <span class="field-label">E-Mail</span>
          <input
            class="input"
            type="email"
            autocomplete="username"
            value={email()}
            onInput={(e) => setEmail(e.currentTarget.value)}
            required
          />
        </label>
        <label class="field">
          <span class="field-label">Passwort</span>
          <input
            class="input"
            type="password"
            autocomplete="current-password"
            value={password()}
            onInput={(e) => setPassword(e.currentTarget.value)}
            required
          />
        </label>

        <Show when={error()}>
          <p class="auth-error" role="alert">
            {error()}
          </p>
        </Show>

        <button class="btn btn-primary btn-block" type="submit" disabled={busy()}>
          {busy() ? "Anmelden …" : "Anmelden"}
        </button>
        <p class="auth-hint">
          Kein Konto? Zugänge werden von der Agentur vergeben.
        </p>
      </form>
    </div>
  );
}
