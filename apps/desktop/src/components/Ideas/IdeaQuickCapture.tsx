import { Show, createSignal, createEffect } from "solid-js";
import { Portal } from "solid-js/web";
import { api } from "~/lib/api";
import { tabsStore } from "~/stores/tabs";
import { pushToast } from "~/stores/toasts";

export interface IdeaQuickCaptureProps {
  open: boolean;
  onClose(): void;
}

/** ⌘I-Overlay zum schnellen Erfassen einer Idee. Zwei Aktionen:
 *  ⏎ legt die Idee an, ⌘⏎ legt sie an UND macht direkt ein Skript
 *  daraus (ein Klick weniger als „erst speichern, dann konvertieren"). */
export function IdeaQuickCapture(props: IdeaQuickCaptureProps) {
  const [val, setVal] = createSignal("");
  let inputRef: HTMLInputElement | undefined;

  // Fokus beim Aufgehen + Reset des Werts.
  let lastOpen = false;
  createEffect(() => {
    const isOpen = props.open;
    if (isOpen && !lastOpen) {
      setVal("");
      setTimeout(() => inputRef?.focus(), 30);
    }
    lastOpen = isOpen;
  });

  async function save(convertToScript = false) {
    const t = val().trim();
    if (!t) {
      props.onClose();
      return;
    }
    try {
      const idea = await api.createIdea({ title: t });
      if (convertToScript) {
        const { script } = await api.convertIdeaToScript({ ideaId: idea.id });
        tabsStore.openScript(script.id, script.title);
        pushToast(`„${script.title}" angelegt`, "ok");
      } else {
        pushToast(`Idee „${idea.title}" gemerkt`, "ok");
      }
    } catch (err) {
      pushToast(`Fehler: ${(err as Error).message ?? err}`, "error");
    } finally {
      props.onClose();
    }
  }

  return (
    <Show when={props.open}>
      <Portal>
        <div class="qcap-scrim" onClick={props.onClose}>
          <div class="qcap" onClick={(e) => e.stopPropagation()}>
            <div class="qcap-head">
              <span class="qcap-bulb"><BulbIcon /></span>
              <span class="qcap-label">Neue Idee</span>
              <span class="qcap-spacer" />
              <span class="kbd kbd-inline">Esc</span>
            </div>
            <input
              ref={inputRef}
              class="qcap-input"
              value={val()}
              onInput={(e) => setVal(e.currentTarget.value)}
              placeholder="Worüber willst du schreiben?"
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
              <button class="btn" onClick={props.onClose}>Abbrechen</button>
              <div style="flex:1" />
              <button
                class="btn"
                disabled={!val().trim()}
                onClick={() => void save(true)}
                title="Idee speichern und sofort als Skript öffnen"
              >
                Skript erstellen <span class="kbd kbd-inline">⌘⏎</span>
              </button>
              <button
                class="btn btn-primary"
                disabled={!val().trim()}
                onClick={() => void save(false)}
                title="Idee merken"
              >
                Merken <span class="kbd kbd-inline">⏎</span>
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
