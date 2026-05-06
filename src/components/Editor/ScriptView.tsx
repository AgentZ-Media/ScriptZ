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
import { scriptsBus } from "~/lib/scriptsBus";
import { SnapshotsDialog } from "./SnapshotsDialog";
import type { ScriptCharacter } from "~/lib/types";
import "./PaperLayout.css";

export interface ScriptViewProps {
  scriptId: string;
}

const QUICK_MODE_KEY = (id: string) => `script.${id}.quick_mode`;

export function ScriptView(props: ScriptViewProps) {
  // Refetch on scriptsBus bumps too — toggling the highlight from the
  // TabBar updates the DB and bumps the bus, but without this dependency
  // the editor would keep reading the stale highlighting_enabled value
  // and the on-screen tinting wouldn't react.
  // The Editor itself is keyed on s().id (Show keyed) so a refetch with
  // unchanged id does NOT remount it; only the reactive props (highlighting,
  // characters) re-evaluate, which is what we want.
  const [script, { mutate: setScript }] = createResource(
    () => ({ id: props.scriptId, v: scriptsBus.version() }),
    ({ id }) => api.getScript(id),
  );
  const [pageCount, setPageCount] = createSignal(1);
  const [currentPage, setCurrentPage] = createSignal(1);
  const [saving, setSaving] = createSignal(false);
  const [snapshotsOpen, setSnapshotsOpen] = createSignal(false);
  // Set when initialContentJson can't be parsed by Lexical. We deliberately
  // suspend the editor (and its auto-save loop) so we don't overwrite the
  // user's broken-but-present content_json with an empty state — see H1
  // in the production audit for the rationale.
  const [parseError, setParseError] = createSignal<string | null>(null);
  const [recovering, setRecovering] = createSignal(false);

  // Quick-mode toggle: enabled only while the script has exactly two
  // characters. The per-script app_state key holds the writer's manual
  // override ("1" / "0"). When the key is absent the script follows the
  // global "auto-enable on 2 chars" setting. Once the writer toggles the
  // pill on this script, the override sticks across character-count
  // changes — so re-adding a 3rd character and removing it again will
  // not silently flip the mode back on.
  const [liveChars, setLiveChars] = createSignal<ScriptCharacter[]>([]);
  const [manualOverride, setManualOverride] = createSignal<"1" | "0" | null>(
    null,
  );
  const quickAvailable = () => liveChars().length === 2;
  const quickMode = () => {
    if (!quickAvailable()) return false;
    const m = manualOverride();
    if (m !== null) return m === "1";
    return settingsStore.quickModeAutoEnable();
  };

  let canvasRef: HTMLDivElement | undefined;

  // Highlighting resolution: per-script override > global default.
  // Read `.latest` so a scriptsBus-driven refetch (e.g. highlight toggle)
  // doesn't throw to the parent Suspense and tear the editor out of the
  // tree — the previous value stays accessible while the new one loads.
  const highlightingOn = () => {
    const s = script.latest;
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
    const s = script.latest;
    if (s) tabsStore.setScriptTitle(s.id, s.title);
  });

  // Seed liveChars from the initial server fetch so the toggle reflects the
  // real state before any save round-trip has run.
  createEffect(() => {
    const s = script.latest;
    if (s) setLiveChars(s.characters);
  });

  // Reset recovery state when the script id changes — the previous tab's
  // parse error doesn't carry over to a different script.
  createEffect(() => {
    void props.scriptId;
    setParseError(null);
  });

  // Replace the broken content_json with a fresh empty Lexical state.
  // Snapshots up to this point still hold the original JSON via the
  // automatic auto-snapshot loop, so the writer can roll back if they
  // change their mind.
  const onResetToEmpty = async () => {
    if (recovering()) return;
    setRecovering(true);
    try {
      // Take a manual snapshot of the current (broken) JSON before we
      // overwrite — the user's last reachable safety net. This works
      // because createSnapshot reads content_json from the DB, which
      // still holds the broken-but-original state.
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
        pageCount: 1,
      });
      // Re-fetch the script so the editor mounts with fresh JSON.
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

  // Load the per-script manual override on script change. Absent key →
  // null (= follow global auto rule); explicit "1"/"0" → user override.
  createEffect(() => {
    const id = props.scriptId;
    if (!id) return;
    void (async () => {
      try {
        const raw = await api.getAppState(QUICK_MODE_KEY(id));
        setManualOverride(raw === "1" || raw === "0" ? raw : null);
      } catch {
        setManualOverride(null);
      }
    })();
  });

  const toggleQuickMode = () => {
    if (!quickAvailable()) return;
    const next = !quickMode();
    // Any click counts as a manual override and is persisted per-script;
    // even toggling back to whatever the auto-rule would have produced
    // pins the writer's choice for this script forever.
    setManualOverride(next ? "1" : "0");
    void api
      .setAppState(QUICK_MODE_KEY(props.scriptId), next ? "1" : "0")
      .catch(() => {});
  };

  // Hotkeys local to this script: Cmd+Shift+S snapshot, Cmd+Shift+H snapshots
  // dialog. (⌘E export and ⌘P print live in App.tsx so the TabBar buttons
  // and the shortcuts share the same trigger.)
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

  return (
    <div class="script-shell">
      {/* `script.latest` keeps returning the previously-resolved value
          during a refetch (e.g. after the highlight toggle bumps
          scriptsBus). Reading `script()` instead would throw the
          fetch-in-flight promise up to the Suspense boundary in App,
          which then yanks the editor out and re-mounts it on resolve —
          producing the visible flash the user reported. */}
      <Show when={script.latest} fallback={<div style="padding: 40px;">Lade…</div>}>
        {(s) => (
          <>
            <button
              type="button"
              class="quick-mode-toggle"
              classList={{
                "is-on": quickMode(),
                "is-disabled": !quickAvailable(),
              }}
              disabled={!quickAvailable()}
              onClick={toggleQuickMode}
              title={
                quickAvailable()
                  ? quickMode()
                    ? "Quick-Modus aus"
                    : "Quick-Modus an (Enter im Dialog → anderer Charakter)"
                  : "Quick-Modus benötigt genau 2 Charaktere im Skript"
              }
              aria-label="Quick-Modus"
              aria-pressed={quickMode()}
            >
              <BoltIcon />
            </button>

            <div class="paper-canvas" ref={canvasRef}>
              <div
                class="paper-stack"
                style={{ "--page-count": pageCount() }}
              >
                {/* Reference elements used by Editor.tsx to resolve the
                    current paper-content-h and the page-boundary "dead
                    zone" (margin-bottom + gap + margin-top) to px values
                    so pagination stays correct under any future
                    paper-zoom. */}
                <div class="paper-content-ruler" />
                <div class="paper-deadzone-ruler" />

                {/* Background: one A4 sheet per page, absolutely
                    positioned so the stack height stays predictable. */}
                <For each={Array.from({ length: pageCount() }, (_, i) => i)}>
                  {(i) => (
                    <div
                      class="paper-page-bg"
                      style={{ "--page-index": i }}
                      data-page-num={i + 1}
                      aria-hidden="true"
                    >
                      <Show when={i > 0}>
                        <span class="paper-page-num">Seite {i + 1}</span>
                      </Show>
                    </div>
                  )}
                </For>

                {/* Foreground: the Lexical editor as a single overlay over
                    the page-stack. Keyed on scriptId so the editor is torn
                    down and rebuilt on tab switch (otherwise it would keep
                    the previous script's content and persist it to the
                    newly-active scriptId on the next save). */}
                <div class="paper-editor-overlay">
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
                          characters={s().characters}
                          highlighting={highlightingOn()}
                          quickModeEnabled={() => quickMode()}
                          onPageCountChange={setPageCount}
                          onSavingChange={setSaving}
                          onCharactersChange={setLiveChars}
                          onParseError={(raw) => setParseError(raw)}
                        />
                      )}
                    </Show>
                  </Show>
                </div>
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
          title="Aktuelle (defekte) Version als Snapshot sichern und mit leerem Skript fortfahren"
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

function BoltIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
    </svg>
  );
}

export default ScriptView;
