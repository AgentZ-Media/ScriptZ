import { Show, onMount, onCleanup } from "solid-js";
import { settingsStore } from "@scriptz/core/stores/settings";
import { t } from "@scriptz/core/i18n";
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
    if (s === "downloading") return t("updateIndicator.label.downloading", { progress: updatesStore.progress() });
    if (s === "ready") return t("updateIndicator.label.ready");
    if (s === "error") return t("updateIndicator.label.error");
    const v = updatesStore.available()?.version;
    return v ? t("updateIndicator.label.available", { version: v }) : t("updateIndicator.label.generic");
  };

  const title = () => {
    const s = updatesStore.stage();
    if (s === "ready") return t("updateIndicator.title.ready");
    if (s === "downloading") return t("updateIndicator.title.downloading");
    if (s === "error") return t("updateIndicator.title.error");
    return t("updateIndicator.title.default");
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
