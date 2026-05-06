import { Show, createSignal, onCleanup, onMount } from "solid-js";
import { relaunch } from "@tauri-apps/plugin-process";
import { type Update, check } from "@tauri-apps/plugin-updater";
import { settingsStore } from "~/stores/settings";
import "./UpdateIndicator.css";

type Stage = "idle" | "available" | "downloading" | "ready" | "error";

const HOUR_MS = 60 * 60 * 1000;
const STARTUP_DELAY_MS = 30_000;

export function UpdateIndicator() {
  const [stage, setStage] = createSignal<Stage>("idle");
  const [available, setAvailable] = createSignal<Update | null>(null);
  const [progress, setProgress] = createSignal(0);
  let timer: ReturnType<typeof setInterval> | null = null;
  let startupTimer: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;
  let inFlight = false;

  const poll = async () => {
    if (cancelled || inFlight) return;
    if (stage() === "downloading" || stage() === "ready") return;
    inFlight = true;
    try {
      const update = await check();
      if (cancelled) return;
      if (update) {
        setAvailable(update);
        setStage("available");
      }
    } catch {
      /* offline / not configured: stay silent */
    } finally {
      inFlight = false;
    }
  };

  const onClick = async () => {
    const s = stage();
    if (s === "ready") {
      try {
        await relaunch();
      } catch {
        setStage("error");
      }
      return;
    }
    if (s !== "available") return;
    const update = available();
    if (!update) return;

    setStage("downloading");
    setProgress(0);
    let total = 0;
    let got = 0;
    try {
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            total = event.data.contentLength ?? 0;
            got = 0;
            setProgress(0);
            break;
          case "Progress":
            got += event.data.chunkLength;
            if (total > 0) {
              setProgress(Math.min(99, Math.floor((got / total) * 100)));
            }
            break;
          case "Finished":
            setProgress(100);
            break;
        }
      });
      setStage("ready");
    } catch {
      setStage("error");
      setTimeout(() => {
        if (!cancelled && stage() === "error") setStage("available");
      }, 4000);
    }
  };

  onMount(() => {
    if (import.meta.env.DEV) return;
    if (!settingsStore.updateCheckEnabled()) return;
    startupTimer = setTimeout(() => {
      void poll();
    }, STARTUP_DELAY_MS);
    if (settingsStore.hourlyUpdateCheck()) {
      timer = setInterval(() => void poll(), HOUR_MS);
    }
    onCleanup(() => {
      cancelled = true;
      if (startupTimer) clearTimeout(startupTimer);
      if (timer) clearInterval(timer);
    });
  });

  const label = () => {
    const s = stage();
    if (s === "downloading") return `Lade Update… ${progress()}%`;
    if (s === "ready") return "Neustart für Update";
    if (s === "error") return "Update fehlgeschlagen";
    const v = available()?.version;
    return v ? `Update v${v}` : "Update";
  };

  const title = () => {
    const s = stage();
    if (s === "ready") return "Klicken zum Neustart und Update installieren";
    if (s === "downloading") return "Update wird heruntergeladen und installiert";
    if (s === "error") return "Update fehlgeschlagen — erneut versuchen";
    return "Update herunterladen und installieren";
  };

  return (
    <Show when={settingsStore.updateCheckEnabled() && stage() !== "idle"}>
      <button
        class="update-pill"
        onClick={onClick}
        title={title()}
        disabled={stage() === "downloading"}
      >
        <span class="update-dot" aria-hidden="true" />
        <span>{label()}</span>
      </button>
    </Show>
  );
}
