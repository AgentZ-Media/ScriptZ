import { Show, createSignal, onCleanup, onMount } from "solid-js";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api } from "~/lib/api";
import { settingsStore } from "~/stores/settings";
import type { UpdateInfo } from "~/lib/types";
import "./UpdateIndicator.css";

const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "0.1.0";
const HOUR_MS = 60 * 60 * 1000;

export function UpdateIndicator() {
  const [info, setInfo] = createSignal<UpdateInfo | null>(null);
  let timer: ReturnType<typeof setInterval> | null = null;
  let cancelled = false;

  const runCheck = async () => {
    try {
      const res = await api.checkForUpdate(APP_VERSION);
      if (cancelled) return;
      setInfo(res);
    } catch {
      /* network errors silently ignored */
    }
  };

  const setupTimer = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (settingsStore.hourlyUpdateCheck()) {
      timer = setInterval(runCheck, HOUR_MS);
    }
  };

  onMount(() => {
    if (settingsStore.updateCheckEnabled()) {
      void runCheck();
      setupTimer();
    }
    onCleanup(() => {
      cancelled = true;
      if (timer) clearInterval(timer);
    });
  });

  const onClick = async () => {
    const url = info()?.url;
    if (url) {
      try {
        await openUrl(url);
      } catch {
        /* ignore */
      }
    }
  };

  return (
    <Show when={settingsStore.updateCheckEnabled() && info()?.available && info()?.latest}>
      <button class="update-pill" onClick={onClick} title="Update auf GitHub anzeigen">
        <span class="update-dot" aria-hidden="true" />
        <span>Update v{info()?.latest}</span>
      </button>
    </Show>
  );
}
