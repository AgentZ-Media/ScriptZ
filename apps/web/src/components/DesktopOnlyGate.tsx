import { Show, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { t } from "@scriptz/core/i18n";
import "./DesktopOnlyGate.css";

// 900px is the lowest threshold where the home layout (greeting +
// MomentumStrip + folder chips + sortbar) still fits cleanly side by
// side. Lower -> sortbar wraps and looks broken. With this we catch:
//  - iPad landscape (1024+) -> in
//  - iPad Pro 12.9" portrait (1024) -> in
//  - iPad 11"/10.9" landscape (1180/1194) -> in
//  - iPad mini portrait (744-768) -> gated
//  - Phones (375-430) -> gated
const MIN_DESKTOP_WIDTH = 900;

function initialIsDesktop(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia(`(min-width: ${MIN_DESKTOP_WIDTH}px)`).matches;
}

export function DesktopOnlyGate(props: { children: JSX.Element }): JSX.Element {
  const [isDesktop, setIsDesktop] = createSignal(initialIsDesktop());

  onMount(() => {
    const mq = window.matchMedia(`(min-width: ${MIN_DESKTOP_WIDTH}px)`);
    const sync = () => setIsDesktop(mq.matches);
    mq.addEventListener("change", sync);
    onCleanup(() => mq.removeEventListener("change", sync));
  });

  return (
    <Show when={isDesktop()} fallback={<GateScreen />}>
      {props.children}
    </Show>
  );
}

// Splits a translation string at the `{url}` placeholder and renders
// the URL as <strong> between the text parts - without binding the
// translation string to HTML.
function withUrl(template: string, url: string): JSX.Element {
  const parts = template.split("{url}");
  return (
    <>
      {parts[0]}
      <strong>{url}</strong>
      {parts[1] ?? ""}
    </>
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
        <h1 class="desktop-gate-title">{t("web.gate.title")}</h1>
        <p class="desktop-gate-text">
          {withUrl(t("web.gate.text"), "app.write-scriptz.com")}
        </p>
        <p class="desktop-gate-hint">
          {withUrl(t("web.gate.hint"), "write-scriptz.com")}
        </p>
      </div>
    </div>
  );
}
