import { createSignal } from "solid-js";
import { api } from "~/lib/api";
import { tabsStore } from "~/stores/tabs";
import { pushToast } from "~/stores/toasts";
import { scriptsBus } from "~/lib/scriptsBus";
import { Modal } from "~/components/Common/Modal";

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
      scriptsBus.bump();
      tabsStore.openScript(created.id, created.title);
      props.onCreated?.();
      props.onClose();
    } catch (e) {
      pushToast(`Fehler: ${(e as Error).message}`, "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={true}
      onClose={props.onClose}
      title="Neues Skript"
      footer={
        <>
          <button class="btn" onClick={props.onClose}>
            Abbrechen
          </button>
          <button
            class="btn btn-primary"
            onClick={submit}
            disabled={submitting()}
          >
            Erstellen
          </button>
        </>
      }
    >
      <div class="field">
        <label>Titel</label>
        <input
          type="text"
          placeholder="Unbenannt"
          value={title()}
          onInput={(e) => setTitle(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          autofocus
        />
      </div>
    </Modal>
  );
}
