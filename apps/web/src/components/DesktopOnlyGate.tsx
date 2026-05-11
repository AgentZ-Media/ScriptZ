import { Show, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import "./DesktopOnlyGate.css";

// Viewport-Threshold: unter dem zeigen wir den Gate-Screen statt der App.
//
// 1024 px ist der iPad-Portrait-Bruch - alles darunter (Phones, iPad
// Portrait) bekommt den Hinweis, alles darüber (iPad-Landscape mit
// Tastatur, kleine Laptops, Desktops) läuft normal weiter. UA-Sniffing
// haben wir bewusst NICHT genommen, weil:
//   - UA-Strings lügen / ändern sich
//   - die ehrliche Frage ist "passt mir hier Editor + Cast-Rail rein",
//     und das beantwortet die Pixelbreite zuverlässig
//   - reagiert live auf Window-Resize statt nur beim Laden
const MIN_DESKTOP_WIDTH = 1024;

function initialIsDesktop(): boolean {
  // Vor dem ersten Render schon den richtigen Wert haben, damit es kein
  // 1-Frame-Flackern Gate -> App gibt. window/matchMedia gibt's in jeder
  // Browser-Runtime; der typeof-Guard ist nur SSR-Hygiene für den Fall,
  // dass das Modul je in einem Node-Kontext geladen wird.
  if (typeof window === "undefined") return true;
  return window.matchMedia(`(min-width: ${MIN_DESKTOP_WIDTH}px)`).matches;
}

export function DesktopOnlyGate(props: { children: JSX.Element }): JSX.Element {
  const [isDesktop, setIsDesktop] = createSignal(initialIsDesktop());

  onMount(() => {
    const mq = window.matchMedia(`(min-width: ${MIN_DESKTOP_WIDTH}px)`);
    const sync = () => setIsDesktop(mq.matches);
    // matchMedia-Events sind die saubere Variante - feuern nur beim
    // tatsächlichen Bruch der Schwelle, nicht bei jedem Resize-Pixel.
    mq.addEventListener("change", sync);
    onCleanup(() => mq.removeEventListener("change", sync));
  });

  return (
    <Show when={isDesktop()} fallback={<GateScreen />}>
      {props.children}
    </Show>
  );
}

function GateScreen(): JSX.Element {
  return (
    <div class="desktop-gate" role="alert">
      <div class="desktop-gate-card">
        <svg
          class="desktop-gate-icon"
          width="56"
          height="56"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <rect x="2" y="4" width="20" height="13" rx="2" ry="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
        <h1 class="desktop-gate-title">Schreiben passiert am Desktop.</h1>
        <p class="desktop-gate-text">
          Der Test-Editor von ScriptZ ist für größere Bildschirme mit
          Tastatur gebaut. Öffne <strong>app.write-scriptz.com</strong> auf
          einem Mac oder PC, dann geht's los.
        </p>
        <p class="desktop-gate-hint">
          Tipp: Wer die App fest haben möchte, holt sich die
          Desktop-Version unter <strong>write-scriptz.com</strong> -
          schneller, offline, mit eigener Daten-Datei.
        </p>
      </div>
    </div>
  );
}
