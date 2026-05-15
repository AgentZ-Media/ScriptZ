import { Show } from "solid-js";
import type { Folder, ScriptSummary } from "../../lib/types";
import { Modal } from "../Common/Modal";
import { ConfirmDialog } from "../Common/ConfirmDialog";
import { t } from "../../i18n";

export interface BrowserDialogsProps {
  // Script rename
  renameTarget: ScriptSummary | null;
  renameValue: string;
  onRenameValue: (v: string) => void;
  onRenameClose: () => void;
  onRenameCommit: () => void;

  // Folder create
  folderCreateOpen: boolean;
  folderCreateValue: string;
  onFolderCreateValue: (v: string) => void;
  onFolderCreateClose: () => void;
  onFolderCreateCommit: () => void;

  // Folder rename
  folderRenameTarget: Folder | null;
  folderRenameValue: string;
  onFolderRenameValue: (v: string) => void;
  onFolderRenameClose: () => void;
  onFolderRenameCommit: () => void;

  // Folder delete (confirm)
  folderDeleteTarget: Folder | null;
  onFolderDeleteCancel: () => void;
  onFolderDeleteConfirm: () => void;
}

/** All modal dialogs spawned from the Browser: script rename,
 *  folder create / rename, folder-delete confirm. Pure presentational —
 *  the parent owns the state and the commit/cancel logic. */
export function BrowserDialogs(props: BrowserDialogsProps) {
  return (
    <>
      <Modal
        open={props.renameTarget !== null}
        onClose={props.onRenameClose}
        title={t("script.renameTitle")}
        footer={
          <>
            <button class="btn" onClick={props.onRenameClose}>
              {t("common.cancel")}
            </button>
            <button
              class="btn btn-primary"
              onClick={props.onRenameCommit}
              disabled={props.renameValue.trim().length === 0}
            >
              {t("common.save")}
            </button>
          </>
        }
      >
        <Show when={props.renameTarget}>
          {(target) => (
            <div class="field">
              <label>{t("script.titleLabel")}</label>
              <input
                type="text"
                value={props.renameValue}
                autofocus
                aria-invalid={props.renameValue.trim().length === 0}
                aria-describedby={
                  props.renameValue.trim().length === 0 ? "rename-empty-hint" : undefined
                }
                onInput={(e) => props.onRenameValue(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") props.onRenameCommit();
                }}
              />
              <Show
                when={props.renameValue.trim().length === 0}
                fallback={
                  <div class="muted small">
                    {t("common.current", { value: target().title })}
                  </div>
                }
              >
                <div id="rename-empty-hint" class="field-hint field-hint-warn">
                  {t("script.renameEmptyHint")}
                </div>
              </Show>
            </div>
          )}
        </Show>
      </Modal>

      <Modal
        open={props.folderCreateOpen}
        onClose={props.onFolderCreateClose}
        title={t("folder.createTitle")}
        footer={
          <>
            <button class="btn" onClick={props.onFolderCreateClose}>
              {t("common.cancel")}
            </button>
            <button class="btn btn-primary" onClick={props.onFolderCreateCommit}>
              {t("folder.createSubmit")}
            </button>
          </>
        }
      >
        <div class="field">
          <label>{t("common.name")}</label>
          <input
            type="text"
            value={props.folderCreateValue}
            placeholder={t("folder.placeholder")}
            autofocus
            onInput={(e) => props.onFolderCreateValue(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") props.onFolderCreateCommit();
            }}
          />
        </div>
      </Modal>

      <Modal
        open={props.folderRenameTarget !== null}
        onClose={props.onFolderRenameClose}
        title={t("folder.renameTitle")}
        footer={
          <>
            <button class="btn" onClick={props.onFolderRenameClose}>
              {t("common.cancel")}
            </button>
            <button class="btn btn-primary" onClick={props.onFolderRenameCommit}>
              {t("common.save")}
            </button>
          </>
        }
      >
        <Show when={props.folderRenameTarget}>
          {(target) => (
            <div class="field">
              <label>{t("folder.renameLabel")}</label>
              <input
                type="text"
                value={props.folderRenameValue}
                autofocus
                onInput={(e) => props.onFolderRenameValue(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") props.onFolderRenameCommit();
                }}
              />
              <div class="muted small">{t("common.current", { value: target().name })}</div>
            </div>
          )}
        </Show>
      </Modal>

      <Show when={props.folderDeleteTarget}>
        {(target) => (
          <ConfirmDialog
            open={true}
            title={t("folder.deleteTitle", { name: target().name })}
            body={
              target().script_count === 0
                ? t("folder.deleteBody.empty")
                : target().script_count === 1
                ? t("folder.deleteBody.one")
                : t("folder.deleteBody.many", { count: target().script_count })
            }
            confirmLabel={t("common.delete")}
            danger
            onCancel={props.onFolderDeleteCancel}
            onConfirm={props.onFolderDeleteConfirm}
          />
        )}
      </Show>
    </>
  );
}
