import { Show, onMount, onCleanup } from "solid-js";
import { settingsStore } from "@scriptz/core/stores/settings";
import { updatesStore } from "~/stores/updates";
import "./UpdateIndicator.css";

export function UpdateIndicator() {
  const onClick = async () => {
    const s = updatesStore.stage();
    if (s === "ready") {
      await updatesStore.restart();
      return;
    }
    if (s === "available" || s === "error") {
      await updatesStore.downloadAndInstall();
    }
  };

  onMount(() => {
    updatesStore.startBackgroundPolling();
    onCleanup(() => updatesStore.stopBackgroundPolling());
  });

  const label = () => {
    const s = updatesStore.stage();
    if (s === "downloading") return `Lade Update… ${updatesStore.progress()}%`;
    if (s === "ready") return "Neustart für Update";
    if (s === "error") return "Update fehlgeschlagen";
    const v = updatesStore.available()?.version;
    return v ? `Update v${v}` : "Update";
  };

  const title = () => {
    const s = updatesStore.stage();
    if (s === "ready") return "Klicken zum Neustart und Update installieren";
    if (s === "downloading") return "Update wird heruntergeladen und installiert";
    if (s === "error") return "Update fehlgeschlagen — erneut versuchen";
    return "Update herunterladen und installieren";
  };

  return (
    <Show
      when={
        settingsStore.updateCheckEnabled() && updatesStore.stage() !== "idle"
      }
    >
      <button
        class="update-pill"
        onClick={onClick}
        title={title()}
        disabled={updatesStore.stage() === "downloading"}
      >
        <span class="update-dot" aria-hidden="true" />
        <span>{label()}</span>
      </button>
    </Show>
  );
}
