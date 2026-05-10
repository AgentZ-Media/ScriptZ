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
import { foldersBus } from "~/lib/foldersBus";
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
import { IdeaQuickCapture } from "~/components/Ideas/IdeaQuickCapture";
import { IdeasView } from "~/components/Ideas/IdeasView";
import { ensureWelcomeContent } from "~/lib/welcome";
import { flushAll } from "~/lib/saveFlush";
import { OnboardingDialog, ONBOARDING_KEY } from "~/components/Onboarding/OnboardingDialog";

import "./components/Common/Common.css";

export default function App() {
  const [bootReady, setBootReady] = createSignal(false);
  const [cmdkOpen, setCmdkOpen] = createSignal(false);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [newScriptOpen, setNewScriptOpen] = createSignal(false);
  const [newScriptFolder, setNewScriptFolder] = createSignal<string | null>(null);
  const [exportOpen, setExportOpen] = createSignal(false);
  const [ideaCaptureOpen, setIdeaCaptureOpen] = createSignal(false);
  const [onboardingOpen, setOnboardingOpen] = createSignal(false);
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

  /** Schnell-Erstellen: ⌘N und der "+"-Knopf in der Tab-Bar legen direkt
   *  ein Skript an, ohne den NewScriptDialog zu öffnen - das spart einen
   *  Klick und einen Tipp-Vorgang. Der "+ Neu"-Knopf im Browser-Header
   *  behält den Modal (für die Ordner-Auswahl). Skripte ohne Titel
   *  starten als "Unbenannt"; ScriptView zwingt in dem Fall die Toolbar
   *  sichtbar, damit der User den Titel inline setzen kann statt 17
   *  Skripte mit dem Default-Namen anzulegen. */
  const quickCreateScript = async () => {
    try {
      const created = await api.createScript({});
      scriptsBus.bump();
      foldersBus.bump();
      tabsStore.openScript(created.id, created.title);
    } catch (err) {
      pushToast(`Fehler: ${(err as Error).message ?? err}`, "error");
    }
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
        // Bestandsskripte (Sentinel aus Migration 005) einmalig
        // nachziehen, damit die Browser-Übersicht sofort korrekte
        // Spielzeiten zeigt - ohne diesen Backfill müsste der User
        // jedes Skript einmal öffnen+speichern, bevor das Label
        // erscheint. Idempotent, fehlertolerant - nicht startblockend.
        api.backfillRuntimeStats().catch((err) => {
          console.warn("[scriptz] runtime backfill skipped", err);
        }),
      ]);
    } catch (err) {
      console.error("[scriptz] boot failed", err);
      pushToast(`Start fehlgeschlagen: ${(err as Error).message ?? err}`, "error");
    } finally {
      setBootReady(true);
    }
    // Onboarding nur beim ersten Start. Nach setBootReady, damit das
    // Overlay nicht über den Boot-Screen knallt.
    try {
      const done = await api.getAppState(ONBOARDING_KEY);
      if (!done) setOnboardingOpen(true);
    } catch {
      /* nicht blockend */
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
        void quickCreateScript();
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

  // Im Skript-Tab den Fokus-Modus pro Tab-Wechsel neu setzen:
  //  - Default: Settings-Wert (focusModeDefault)
  //  - Override: bei "Unbenannt"-Skripten zwingend AUS, damit die
  //    Toolbar mit dem Titel-Input sichtbar ist und der User nicht
  //    eine Liste voller "Unbenannt"-Skripte ansammelt
  // Manueller ⇧⌘F-Toggle danach bleibt bestehen, bis der User den Tab
  // wechselt - der Effect feuert NUR bei Tab-Wechsel, nicht bei Title-
  // Updates auf demselben Tab. Sonst wäre ein gerade-zu-Ende-getippter
  // Titel ein abrupter Layout-Sprung, weil die Toolbar sich plötzlich
  // einrollt.
  let lastSeenTabId: string | null = null;
  createEffect(() => {
    if (!settingsStore.loaded()) return;
    if (tabsStore.isHome() || tabsStore.isIdeas()) {
      lastSeenTabId = null;
      return;
    }
    const tabId = tabsStore.activeTabId();
    if (tabId === lastSeenTabId) return;
    lastSeenTabId = tabId;

    const title = (tabsStore.activeScript()?.scriptTitle ?? "").trim();
    if (title === "" || title === "Unbenannt") {
      setFocusMode(false);
    } else {
      setFocusMode(settingsStore.focusModeDefault());
    }
  });

  // Fokus-Modus räumt eine laufende Quick-Capture mit weg.
  createEffect(() => {
    if (focusMode()) {
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
          onNewScript={() => void quickCreateScript()}
          onOpenSettings={() => setSettingsOpen(true)}
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
        <SettingsDialog
          open={settingsOpen()}
          onClose={() => setSettingsOpen(false)}
          onStartOnboarding={() => {
            setSettingsOpen(false);
            setOnboardingOpen(true);
          }}
        />
        <OnboardingDialog
          open={onboardingOpen()}
          onClose={() => setOnboardingOpen(false)}
          onCreateFirstScript={() => void quickCreateScript()}
        />
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
        {/* Quick-Capture (⌘I) bleibt überall greifbar, ausser im Fokus-
            Modus - dort wird das Schreiben bewusst nicht durch das
            Ideen-Sammeln unterbrochen. Die früheren IdeasDrawer/IdeasToggle
            sind raus: der Glühbirnen-Tab in der TabBar liefert dieselbe
            Liste mit einem Klick weniger Pseudo-Modal. */}
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
