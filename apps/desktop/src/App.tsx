import {
  Show,
  createSignal,
  createEffect,
  createResource,
  onMount,
  onCleanup,
  Switch,
  Match,
  ErrorBoundary,
  Suspense,
} from "solid-js";
import { settingsStore } from "~/stores/settings";
import { aiStore } from "~/stores/ai";
import { tabsStore } from "~/stores/tabs";
import { pushToast } from "~/stores/toasts";
import { scriptsBus } from "~/lib/scriptsBus";
import { api } from "~/lib/api";
import TabBar from "~/components/TabBar";
import ScriptView from "~/components/Editor/ScriptView";
import Browser from "~/components/Browser/Browser";
import { CommandBar } from "~/components/CommandBar/CommandBar";
import { SettingsDialog } from "~/components/Settings/SettingsDialog";
import { NewScriptDialog } from "~/components/Browser/NewScriptDialog";
import { ExportDialog } from "~/components/Editor/ExportDialog";
import ToastHost from "~/components/Common/ToastHost";
import { ensureWelcomeContent } from "~/lib/welcome";
import { printScript } from "~/lib/print";
import { flushAll } from "~/lib/saveFlush";
import { healthCheck as dbHealthCheck, termLog } from "~/lib/db";

import "./components/Common/Common.css";

type FocusedView =
  | { kind: "browser" }
  | { kind: "script"; scriptId: string };

export default function App() {
  const [bootReady, setBootReady] = createSignal(false);
  const [cmdkOpen, setCmdkOpen] = createSignal(false);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [newScriptOpen, setNewScriptOpen] = createSignal(false);
  const [newScriptFolder, setNewScriptFolder] = createSignal<string | null>(null);
  const [exportOpen, setExportOpen] = createSignal(false);

  const activeScriptId = (): string | null => {
    const t = tabsStore.active();
    return t?.kind === "script" ? t.scriptId ?? null : null;
  };
  const activeScriptTitle = (): string => {
    const t = tabsStore.active();
    return t?.kind === "script" ? (t.scriptTitle || "Unbenannt") : "";
  };

  const openExport = () => {
    if (activeScriptId()) setExportOpen(true);
  };
  const triggerPrint = async () => {
    const id = activeScriptId();
    if (!id) return;
    try {
      // Browser-native printing through a hidden iframe — the OS shows its
      // real print sheet directly, no PDF round-trip, no third-party
      // viewer (Adobe / Preview) launching in front of it.
      await printScript(id, {
        highlighting: settingsStore.printHighlighting(),
        titlePage: settingsStore.printTitlePage(),
      });
    } catch (err) {
      pushToast(`Druck fehlgeschlagen: ${(err as Error).message ?? err}`, "error");
    }
  };

  // Lightweight read of the active script's highlighting flag, separate
  // from ScriptView's createResource so the TabBar can render the toggle
  // state without prop-drilling through the editor tree. Refetches when
  // the active script changes OR when scriptsBus bumps (covers the
  // post-toggle save).
  const [activeHighlightFlag] = createResource(
    () => ({ id: activeScriptId(), v: scriptsBus.version() }),
    async ({ id }) => {
      if (!id) return null;
      try {
        const s = await api.getScript(id);
        return s.highlighting_enabled;
      } catch {
        return null;
      }
    },
    { initialValue: null },
  );

  const highlightOn = (): boolean => {
    const flag = activeHighlightFlag();
    if (flag === 1) return true;
    if (flag === 0) return false;
    return settingsStore.highlightingDefault();
  };

  const toggleHighlight = async () => {
    const id = activeScriptId();
    if (!id) return;
    const next = !highlightOn();
    try {
      await api.updateScript({ id, highlightingEnabled: next ? 1 : 0 });
      scriptsBus.bump();
    } catch (err) {
      pushToast(
        `Highlight-Wechsel fehlgeschlagen: ${(err as Error).message ?? err}`,
        "error",
      );
    }
  };

  onMount(async () => {
    try {
      await settingsStore.load();
      await aiStore.refresh();
      await ensureWelcomeContent();
      await tabsStore.load();
    } catch (err) {
      console.error("[scriptz] boot failed", err);
      pushToast(`Start fehlgeschlagen: ${(err as Error).message ?? err}`, "error");
    } finally {
      setBootReady(true);
    }
    // Phase 0 smoke test: confirm the TS-side SQLite connection (via
    // @tauri-apps/plugin-sql) sees the same DB Rust opened. Read-only;
    // if it ever fails, the migration plumbing is misconfigured. We log
    // both to the WebKit console AND through the frontend_log bridge so
    // the result shows up in the terminal where tauri:dev runs.
    console.log("[scriptz][db] phase 0 smoke test: calling dbHealthCheck()");
    void termLog("info", "[phase0] frontend reached the smoke-test code path");
    void dbHealthCheck()
      .then((h) => {
        const msg = `[phase0] TS DB connection OK — user_version=${h.userVersion}, journal=${h.walMode}, scripts=${h.scriptCount}`;
        console.log(
          `%c${msg}`,
          "color:#3a8ed4;font-weight:bold",
        );
        void termLog("info", msg);
      })
      .catch((err) => {
        const msg = `[phase0] TS DB connection FAILED: ${(err as Error)?.message ?? String(err)}`;
        console.error(msg, err);
        void termLog("error", msg);
      });
  });

  // Wire window-close-request → drain all pending writes (auto-save,
  // tab-state, etc.) before letting Tauri destroy the window. Without
  // this, Cmd+Q / red-traffic-light within 250 ms of a keystroke loses
  // the buffered save.
  onMount(() => {
    let unlisten: (() => void) | null = null;
    let closing = false;
    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        unlisten = await win.onCloseRequested(async (event) => {
          if (closing) return; // already in flight — let it through
          event.preventDefault();
          closing = true;
          try {
            await flushAll(2000);
          } finally {
            try {
              await win.destroy();
            } catch {
              // Fallback: if destroy() isn't allowed for some reason,
              // tear down via close() so the user isn't stuck.
              try {
                await win.close();
              } catch {
                /* nothing left to do */
              }
            }
          }
        });
      } catch (err) {
        // Non-Tauri env (vite preview) or older API — non-fatal.
        console.warn("[scriptz] close-flush hook unavailable", err);
      }
    })();
    onCleanup(() => {
      try {
        unlisten?.();
      } catch {
        /* ignore */
      }
    });
  });

  // Whenever the script list changes (archive / purge / restore / create /
  // duplicate / rename) reconcile open tabs against the DB so dead tabs
  // disappear from the dropdown and ⌘1-9 navigation.
  createEffect(() => {
    scriptsBus.version();
    void (async () => {
      try {
        const list = await api.listScripts({});
        const live = new Set(list.map((s) => s.id));
        tabsStore.reconcile(live);
      } catch {
        /* silent */
      }
    })();
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
        setNewScriptFolder(null);
        setNewScriptOpen(true);
        return;
      }
      if (ev.key.toLowerCase() === "e" && !ev.shiftKey) {
        if (activeScriptId()) {
          ev.preventDefault();
          openExport();
        }
        return;
      }
      if (ev.key.toLowerCase() === "p" && !ev.shiftKey) {
        if (activeScriptId()) {
          ev.preventDefault();
          void triggerPrint();
        }
        return;
      }
      // Tab cycling. ⌘Tab is captured by macOS system, so we use the
      // browser/Slack/VS Code convention: ⌘⌥← / ⌘⌥→. Works inside the
      // contenteditable editor and doesn't shadow any text-editing
      // shortcut. We also keep ⌘Tab as a best-effort fallback for
      // non-Mac builds.
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
      if (/^[1-9]$/.test(ev.key) && !ev.shiftKey && !ev.altKey) {
        const target = ev.target as HTMLElement | null;
        const isTextField =
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement ||
          (target?.isContentEditable ?? false);
        // Inside the editor ⌘1–7 are owned by blockHotkeys (block-type
        // swap). Outside (Browser, dialogs) they activate the tab at
        // that index.
        if (isTextField) return;
        ev.preventDefault();
        tabsStore.activateByIndex(parseInt(ev.key, 10) - 1);
      }
    };
    window.addEventListener("keydown", handler);
    onCleanup(() => window.removeEventListener("keydown", handler));
  });

  const activeView = (): FocusedView | null => {
    const t = tabsStore.active();
    if (!t) return null;
    if (t.kind === "browser") return { kind: "browser" };
    return { kind: "script", scriptId: t.scriptId! };
  };

  const onCreatedScript = () => {
    setNewScriptOpen(false);
  };

  // ---- View-Transition: Tab-Wechsel & Browser <-> Editor ---------------
  // Richtungsbasierter Slide statt Cross-Fade. Vier Modi:
  //   forward         neuer Tab liegt rechts vom alten           -> Slide von rechts
  //   backward        neuer Tab liegt links vom alten            -> Slide von links
  //   into-script     Browser-Tab wird zum Skript-Tab            -> Skript "hebt sich"
  //   back-to-browser Skript-Tab wird zum Browser-Tab            -> Zoom-Out auf die Uebersicht
  //
  // Das Triggern passiert via Klassen-Toggle + erzwungenes Reflow auf dem
  // Inner-Wrapper, damit die CSS-Animation jedes Mal neu startet (auch
  // wenn die Direction gleich bleibt, z.B. zweimal hintereinander Tab
  // weiter nach rechts).
  let appMainRef: HTMLElement | undefined;
  let viewFrameRef: HTMLDivElement | undefined;
  let prevTab: { id: string; kind: "browser" | "script" } | null = null;
  createEffect(() => {
    const list = tabsStore.tabs();
    const id = tabsStore.activeTabId();
    if (!id || !appMainRef || !viewFrameRef) return;
    const cur = list.find((t) => t.id === id);
    if (!cur) return;
    if (prevTab === null) {
      // Erster Mount nach Boot — keine Animation.
      prevTab = { id: cur.id, kind: cur.kind };
      return;
    }
    if (prevTab.id === cur.id && prevTab.kind === cur.kind) return;

    let dir: "forward" | "backward" | "into-script" | "back-to-browser";
    if (prevTab.kind === "browser" && cur.kind === "script") {
      dir = "into-script";
    } else if (prevTab.kind === "script" && cur.kind === "browser") {
      dir = "back-to-browser";
    } else {
      const oldIdx = list.findIndex((t) => t.id === prevTab!.id);
      const newIdx = list.findIndex((t) => t.id === cur.id);
      // Wenn der alte Tab inzwischen geschlossen wurde (oldIdx === -1),
      // defaulten wir auf forward — wirkt im Zweifel "weiter".
      dir = oldIdx === -1 || newIdx === -1 || newIdx >= oldIdx
        ? "forward"
        : "backward";
    }
    prevTab = { id: cur.id, kind: cur.kind };

    appMainRef.dataset.viewDir = dir;
    viewFrameRef.classList.remove("is-animating");
    // Reflow erzwingen, damit der Browser den Klassen-Wechsel registriert
    // und die Animation tatsaechlich neu triggert.
    void viewFrameRef.offsetWidth;
    viewFrameRef.classList.add("is-animating");
  });

  return (
    <div class="app-root">
      <Show when={bootReady()} fallback={<BootScreen />}>
        <TabBar
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenExport={openExport}
          onPrint={() => void triggerPrint()}
          onToggleHighlight={() => void toggleHighlight()}
          highlightOn={highlightOn}
        />

        <main class="app-main" ref={appMainRef}>
          <div class="view-frame" ref={viewFrameRef}>
            <Show when={activeView()}>
              {(v) => (
                <Switch>
                  <Match when={v().kind === "browser"}>
                    <Browser
                      onNewScript={(folderId) => {
                        setNewScriptFolder(folderId ?? null);
                        setNewScriptOpen(true);
                      }}
                    />
                  </Match>
                  <Match when={v().kind === "script"}>
                    <ErrorBoundary fallback={(err) => <div class="error-pane">Fehler: {String(err)}</div>}>
                      <Suspense fallback={<div class="loading-pane">Lade Skript…</div>}>
                        <ScriptView scriptId={(v() as { scriptId: string }).scriptId} />
                      </Suspense>
                    </ErrorBoundary>
                  </Match>
                </Switch>
              )}
            </Show>
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
