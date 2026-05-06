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

import "./components/Common/Common.css";

type FocusedView =
  | { kind: "browser" }
  | { kind: "script"; scriptId: string };

export default function App() {
  const [bootReady, setBootReady] = createSignal(false);
  const [cmdkOpen, setCmdkOpen] = createSignal(false);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [newScriptOpen, setNewScriptOpen] = createSignal(false);
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

  return (
    <div class="app-root">
      <Show when={bootReady()} fallback={<BootScreen />}>
        <TabBar
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenExport={openExport}
          onPrint={() => void triggerPrint()}
        />

        <main class="app-main">
          <Show when={activeView()}>
            {(v) => (
              <Switch>
                <Match when={v().kind === "browser"}>
                  <Browser
                    onNewScript={() => setNewScriptOpen(true)}
                    onOpenSettings={() => setSettingsOpen(true)}
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
        </main>

        <CommandBar open={cmdkOpen()} onClose={() => setCmdkOpen(false)} />
        <SettingsDialog open={settingsOpen()} onClose={() => setSettingsOpen(false)} />
        <Show when={newScriptOpen()}>
          <NewScriptDialog
            onClose={() => setNewScriptOpen(false)}
            onCreated={onCreatedScript}
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
