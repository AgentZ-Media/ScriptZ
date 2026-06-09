import { createSignal } from "solid-js";

// ---- Toasts ----
export type ToastKind = "ok" | "error" | "info";
export interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}
const [toasts, setToasts] = createSignal<Toast[]>([]);
export { toasts };
let toastSeq = 1;
export function pushToast(message: string, kind: ToastKind = "info"): void {
  const id = toastSeq++;
  setToasts((t) => [...t, { id, message, kind }]);
  setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
}
export function dismissToast(id: number): void {
  setToasts((t) => t.filter((x) => x.id !== id));
}

/** Run a mutation, surfacing any error as a toast. Returns true on success. */
export async function withToast<T>(
  fn: () => Promise<T>,
  okMessage?: string,
): Promise<T | undefined> {
  try {
    const r = await fn();
    if (okMessage) pushToast(okMessage, "ok");
    return r;
  } catch (e) {
    pushToast((e as Error)?.message ?? "Etwas ist schiefgelaufen", "error");
    return undefined;
  }
}

// ---- Status labels ----
export type ItemStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "rejected"
  | "changes_requested"
  | "filmed";

export function statusLabel(status: string): string {
  switch (status) {
    case "draft":
      return "Entwurf";
    case "in_review":
      return "Zur Freigabe";
    case "approved":
      return "Freigegeben";
    case "rejected":
      return "Abgelehnt";
    case "changes_requested":
      return "Änderung erbeten";
    case "filmed":
      return "Gedreht";
    default:
      return status;
  }
}

// ---- Date formatting (German) ----
export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
/** "vor 3 Min." style relative time, falling back to a date. */
export function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.floor(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.floor(h / 24);
  if (d < 7) return `vor ${d} Tg.`;
  return formatDate(ms);
}

/** Formats a folder date range like "01.07. – 30.09.2026". */
export function formatRange(start: string | null, end: string | null): string | null {
  const fmt = (s: string) => {
    const [y, m, d] = s.split("-");
    return `${d}.${m}.${y}`;
  };
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return `ab ${fmt(start)}`;
  if (end) return `bis ${fmt(end)}`;
  return null;
}
