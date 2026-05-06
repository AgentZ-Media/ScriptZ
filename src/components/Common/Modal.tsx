import { JSX, Show, onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";
import "./Modal.css";

export interface ModalProps {
  open: boolean;
  onClose(): void;
  title?: string;
  children: JSX.Element;
  /** Optional element placed in the footer area. */
  footer?: JSX.Element;
  /** Maximum width override (px). */
  maxWidth?: number;
  /** Hide built-in close-on-backdrop. Defaults true. */
  closeOnBackdrop?: boolean;
}

export function Modal(props: ModalProps) {
  let modalRef: HTMLDivElement | undefined;
  let previousFocus: HTMLElement | null = null;

  const onKey = (e: KeyboardEvent) => {
    if (!props.open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      props.onClose();
      return;
    }
    if (e.key === "Tab" && modalRef) {
      // Basic focus trap
      const focusables = modalRef.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !modalRef.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  };

  onMount(() => {
    document.addEventListener("keydown", onKey, true);
    onCleanup(() => document.removeEventListener("keydown", onKey, true));
  });

  // When open changes, manage focus
  let lastOpen = false;
  const focusEffect = () => {
    if (props.open && !lastOpen) {
      previousFocus = document.activeElement as HTMLElement | null;
      // Focus first focusable element after a tick
      queueMicrotask(() => {
        if (!modalRef) return;
        const first = modalRef.querySelector<HTMLElement>(
          'input, textarea, select, button, [tabindex]:not([tabindex="-1"])',
        );
        first?.focus();
      });
    } else if (!props.open && lastOpen) {
      previousFocus?.focus?.();
    }
    lastOpen = props.open;
  };

  return (
    <Show when={props.open}>
      {(() => {
        focusEffect();
        return (
          <Portal>
            <div
              class="modal-backdrop"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget && (props.closeOnBackdrop ?? true)) {
                  props.onClose();
                }
              }}
            >
              <div
                ref={modalRef}
                class="modal"
                role="dialog"
                aria-modal="true"
                aria-label={props.title}
                style={
                  props.maxWidth ? `max-width:${props.maxWidth}px;width:min(${props.maxWidth}px,92vw)` : ""
                }
                onMouseDown={(e) => e.stopPropagation()}
              >
                <Show when={props.title}>
                  <h2>{props.title}</h2>
                </Show>
                <div class="modal-body">{props.children}</div>
                <Show when={props.footer}>
                  <div class="modal-footer">{props.footer}</div>
                </Show>
              </div>
            </div>
          </Portal>
        );
      })()}
    </Show>
  );
}
