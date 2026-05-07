import { onCleanup, onMount, For } from "solid-js";
import { Portal } from "solid-js/web";

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export interface ScriptContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  items: ContextMenuItem[];
}

export function ScriptContextMenu(props: ScriptContextMenuProps) {
  let menuRef: HTMLDivElement | undefined;

  const onDocClick = (e: MouseEvent) => {
    if (menuRef && !menuRef.contains(e.target as Node)) props.onClose();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      props.onClose();
    }
  };

  onMount(() => {
    // Use timeout so the originating right-click doesn't immediately close
    const t = setTimeout(() => {
      document.addEventListener("mousedown", onDocClick, true);
      document.addEventListener("contextmenu", onDocClick, true);
    }, 0);
    document.addEventListener("keydown", onKey);
    onCleanup(() => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onDocClick, true);
      document.removeEventListener("contextmenu", onDocClick, true);
      document.removeEventListener("keydown", onKey);
    });
  });

  // Clamp to viewport
  const style = () => {
    const w = 220;
    const h = props.items.length * 32 + 8;
    const left = Math.min(props.x, window.innerWidth - w - 8);
    const top = Math.min(props.y, window.innerHeight - h - 8);
    return `left:${Math.max(8, left)}px;top:${Math.max(8, top)}px`;
  };

  return (
    <Portal>
      <div ref={menuRef} class="ctx-menu" style={style()} role="menu">
        <For each={props.items}>
          {(item) => (
            <button
              class={`ctx-menu-item${item.danger ? " danger" : ""}`}
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                if (item.disabled) return;
                item.onClick();
                props.onClose();
              }}
            >
              {item.label}
            </button>
          )}
        </For>
      </div>
    </Portal>
  );
}
