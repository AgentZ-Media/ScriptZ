import { Show, onMount, type JSX } from "solid-js";
import { Router, Route, Navigate, A } from "@solidjs/router";
import { StudioProvider, useStudio } from "./context";
import { Login } from "./components/Login";
import { ToastHost } from "./components/ui";
import { consumeOttFromUrl, signOut } from "./lib/convexAuth";
import { settingsStore } from "@scriptz/core/stores/settings";
import { Home } from "./screens/Home";
import { ClientWorkspace } from "./screens/ClientWorkspace";
import { IdeaDetail } from "./screens/IdeaDetail";
import { ScriptEditor } from "./screens/ScriptEditor";
import { Admin } from "./screens/Admin";
import { Account } from "./screens/Account";
import { CompanySettings } from "./screens/CompanySettings";

function Loading() {
  return (
    <div class="center-screen">
      <div class="spinner" />
    </div>
  );
}

function NoAccess() {
  return (
    <div class="auth-screen">
      <div class="auth-card">
        <div class="auth-brand">
          <span class="auth-logo">ScriptZ</span>
          <span class="auth-logo-sub">Studio</span>
        </div>
        <p class="auth-tagline">
          Dein Konto ist angemeldet, aber noch keinem Workspace zugeordnet.
          Bitte wende dich an die Agentur.
        </p>
        <button class="btn btn-block" onClick={() => void signOut()}>
          Abmelden
        </button>
      </div>
    </div>
  );
}

function Shell(props: { children?: JSX.Element }) {
  const { auth, me, role } = useStudio();
  return (
    <Show when={!auth.isPending()} fallback={<Loading />}>
      <Show when={auth.isAuthenticated()} fallback={<Login />}>
        <Show when={auth.convexReady() && me() !== undefined} fallback={<Loading />}>
          <Show when={role()} fallback={<NoAccess />}>
            <div class="studio-root">
              <header class="topbar">
                <A class="topbar-logo" href="/">
                  ScriptZ <span>Studio</span>
                </A>
                <div class="topbar-spacer" />
                <div class="topbar-user">
                  <A class="topbar-account" href="/account" title="Mein Konto">
                    {me()?.name}
                  </A>
                  <span class="badge badge-role">{role() === "agency" ? "Agentur" : "Kunde"}</span>
                  <button
                    class="btn btn-sm btn-ghost btn-icon"
                    title="Hell / Dunkel"
                    aria-label="Theme wechseln"
                    onClick={() =>
                      void settingsStore.setTheme(
                        settingsStore.resolvedTheme() === "dark" ? "light" : "dark",
                      )
                    }
                  >
                    {settingsStore.resolvedTheme() === "dark" ? "☀" : "☾"}
                  </button>
                  <button class="btn btn-sm btn-ghost" onClick={() => void signOut()}>
                    Abmelden
                  </button>
                </div>
              </header>
              {props.children}
            </div>
          </Show>
        </Show>
      </Show>
    </Show>
  );
}

export default function App() {
  onMount(() => {
    void consumeOttFromUrl();
    void settingsStore.load();
  });
  return (
    <StudioProvider>
      <Router root={Shell}>
        <Route path="/" component={Home} />
        <Route path="/admin" component={Admin} />
        <Route path="/account" component={Account} />
        <Route path="/c/:clientId" component={ClientWorkspace} />
        <Route path="/c/:clientId/settings" component={CompanySettings} />
        <Route path="/c/:clientId/idea/:ideaId" component={IdeaDetail} />
        <Route path="/c/:clientId/script/:scriptId" component={ScriptEditor} />
        <Route path="*" component={() => <Navigate href="/" />} />
      </Router>
      <ToastHost />
    </StudioProvider>
  );
}
