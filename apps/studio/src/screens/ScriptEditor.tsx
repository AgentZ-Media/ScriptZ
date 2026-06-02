import { createEffect, createSignal, Show } from "solid-js";
import { useParams, useNavigate, A } from "@solidjs/router";
import { createQuery, convex } from "../lib/convex";
import { api } from "../../convex/_generated/api";
import { useStudio } from "../context";
import { LoadingBlock, StatusBadge } from "../components/ui";
import { WorkflowBar } from "../components/WorkflowBar";
import { CommentsPanel } from "../components/CommentsPanel";
import { withToast, statusLabel } from "../lib/ui";
import { exportScriptsBundle } from "../lib/exportBundle";
import { Editor } from "@scriptz/core/components/Editor/Editor";
import { settingsStore } from "@scriptz/core/stores/settings";
import type { ScriptCharacter } from "@scriptz/core/lib/types";
import { setCurrentClient } from "../adapters/convex";
import "@scriptz/core/components/Editor/PaperLayout.css";

export function ScriptEditor() {
  const params = useParams();
  const navigate = useNavigate();
  const { isAgency } = useStudio();
  const script = createQuery(api.scripts.get, () => ({ scriptId: params.scriptId as never }));
  const readOnly = () => !isAgency();
  const [parseError, setParseError] = createSignal(false);

  // Scope the editor's character palette to this script's client, so colours
  // never bleed across companies. Set before the editor loads its palette.
  createEffect(() => {
    const s = script.data();
    if (s) setCurrentClient(s.clientId);
  });

  const highlightingOn = () => script.data()?.highlighting_enabled !== 0;

  // ---- Quick mode (two-hander dialogue), same behaviour as the core editor:
  // available only with exactly two characters; per-script manual override
  // remembered locally, otherwise follows the global default. ----
  const [liveChars, setLiveChars] = createSignal<ScriptCharacter[]>([]);
  createEffect(() => {
    const s = script.data();
    if (s) setLiveChars(s.characters);
  });
  const quickKey = () => `studio.quickmode.${params.scriptId}`;
  const [manualQuick, setManualQuick] = createSignal<"1" | "0" | null>(null);
  createEffect(() => {
    void params.scriptId; // re-read when the script changes
    try {
      const v = localStorage.getItem(quickKey());
      setManualQuick(v === "1" || v === "0" ? v : null);
    } catch {
      setManualQuick(null);
    }
  });
  const quickAvailable = () => liveChars().length === 2;
  const quickMode = () => {
    if (!quickAvailable()) return false;
    const m = manualQuick();
    if (m !== null) return m === "1";
    return settingsStore.quickModeAutoEnable();
  };
  const toggleQuick = () => {
    if (!quickAvailable()) return;
    const next = !quickMode();
    setManualQuick(next ? "1" : "0");
    try {
      localStorage.setItem(quickKey(), next ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  const renameScript = async (next: string) => {
    const cur = script.data();
    if (!cur || next.trim() === cur.title) return;
    await withToast(
      () => convex.mutation(api.scripts.updateMeta, { scriptId: params.scriptId as never, title: next.trim() || "Unbenannt" }),
    );
  };

  const toggleHighlight = async () => {
    await convex.mutation(api.scripts.updateMeta, {
      scriptId: params.scriptId as never,
      highlightingEnabled: !highlightingOn(),
    });
  };

  const del = async () => {
    if (!confirm("Dieses Skript löschen?")) return;
    const ok = await withToast(
      () => convex.mutation(api.scripts.remove, { scriptId: params.scriptId as never }),
      "Skript gelöscht",
    );
    if (ok !== undefined) navigate(`/c/${params.clientId}`);
  };

  return (
    <main class="page page-wide">
      <Show when={!script.loading() && script.data()} fallback={<LoadingBlock />}>
        {(s) => (
          <>
            <div class="crumbs" style="margin-bottom:0.75rem;">
              <A href="/">Kunden</A>
              <span class="sep">/</span>
              <A href={`/c/${params.clientId}`}>zurück</A>
              <span class="sep">/</span>
              <span class="cur">Skript</span>
            </div>

            <div class="editor-head">
              <Show
                when={isAgency()}
                fallback={<h1 class="page-title">{s().title}</h1>}
              >
                <input
                  class="editor-title-input"
                  value={s().title}
                  onChange={(e) => void renameScript(e.currentTarget.value)}
                />
              </Show>
              <StatusBadge status={s().status} />
              <span class="spacer" />
              <Show when={isAgency()}>
                <button
                  class="btn btn-sm"
                  classList={{ "is-active": quickMode() }}
                  disabled={!quickAvailable()}
                  title={
                    quickAvailable()
                      ? "Quick-Modus: nach einem Dialog automatisch der andere Charakter (Zwei-Personen-Dialog)"
                      : "Quick-Modus benötigt genau 2 Charaktere"
                  }
                  onClick={toggleQuick}
                >
                  Quick {quickMode() ? "an" : "aus"}
                </button>
                <button class="btn btn-sm" onClick={() => void toggleHighlight()}>
                  {highlightingOn() ? "Farben aus" : "Farben an"}
                </button>
              </Show>
              <button
                class="btn btn-sm"
                onClick={() => void exportScriptsBundle([s().id], `${s().title || "Skript"}.pdf`)}
              >
                PDF
              </button>
              <Show when={isAgency()}>
                <button class="btn btn-ghost btn-sm" onClick={() => void del()}>
                  Löschen
                </button>
              </Show>
            </div>

            <div class="editor-layout">
              <div class="editor-pane">
                <Show
                  when={!parseError()}
                  fallback={<div class="recovery-note">Dieses Skript konnte nicht geladen werden (beschädigter Inhalt).</div>}
                >
                  <div class="paper-canvas">
                    <div class="paper-sheet">
                      <Show when={s().id} keyed>
                        {(id) => (
                          <Editor
                            scriptId={id}
                            initialContentJson={s().content_json}
                            characters={s().characters}
                            highlighting={highlightingOn()}
                            readOnly={readOnly()}
                            quickModeEnabled={() => quickMode()}
                            onCharactersChange={setLiveChars}
                            onParseError={() => setParseError(true)}
                          />
                        )}
                      </Show>
                    </div>
                  </div>
                </Show>
              </div>

              <aside class="detail-side">
                <div class="card detail-workflow">
                  <h3 class="detail-side-head">Status: {statusLabel(s().status)}</h3>
                  <Show when={s().decisionNote}>
                    <p class="decision-note">„{s().decisionNote}"</p>
                  </Show>
                  <WorkflowBar targetType="script" id={s().id} status={s().status} isAgency={isAgency()} />
                </div>
                <Show when={s().originIdea}>
                  <div class="card detail-origin">
                    <details>
                      <summary class="detail-origin-summary">Aus Idee entstanden</summary>
                      <p class="detail-origin-title">{s().originIdea!.title}</p>
                      <Show when={s().originIdea!.notes}>
                        <p class="detail-origin-notes">{s().originIdea!.notes}</p>
                      </Show>
                    </details>
                  </div>
                </Show>
                <div class="card">
                  <CommentsPanel targetType="script" targetId={s().id} />
                </div>
              </aside>
            </div>
          </>
        )}
      </Show>
    </main>
  );
}
