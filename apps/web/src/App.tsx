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
import { settingsStore } from "@scriptz/core/stores/settings";
import { tabsStore } from "@scriptz/core/stores/tabs";
import { pushToast } from "@scriptz/core/stores/toasts";
import { scriptsBus } from "@scriptz/core/lib/scriptsBus";
import { foldersBus } from "@scriptz/core/lib/foldersBus";
import { dailyStatsBus } from "@scriptz/core/lib/dailyStatsBus";
import { api } from "@scriptz/core/lib/api";
import TabBar from "@scriptz/core/components/TabBar";
import ScriptView from "@scriptz/core/components/Editor/ScriptView";
import Browser from "@scriptz/core/components/Browser/Browser";
import { CommandBar } from "@scriptz/core/components/CommandBar/CommandBar";
import { SettingsDialog } from "@scriptz/core/components/Settings/SettingsDialog";
import { NewScriptDialog } from "@scriptz/core/components/Browser/NewScriptDialog";
import { ExportDialog } from "@scriptz/core/components/Editor/ExportDialog";
import ToastHost from "@scriptz/core/components/Common/ToastHost";
import { IdeaQuickCapture } from "@scriptz/core/components/Ideas/IdeaQuickCapture";
import { IdeasView } from "@scriptz/core/components/Ideas/IdeasView";
import { ensureWelcomeContent } from "@scriptz/core/lib/welcome";
import { flushAll } from "@scriptz/core/lib/saveFlush";
import {
  OnboardingDialog,
  ONBOARDING_KEY,
} from "@scriptz/core/components/Onboarding/OnboardingDialog";
import { WebDisclaimerBanner } from "./components/WebDisclaimerBanner";
import { StoragePersistedBadge } from "./components/StoragePersistedBadge";
import { t } from "@scriptz/core/i18n";

import "@scriptz/core/components/Common/Common.css";

// Web-Variante von apps/desktop/src/App.tsx. Identische Komponentennutzung,
// aber ohne Tauri-spezifisches Close-Handling (kein onCloseRequested).
// Phase F traegt den Save-Flush via beforeunload/pagehide nach,
// Phase H legt den WebDisclaimerBanner oben drauf.
export default function App() {
  const [bootReady, setBootReady] = createSignal(false);
  const [cmdkOpen, setCmdkOpen] = createSignal(false);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [newScriptOpen, setNewScriptOpen] = createSignal(false);
  const [newScriptFolder, setNewScriptFolder] = createSignal<string | null>(null);
  // Schutz gegen Doppel-Klicks auf den "Neu"-Button direkt nach dem
  // Schließen des Dialogs (per Backdrop-Click, ESC, oder erfolgreicher
  // Erstellung). Solid rendert das Modal asynchron - ohne diesen Block
  // konnte ein zweiter Klick den Dialog mit frischem leeren State
  // wieder hochziehen, und ein noch wartender Submit hätte ein leeres
  // "Unbenannt" als Phantom-Skript angelegt.
  let lastNewScriptCloseAt = 0;
  const openNewScriptDialog = (folderId: string | null) => {
    if (newScriptOpen()) return;
    if (Date.now() - lastNewScriptCloseAt < 250) return;
    setNewScriptFolder(folderId);
    setNewScriptOpen(true);
  };
  const closeNewScriptDialog = () => {
    lastNewScriptCloseAt = Date.now();
    setNewScriptOpen(false);
  };
  const [exportOpen, setExportOpen] = createSignal(false);
  const [ideaCaptureOpen, setIdeaCaptureOpen] = createSignal(false);
  const [onboardingOpen, setOnboardingOpen] = createSignal(false);
  const [focusMode, setFocusMode] = createSignal(true);

  const activeScriptId = (): string | null =>
    tabsStore.activeScript()?.scriptId ?? null;

  const FOCUS_KEY = (id: string) => `script.${id}.focus_mode`;
  const focusOverride = new Map<string, boolean>();

  const toggleFocusMode = () => {
    const next = !focusMode();
    setFocusMode(next);
    const id = activeScriptId();
    if (id) {
      focusOverride.set(id, next);
      void api.setAppState(FOCUS_KEY(id), next ? "1" : "0").catch(() => {});
    }
  };
  const activeScriptTitle = (): string =>
    tabsStore.activeScript()?.scriptTitle || t("common.untitled");

  const openExport = () => {
    if (activeScriptId()) setExportOpen(true);
  };

  const quickCreateScript = async () => {
    try {
      const created = await api.createScript({});
      scriptsBus.bump();
      foldersBus.bump();
      tabsStore.openScript(created.id, created.title);
    } catch (err) {
      pushToast(t("common.errorPrefix", { message: (err as Error).message ?? String(err) }), "error");
    }
  };

  onMount(async () => {
    try {
      await Promise.all([
        settingsStore.load(),
        ensureWelcomeContent(),
        tabsStore.load(),
        api.backfillRuntimeStats().catch((err) => {
          console.warn("[scriptz-web] runtime backfill skipped", err);
        }),
      ]);
    } catch (err) {
      console.error("[scriptz-web] boot failed", err);
      pushToast(t("boot.failed", { message: (err as Error).message ?? String(err) }), "error");
    } finally {
      setBootReady(true);
    }
    try {
      const done = await api.getAppState(ONBOARDING_KEY);
      if (!done) setOnboardingOpen(true);
    } catch {
      /* nicht blockend */
    }
  });

  // Save-Flush beim Tab-Schliessen / Reload. Pendant zum
  // onCloseRequested-Hook der Desktop-App. `beforeunload` feuert vor dem
  // Unload (alle Hauptbrowser), `pagehide` ist iOS-Safari's Variante.
  // flushAll(timeout) drainet die pending Editor-Saves + Tab-State -
  // synchron heisst hier "innerhalb der ~2 s, die der Browser uns gibt".
  // 100% Garantie gibt es nicht (z.B. wenn der User SOFORT Force-Quit
  // macht), aber der Normalfall ist abgedeckt.
  onMount(() => {
    const handler = () => {
      // Wir starten den Flush, aber blockieren NICHT auf das Promise -
      // moderne Browser ignorieren preventDefault auf beforeunload eh.
      // Die in saveFlush registrierten Flusher haben Sync-Fast-Paths,
      // wo es geht; Editor.tsx flusht direkt in IndexedDB.
      void flushAll(2000);
    };
    window.addEventListener("beforeunload", handler);
    window.addEventListener("pagehide", handler);
    onCleanup(() => {
      window.removeEventListener("beforeunload", handler);
      window.removeEventListener("pagehide", handler);
    });
  });

  // Skript-Liste -> Tabs versoehnen, identisch zum Desktop.
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
      if (ev.shiftKey && ev.key.toLowerCase() === "f") {
        ev.preventDefault();
        toggleFocusMode();
        return;
      }
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

  createEffect(() => {
    if ((tabsStore.isHome() || tabsStore.isIdeas()) && focusMode()) setFocusMode(false);
  });

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

    const scriptId = tabsStore.activeScript()?.scriptId ?? null;
    const title = (tabsStore.activeScript()?.scriptTitle ?? "").trim();
    if (title === "" || title === t("common.untitled")) {
      setFocusMode(false);
      return;
    }
    if (!scriptId) {
      setFocusMode(settingsStore.focusModeDefault());
      return;
    }
    const cached = focusOverride.get(scriptId);
    if (cached !== undefined) {
      setFocusMode(cached);
      return;
    }
    setFocusMode(settingsStore.focusModeDefault());
    void (async () => {
      try {
        const raw = await api.getAppState(FOCUS_KEY(scriptId));
        if (tabsStore.activeScript()?.scriptId !== scriptId) return;
        if (raw === "1" || raw === "0") {
          const v = raw === "1";
          focusOverride.set(scriptId, v);
          setFocusMode(v);
        }
      } catch { /* ignore */ }
    })();
  });

  createEffect(() => {
    if (focusMode()) setIdeaCaptureOpen(false);
  });

  const onCreatedScript = () => closeNewScriptDialog();

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
        <WebDisclaimerBanner />
        <TabBar
          onNewScript={() => void quickCreateScript()}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <main class="app-main" ref={appMainRef}>
          <div class="view-frame" ref={viewFrameRef}>
            <Switch>
              <Match when={tabsStore.isHome()}>
                <Browser
                  onNewScript={(folderId) => openNewScriptDialog(folderId ?? null)}
                  onOpenCmdK={() => setCmdkOpen(true)}
                />
              </Match>
              <Match when={tabsStore.isIdeas()}>
                <IdeasView />
              </Match>
              <Match when={tabsStore.activeScript()}>
                {(tab) => (
                  <ErrorBoundary fallback={(err) => <div class="error-pane">{t("boot.error", { message: String(err) })}</div>}>
                    <Suspense fallback={<div class="loading-pane">{t("boot.loadingScript")}</div>}>
                      <ScriptView
                        scriptId={tab().scriptId}
                        focusMode={focusMode()}
                        onToggleFocus={toggleFocusMode}
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
          webIntro
        />
        <Show when={newScriptOpen()}>
          <NewScriptDialog
            onClose={closeNewScriptDialog}
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
        <Show when={!focusMode()}>
          <IdeaQuickCapture
            open={ideaCaptureOpen()}
            onClose={() => setIdeaCaptureOpen(false)}
          />
        </Show>
        <ToastHost />
        <StoragePersistedBadge />
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
