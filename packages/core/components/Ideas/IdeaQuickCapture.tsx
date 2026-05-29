import { Show, createSignal, createEffect, createMemo, createResource } from "solid-js";
import { Portal } from "solid-js/web";
import { api } from "../../lib/api";
import { tabsStore } from "../../stores/tabs";
import { pushToast } from "../../stores/toasts";
import { foldersBus } from "../../lib/foldersBus";
import { K } from "../../lib/keys";
import { t } from "../../i18n";
import { ConvertIdeaDialog } from "./ConvertIdeaDialog";
import { FolderSelect, type FolderOption } from "./parts/FolderSelect";
import type { Idea } from "../../lib/types";

export interface IdeaQuickCaptureProps {
  open: boolean;
  onClose(): void;
}

export function IdeaQuickCapture(props: IdeaQuickCaptureProps) {
  const [val, setVal] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [folderId, setFolderId] = createSignal<string | null>(null);
  const [pendingConvert, setPendingConvert] = createSignal<Idea | null>(null);
  let inputRef: HTMLInputElement | undefined;

  const [folders] = createResource(
    () => foldersBus.version(),
    () => api.listFolders(),
    { initialValue: [] },
  );

  const folderOptions = createMemo<FolderOption[]>(() => [
    { id: null, name: t("newScript.folder.none") },
    ...(folders() ?? []).map((f) => ({ id: f.id, name: f.name })),
  ]);

  let lastOpen = false;
  createEffect(() => {
    const isOpen = props.open;
    if (isOpen && !lastOpen) {
      setVal("");
      setFolderId(null);
      setSaving(false);
      setTimeout(() => inputRef?.focus(), 30);
    }
    lastOpen = isOpen;
  });

  async function save(convertToScript = false) {
    if (saving()) return;
    const txt = val().trim();
    if (!txt) {
      props.onClose();
      return;
    }
    setSaving(true);
    try {
      const idea = await api.createIdea({ title: txt, folderId: folderId() });
      if (convertToScript) {
        if ((folders() ?? []).length > 0) {
          // Hand off to the folder picker; the quick-capture stays
          // mounted underneath so the dialog opens on top.
          setPendingConvert(idea);
          return;
        }
        await convertInto(idea, null);
      } else {
        pushToast(t("idea.quick.toast.remembered", { title: idea.title }), "ok");
        props.onClose();
      }
    } catch (err) {
      pushToast(t("common.errorPrefix", { message: (err as Error).message ?? String(err) }), "error");
    } finally {
      setSaving(false);
    }
  }

  async function convertInto(idea: Idea, folderId: string | null) {
    try {
      const { script } = await api.convertIdeaToScript({ ideaId: idea.id, folderId });
      tabsStore.openScript(script.id, script.title);
      pushToast(t("idea.quick.toast.scriptCreated", { title: script.title }), "ok");
      props.onClose();
    } catch (err) {
      pushToast(t("common.errorPrefix", { message: (err as Error).message ?? String(err) }), "error");
    }
  }

  return (
    <Show when={props.open}>
      <Portal>
        <div class="qcap-scrim" onClick={props.onClose}>
          <div class="qcap" onClick={(e) => e.stopPropagation()}>
            <div class="qcap-head">
              <span class="qcap-bulb"><BulbIcon /></span>
              <span class="qcap-label">{t("idea.quick.label")}</span>
              <span class="qcap-spacer" />
              <span class="kbd kbd-inline">Esc</span>
            </div>
            <input
              ref={inputRef}
              class="qcap-input"
              value={val()}
              onInput={(e) => setVal(e.currentTarget.value)}
              placeholder={t("idea.quick.placeholder")}
              spellcheck={false}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void save(true);
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  void save(false);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  props.onClose();
                }
              }}
            />
            <Show when={(folders() ?? []).length > 0}>
              <div class="qcap-folder">
                <span class="qcap-folder-label">{t("ideas.capture.folder")}</span>
                <FolderSelect
                  options={folderOptions()}
                  value={folderId()}
                  onChange={setFolderId}
                />
              </div>
            </Show>
            <div class="qcap-foot">
              <button class="btn" onClick={props.onClose}>{t("common.cancel")}</button>
              <div style="flex:1" />
              <button
                class="btn"
                disabled={!val().trim() || saving()}
                onClick={() => void save(true)}
                title={t("idea.quick.createScript.title")}
              >
                {t("idea.quick.createScript")} <span class="kbd kbd-inline">{K("Mod+Enter")}</span>
              </button>
              <button
                class="btn btn-primary"
                disabled={!val().trim() || saving()}
                onClick={() => void save(false)}
                title={t("idea.quick.remember.title")}
              >
                {t("idea.quick.remember")} <span class="kbd kbd-inline">⏎</span>
              </button>
            </div>
          </div>
        </div>
      </Portal>
      <Show when={pendingConvert()}>
        {(idea) => (
          <ConvertIdeaDialog
            ideaTitle={idea().title}
            defaultFolderId={idea().folder_id}
            onCancel={() => {
              setPendingConvert(null);
              setSaving(false);
              props.onClose();
            }}
            onConfirm={(folderId) => {
              const target = idea();
              setPendingConvert(null);
              void convertInto(target, folderId);
            }}
          />
        )}
      </Show>
    </Show>
  );
}

function BulbIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2V17h6v-.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z" />
    </svg>
  );
}
