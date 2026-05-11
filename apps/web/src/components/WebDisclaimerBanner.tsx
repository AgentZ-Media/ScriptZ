import { Show, createSignal, onMount } from "solid-js";
import { api } from "@scriptz/core/lib/api";
import "./WebDisclaimerBanner.css";

// Phase-H-Disclaimer für den Web-Test-Editor. Zwei Zeilen oben über
// der TabBar: erklärt kurz, dass alles lokal liegt, und linkt auf die
// Desktop-App. Per "Verstanden" wegklickbar.
//
// Dismiss-State liegt in IndexedDB (api.setAppState). Damit kommt der
// Banner automatisch zurück, sobald der Browser den Speicher der Seite
// räumt (Safari-ITP, "Browser-Daten löschen", neues Gerät) - genau
// das, was der Plan in Phase H verlangt.
const DISMISS_KEY = "web_disclaimer_dismissed_v1";
const LANDING_URL = "https://write-scriptz.com";

export function WebDisclaimerBanner() {
  // Default: ausgeblendet bis der gespeicherte Wert geladen ist.
  // Sonst flackert der Banner kurz auf bei jedem Reload, obwohl er
  // schon dismissed wurde.
  const [ready, setReady] = createSignal(false);
  const [visible, setVisible] = createSignal(false);

  onMount(async () => {
    try {
      const raw = await api.getAppState(DISMISS_KEY);
      setVisible(raw !== "1");
    } catch {
      setVisible(true);
    } finally {
      setReady(true);
    }
  });

  const dismiss = () => {
    setVisible(false);
    void api.setAppState(DISMISS_KEY, "1").catch(() => {});
  };

  return (
    <Show when={ready() && visible()}>
      <div class="web-disclaimer" role="note">
        <div class="web-disclaimer-text">
          <strong>Test-Editor im Browser.</strong>
          <span>
            Deine Skripte liegen lokal in diesem Browser - kein Sync, kein
            Konto. Für die volle Erfahrung{" "}
            <a href={LANDING_URL} target="_blank" rel="noopener">
              Desktop-App laden
            </a>
            .
          </span>
        </div>
        <button
          type="button"
          class="web-disclaimer-dismiss"
          aria-label="Hinweis ausblenden"
          onClick={dismiss}
        >
          Verstanden
        </button>
      </div>
    </Show>
  );
}
