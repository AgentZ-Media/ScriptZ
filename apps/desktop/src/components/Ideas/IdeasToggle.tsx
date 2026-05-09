import { Show } from "solid-js";
import { ideasStore } from "~/stores/ideas";

export interface IdeasToggleProps {
  open: boolean;
  onClick(): void;
  /** Welche Bildschirmkante die Pille ankert. Default: "right" (Home).
   *  Im Editor schalten wir auf "left", weil die rechte Seite vom
   *  Editor-Rail belegt ist und Ideen-Pille + Rail visuell überlappen. */
  position?: "left" | "right";
}

/** Subtile Schaltfläche am Bildschirmrand, die den Ideen-Drawer öffnet.
 *  Zeigt die Anzahl offener Ideen als Badge. Position links/rechts via
 *  `position`-Prop — der Drawer slidet entsprechend rein. */
export function IdeasToggle(props: IdeasToggleProps) {
  const count = () => (ideasStore.ideas() ?? []).filter((i) => !i.used_at).length;
  const pos = () => props.position ?? "right";
  return (
    <button
      class="ideas-toggle"
      classList={{
        "is-open": props.open,
        "ideas-toggle-left": pos() === "left",
        "ideas-toggle-right": pos() === "right",
      }}
      onClick={props.onClick}
      title={props.open ? "Ideen schließen (Esc)" : "Ideen öffnen (⌘I)"}
      aria-label="Ideen"
    >
      <span class="ideas-toggle-ic" aria-hidden="true">
        <BulbIcon />
      </span>
      <span class="ideas-toggle-label">Ideen</span>
      <Show when={count() > 0 && !props.open}>
        <span class="ideas-toggle-count">{count()}</span>
      </Show>
    </button>
  );
}

function BulbIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2V17h6v-.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z" />
    </svg>
  );
}
