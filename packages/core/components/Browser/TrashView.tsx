import { createSignal, createResource, createMemo, For, Show } from "solid-js";
import type { ScriptSummary } from "../../lib/types";
import { api } from "../../lib/api";
import { pushToast } from "../../stores/toasts";
import { relativeTime } from "../../lib/format";
import { Modal } from "../Common/Modal";
import { scriptsBus } from "../../lib/scriptsBus";
import { t, tPlural } from "../../i18n";

type Confirm =
  | { kind: "restore-all" }
  | { kind: "empty" }
  | { kind: "purge"; script: ScriptSummary };

export interface TrashViewProps {
  /** Wird aufgerufen, wenn der Papierkorb durch eine Wiederherstell-Aktion
   *  vollständig geleert wurde. Browser benutzt das, um automatisch zur
   *  Skript-Übersicht zurückzunavigieren - sonst landet der User vor der
   *  „Der Papierkorb ist leer"-Zeile und muss raten, wo das Skript hin
   *  ist. */
  onTrashEmptiedByRestore?: () => void;
}

export function TrashView(props: TrashViewProps = {}) {
  const [confirm, setConfirm] = createSignal<Confirm | null>(null);
  const [scripts] = createResource(
    () => scriptsBus.version(),
    () => api.listScripts({ onlyArchived: true, sort: "updated" }),
  );

  async function restoreAll() {
    const arr = scripts() ?? [];
    if (arr.length === 0) return;
    try {
      await Promise.all(arr.map((s) => api.restoreScript(s.id)));
      pushToast(tPlural("trash.toast.restoredAll", arr.length), "ok");
      scriptsBus.bump();
      // restoreAll leert den Papierkorb per Definition -> raus aus der View.
      props.onTrashEmptiedByRestore?.();
    } catch (e) {
      pushToast(t("common.errorPrefix", { message: (e as Error).message }), "error");
    }
  }

  async function emptyAll() {
    try {
      await api.emptyTrash();
      pushToast(t("trash.toast.emptied"), "ok");
      scriptsBus.bump();
    } catch (e) {
      pushToast(t("common.errorPrefix", { message: (e as Error).message }), "error");
    }
  }

  async function restoreOne(id: string) {
    // Vor dem API-Call merken, ob das hier das letzte Element war - sonst
    // wäre die Liste nach dem Bump schon neu und der Check würde immer
    // false ergeben.
    const wasLast = (scripts() ?? []).length <= 1;
    try {
      await api.restoreScript(id);
      pushToast(t("trash.toast.restored"), "ok");
      scriptsBus.bump();
      if (wasLast) props.onTrashEmptiedByRestore?.();
    } catch (e) {
      pushToast(t("common.errorPrefix", { message: (e as Error).message }), "error");
    }
  }

  async function purgeOne(id: string) {
    try {
      await api.purgeScript(id);
      pushToast(t("trash.toast.purged"), "ok");
      scriptsBus.bump();
    } catch (e) {
      pushToast(t("common.errorPrefix", { message: (e as Error).message }), "error");
    }
  }

  const list = () => scripts() ?? [];

  const confirmTitle = createMemo(() => {
    const c = confirm();
    if (!c) return "";
    if (c.kind === "restore-all") return t("trash.confirm.restoreAll.title");
    if (c.kind === "empty") return t("trash.confirm.empty.title");
    return t("trash.confirm.purge.title");
  });

  return (
    <div class="trash-region">
      <div class="trash-toolbar">
        <button
          class="btn"
          disabled={list().length === 0}
          onClick={() => setConfirm({ kind: "restore-all" })}
        >
          {t("trash.restoreAll")}
        </button>
        <button
          class="btn btn-danger"
          disabled={list().length === 0}
          onClick={() => setConfirm({ kind: "empty" })}
        >
          {t("trash.emptyAll")}
        </button>
      </div>

      <Show
        when={list().length > 0}
        fallback={
          <Show when={!scripts.loading}>
            <div class="empty-state">
              <p class="muted">{t("trash.empty")}</p>
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
                      {t("trash.deletedAt", { when: relativeTime(s.archived_at!) })}
                    </Show>
                  </div>
                </div>
                <div class="trash-row-actions">
                  <button class="btn" onClick={() => restoreOne(s.id)}>
                    {t("trash.restoreOne")}
                  </button>
                  <button
                    class="btn btn-danger"
                    onClick={() => setConfirm({ kind: "purge", script: s })}
                  >
                    {t("trash.purgeOne")}
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
              {t("common.cancel")}
            </button>
            <Show when={confirm()?.kind === "restore-all"}>
              <button
                class="btn btn-primary"
                onClick={() => {
                  setConfirm(null);
                  void restoreAll();
                }}
              >
                {t("trash.restoreOne")}
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
                {t("trash.confirm.empty.button")}
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
                {t("common.delete")}
              </button>
            </Show>
          </>
        }
      >
        <Show when={confirm()}>
          {(c) => (
            <p class="muted">
              <Show when={c().kind === "restore-all"}>
                {tPlural("trash.confirm.restoreAll.body", list().length)}
              </Show>
              <Show when={c().kind === "empty"}>
                {tPlural("trash.confirm.empty.body", list().length)}
              </Show>
              <Show when={c().kind === "purge"}>
                {t("trash.confirm.purge.body", { title: (c() as { kind: "purge"; script: ScriptSummary }).script.title })}
              </Show>
            </p>
          )}
        </Show>
      </Modal>
    </div>
  );
}
