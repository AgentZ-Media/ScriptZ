import { createSignal, createMemo, createResource } from "solid-js";
import { api } from "../../lib/api";
import { foldersBus } from "../../lib/foldersBus";
import { Modal } from "../Common/Modal";
import { t } from "../../i18n";
import { FolderSelect, type FolderOption } from "./parts/FolderSelect";

export interface ConvertIdeaDialogProps {
  ideaTitle: string;
  /** Folder the idea already lives in — pre-selected so converting keeps
   *  the script in the same client/project folder. */
  defaultFolderId?: string | null;
  onCancel: () => void;
  onConfirm: (folderId: string | null) => void;
}

export function ConvertIdeaDialog(props: ConvertIdeaDialogProps) {
  const [folderId, setFolderId] = createSignal<string | null>(
    props.defaultFolderId ?? null,
  );

  const [folders] = createResource(
    () => foldersBus.version(),
    () => api.listFolders(),
    { initialValue: [] },
  );

  const folderOptions = createMemo<FolderOption[]>(() => [
    { id: null, name: t("newScript.folder.none") },
    ...(folders() ?? []).map((f) => ({ id: f.id, name: f.name })),
  ]);

  return (
    <Modal
      open={true}
      onClose={props.onCancel}
      title={t("idea.convert.title")}
      footer={
        <>
          <button class="btn" onClick={props.onCancel}>
            {t("common.cancel")}
          </button>
          <button
            class="btn btn-primary"
            onClick={() => props.onConfirm(folderId())}
          >
            {t("common.create")}
          </button>
        </>
      }
    >
      <div class="field">
        <div class="idea-convert-summary">
          {t("idea.convert.summary", { title: props.ideaTitle })}
        </div>
      </div>
      <div class="field">
        <label>{t("newScript.folder")}</label>
        <FolderSelect
          options={folderOptions()}
          value={folderId()}
          onChange={setFolderId}
        />
      </div>
    </Modal>
  );
}
