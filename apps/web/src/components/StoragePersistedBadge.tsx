import { Show, createSignal, onCleanup, onMount } from "solid-js";
import { t } from "@scriptz/core/i18n";
import "./StoragePersistedBadge.css";

/** Status der `navigator.storage.persisted()`-Abfrage:
 *  - "unknown": noch nicht geprüft (oder API nicht verfügbar)
 *  - "persisted": Browser garantiert, dass IndexedDB nicht still geräumt wird
 *  - "ephemeral": Browser darf bei Speicherdruck räumen → User-sichtbarer Hinweis
 *
 *  Wir zeigen das Badge NUR im Status "ephemeral" - also wenn der Browser
 *  Persistenz aktiv abgelehnt hat (Safari ITP, Firefox-Default, oder ein
 *  noch nicht installierter Chrome-Tab). Im Erfolgsfall bleibt die UI
 *  ruhig.
 *
 *  Anders als der WebDisclaimerBanner ist dieses Badge nicht
 *  dismissable - wenn der Browser die Daten potenziell wegräumen darf,
 *  soll der User das während der gesamten Session sehen, sonst denkt
 *  er "ist schon ok" und merkt zu spät, dass das nicht stimmt. */
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
      // API kaputt → wir behaupten lieber nichts
    }
  }

  onMount(() => {
    void probe();
    // Wenn der User die Site später bookmarkt / als App installiert,
    // kann sich der Status nachträglich auf "persistent" verbessern.
    // Re-probe auf focus, kostet quasi nichts.
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
