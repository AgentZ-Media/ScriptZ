import { createSignal, createResource, createMemo, For, Show } from "solid-js";
import type { ScriptSummary } from "../../lib/types";
import { api } from "../../lib/api";
import { pushToast } from "../../stores/toasts";
import { relativeTime } from "../../lib/format";
import { Modal } from "../Common/Modal";
import { scriptsBus } from "../../lib/scriptsBus";

type Confirm =
  | { kind: "restore-all" }
  | { kind: "empty" }
  | { kind: "purge"; script: ScriptSummary };

export function TrashView() {
  const [confirm, setConfirm] = createSignal<Confirm | null>(null);
  const [scripts] = createResource(
    () => scriptsBus.version(),
    () => api.listScripts({ onlyArchived: true, sort: "updated" }),
  );

  async function restoreAll() {
    const arr = scripts() ?? [];
    try {
      await Promise.all(arr.map((s) => api.restoreScript(s.id)));
      pushToast(`${arr.length} Skripte wiederhergestellt`, "ok");
      scriptsBus.bump();
    } catch (e) {
      pushToast(`Fehler: ${(e as Error).message}`, "error");
    }
  }

  async function emptyAll() {
    try {
      await api.emptyTrash();
      pushToast("Papierkorb geleert", "ok");
      scriptsBus.bump();
    } catch (e) {
      pushToast(`Fehler: ${(e as Error).message}`, "error");
    }
  }

  async function restoreOne(id: string) {
    try {
      await api.restoreScript(id);
      pushToast("Wiederhergestellt", "ok");
      scriptsBus.bump();
    } catch (e) {
      pushToast(`Fehler: ${(e as Error).message}`, "error");
    }
  }

  async function purgeOne(id: string) {
    try {
      await api.purgeScript(id);
      pushToast("Endgültig gelöscht", "ok");
      scriptsBus.bump();
    } catch (e) {
      pushToast(`Fehler: ${(e as Error).message}`, "error");
    }
  }

  const list = () => scripts() ?? [];

  const confirmTitle = createMemo(() => {
    const c = confirm();
    if (!c) return "";
    if (c.kind === "restore-all") return "Alle wiederherstellen?";
    if (c.kind === "empty") return "Papierkorb leeren?";
    return "Endgültig löschen?";
  });

  return (
    <div class="trash-region">
      <div class="trash-toolbar">
        <button
          class="btn"
          disabled={list().length === 0}
          onClick={() => setConfirm({ kind: "restore-all" })}
        >
          Alle wiederherstellen
        </button>
        <button
          class="btn btn-danger"
          disabled={list().length === 0}
          onClick={() => setConfirm({ kind: "empty" })}
        >
          Papierkorb leeren
        </button>
      </div>

      <Show
        when={list().length > 0}
        fallback={
          <Show when={!scripts.loading}>
            <div class="empty-state">
              <p class="muted">Der Papierkorb ist leer.</p>
            </div>
          </Show>
        }
      >
        <ul class="trash-list">
          <For each={list()}>
            {(s) => (
              <li class="trash-row">
                <div class="trash-row-info">
                  <div class="trash-row-title">{s.title}</div>
                  <div class="trash-row-meta muted">
                    <Show when={s.archived_at}>
                      Gelöscht {relativeTime(s.archived_at!)}
                    </Show>
                  </div>
                </div>
                <div class="trash-row-actions">
                  <button class="btn" onClick={() => restoreOne(s.id)}>
                    Wiederherstellen
                  </button>
                  <button
                    class="btn btn-danger"
                    onClick={() => setConfirm({ kind: "purge", script: s })}
                  >
                    Endgültig löschen
                  </button>
                </div>
              </li>
            )}
          </For>
        </ul>
      </Show>

      <Modal
        open={confirm() !== null}
        onClose={() => setConfirm(null)}
        title={confirmTitle()}
        footer={
          <>
            <button class="btn" onClick={() => setConfirm(null)}>
              Abbrechen
            </button>
            <Show when={confirm()?.kind === "restore-all"}>
              <button
                class="btn btn-primary"
                onClick={() => {
                  setConfirm(null);
                  void restoreAll();
                }}
              >
                Wiederherstellen
              </button>
            </Show>
            <Show when={confirm()?.kind === "empty"}>
              <button
                class="btn btn-danger"
                onClick={() => {
                  setConfirm(null);
                  void emptyAll();
                }}
              >
                Leeren
              </button>
            </Show>
            <Show when={confirm()?.kind === "purge"}>
              <button
                class="btn btn-danger"
                onClick={() => {
                  const c = confirm();
                  setConfirm(null);
                  if (c && c.kind === "purge") void purgeOne(c.script.id);
                }}
              >
                Löschen
              </button>
            </Show>
          </>
        }
      >
        <Show when={confirm()}>
          {(c) => (
            <p class="muted">
              <Show when={c().kind === "restore-all"}>
                Alle {list().length} Skripte werden aus dem Papierkorb wiederhergestellt.
              </Show>
              <Show when={c().kind === "empty"}>
                Alle {list().length} Skripte werden <strong>unwiderruflich</strong>{" "}
                gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.
              </Show>
              <Show when={c().kind === "purge"}>
                "{(c() as { kind: "purge"; script: ScriptSummary }).script.title}" wird{" "}
                <strong>unwiderruflich</strong> gelöscht.
              </Show>
            </p>
          )}
        </Show>
      </Modal>
    </div>
  );
}
