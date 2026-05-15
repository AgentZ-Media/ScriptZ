import { createSignal, createMemo, createResource, For, Show, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import { api } from "../../lib/api";
import { tabsStore } from "../../stores/tabs";
import { pushToast } from "../../stores/toasts";
import { scriptsBus } from "../../lib/scriptsBus";
import { foldersBus } from "../../lib/foldersBus";
import { Modal } from "../Common/Modal";
import { t } from "../../i18n";

export interface NewScriptDialogProps {
  onClose: () => void;
  onCreated?: () => void;
  /** Optional pre-selection — when the dialog is opened from a folder
   * filter, the new script defaults to that folder. `null` = "All". */
  defaultFolderId?: string | null;
}

interface FolderOption {
  id: string | null;
  name: string;
}

interface FolderSelectProps {
  options: FolderOption[];
  value: string | null;
  onChange: (id: string | null) => void;
}

function FolderSelect(props: FolderSelectProps) {
  const [open, setOpen] = createSignal(false);
  const [activeIdx, setActiveIdx] = createSignal(0);
  const [pos, setPos] = createSignal({ top: 0, left: 0, width: 0 });
  let triggerRef: HTMLButtonElement | undefined;
  let popoverRef: HTMLDivElement | undefined;

  const selectedIdx = createMemo(() =>
    props.options.findIndex((o) => o.id === props.value),
  );
  const selectedLabel = createMemo(() => {
    const i = selectedIdx();
    return i >= 0 ? props.options[i].name : "";
  });

  function updatePos() {
    if (!triggerRef) return;
    const r = triggerRef.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: r.left, width: r.width });
  }

  function toggle() {
    if (open()) {
      setOpen(false);
    } else {
      setActiveIdx(Math.max(0, selectedIdx()));
      updatePos();
      setOpen(true);
    }
  }

  function close() {
    setOpen(false);
    triggerRef?.focus();
  }

  function commit(idx: number) {
    const opt = props.options[idx];
    if (opt) props.onChange(opt.id);
    close();
  }

  function onTriggerKey(e: KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!open()) {
        setActiveIdx(Math.max(0, selectedIdx()));
        setOpen(true);
      }
    }
  }

  function onPopoverKey(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % props.options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + props.options.length) % props.options.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      commit(activeIdx());
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  function onDocClick(e: MouseEvent) {
    if (!open()) return;
    const target = e.target as Node;
    if (triggerRef?.contains(target) || popoverRef?.contains(target)) return;
    setOpen(false);
  }
  function onReflow() {
    if (open()) updatePos();
  }
  document.addEventListener("mousedown", onDocClick);
  window.addEventListener("scroll", onReflow, true);
  window.addEventListener("resize", onReflow);
  onCleanup(() => {
    document.removeEventListener("mousedown", onDocClick);
    window.removeEventListener("scroll", onReflow, true);
    window.removeEventListener("resize", onReflow);
  });

  return (
    <div class={`cselect ${open() ? "is-open" : ""}`}>
      <button
        ref={triggerRef}
        type="button"
        class="cselect-trigger"
        aria-haspopup="listbox"
        aria-expanded={open()}
        onClick={toggle}
        onKeyDown={onTriggerKey}
      >
        <span class="cselect-value">{selectedLabel()}</span>
        <span class="cselect-caret" aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
      </button>
      <Show when={open()}>
        <Portal>
          <div
            ref={(el) => {
              popoverRef = el;
              queueMicrotask(() => el.focus());
            }}
            class="cselect-popover"
            role="listbox"
            tabindex="-1"
            onKeyDown={onPopoverKey}
            style={{
              top: `${pos().top}px`,
              left: `${pos().left}px`,
              width: `${pos().width}px`,
            }}
          >
            <For each={props.options}>
              {(opt, i) => (
                <div
                  role="option"
                  aria-selected={opt.id === props.value}
                  class={`cselect-option ${i() === activeIdx() ? "is-active" : ""} ${opt.id === props.value ? "is-selected" : ""}`}
                  onMouseEnter={() => setActiveIdx(i())}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commit(i());
                  }}
                >
                  {opt.name}
                </div>
              )}
            </For>
          </div>
        </Portal>
      </Show>
    </div>
  );
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

  const folderOptions = createMemo<FolderOption[]>(() => [
    { id: null, name: t("newScript.folder.none") },
    ...(folders() ?? []).map((f) => ({ id: f.id, name: f.name })),
  ]);

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
      pushToast(t("common.errorPrefix", { message: (e as Error).message }), "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={true}
      onClose={props.onClose}
      title={t("newScript.title")}
      footer={
        <>
          <button class="btn" onClick={props.onClose}>
            {t("common.cancel")}
          </button>
          <button
            class="btn btn-primary"
            onClick={submit}
            disabled={submitting()}
          >
            {t("common.create")}
          </button>
        </>
      }
    >
      <div class="field">
        <label>{t("newScript.titleField")}</label>
        <input
          type="text"
          placeholder={t("common.untitled")}
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
          <label>{t("newScript.folder")}</label>
          <FolderSelect
            options={folderOptions()}
            value={folderId()}
            onChange={setFolderId}
          />
        </div>
      </Show>
    </Modal>
  );
}
