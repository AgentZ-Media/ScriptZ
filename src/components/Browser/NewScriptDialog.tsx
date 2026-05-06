import { createSignal } from "solid-js";
import { Portal } from "solid-js/web";
import { api } from "~/lib/api";
import { tabsStore } from "~/stores/tabs";
import { pushToast } from "~/stores/toasts";

export interface NewScriptDialogProps {
  onClose: () => void;
  onCreated?: () => void;
}

export function NewScriptDialog(props: NewScriptDialogProps) {
  const [title, setTitle] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);

  async function submit() {
    if (submitting()) return;
    setSubmitting(true);
    try {
      const created = await api.createScript({
        title: title().trim() || undefined,
      });
      tabsStore.openScript(created.id, created.title);
      props.onCreated?.();
      props.onClose();
    } catch (e) {
      pushToast(`Fehler: ${(e as Error).message}`, "error");
    } finally {
      setSubmitting(false);
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      props.onClose();
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <Portal>
      <div
        class="modal-backdrop"
        onClick={(e) => {
          if (e.target === e.currentTarget) props.onClose();
        }}
        onKeyDown={onKey}
        tabIndex={-1}
      >
        <div class="modal" role="dialog" aria-label="Neues Skript">
          <h2>Neues Skript</h2>
          <div class="modal-body">
            <div class="field">
              <label>Titel</label>
              <input
                type="text"
                placeholder="Unbenannt"
                value={title()}
                onInput={(e) => setTitle(e.currentTarget.value)}
                autofocus
              />
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn" onClick={props.onClose}>
              Abbrechen
            </button>
            <button class="btn btn-primary" onClick={submit} disabled={submitting()}>
              Erstellen
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
