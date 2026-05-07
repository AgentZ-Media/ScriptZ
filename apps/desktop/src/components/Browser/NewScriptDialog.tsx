import { createSignal, createResource, For, Show } from "solid-js";
import { api } from "~/lib/api";
import { tabsStore } from "~/stores/tabs";
import { pushToast } from "~/stores/toasts";
import { scriptsBus } from "~/lib/scriptsBus";
import { foldersBus } from "~/lib/foldersBus";
import { Modal } from "~/components/Common/Modal";

export interface NewScriptDialogProps {
  onClose: () => void;
  onCreated?: () => void;
  /** Optional pre-selection — when the dialog is opened from a folder
   * filter, the new script defaults to that folder. `null` = "Alle". */
  defaultFolderId?: string | null;
}

export function NewScriptDialog(props: NewScriptDialogProps) {
  const [title, setTitle] = createSignal("");
  const [folderId, setFolderId] = createSignal<string | null>(
    props.defaultFolderId ?? null,
  );
  const [submitting, setSubmitting] = createSignal(false);

  const [folders] = createResource(
    () => foldersBus.version(),
    () => api.listFolders(),
    { initialValue: [] },
  );

  async function submit() {
    if (submitting()) return;
    setSubmitting(true);
    try {
      const created = await api.createScript({
        title: title().trim() || undefined,
        folderId: folderId(),
      });
      scriptsBus.bump();
      foldersBus.bump();
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
      <Show when={(folders() ?? []).length > 0}>
        <div class="field">
          <label>Ordner</label>
          <select
            value={folderId() ?? ""}
            onChange={(e) =>
              setFolderId(e.currentTarget.value === "" ? null : e.currentTarget.value)
            }
          >
            <option value="">Kein Ordner</option>
            <For each={folders()}>
              {(f) => <option value={f.id}>{f.name}</option>}
            </For>
          </select>
        </div>
      </Show>
    </Modal>
  );
}
