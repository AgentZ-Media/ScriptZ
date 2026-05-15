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
import { OnboardingDialog, ONBOARDING_KEY } from "@scriptz/core/components/Onboarding/OnboardingDialog";
import { t } from "@scriptz/core/i18n";

import "@scriptz/core/components/Common/Common.css";

export default function App() {
  const [bootReady, setBootReady] = createSignal(false);
  const [cmdkOpen, setCmdkOpen] = createSignal(false);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [newScriptOpen, setNewScriptOpen] = createSignal(false);
  const [newScriptFolder, setNewScriptFolder] = createSignal<string | null>(null);
  const [exportOpen, setExportOpen] = createSignal(false);
  const [ideaCaptureOpen, setIdeaCaptureOpen] = createSignal(false);
  const [onboardingOpen, setOnboardingOpen] = createSignal(false);
  // Initial true: by default a script opens in focus mode (quiet writing
  // mode, toolbar + cast rail off). Anyone who doesn't want that disables
  // the default under Settings → Editor.
  const [focusMode, setFocusMode] = createSignal(true);

  const activeScriptId = (): string | null => tabsStore.activeScript()?.scriptId ?? null;

  // Per-script override for focus mode. Set by the manual toggle
  // (⇧⌘F, toolbar button, eye floating button) and used in preference
  // over the global default when switching tabs. Cached in JS memory so
  // that tab switches within the session are synchronous and don't have
  // to wait on an IPC roundtrip every time.
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

  /** Quick-create: ⌘N and the "+" button in the tab bar create a
   *  script directly, without opening the NewScriptDialog - that saves a
   *  click and a typing step. The "+ New" button in the browser header
   *  keeps the modal (for folder selection). Scripts without a title
   *  start as "Untitled"; in that case ScriptView forces the toolbar
   *  visible so the user can set the title inline instead of piling up
   *  17 scripts with the default name. */
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
      // The three boot steps are independent of each other:
      // - settingsStore.load reads 6 settings rows (own Promise.all)
      // - ensureWelcomeContent checks the seed marker and seeds the
      //   tutorial script if needed
      // - tabsStore.load reads the persisted tab IDs and filters them
      //   against the script list
      // Sequentially this was ~3× IPC roundtrip latency; in parallel it
      // roughly halves the "black screen" time at startup.
      await Promise.all([
        settingsStore.load(),
        ensureWelcomeContent(),
        tabsStore.load(),
        // Backfill existing scripts (sentinel from migration 005) once,
        // so the browser overview shows correct runtimes immediately -
        // without this backfill the user would have to open+save every
        // script once before the label appears. Idempotent and
        // fault-tolerant - does not block startup.
        api.backfillRuntimeStats().catch((err) => {
          console.warn("[scriptz] runtime backfill skipped", err);
        }),
      ]);
    } catch (err) {
      console.error("[scriptz] boot failed", err);
      pushToast(t("boot.failed", { message: (err as Error).message ?? String(err) }), "error");
    } finally {
      setBootReady(true);
    }
    // Onboarding only on first start. After setBootReady so the
    // overlay doesn't smash over the boot screen.
    try {
      const done = await api.getAppState(ONBOARDING_KEY);
      if (!done) setOnboardingOpen(true);
    } catch {
      /* non-blocking */
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

  // Initial refresh of the writing stats on boot.
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
        // On Home ⌘W intentionally does nothing — Home is not closable.
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
        // In focus mode the ideas inbox is intentionally out of the way -
        // quick-capture is disabled there too.
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
      // Focus mode ⇧⌘F (only meaningful inside a script tab; toggles silently otherwise).
      if (ev.shiftKey && ev.key.toLowerCase() === "f") {
        ev.preventDefault();
        toggleFocusMode();
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
      // ⌘0 → Home, ⌘1..⌘9 → script tabs
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

  // When switching to Home or Ideas, automatically turn focus mode off
  // (otherwise the title bar dims unnecessarily in a list view).
  createEffect(() => {
    if ((tabsStore.isHome() || tabsStore.isIdeas()) && focusMode()) setFocusMode(false);
  });

  // Inside a script tab, re-apply focus mode on every tab switch:
  //  - per-script override from app_state (manually set by the user)
  //  - otherwise default: settings value (focusModeDefault)
  //  - override: for "Untitled" scripts forced OFF, so the toolbar
  //    with the title input stays visible and the user doesn't pile
  //    up a list of "Untitled" scripts
  // The manual ⇧⌘F toggle persists per script (toggleFocusMode), so a
  // one-off off/on doesn't get overwritten by the default again after
  // the next tab switch.
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

  // Focus mode also dismisses an open quick-capture.
  createEffect(() => {
    if (focusMode()) {
      setIdeaCaptureOpen(false);
    }
  });

  // Guard against double-clicks on the "New" button right after the
  // dialog closes (via backdrop click, ESC, or successful creation).
  // Without this block, a second click could reopen the dialog with
  // fresh empty state, and a still-pending submit would have created
  // an "Untitled" phantom script.
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

  const onCreatedScript = () => {
    closeNewScriptDialog();
  };

  // ---- View transition: tab switch & Home <-> Editor ----
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
      // Home<->Ideas or Ideas<->Script: simple horizontal movement.
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
        {/* Quick-capture (⌘I) stays reachable everywhere except in focus
            mode - writing is deliberately not interrupted there by
            idea capture. The former IdeasDrawer/IdeasToggle are gone:
            the lightbulb tab in the TabBar provides the same list with
            one less pseudo-modal click. */}
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
