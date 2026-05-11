import { Show, createSignal, createMemo, createEffect, onMount, onCleanup, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { settingsStore, type Theme } from "../../stores/settings";
import { tabsStore } from "../../stores/tabs";
import { api } from "../../lib/api";
import "./OnboardingDialog.css";

export const ONBOARDING_KEY = "onboarding_completed_v1";

export interface OnboardingDialogProps {
  open: boolean;
  onClose(): void;
  /** Callback der aus der Final-Karte direkt ein neues Skript anlegt
   *  und in den Editor wechselt. App.tsx liefert hier den
   *  quickCreateScript-Helper. */
  onCreateFirstScript?(): void;
}

type StepDir = "forward" | "backward" | "none";

// 3 Karten: Erscheinungsbild → Schreiben → Final-CTA. Die ehemalige
// Welcome-Karte mit Feature-Grid ist raus - wer die App installiert
// hat, hat die Landing schon gesehen, und das Tutorial-Skript erklärt
// den Editor besser als ein Onboarding-Step.
const TOTAL_STEPS = 3;

export function OnboardingDialog(props: OnboardingDialogProps) {
  const [step, setStep] = createSignal(0);
  const [dir, setDir] = createSignal<StepDir>("none");

  // Reset on each open so re-opening from Settings starts at 0.
  let lastOpen = false;
  createEffect(() => {
    if (props.open && !lastOpen) {
      setStep(0);
      setDir("none");
    }
    lastOpen = props.open;
  });

  const next = () => {
    if (step() >= TOTAL_STEPS - 1) {
      // Auf der letzten Karte ersetzen wir den "Weiter"-CTA durch zwei
      // explizite Aktionen (siehe StepFinal). Enter / ArrowRight führen
      // dort still zum Standard-Ausgang "Zur Übersicht".
      void completeAndClose();
      return;
    }
    setDir("forward");
    setStep((s) => s + 1);
  };

  const back = () => {
    if (step() === 0) return;
    setDir("backward");
    setStep((s) => s - 1);
  };

  const completeAndClose = async () => {
    try {
      await api.setAppState(ONBOARDING_KEY, "1");
    } catch {
      /* non-fatal */
    }
    props.onClose();
  };

  const completeAndCreateScript = async () => {
    try {
      await api.setAppState(ONBOARDING_KEY, "1");
    } catch {
      /* non-fatal */
    }
    props.onClose();
    props.onCreateFirstScript?.();
  };

  const completeAndOpenBrowser = async () => {
    try {
      await api.setAppState(ONBOARDING_KEY, "1");
    } catch {
      /* non-fatal */
    }
    tabsStore.openBrowser();
    props.onClose();
  };

  const skip = () => void completeAndClose();

  // Tastatur: Enter = weiter, ESC = überspringen, Pfeile navigieren.
  const onKey = (e: KeyboardEvent) => {
    if (!props.open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      skip();
      return;
    }
    if (e.key === "Enter") {
      // Nur wenn der Fokus nicht in einem Input liegt — sonst würde
      // Enter im Wochenziel-Feld unbeabsichtigt weiterspringen.
      const t = e.target as HTMLElement | null;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      next();
      return;
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      next();
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      back();
      return;
    }
  };

  onMount(() => {
    document.addEventListener("keydown", onKey, true);
    onCleanup(() => document.removeEventListener("keydown", onKey, true));
  });

  // Re-trigger card animation on every step change.
  const animKey = createMemo(() => `${step()}-${dir()}`);

  const isFinalStep = () => step() === TOTAL_STEPS - 1;

  return (
    <Show when={props.open}>
      <Portal>
        <div class="ob-backdrop" role="dialog" aria-modal="true" aria-label="Willkommen bei ScriptZ">
          <div class="ob-shell">
            <button
              type="button"
              class="ob-skip-x"
              aria-label="Onboarding überspringen"
              title="Überspringen"
              onClick={skip}
            >
              ✕
            </button>

            <div class="ob-stage">
              <div class="ob-card" data-step={step()} data-dir={dir()} data-anim-key={animKey()}>
                <Show when={step() === 0}>
                  <StepAppearance />
                </Show>
                <Show when={step() === 1}>
                  <StepWriting />
                </Show>
                <Show when={step() === 2}>
                  <StepFinal />
                </Show>
              </div>
            </div>

            <div class="ob-foot">
              <div class="ob-foot-left">
                <Show
                  when={step() > 0}
                  fallback={
                    <button type="button" class="ob-link" onClick={skip}>
                      Überspringen
                    </button>
                  }
                >
                  <button type="button" class="ob-link" onClick={back}>
                    ← Zurück
                  </button>
                </Show>
              </div>

              <div class="ob-dots" aria-hidden="true">
                {Array.from({ length: TOTAL_STEPS }, (_, i) => (
                  <span class="ob-dot" classList={{ "is-on": i === step(), "is-done": i < step() }} />
                ))}
              </div>

              <div class="ob-foot-right">
                <Show
                  when={!isFinalStep()}
                  fallback={
                    <div class="ob-final-actions">
                      <button type="button" class="btn" onClick={() => void completeAndOpenBrowser()}>
                        Zur Übersicht
                      </button>
                      <button type="button" class="btn btn-primary ob-cta" onClick={() => void completeAndCreateScript()}>
                        Erstes Skript schreiben
                      </button>
                    </div>
                  }
                >
                  <button type="button" class="btn btn-primary ob-cta" onClick={next}>
                    Weiter
                  </button>
                </Show>
              </div>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}

/* =========================================================================
   Schritt 1 – Erscheinungsbild (Theme + Charakter-Highlighting)
   ========================================================================= */
function StepAppearance() {
  const themes: { id: Theme; label: string; sub: string }[] = [
    { id: "light", label: "Hell",   sub: "Heller App-Rahmen, weisses Papier." },
    { id: "dark",  label: "Dunkel", sub: "Dunkles Grau – Papier bleibt hell." },
    { id: "auto",  label: "Auto",   sub: "Folgt deinem System-Theme." },
  ];
  const on = () => settingsStore.highlightingDefault();
  return (
    <div class="ob-step">
      <div class="ob-eyebrow">Schritt 1 von 2 · Erscheinungsbild</div>
      <h1 class="ob-h1">Sieh aus, wie du willst.</h1>
      <p class="ob-lede">
        Theme und Charakter-Farben - beides änderst du jederzeit später in
        den Einstellungen.
      </p>

      <div class="ob-themes">
        {themes.map((t) => (
          <button
            type="button"
            class="ob-theme"
            classList={{ "is-on": settingsStore.theme() === t.id }}
            onClick={() => void settingsStore.setTheme(t.id)}
            data-variant={t.id}
            aria-pressed={settingsStore.theme() === t.id}
          >
            <div class="ob-theme-preview" data-variant={t.id}>
              <div class="ob-theme-window">
                <div class="ob-theme-tl">
                  <span /><span /><span />
                </div>
                <div class="ob-theme-paper">
                  <div class="ob-theme-line w-70" />
                  <div class="ob-theme-line w-90" />
                  <div class="ob-theme-line w-50" />
                  <div class="ob-theme-line ob-theme-char w-30" />
                  <div class="ob-theme-line w-80" />
                </div>
              </div>
            </div>
            <div class="ob-theme-meta">
              <div class="ob-theme-label">{t.label}</div>
              <div class="ob-theme-sub">{t.sub}</div>
            </div>
            <span class="ob-theme-check" aria-hidden="true">✓</span>
          </button>
        ))}
      </div>

      <div class="ob-hl-preview" data-on={on() ? "1" : "0"} aria-hidden="true">
        <div class="ob-hl-paper">
          <ObHlBlock kind="character" tint="--char-1" text="MIRA" />
          <ObHlBlock kind="dialog"    tint="--char-1" text="Du bist spät." />
          <ObHlBlock kind="character" tint="--char-2" text="JONAS" />
          <ObHlBlock kind="dialog"    tint="--char-2" text="Ich nenn’s dramatischen Auftritt." />
        </div>
      </div>

      <div class="ob-hl-row">
        <div class="ob-hl-row-label">
          <div class="ob-field-label">Charakter-Highlighting standardmässig</div>
          <div class="ob-field-help">
            Hinterlegt Dialog-Blöcke dezent in der Charakter-Farbe.
          </div>
        </div>
        <ObToggle
          checked={settingsStore.highlightingDefault()}
          onChange={(v) => void settingsStore.setHighlightingDefault(v)}
          label="Charakter-Highlighting standardmäßig"
        />
      </div>
    </div>
  );
}

function ObHlBlock(props: {
  kind: "caption" | "action" | "character" | "dialog" | "parenthetical";
  tint?: string;
  text: string;
}) {
  return (
    <div
      class="ob-hl-block"
      data-kind={props.kind}
      style={props.tint ? `--ob-tint: var(${props.tint})` : ""}
    >
      <span class="ob-hl-text">{props.text}</span>
    </div>
  );
}

/* =========================================================================
   Schritt 2 – Schreib-Defaults (Wochenziel + Fokus-Modus)
   ========================================================================= */
function StepWriting() {
  return (
    <div class="ob-step">
      <div class="ob-eyebrow">Schritt 2 von 2 · Schreiben</div>
      <h1 class="ob-h1">Zwei Defaults zum Starten.</h1>
      <p class="ob-lede">
        Beides änderst du jederzeit in den Einstellungen. Hier nur ein
        guter Start.
      </p>

      <div class="ob-fields">
        <div class="ob-field">
          <div class="ob-field-head">
            <div class="ob-field-label">Wochenziel</div>
            <div class="ob-field-help">
              Wörter pro Woche (seit Montag). Wird in der Statusleiste oben
              und auf der Startseite angezeigt. 1500 entspricht etwa 7
              Skripten à 200 Wörter.
            </div>
          </div>
          <div class="ob-goal">
            <input
              type="number"
              min={settingsStore.WEEKLY_WORD_GOAL_MIN}
              max={settingsStore.WEEKLY_WORD_GOAL_MAX}
              step={100}
              value={settingsStore.weeklyWordGoal()}
              onChange={(e) => {
                const n = Number(e.currentTarget.value);
                if (Number.isFinite(n)) void settingsStore.setWeeklyWordGoal(n);
              }}
            />
            <span class="ob-goal-unit">Wörter / Woche</span>
          </div>
        </div>

        <div class="ob-field">
          <div class="ob-field-head">
            <div class="ob-field-label">Fokus-Modus standardmässig aktiv</div>
            <div class="ob-field-help">
              Beim Öffnen eines Skripts sind Toolbar und Cast-Leiste
              ausgeblendet – nur das Papier. ⇧⌘F holt sie zurück.
            </div>
          </div>
          <ObToggle
            checked={settingsStore.focusModeDefault()}
            onChange={(v) => void settingsStore.setFocusModeDefault(v)}
            label="Fokus-Modus standardmässig"
          />
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   Final-Karte – CTA zur ersten Aktion
   ========================================================================= */
function StepFinal() {
  return (
    <div class="ob-step ob-step-final">
      <div class="ob-eyebrow">Fertig.</div>
      <h1 class="ob-h1">Los geht’s.</h1>
      <p class="ob-lede">
        Setup ist durch. Du kannst jetzt direkt dein erstes Skript
        anlegen, oder erst durch die Übersicht stöbern - dort liegt das
        kurze Tutorial-Skript, das die Block-Typen und Hotkeys erklärt.
      </p>
      <div class="ob-final-hints">
        <div class="ob-final-hint">
          <span class="kbd kbd-inline">⌘N</span> legt jederzeit ein neues
          Skript an
        </div>
        <div class="ob-final-hint">
          <span class="kbd kbd-inline">⌘K</span> findet jedes Skript per
          Suche
        </div>
        <div class="ob-final-hint">
          <span class="kbd kbd-inline">⌘I</span> merkt eine Idee für später
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   Lokale UI-Bausteine
   ========================================================================= */
function ObToggle(props: { checked: boolean; onChange(v: boolean): void; label?: string }) {
  return (
    <button
      type="button"
      class="ob-toggle"
      classList={{ "is-on": props.checked }}
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      onClick={() => props.onChange(!props.checked)}
    />
  );
}

// JSX import bleibt erhalten, falls künftig wieder Icon-Karten zurück
// kommen sollten - wir wollen das CSS nicht doppelt umstellen müssen.
void (null as unknown as JSX.Element);
