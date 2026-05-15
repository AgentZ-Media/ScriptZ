import { Show, createSignal, onCleanup, onMount } from "solid-js";
import { t } from "@scriptz/core/i18n";
import "./StoragePersistedBadge.css";

/** State of the `navigator.storage.persisted()` query:
 *  - "unknown": not yet checked (or API unavailable)
 *  - "persisted": browser guarantees IndexedDB won't be silently evicted
 *  - "ephemeral": browser may evict under storage pressure → user-visible hint
 *
 *  We show the badge ONLY in the "ephemeral" state - i.e. when the browser
 *  has actively refused persistence (Safari ITP, Firefox default, or a
 *  not-yet-installed Chrome tab). On success the UI stays quiet.
 *
 *  Unlike the WebDisclaimerBanner, this badge is NOT dismissable - if
 *  the browser may potentially wipe the data, the user should see this
 *  for the entire session; otherwise they think "it's fine" and notice
 *  too late that it isn't. */
type PersistState = "unknown" | "persisted" | "ephemeral";

export function StoragePersistedBadge() {
  const [state, setState] = createSignal<PersistState>("unknown");

  async function probe() {
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.storage?.persisted
      ) {
        const ok = await navigator.storage.persisted();
        setState(ok ? "persisted" : "ephemeral");
      }
    } catch {
      // API broken → better not claim anything
    }
  }

  onMount(() => {
    void probe();
    // If the user later bookmarks the site / installs it as an app, the
    // state can improve to "persistent" after the fact. Re-probe on
    // focus - costs basically nothing.
    const onFocus = () => void probe();
    window.addEventListener("focus", onFocus);
    onCleanup(() => window.removeEventListener("focus", onFocus));
  });

  return (
    <Show when={state() === "ephemeral"}>
      <div
        class="storage-persist-badge"
        role="status"
        aria-live="polite"
        title={t("web.persistDenied.tooltip")}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        </svg>
        <span>{t("web.persistDenied.label")}</span>
      </div>
    </Show>
  );
}
