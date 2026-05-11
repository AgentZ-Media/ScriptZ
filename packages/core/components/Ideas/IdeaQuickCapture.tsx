import { Show, createSignal, createEffect } from "solid-js";
import { Portal } from "solid-js/web";
import { api } from "../../lib/api";
import { tabsStore } from "../../stores/tabs";
import { pushToast } from "../../stores/toasts";
import { K } from "../../lib/keys";
import { t } from "../../i18n";

export interface IdeaQuickCaptureProps {
  open: boolean;
  onClose(): void;
}

export function IdeaQuickCapture(props: IdeaQuickCaptureProps) {
  const [val, setVal] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  let inputRef: HTMLInputElement | undefined;

  let lastOpen = false;
  createEffect(() => {
    const isOpen = props.open;
    if (isOpen && !lastOpen) {
      setVal("");
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
      const idea = await api.createIdea({ title: txt });
      if (convertToScript) {
        const { script } = await api.convertIdeaToScript({ ideaId: idea.id });
        tabsStore.openScript(script.id, script.title);
        pushToast(t("idea.quick.toast.scriptCreated", { title: script.title }), "ok");
      } else {
        pushToast(t("idea.quick.toast.remembered", { title: idea.title }), "ok");
      }
      props.onClose();
    } catch (err) {
      pushToast(t("common.errorPrefix", { message: (err as Error).message ?? String(err) }), "error");
    } finally {
      setSaving(false);
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
