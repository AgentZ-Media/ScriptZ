import {
  Show,
  createSignal,
  createEffect,
  onMount,
  onCleanup,
  Switch,
  Match,
  ErrorBoundary,
  Suspense,
} from "solid-js";
import { settingsStore } from "~/stores/settings";
import { tabsStore } from "~/stores/tabs";
import { pushToast } from "~/stores/toasts";
import { scriptsBus } from "~/lib/scriptsBus";
import { dailyStatsBus } from "~/lib/dailyStatsBus";
import { api } from "~/lib/api";
import TabBar from "~/components/TabBar";
import ScriptView from "~/components/Editor/ScriptView";
import Browser from "~/components/Browser/Browser";
import { CommandBar } from "~/components/CommandBar/CommandBar";
import { SettingsDialog } from "~/components/Settings/SettingsDialog";
import { NewScriptDialog } from "~/components/Browser/NewScriptDialog";
import { ExportDialog } from "~/components/Editor/ExportDialog";
import ToastHost from "~/components/Common/ToastHost";
import { IdeasDrawer } from "~/components/Ideas/IdeasDrawer";
import { IdeasToggle } from "~/components/Ideas/IdeasToggle";
import { IdeaQuickCapture } from "~/components/Ideas/IdeaQuickCapture";
import { IdeasView } from "~/components/Ideas/IdeasView";
import "~/components/Ideas/IdeasDrawer.css";
import { ensureWelcomeContent } from "~/lib/welcome";
import { flushAll } from "~/lib/saveFlush";

import "./components/Common/Common.css";

export default function App() {
  const [bootReady, setBootReady] = createSignal(false);
  const [cmdkOpen, setCmdkOpen] = createSignal(false);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [newScriptOpen, setNewScriptOpen] = createSignal(false);
  const [newScriptFolder, setNewScriptFolder] = createSignal<string | null>(null);
  const [exportOpen, setExportOpen] = createSignal(false);
  const [ideasOpen, setIdeasOpen] = createSignal(false);
  const [ideaCaptureOpen, setIdeaCaptureOpen] = createSignal(false);
  // Initial true: per Default startet ein Skript im Fokus-Modus (ruhiger
  // Schreib-Modus, Toolbar + Cast-Rail aus). Wer das nicht will, deaktiviert
  // den Default in den Einstellungen → Editor.
  const [focusMode, setFocusMode] = createSignal(true);

  const activeScriptId = (): string | null => tabsStore.activeScript()?.scriptId ?? null;
  const activeScriptTitle = (): string =>
    tabsStore.activeScript()?.scriptTitle || "Unbenannt";

  const openExport = () => {
    if (activeScriptId()) setExportOpen(true);
  };

  onMount(async () => {
    try {
      // Die drei Boot-Schritte sind voneinander unabhängig:
      // - settingsStore.load liest 6 settings-Rows (eigenes Promise.all)
      // - ensureWelcomeContent prüft den Seed-Marker und legt ggf. das
      //   Tutorial-Skript an
      // - tabsStore.load liest die persistierten Tab-IDs und filtert sie
      //   gegen die Skript-Liste
      // Sequentiell waren das ~3× IPC-Roundtrip-Latenz; parallel halbiert
      // sich die "schwarzer Bildschirm"-Zeit beim Start.
      await Promise.all([
        settingsStore.load(),
        ensureWelcomeContent(),
        tabsStore.load(),
      ]);
    } catch (err) {
      console.error("[scriptz] boot failed", err);
      pushToast(`Start fehlgeschlagen: ${(err as Error).message ?? err}`, "error");
    } finally {
      setBootReady(true);
    }
  });

  // Wire window-close-request → drain all pending writes before letting
  // Tauri destroy the window.
  onMount(() => {
    let unlisten: (() => void) | null = null;
    let closing = false;
    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        unlisten = await win.onCloseRequested(async (event) => {
          if (closing) return;
          event.preventDefault();
          closing = true;
          try {
            await flushAll(2000);
          } finally {
            try {
              await win.destroy();
            } catch {
              try { await win.close(); } catch { /* nothing left */ }
            }
          }
        });
      } catch (err) {
        console.warn("[scriptz] close-flush hook unavailable", err);
      }
    })();
    onCleanup(() => {
      try { unlisten?.(); } catch { /* ignore */ }
    });
  });

  // Reconcile tabs against the live script list whenever the list changes.
  createEffect(() => {
    scriptsBus.version();
    void (async () => {
      try {
        const list = await api.listScripts({});
        const live = new Set(list.map((s) => s.id));
        tabsStore.reconcile(live);
      } catch { /* silent */ }
    })();
  });

  // Initial-Refresh der Schreibstatistik beim Boot.
  createEffect(() => {
    if (!bootReady()) return;
    dailyStatsBus.bump();
  });

  onMount(() => {
    const handler = (ev: KeyboardEvent) => {
      const cmd = ev.metaKey || ev.ctrlKey;
      if (!cmd) return;

      if (ev.key.toLowerCase() === "t" && !ev.shiftKey) {
        ev.preventDefault();
        tabsStore.openBrowser();
        return;
      }
      if (ev.key.toLowerCase() === "w" && !ev.shiftKey) {
        ev.preventDefault();
        const id = tabsStore.activeTabId();
        if (id) tabsStore.closeTab(id);
        // Auf Home tut ⌘W bewusst nichts — Home ist nicht schließbar.
        return;
      }
      if (ev.key.toLowerCase() === "k" && !ev.shiftKey) {
        ev.preventDefault();
        setCmdkOpen(true);
        return;
      }
      if (ev.key === ",") {
        ev.preventDefault();
        setSettingsOpen(true);
        return;
      }
      if (ev.key.toLowerCase() === "n" && !ev.shiftKey) {
        ev.preventDefault();
        setNewScriptFolder(null);
        setNewScriptOpen(true);
        return;
      }
      if (ev.key.toLowerCase() === "i" && !ev.shiftKey) {
        // Im Fokus-Modus ist die Ideen-Inbox bewusst aus dem Weg -
        // Quick-Capture greift dann auch nicht.
        if (focusMode()) {
          ev.preventDefault();
          return;
        }
        ev.preventDefault();
        setIdeaCaptureOpen(true);
        return;
      }
      if (ev.key.toLowerCase() === "e" && !ev.shiftKey) {
        if (activeScriptId()) {
          ev.preventDefault();
          openExport();
        }
        return;
      }
      // Fokus-Modus ⇧⌘F (nur sinnvoll im Skript-Tab; toggelt sonst still).
      if (ev.shiftKey && ev.key.toLowerCase() === "f") {
        ev.preventDefault();
        setFocusMode((f) => !f);
        return;
      }
      // Tab cycling: ⌘⌥← / ⌘⌥→
      if (ev.altKey && (ev.key === "ArrowLeft" || ev.key === "ArrowRight")) {
        ev.preventDefault();
        tabsStore.cycle(ev.key === "ArrowRight" ? 1 : -1);
        return;
      }
      if (ev.key === "Tab" && !ev.altKey) {
        ev.preventDefault();
        tabsStore.cycle(ev.shiftKey ? -1 : 1);
        return;
      }
      // ⌘0 → Home, ⌘1..⌘9 → Skript-Tabs
      if (/^[0-9]$/.test(ev.key) && !ev.shiftKey && !ev.altKey) {
        const target = ev.target as HTMLElement | null;
        const isTextField =
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement ||
          (target?.isContentEditable ?? false);
        if (isTextField) return;
        ev.preventDefault();
        tabsStore.activateByIndex(parseInt(ev.key, 10));
      }
    };
    window.addEventListener("keydown", handler);
    onCleanup(() => window.removeEventListener("keydown", handler));
  });

  // Beim Wechsel auf Home oder Ideen automatisch Fokus-Modus aus
  // (sonst dimmt sich die Titlebar in einer Listenansicht unnötig).
  createEffect(() => {
    if ((tabsStore.isHome() || tabsStore.isIdeas()) && focusMode()) setFocusMode(false);
  });

  // Im Skript-Tab den Fokus-Modus auf den Settings-Default zurückziehen,
  // sobald die Settings geladen sind und immer wenn der User auf einem
  // Skript-Tab ist. Sich-merken einer manuellen ⇧⌘F-Wahl pro Skript-Wechsel
  // ist bewusst nicht implementiert — der Default ist die Wahrheit, ⇧⌘F
  // kippt sie für die aktuelle Sitzung.
  createEffect(() => {
    if (!settingsStore.loaded()) return;
    if (tabsStore.isHome() || tabsStore.isIdeas()) return;
    setFocusMode(settingsStore.focusModeDefault());
  });

  // Fokus-Modus räumt sämtliche Ideen-Overlays mit weg - egal ob ein
  // bereits offener Drawer oder eine laufende Quick-Capture.
  createEffect(() => {
    if (focusMode()) {
      setIdeasOpen(false);
      setIdeaCaptureOpen(false);
    }
  });

  const onCreatedScript = () => {
    setNewScriptOpen(false);
  };

  // ---- View-Transition: Tab-Wechsel & Home <-> Editor ----
  let appMainRef: HTMLElement | undefined;
  let viewFrameRef: HTMLDivElement | undefined;
  type ViewRoute = "home" | "ideas" | "script";
  let prevState: { route: ViewRoute; id: string | null } | null = null;
  createEffect(() => {
    const tabId = tabsStore.activeTabId();
    const isHome = tabsStore.isHome();
    const isIdeas = tabsStore.isIdeas();
    if (!appMainRef || !viewFrameRef) return;
    const cur: { route: ViewRoute; id: string | null } = isHome
      ? { route: "home", id: null }
      : isIdeas
        ? { route: "ideas", id: null }
        : { route: "script", id: tabId };
    if (prevState === null) {
      prevState = cur;
      return;
    }
    if (prevState.route === cur.route && prevState.id === cur.id) return;

    let dir: "forward" | "backward" | "into-script" | "back-to-browser";
    if (prevState.route === "home" && cur.route === "script") {
      dir = "into-script";
    } else if (prevState.route === "script" && cur.route === "home") {
      dir = "back-to-browser";
    } else if (prevState.route === "script" && cur.route === "script") {
      const list = tabsStore.tabs();
      const oldIdx = list.findIndex((t) => t.id === prevState!.id);
      const newIdx = list.findIndex((t) => t.id === cur.id);
      dir = oldIdx === -1 || newIdx === -1 || newIdx >= oldIdx
        ? "forward"
        : "backward";
    } else {
      // Home<->Ideas oder Ideas<->Skript: einfache horizontale Bewegung.
      dir = "forward";
    }
    prevState = cur;

    appMainRef.dataset.viewDir = dir;
    viewFrameRef.classList.remove("is-animating");
    void viewFrameRef.offsetWidth;
    viewFrameRef.classList.add("is-animating");
  });

  return (
    <div
      class="app-root"
      classList={{
        "is-focus": focusMode() && !tabsStore.isHome() && !tabsStore.isIdeas(),
      }}
    >
      <Show when={bootReady()} fallback={<BootScreen />}>
        <TabBar
          onNewScript={() => {
            setNewScriptFolder(null);
            setNewScriptOpen(true);
          }}
        />

        <main class="app-main" ref={appMainRef}>
          <div class="view-frame" ref={viewFrameRef}>
            <Switch>
              <Match when={tabsStore.isHome()}>
                <Browser
                  onNewScript={(folderId) => {
                    setNewScriptFolder(folderId ?? null);
                    setNewScriptOpen(true);
                  }}
                  onOpenSettings={() => setSettingsOpen(true)}
                  onOpenCmdK={() => setCmdkOpen(true)}
                />
              </Match>
              <Match when={tabsStore.isIdeas()}>
                <IdeasView />
              </Match>
              <Match when={tabsStore.activeScript()}>
                {(t) => (
                  <ErrorBoundary fallback={(err) => <div class="error-pane">Fehler: {String(err)}</div>}>
                    <Suspense fallback={<div class="loading-pane">Lade Skript…</div>}>
                      <ScriptView
                        scriptId={t().scriptId}
                        focusMode={focusMode()}
                        onToggleFocus={() => setFocusMode((f) => !f)}
                        onBackToHome={() => tabsStore.openBrowser()}
                        onOpenExport={openExport}
                      />
                    </Suspense>
                  </ErrorBoundary>
                )}
              </Match>
            </Switch>
          </div>
        </main>

        <CommandBar open={cmdkOpen()} onClose={() => setCmdkOpen(false)} />
        <SettingsDialog open={settingsOpen()} onClose={() => setSettingsOpen(false)} />
        <Show when={newScriptOpen()}>
          <NewScriptDialog
            onClose={() => setNewScriptOpen(false)}
            onCreated={onCreatedScript}
            defaultFolderId={newScriptFolder()}
          />
        </Show>
        <Show when={activeScriptId()}>
          <ExportDialog
            open={exportOpen()}
            onClose={() => setExportOpen(false)}
            scriptId={activeScriptId()!}
            scriptTitle={activeScriptTitle()}
          />
        </Show>
        {/* Im Editor läuft die Ideen-Pille auf der LINKEN Seite, weil
            die rechte Bildschirmkante vom Editor-Rail belegt ist. Auf
            Home bleibt sie rechts (passt besser zur "+ Neu"-Ecke).
            Auf der Ideen-Vollseite blenden wir Drawer & Toggle aus -
            dort ist der Inhalt eh schon da, eine zweite Liste daneben
            wäre Doppel-Information. Quick-Capture bleibt aktiv, damit
            ⌘I überall greift. */}
        <Show when={!focusMode() && !tabsStore.isIdeas()}>
          <IdeasToggle
            open={ideasOpen()}
            onClick={() => setIdeasOpen(true)}
            position={tabsStore.isHome() ? "right" : "left"}
          />
          <IdeasDrawer
            open={ideasOpen()}
            onClose={() => setIdeasOpen(false)}
            position={tabsStore.isHome() ? "right" : "left"}
          />
        </Show>
        <Show when={!focusMode()}>
          <IdeaQuickCapture
            open={ideaCaptureOpen()}
            onClose={() => setIdeaCaptureOpen(false)}
          />
        </Show>
        <ToastHost />
      </Show>
    </div>
  );
}

function BootScreen() {
  return (
    <div class="boot-screen">
      <div class="boot-logo">ScriptZ</div>
      <div class="boot-spinner" />
    </div>
  );
}
