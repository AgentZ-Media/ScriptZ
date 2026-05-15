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
import { EditorToolbar } from "./EditorToolbar";
import { EditorRail } from "./EditorRail";
import type { ScriptCharacter } from "../../lib/types";
import {
  scriptViewCache,
  captureCursor,
  type CursorAddress,
} from "../../lib/scriptViewCache";
import { t } from "../../i18n";
import "./PaperLayout.css";
import "./EditorToolbar.css";
import "./EditorRail.css";

export interface ScriptViewProps {
  scriptId: string;
  /** Set by the app root — global focus mode, ⇧⌘F. */
  focusMode: boolean;
  onToggleFocus(): void;
  /** Back to the overview (home tab). */
  onBackToHome(): void;
  /** Open the export dialog — the app root owns the state. */
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

  // Editor instance after mount (for block toolbar in EditorToolbar).
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

  // ---- Persist view state per script (scroll + cursor) ------------
  // ScriptView itself is NOT remounted on a tab switch A->B -
  // Solid just delivers new props because <Match> stays active. We can
  // therefore catch the scriptId switch via an effect with
  // onCleanup: the inner onCleanup fires exactly when
  // props.scriptId changes (i.e. before the new value takes effect)
  // and gives us the last known state for the PREVIOUS script id
  // to stash away.
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

  // On script switch, stash the state of the OLD id.
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

  // When a new script id appears, restore its cached scroll
  // position. Multiple rAFs so the editor remount + pagecount measure
  // can take up their height before we set scrollTop - otherwise
  // the browser clamps to the (still-too-small) scrollHeight.
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

  /** Initial cursor for the next editor mount. Recomputed reactively
   *  on script switch so the freshly mounted
   *  editor (see <Show keyed> below) receives the matching cursor. */
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
      pushToast(t("editor.toast.resetDone"), "ok");
    } catch (err) {
      pushToast(t("editor.toast.resetFailed", { message: (err as Error).message ?? String(err) }), "error");
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
        t("editor.toast.highlightFailed", { message: (err as Error).message ?? String(err) }),
        "error",
      );
    }
  };

  // Local hotkeys: snapshot + snapshots dialog. (⇧⌘F lives in the app root
  // so it also works outside the editor.)
  onMount(() => {
    const handler = async (ev: KeyboardEvent) => {
      const cmd = ev.metaKey || ev.ctrlKey;
      if (!cmd) return;
      if (ev.shiftKey && (ev.key === "S" || ev.key === "s")) {
        ev.preventDefault();
        try {
          await api.createSnapshot(props.scriptId, "manual");
          pushToast(t("editor.toast.snapshotSaved"), "ok");
        } catch (err) {
          pushToast(t("editor.toast.snapshotError", { message: (err as Error).message ?? String(err) }), "error");
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
        t("editor.toast.renameFailed", { message: (err as Error).message ?? String(err) }),
        "error",
      );
    }
  };

  return (
    <div class="script-shell">
      <Show when={script.latest} fallback={<div style="padding: 40px;">{t("editor.loading")}</div>}>
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
                title={t("editor.focus.exit", { hotkey: K("Mod+Shift+F") })}
                aria-label={t("editor.focus.exitAria")}
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
      <h3 class="recovery-title">{t("editor.recovery.title")}</h3>
      <p class="recovery-body">
        {t("editor.recovery.body")}
      </p>
      <p class="recovery-body muted small">
        {t("editor.recovery.hint")}
      </p>
      <div class="recovery-actions">
        <button class="btn btn-primary" onClick={props.onOpenSnapshots}>
          {t("editor.recovery.openSnapshots")}
        </button>
        <button
          class="btn btn-danger"
          onClick={props.onReset}
          disabled={props.resetting}
        >
          {props.resetting ? t("editor.recovery.resetting") : t("editor.recovery.reset")}
        </button>
      </div>
      <details class="recovery-details">
        <summary>{t("editor.recovery.tech")}</summary>
        <pre class="recovery-raw">{props.broken.slice(0, 4000)}</pre>
      </details>
    </div>
  );
}

/* Filled eye — floating button in active focus mode.
   Filled variant of the toolbar eye: same shape, clear active state
   (analogous to the star / filled-star pattern). The pupil circle is
   cut out from the almond shape via evenodd fill so it cleanly shows
   through without a fixed background value (paper / dark). */
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
