import {
  createSignal,
  createEffect,
  createResource,
  Show,
  For,
  onMount,
  onCleanup,
} from "solid-js";
import { Editor } from "./Editor";
import { api } from "~/lib/api";
import { tabsStore } from "~/stores/tabs";
import { settingsStore } from "~/stores/settings";
import { pushToast } from "~/stores/toasts";
import { ExportDialog } from "./ExportDialog";
import { SnapshotsDialog } from "./SnapshotsDialog";
import "./PaperLayout.css";

export interface ScriptViewProps {
  scriptId: string;
}

export function ScriptView(props: ScriptViewProps) {
  const [script] = createResource(
    () => props.scriptId,
    (id) => api.getScript(id),
  );
  const [pageCount, setPageCount] = createSignal(1);
  const [currentPage, setCurrentPage] = createSignal(1);
  const [saving, setSaving] = createSignal(false);
  const [exportOpen, setExportOpen] = createSignal(false);
  const [snapshotsOpen, setSnapshotsOpen] = createSignal(false);

  let canvasRef: HTMLDivElement | undefined;

  // Highlighting resolution: per-script override > global default
  const highlightingOn = () => {
    const s = script();
    if (!s) return false;
    if (s.highlighting_enabled === 1) return true;
    if (s.highlighting_enabled === 0) return false;
    return settingsStore.highlightingDefault();
  };

  // Track current page based on scroll position
  createEffect(() => {
    const el = canvasRef;
    if (!el) return;
    const handler = () => {
      const sheets = el.querySelectorAll<HTMLDivElement>(".paper-sheet");
      if (sheets.length === 0) return;
      const top = el.scrollTop + 80;
      let nearest = 1;
      sheets.forEach((sheet) => {
        if (sheet.offsetTop <= top) {
          nearest = parseInt(sheet.dataset.pageNum || "1", 10);
        }
      });
      setCurrentPage(nearest);
    };
    el.addEventListener("scroll", handler, { passive: true });
    onCleanup(() => el.removeEventListener("scroll", handler));
  });

  // Sync the script tab's title back to tab store
  createEffect(() => {
    const s = script();
    if (s) tabsStore.setScriptTitle(s.id, s.title);
  });

  // Hotkeys local to this script: Cmd+E export, Cmd+Shift+S snapshot, Cmd+Shift+H snapshots dialog
  onMount(() => {
    const handler = async (ev: KeyboardEvent) => {
      const cmd = ev.metaKey || ev.ctrlKey;
      if (!cmd) return;
      if (ev.key === "e" || ev.key === "E") {
        ev.preventDefault();
        setExportOpen(true);
        return;
      }
      if (ev.shiftKey && (ev.key === "S" || ev.key === "s")) {
        ev.preventDefault();
        try {
          await api.createSnapshot(props.scriptId, "manual");
          pushToast("Snapshot gespeichert", "ok");
        } catch (err) {
          pushToast(`Snapshot-Fehler: ${(err as Error).message ?? err}`, "error");
        }
        return;
      }
      if (ev.shiftKey && (ev.key === "H" || ev.key === "h")) {
        ev.preventDefault();
        setSnapshotsOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    onCleanup(() => window.removeEventListener("keydown", handler));
  });

  return (
    <div class="script-shell">
      <Show when={script()} fallback={<div style="padding: 40px;">Lade…</div>}>
        {(s) => (
          <>
            <div class="paper-canvas" ref={canvasRef}>
              <div class="paper-stack">
                <div class="paper-sheet" data-page-num={1}>
                  <Editor
                    scriptId={s().id}
                    initialContentJson={s().content_json}
                    characters={s().characters}
                    highlighting={highlightingOn()}
                    onPageCountChange={setPageCount}
                    onSavingChange={setSaving}
                  />
                </div>
                <For each={Array.from({ length: Math.max(0, pageCount() - 1) }, (_, i) => i + 2)}>
                  {(p) => (
                    <>
                      <div class="page-break"><span>Seitenumbruch</span></div>
                      <div class="paper-sheet ghost" data-page-num={p} aria-hidden="true" />
                    </>
                  )}
                </For>
              </div>
            </div>

            <div class="script-status">
              <span class="saving-indicator">
                <span class={"dot" + (saving() ? " saving" : "")} />
                <Show when={saving()} fallback={<span>Gespeichert</span>}>
                  <span>Speichert…</span>
                </Show>
              </span>
              <span>Seite {currentPage()} von {pageCount()}</span>
            </div>

            <ExportDialog
              open={exportOpen()}
              onClose={() => setExportOpen(false)}
              scriptId={s().id}
              scriptTitle={s().title}
            />
            <SnapshotsDialog
              open={snapshotsOpen()}
              onClose={() => setSnapshotsOpen(false)}
              scriptId={s().id}
            />
          </>
        )}
      </Show>
    </div>
  );
}

export default ScriptView;
