// Locale-aware Formatierung. Liest die aktuelle Sprache via i18n, daher
// passen sich relative-time-Strings, Monats-/Wochentag-Namen, Plurale
// und Datums-Layouts automatisch dem Sprach-Setting an. Re-evaluation
// in Komponenten passiert, weil `t()` reaktiv die i18n-Language liest.

import { getCurrentLocale, t, tPlural } from "../i18n";

/** Locale-aware relative time. Format passt sich der aktiven Sprache an. */
export function relativeTime(ms: number, now = Date.now()): string {
  const diff = Math.max(0, now - ms);
  const sec = diff / 1000;
  if (sec < 30) return t("time.justNow");
  if (sec < 60) return t("time.secondsAgo", { n: Math.floor(sec) });
  const min = sec / 60;
  if (min < 60) return t("time.minutesAgo", { n: Math.floor(min) });
  const hr = min / 60;
  if (hr < 24) return t("time.hoursAgo", { n: Math.floor(hr) });
  const days = hr / 24;
  if (days < 2) return t("time.yesterday");
  if (days < 7) {
    const d = new Date(ms);
    return t(`weekday.${d.getDay()}` as
      | "weekday.0" | "weekday.1" | "weekday.2" | "weekday.3"
      | "weekday.4" | "weekday.5" | "weekday.6");
  }
  const date = new Date(ms);
  return date.toLocaleDateString(getCurrentLocale(), {
    day: "2-digit",
    month: "short",
    year: date.getFullYear() !== new Date(now).getFullYear() ? "numeric" : undefined,
  });
}

export function formatAbsolute(ms: number): string {
  return new Date(ms).toLocaleString(getCurrentLocale(), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatPageCount(n: number): string {
  return tPlural("units.pages", n);
}

export function debounce<F extends (...args: any[]) => void>(fn: F, ms: number): F & { cancel(): void; flush(): void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: any[] | null = null;
  const debounced = ((...args: any[]) => {
    lastArgs = args;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const a = lastArgs!;
      lastArgs = null;
      fn(...a);
    }, ms);
  }) as F & { cancel(): void; flush(): void };
  (debounced as any).cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    lastArgs = null;
  };
  (debounced as any).flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
      const a = lastArgs!;
      lastArgs = null;
      fn(...a);
    }
  };
  return debounced;
}
