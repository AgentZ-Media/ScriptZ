/** Localised relative-time formatter. */
export function relativeTime(ms: number, now = Date.now()): string {
  const diff = Math.max(0, now - ms);
  const sec = diff / 1000;
  if (sec < 30) return "Gerade eben";
  if (sec < 60) return `vor ${Math.floor(sec)}s`;
  const min = sec / 60;
  if (min < 60) return `vor ${Math.floor(min)} Min.`;
  const hr = min / 60;
  if (hr < 24) return `vor ${Math.floor(hr)} Std.`;
  const days = hr / 24;
  if (days < 2) return "Gestern";
  if (days < 7) {
    const d = new Date(ms);
    return ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"][
      d.getDay()
    ];
  }
  const date = new Date(ms);
  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "short",
    year: date.getFullYear() !== new Date(now).getFullYear() ? "numeric" : undefined,
  });
}

export function formatAbsolute(ms: number): string {
  return new Date(ms).toLocaleString("de-DE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatPageCount(n: number): string {
  return n === 1 ? "1 Seite" : `${n} Seiten`;
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
