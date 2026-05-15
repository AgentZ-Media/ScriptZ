import { createSignal, onCleanup, onMount, For, Show } from "solid-js";
import { Portal } from "solid-js/web";

export interface ContextMenuItem {
  label: string;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Presence of `children` turns the row into a submenu trigger. */
  children?: ContextMenuItem[];
  /** Visual hint that the row leads to a submenu (>) — defaults to true if `children` is set. */
  hasSubmenu?: boolean;
}

export interface ScriptContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  items: ContextMenuItem[];
}

const MENU_W = 220;
const ITEM_H = 32;

export function ScriptContextMenu(props: ScriptContextMenuProps) {
  let menuRef: HTMLDivElement | undefined;

  const onDocClick = (e: MouseEvent) => {
    // The submenu lives in a separate <Portal>, so menuRef.contains()
    // misses it and treats clicks on submenu items as "outside" — the
    // mousedown then closes the whole context menu in capture phase
    // before the click event ever reaches the submenu button. Use a
    // class-based check instead so any menu surface (root or submenu)
    // counts as "inside".
    const target = e.target as HTMLElement | null;
    if (target?.closest(".ctx-menu")) return;
    props.onClose();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      props.onClose();
    }
  };

  onMount(() => {
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

  const style = () => {
    const h = props.items.length * ITEM_H + 8;
    const left = Math.min(props.x, window.innerWidth - MENU_W - 8);
    const top = Math.min(props.y, window.innerHeight - h - 8);
    return `left:${Math.max(8, left)}px;top:${Math.max(8, top)}px`;
  };

  return (
    <Portal>
      <div ref={menuRef} class="ctx-menu" style={style()} role="menu">
        <For each={props.items}>
          {(item) => (
            <MenuRow
              item={item}
              onChoose={() => props.onClose()}
            />
          )}
        </For>
      </div>
    </Portal>
  );
}

function MenuRow(props: { item: ContextMenuItem; onChoose: () => void }) {
  let rowRef: HTMLButtonElement | undefined;
  const [openSub, setOpenSub] = createSignal(false);
  const [subPos, setSubPos] = createSignal<{ x: number; y: number } | null>(null);

  // Without a small grace period before hiding, the cursor can't traverse
  // the gap between parent row and submenu — mouseleave fires on the
  // parent before mouseenter on the submenu, and the submenu disappears
  // mid-flight. We schedule a hide on leave and cancel it as soon as the
  // cursor reaches the submenu (or the row again).
  let hideTimer: number | null = null;
  const cancelHide = () => {
    if (hideTimer !== null) {
      window.clearTimeout(hideTimer);
      hideTimer = null;
    }
  };
  const scheduleHide = () => {
    cancelHide();
    hideTimer = window.setTimeout(() => {
      hideTimer = null;
      setOpenSub(false);
    }, 140);
  };
  onCleanup(cancelHide);

  const hasSub = () => {
    const c = props.item.children;
    return Array.isArray(c) && c.length > 0;
  };

  const showSub = () => {
    if (!hasSub() || !rowRef) return;
    cancelHide();
    const rect = rowRef.getBoundingClientRect();
    // Open to the right; flip left if it would clip the viewport. We
    // overlap the parent by 2px so the cursor never crosses a "dead"
    // strip between the two surfaces during diagonal traversal.
    let x = rect.right - 2;
    if (x + MENU_W + 8 > window.innerWidth) {
      x = Math.max(8, rect.left - MENU_W + 2);
    }
    // Clamp vertically: if the submenu would extend past the bottom of
    // the viewport, pull it up until it fits (same logic as the root
    // menu). Otherwise the bottom item sticks below the app edge.
    const subH = (props.item.children?.length ?? 0) * ITEM_H + 8;
    let y = rect.top;
    if (y + subH + 8 > window.innerHeight) {
      y = Math.max(8, window.innerHeight - subH - 8);
    }
    setSubPos({ x, y });
    setOpenSub(true);
  };

  const handleClick = () => {
    if (props.item.disabled) return;
    if (hasSub()) {
      // For mouse users the submenu opens on hover; click toggles it for
      // touch / keyboard. Either way it never fires the parent's onClick.
      if (openSub()) {
        cancelHide();
        setOpenSub(false);
      } else {
        showSub();
      }
      return;
    }
    props.item.onClick?.();
    props.onChoose();
  };

  return (
    <>
      <button
        ref={rowRef}
        class={`ctx-menu-item${props.item.danger ? " danger" : ""}${hasSub() ? " has-sub" : ""}`}
        role="menuitem"
        disabled={props.item.disabled}
        onMouseEnter={() => {
          cancelHide();
          if (hasSub()) showSub();
        }}
        onMouseLeave={() => {
          if (hasSub()) scheduleHide();
        }}
        onClick={handleClick}
      >
        <span class="ctx-menu-label">{props.item.label}</span>
        <Show when={hasSub()}>
          <span class="ctx-menu-chevron" aria-hidden="true">
            ›
          </span>
        </Show>
      </button>
      <Show when={openSub() && subPos()}>
        {(pos) => (
          <Portal>
            <div
              class="ctx-menu ctx-submenu"
              style={`left:${pos().x}px;top:${pos().y}px`}
              role="menu"
              onMouseEnter={cancelHide}
              onMouseLeave={scheduleHide}
            >
              <For each={props.item.children}>
                {(child) => (
                  <MenuRow item={child} onChoose={props.onChoose} />
                )}
              </For>
            </div>
          </Portal>
        )}
      </Show>
    </>
  );
}
