import { For, Show, type JSX } from "solid-js";
import { toasts, dismissToast, statusLabel } from "../lib/ui";

export function Spinner() {
  return <div class="spinner" />;
}

export function LoadingBlock() {
  return (
    <div style="display:grid;place-items:center;padding:4rem;">
      <Spinner />
    </div>
  );
}

export function StatusBadge(props: { status: string }) {
  return (
    <span class={`badge badge-${props.status}`}>{statusLabel(props.status)}</span>
  );
}

export function Empty(props: { title: string; children?: JSX.Element }) {
  return (
    <div class="empty">
      <p class="empty-title">{props.title}</p>
      <Show when={props.children}>
        <div>{props.children}</div>
      </Show>
    </div>
  );
}

export function ToastHost() {
  return (
    <div class="toast-host">
      <For each={toasts()}>
        {(t) => (
          <div
            class={`toast ${t.kind === "error" ? "toast-error" : t.kind === "ok" ? "toast-ok" : ""}`}
            onClick={() => dismissToast(t.id)}
          >
            {t.message}
          </div>
        )}
      </For>
    </div>
  );
}

export function Modal(props: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: JSX.Element;
}) {
  return (
    <Show when={props.open}>
      <div
        class="modal-backdrop"
        onClick={(e) => {
          if (e.target === e.currentTarget) props.onClose();
        }}
      >
        <div class="modal" role="dialog" aria-modal="true">
          <h2 class="modal-title">{props.title}</h2>
          {props.children}
        </div>
      </div>
    </Show>
  );
}
