import {
  createSignal,
  createEffect,
  createResource,
  Show,
  onMount,
  onCleanup,
} from "solid-js";
import type { LexicalEditor } from "lexical";
import { Editor } from "./Editor";
import { api } from "../../lib/api";
import { K } from "../../lib/keys";
import { tabsStore } from "../../stores/tabs";
import { settingsStore } from "../../stores/settings";
import { pushToast } from "../../stores/toasts";
import { scriptsBus } from "../../lib/scriptsBus";
import { SnapshotsDialog } from "./SnapshotsDialog";
import { SprintPill } from "./SprintPill";
import { EditorToolbar } from "./EditorToolbar";
import { EditorRail } from "./EditorRail";
import type { ScriptCharacter } from "../../lib/types";
import {
  scriptViewCache,
  captureCursor,
  type CursorAddress,
} from "../../lib/scriptViewCache";
import "./PaperLayout.css";
import "./EditorToolbar.css";
import "./EditorRail.css";

export interface ScriptViewProps {
  scriptId: string;
  /** Wird vom App-Root gesetzt — globaler Fokus-Modus, ⇧⌘F. */
  focusMode: boolean;
  onToggleFocus(): void;
  /** Zurück zur Übersicht (Home-Tab). */
  onBackToHome(): void;
  /** Export-Dialog öffnen — App-Root besitzt den State. */
  onOpenExport(): void;
}

const QUICK_MODE_KEY = (id: string) => `script.${id}.quick_mode`;

export function ScriptView(props: ScriptViewProps) {
  const [script, { mutate: setScript }] = createResource(
    () => ({ id: props.scriptId, v: scriptsBus.version() }),
    ({ id }) => api.getScript(id),
  );
  const [snapshotsOpen, setSnapshotsOpen] = createSignal(false);
  const [parseError, setParseError] = createSignal<string | null>(null);
  const [recovering, setRecovering] = createSignal(false);

  // Editor-Instanz nach Mount (für Block-Toolbar in EditorToolbar).
  const [editorInstance, setEditorInstance] = createSignal<LexicalEditor | null>(null);
  const [activeBlock, setActiveBlock] = createSignal<string | null>(null);

  const [liveChars, setLiveChars] = createSignal<ScriptCharacter[]>([]);
  const [manualOverride, setManualOverride] = createSignal<"1" | "0" | null>(null);
  const quickAvailable = () => liveChars().length === 2;
  const quickMode = () => {
    if (!quickAvailable()) return false;
    const m = manualOverride();
    if (m !== null) return m === "1";
    return settingsStore.quickModeAutoEnable();
  };

  let canvasRef: HTMLDivElement | undefined;

  // ---- View-State pro Skript persistieren (Scroll + Cursor) ------------
  // ScriptView selbst wird beim Tab-Wechsel A->B NICHT neu gemountet -
  // Solid liefert nur neue Props, weil <Match> aktiv bleibt. Deshalb
  // koennen wir den scriptId-Wechsel hier ueber einen Effect mit
  // onCleanup abfangen: das innere onCleanup feuert genau dann, wenn
  // sich props.scriptId aendert (also: bevor der neue Wert greift),
  // und gibt uns den letzten bekannten Stand fuer die VORIGE Skript-ID
  // zum Wegspeichern.
  let lastScrollTop = 0;
  const onCanvasScroll = () => {
    if (canvasRef) lastScrollTop = canvasRef.scrollTop;
  };
  onMount(() => {
    if (!canvasRef) return;
    canvasRef.addEventListener("scroll", onCanvasScroll, { passive: true });
    onCleanup(() => {
      canvasRef?.removeEventListener("scroll", onCanvasScroll);
    });
  });

  // Beim Skript-Wechsel den Stand der ALTEN ID wegspeichern.
  createEffect(() => {
    const id = props.scriptId;
    onCleanup(() => {
      let cursor: CursorAddress | null = null;
      const ed = editorInstance();
      if (ed) {
        try { cursor = captureCursor(ed); } catch { /* ignore */ }
      }
      scriptViewCache.set(id, {
        scrollTop: lastScrollTop,
        cursor,
      });
    });
  });

  // Beim Erscheinen einer neuen Skript-ID dessen gecachten Scroll wieder
  // anlegen. Mehrfach-rAF, damit der Editor-Remount + Pagecount-Measure
  // erst ihre Hoehe einnehmen koennen, bevor wir scrollTop setzen - sonst
  // clamped der Browser auf den (noch zu kleinen) scrollHeight.
  let appliedScrollForId: string | null = null;
  let scrollRestoreRun = 0;
  createEffect(() => {
    const id = script.latest?.id;
    if (!id) return;
    if (appliedScrollForId === id) return;
    appliedScrollForId = id;
    const run = ++scrollRestoreRun;
    const cached = scriptViewCache.get(id);
    const target = cached?.scrollTop ?? 0;
    if (!canvasRef) return;
    if (target <= 0) {
      canvasRef.scrollTop = 0;
      lastScrollTop = 0;
      return;
    }
    let attempts = 8;
    let rafId = 0;
    const tryApply = () => {
      if (!canvasRef || run !== scrollRestoreRun) return;
      canvasRef.scrollTop = target;
      lastScrollTop = canvasRef.scrollTop;
      if (canvasRef.scrollTop < target - 1 && attempts-- > 0) {
        rafId = requestAnimationFrame(tryApply);
      }
    };
    rafId = requestAnimationFrame(tryApply);
    onCleanup(() => {
      scrollRestoreRun++;
      if (rafId) cancelAnimationFrame(rafId);
    });
  });

  /** Initial-Cursor fuer den naechsten Editor-Mount. Wird beim
   *  Skript-Wechsel reaktiv neu berechnet, damit der frisch montierte
   *  Editor (siehe <Show keyed> unten) den passenden Cursor erhaelt. */
  const initialCursorFor = (id: string): CursorAddress | null =>
    scriptViewCache.get(id)?.cursor ?? null;

  // Highlighting resolution: per-script override > global default.
  const highlightingOn = () => {
    const s = script.latest;
    if (!s) return false;
    if (s.highlighting_enabled === 1) return true;
    if (s.highlighting_enabled === 0) return false;
    return settingsStore.highlightingDefault();
  };

  // Sync the script tab's title back to tab store
  createEffect(() => {
    const s = script.latest;
    if (s) tabsStore.setScriptTitle(s.id, s.title);
  });

  createEffect(() => {
    const s = script.latest;
    if (s) setLiveChars(s.characters);
  });

  createEffect(() => {
    void props.scriptId;
    setParseError(null);
  });

  const onResetToEmpty = async () => {
    if (recovering()) return;
    setRecovering(true);
    try {
      try {
        await api.createSnapshot(props.scriptId, "manual");
      } catch (err) {
        console.warn("[scriptz] pre-recovery snapshot failed", err);
      }
      const empty = JSON.stringify({
        root: {
          type: "root",
          version: 1,
          direction: null,
          format: "",
          indent: 0,
          children: [
            {
              type: "scriptz-character",
              version: 1,
              characterName: "",
              direction: null,
              format: "",
              indent: 0,
              children: [],
            },
          ],
        },
      });
      const updated = await api.updateScript({
        id: props.scriptId,
        contentJson: empty,
      });
      const fresh = await api.getScript(props.scriptId);
      setScript(fresh);
      setLiveChars(updated.characters ?? []);
      setParseError(null);
      pushToast(
        "Skript zurückgesetzt. Snapshot des alten Inhalts liegt im Verlauf.",
        "ok",
      );
    } catch (err) {
      pushToast(`Reset fehlgeschlagen: ${(err as Error).message ?? err}`, "error");
    } finally {
      setRecovering(false);
    }
  };

  createEffect(() => {
    const id = props.scriptId;
    if (!id) return;
    let cancelled = false;
    void (async () => {
      try {
        const raw = await api.getAppState(QUICK_MODE_KEY(id));
        if (!cancelled && props.scriptId === id) {
          setManualOverride(raw === "1" || raw === "0" ? raw : null);
        }
      } catch {
        if (!cancelled && props.scriptId === id) {
          setManualOverride(null);
        }
      }
    })();
    onCleanup(() => {
      cancelled = true;
    });
  });

  const toggleQuickMode = () => {
    if (!quickAvailable()) return;
    const next = !quickMode();
    setManualOverride(next ? "1" : "0");
    void api
      .setAppState(QUICK_MODE_KEY(props.scriptId), next ? "1" : "0")
      .catch(() => {});
  };

  const toggleHighlight = async () => {
    const s = script.latest;
    if (!s) return;
    const next = !highlightingOn();
    try {
      await api.updateScript({ id: s.id, highlightingEnabled: next ? 1 : 0 });
      scriptsBus.bump();
    } catch (err) {
      pushToast(
        `Highlight-Wechsel fehlgeschlagen: ${(err as Error).message ?? err}`,
        "error",
      );
    }
  };

  // Lokale Hotkeys: Snapshot + Snapshots-Dialog. (⇧⌘F lebt im App-Root,
  // damit es auch außerhalb des Editors funktioniert.)
  onMount(() => {
    const handler = async (ev: KeyboardEvent) => {
      const cmd = ev.metaKey || ev.ctrlKey;
      if (!cmd) return;
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

  const renameScriptTitle = async (next: string) => {
    const s = script.latest;
    if (!s) return;
    try {
      const updated = await api.renameScript(s.id, next);
      tabsStore.setScriptTitle(s.id, updated.title);
      scriptsBus.bump();
    } catch (err) {
      pushToast(
        `Umbenennen fehlgeschlagen: ${(err as Error).message ?? err}`,
        "error",
      );
    }
  };

  return (
    <div class="script-shell">
      <Show when={script.latest} fallback={<div style="padding: 40px;">Lade…</div>}>
        {(s) => (
          <>
            <EditorToolbar
              title={s().title}
              onTitleCommit={(next) => void renameScriptTitle(next)}
              onBack={props.onBackToHome}
              editor={editorInstance()}
              activeBlock={activeBlock()}
              quickModeOn={() => quickMode()}
              quickModeAvailable={() => quickAvailable()}
              onToggleQuickMode={toggleQuickMode}
              highlightOn={() => highlightingOn()}
              onToggleHighlight={() => void toggleHighlight()}
              onToggleFocus={props.onToggleFocus}
              onOpenExport={props.onOpenExport}
            />

            {/* Eye-Button im Fokus-Modus zum Aussteigen.
                Liegt fixed; nur sichtbar wenn focusMode true. */}
            <Show when={props.focusMode}>
              <button
                class="focus-toggle"
                title={`Fokus verlassen (${K("Mod+Shift+F")})`}
                aria-label="Fokus verlassen"
                onClick={props.onToggleFocus}
              >
                <EyeIcon />
              </button>
            </Show>

            <div class="paper-canvas" ref={canvasRef}>
              <div class="paper-sheet">
                <Show
                  when={!parseError()}
                  fallback={
                    <RecoveryPanel
                      broken={parseError() ?? ""}
                      onOpenSnapshots={() => setSnapshotsOpen(true)}
                      onReset={() => void onResetToEmpty()}
                      resetting={recovering()}
                    />
                  }
                >
                  <Show when={s().id} keyed>
                    {(scriptId) => (
                      <Editor
                        scriptId={scriptId}
                        initialContentJson={s().content_json}
                        initialCursor={initialCursorFor(scriptId)}
                        characters={s().characters}
                        highlighting={highlightingOn()}
                        quickModeEnabled={() => quickMode()}
                        onCharactersChange={setLiveChars}
                        onParseError={(raw) => setParseError(raw)}
                        onEditorReady={(ed) => setEditorInstance(ed)}
                        onActiveBlockChange={(b) => setActiveBlock(b)}
                      />
                    )}
                  </Show>
                </Show>
              </div>
            </div>

            {/* Rechte Editor-Rail mit Cast-Stats / Versionen.
                Versteckt im Recovery-Mode (kein sinnvoller Inhalt). */}
            <Show when={!parseError()}>
              <EditorRail
                contentJson={s().content_json}
                characters={liveChars()}
                onOpenSnapshots={() => setSnapshotsOpen(true)}
              />
            </Show>

            {/* Bottom status-strip entfernt — Seitenzahl steht auf der
                Seite selbst, Save-Status oben rechts in der TabBar. */}

            <SnapshotsDialog
              open={snapshotsOpen()}
              onClose={() => setSnapshotsOpen(false)}
              scriptId={s().id}
            />

            <SprintPill />
          </>
        )}
      </Show>
    </div>
  );
}

function RecoveryPanel(props: {
  broken: string;
  onOpenSnapshots: () => void;
  onReset: () => void;
  resetting: boolean;
}) {
  return (
    <div class="recovery-panel" role="alert">
      <h3 class="recovery-title">Skript-Inhalt nicht lesbar</h3>
      <p class="recovery-body">
        Die gespeicherte Struktur dieses Skripts konnte nicht geladen werden.
        Damit dein Inhalt nicht durch eine leere Version überschrieben wird,
        ist der Editor pausiert.
      </p>
      <p class="recovery-body muted small">
        Empfohlen: Öffne den Snapshot-Verlauf und stelle eine ältere Version
        wieder her — dort liegt der Inhalt aller bisherigen Auto-Snapshots.
      </p>
      <div class="recovery-actions">
        <button class="btn btn-primary" onClick={props.onOpenSnapshots}>
          Snapshots öffnen
        </button>
        <button
          class="btn btn-danger"
          onClick={props.onReset}
          disabled={props.resetting}
        >
          {props.resetting ? "Setze zurück…" : "Trotzdem leer fortfahren"}
        </button>
      </div>
      <details class="recovery-details">
        <summary>Technische Info</summary>
        <pre class="recovery-raw">{props.broken.slice(0, 4000)}</pre>
      </details>
    </div>
  );
}

/* Auge gefüllt — Floating-Button im aktiven Fokus-Modus.
   Gefüllte Variante des Toolbar-Auges: gleiche Form, klarer Aktiv-Zustand
   (analog zu Stern/Filled-Star-Pattern). Der Pupillen-Kreis wird per
   evenodd-Fill aus der Almond-Form ausgespart, damit er ohne festen
   Hintergrund-Wert (Paper / Dark) sauber durchscheint. */
function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M12 5C5 5 1 12 1 12s4 7 11 7 11-7 11-7-4-7-11-7zm0 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"
      />
    </svg>
  );
}

export default ScriptView;
