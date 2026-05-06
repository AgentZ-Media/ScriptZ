import { createSignal, createResource, For, Show } from "solid-js";
import { Portal } from "solid-js/web";
import type { ScriptSummary } from "~/lib/types";
import { api } from "~/lib/api";
import { pushToast } from "~/stores/toasts";
import { relativeTime } from "~/lib/format";

type Confirm =
  | { kind: "restore-all" }
  | { kind: "empty" }
  | { kind: "purge"; script: ScriptSummary };

export function TrashView() {
  const [confirm, setConfirm] = createSignal<Confirm | null>(null);
  const [scripts, { refetch }] = createResource(() =>
    api.listScripts({ onlyArchived: true, sort: "updated" }),
  );

  async function restoreAll() {
    const list = scripts() ?? [];
    try {
      await Promise.all(list.map((s) => api.restoreScript(s.id)));
      pushToast(`${list.length} Skripte wiederhergestellt`, "ok");
      void refetch();
    } catch (e) {
      pushToast(`Fehler: ${(e as Error).message}`, "error");
    }
  }

  async function emptyAll() {
    try {
      await api.emptyTrash();
      pushToast("Papierkorb geleert", "ok");
      void refetch();
    } catch (e) {
      pushToast(`Fehler: ${(e as Error).message}`, "error");
    }
  }

  async function restoreOne(id: string) {
    try {
      await api.restoreScript(id);
      pushToast("Wiederhergestellt", "ok");
      void refetch();
    } catch (e) {
      pushToast(`Fehler: ${(e as Error).message}`, "error");
    }
  }

  async function purgeOne(id: string) {
    try {
      await api.purgeScript(id);
      pushToast("Endgültig gelöscht", "ok");
      void refetch();
    } catch (e) {
      pushToast(`Fehler: ${(e as Error).message}`, "error");
    }
  }

  const list = () => scripts() ?? [];

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
                      <span class="dot-sep">·</span>
                    </Show>
                    {s.page_count === 1 ? "1 Seite" : `${s.page_count} Seiten`}
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

      <Show when={confirm()}>
        {(c) => (
          <Portal>
            <div
              class="modal-backdrop"
              onClick={(e) => {
                if (e.target === e.currentTarget) setConfirm(null);
              }}
            >
              <div class="modal" role="dialog">
                <h2>
                  {c().kind === "restore-all" && "Alle wiederherstellen?"}
                  {c().kind === "empty" && "Papierkorb leeren?"}
                  {c().kind === "purge" && "Endgültig löschen?"}
                </h2>
                <div class="modal-body">
                  <Show when={c().kind === "restore-all"}>
                    <p>
                      Alle {list().length} Skripte werden aus dem Papierkorb wiederhergestellt.
                    </p>
                  </Show>
                  <Show when={c().kind === "empty"}>
                    <p>
                      Alle {list().length} Skripte werden <strong>unwiderruflich</strong>{" "}
                      gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.
                    </p>
                  </Show>
                  <Show when={c().kind === "purge"}>
                    <p>
                      "{(c() as { kind: "purge"; script: ScriptSummary }).script.title}" wird{" "}
                      <strong>unwiderruflich</strong> gelöscht.
                    </p>
                  </Show>
                </div>
                <div class="modal-footer">
                  <button class="btn" onClick={() => setConfirm(null)}>
                    Abbrechen
                  </button>
                  <Show when={c().kind === "restore-all"}>
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
                  <Show when={c().kind === "empty"}>
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
                  <Show when={c().kind === "purge"}>
                    <button
                      class="btn btn-danger"
                      onClick={() => {
                        const cur = c();
                        setConfirm(null);
                        if (cur.kind === "purge") void purgeOne(cur.script.id);
                      }}
                    >
                      Löschen
                    </button>
                  </Show>
                </div>
              </div>
            </div>
          </Portal>
        )}
      </Show>
    </div>
  );
}
