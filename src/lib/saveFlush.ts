// Central registry of "pending save flushers" — anything that buffers
// writes (the editor's debounced auto-save, the tab-state debounced
// persist, etc.) registers a callback here. The window-close handler in
// App.tsx awaits all of them before destroying the window so the user
// never loses the last 250 ms of typing to a Cmd+Q or red-traffic-light
// click.
//
// Each flusher is expected to return a Promise that resolves once the
// buffered write is persisted. Implementations should be fire-and-forget
// safe: calling flush twice in quick succession or calling flush on a
// nothing-to-do state must resolve cleanly without throwing.

type Flusher = () => Promise<void> | void;

const flushers = new Set<Flusher>();

export function registerFlusher(fn: Flusher): () => void {
  flushers.add(fn);
  return () => {
    flushers.delete(fn);
  };
}

export async function flushAll(timeoutMs = 2000): Promise<void> {
  const fns = Array.from(flushers);
  if (fns.length === 0) return;
  const tasks = fns.map((fn) => {
    try {
      const r = fn();
      return r instanceof Promise ? r : Promise.resolve();
    } catch {
      return Promise.resolve();
    }
  });
  // Bound the wait so a wedged network call (e.g. AI background) never
  // prevents the window from closing.
  const timeout = new Promise<void>((resolve) =>
    setTimeout(resolve, timeoutMs),
  );
  await Promise.race([
    Promise.allSettled(tasks).then(() => undefined),
    timeout,
  ]);
}
