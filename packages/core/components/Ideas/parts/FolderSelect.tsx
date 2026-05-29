import { createSignal, createMemo, For, Show, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";

// Custom dropdown for picking a folder. Shared by the ideas flows that
// assign a folder: ConvertIdeaDialog, IdeaQuickCapture and the per-card
// move control. Same look + behaviour as the FolderSelect in
// NewScriptDialog.tsx (kept separate there because the browser dialog
// uses it in a different layout).

export interface FolderOption {
  id: string | null;
  name: string;
}

export interface FolderSelectProps {
  options: FolderOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  /** Extra class on the wrapper, e.g. to render a compact variant. */
  class?: string;
}

export function FolderSelect(props: FolderSelectProps) {
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
    <div class={`cselect ${props.class ?? ""} ${open() ? "is-open" : ""}`}>
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
