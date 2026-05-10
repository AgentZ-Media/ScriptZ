import { Show, createSignal, createMemo, createEffect, onMount, onCleanup, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { settingsStore, type Theme } from "~/stores/settings";
import { api } from "~/lib/api";
import "./OnboardingDialog.css";

export const ONBOARDING_KEY = "onboarding_completed_v1";

export interface OnboardingDialogProps {
  open: boolean;
  onClose(): void;
}

type StepDir = "forward" | "backward" | "none";

const TOTAL_STEPS = 4;

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
      void complete();
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

  const complete = async () => {
    try {
      await api.setAppState(ONBOARDING_KEY, "1");
    } catch {
      /* non-fatal */
    }
    props.onClose();
  };

  const skip = () => void complete();

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
      // Enter im Tagesziel-Feld unbeabsichtigt weiterspringen.
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
                  <StepWelcome />
                </Show>
                <Show when={step() === 1}>
                  <StepTheme />
                </Show>
                <Show when={step() === 2}>
                  <StepHighlight />
                </Show>
                <Show when={step() === 3}>
                  <StepWriting />
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
                <button type="button" class="btn btn-primary ob-cta" onClick={next}>
                  {step() < TOTAL_STEPS - 1 ? "Weiter" : "Los geht’s"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}

/* =========================================================================
   Schritt 1 – Willkommen / Was kann ScriptZ
   ========================================================================= */
function StepWelcome() {
  return (
    <div class="ob-step">
      <div class="ob-eyebrow">Willkommen</div>
      <h1 class="ob-h1">Schreiben, ohne Reibung.</h1>
      <p class="ob-lede">
        ScriptZ ist ein schneller, lokaler Editor für TikTok-Skripte und Sketches.
        Kein Konto, keine Cloud, keine Tracker. Alles bleibt auf deinem Mac.
      </p>

      <div class="ob-feats">
        <Feat
          title="7 Block-Typen"
          desc="Aktion, Charakter, Dialog, Klammer, Kamera, Caption, SFX. Mit Tab oder ⌘1–7."
          icon={<IconBlocks />}
        />
        <Feat
          title="Lokal & schnell"
          desc="SQLite + Volltextsuche. Auch in offline und mit langen Skripten flott."
          icon={<IconBolt />}
        />
        <Feat
          title="Streak & Tagesziel"
          desc="Heatmap, Streak und Wort-Tagesziel halten dich am Schreiben."
          icon={<IconFlame />}
        />
        <Feat
          title="⌘K für alles"
          desc="Skripte finden, springen, exportieren – aus jedem Fenster."
          icon={<IconCmd />}
        />
      </div>
    </div>
  );
}

function Feat(props: { title: string; desc: string; icon: JSX.Element }) {
  return (
    <div class="ob-feat">
      <div class="ob-feat-ic">{props.icon}</div>
      <div class="ob-feat-text">
        <div class="ob-feat-title">{props.title}</div>
        <div class="ob-feat-desc">{props.desc}</div>
      </div>
    </div>
  );
}

/* =========================================================================
   Schritt 2 – Theme
   ========================================================================= */
function StepTheme() {
  const themes: { id: Theme; label: string; sub: string }[] = [
    { id: "light", label: "Hell",   sub: "Heller App-Rahmen, weisses Papier." },
    { id: "dark",  label: "Dunkel", sub: "Dunkles Grau – Papier bleibt hell." },
    { id: "auto",  label: "Auto",   sub: "Folgt deinem System-Theme." },
  ];
  return (
    <div class="ob-step">
      <div class="ob-eyebrow">Schritt 2 von 4 · Erscheinungsbild</div>
      <h1 class="ob-h1">Wähle dein Theme.</h1>
      <p class="ob-lede">Kannst du jederzeit in den Einstellungen wechseln.</p>

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
    </div>
  );
}

/* =========================================================================
   Schritt 3 – Charakter-Highlighting (Live-Demo)
   ========================================================================= */
function StepHighlight() {
  const on = () => settingsStore.highlightingDefault();
  return (
    <div class="ob-step">
      <div class="ob-eyebrow">Schritt 3 von 4 · Editor</div>
      <h1 class="ob-h1">Charakter-Highlighting.</h1>
      <p class="ob-lede">
        Jeder Charakter bekommt eine eigene Farbe. Wenn aktiv, hinterlegt
        ScriptZ Dialog-Blöcke dezent in der Charakter-Farbe – beim Drüberlesen
        siehst du sofort, wer spricht.
      </p>

      <div class="ob-hl-preview" data-on={on() ? "1" : "0"} aria-hidden="true">
        <div class="ob-hl-paper">
          <ObHlBlock kind="caption" text="INT. CAFÉ — TAG" />
          <ObHlBlock kind="action" text="Mira sitzt am Fenster, Jonas kommt rein." />
          <ObHlBlock kind="character" tint="--char-1" text="MIRA" />
          <ObHlBlock kind="dialog"    tint="--char-1"
            text="Du bist spät." />
          <ObHlBlock kind="character" tint="--char-2" text="JONAS" />
          <ObHlBlock kind="parenthetical" tint="--char-2" text="(grinst)" />
          <ObHlBlock kind="dialog"    tint="--char-2"
            text="Ich nenn’s dramatischen Auftritt." />
          <ObHlBlock kind="character" tint="--char-1" text="MIRA" />
          <ObHlBlock kind="dialog"    tint="--char-1"
            text="Du nennst alles dramatisch." />
        </div>
      </div>

      <div class="ob-hl-row">
        <div class="ob-hl-row-label">
          <div class="ob-field-label">Standardmässig aktiv</div>
          <div class="ob-field-help">
            Greift in jedem neu geöffneten Skript. Pro Skript überschreibst du
            die Wahl jederzeit über das Augen-Icon in der Toolbar.
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
   Schritt 4 – Schreib-Defaults
   ========================================================================= */
function StepWriting() {
  return (
    <div class="ob-step">
      <div class="ob-eyebrow">Schritt 4 von 4 · Schreiben</div>
      <h1 class="ob-h1">Zwei Defaults zum Starten.</h1>
      <p class="ob-lede">
        Beides änderst du jederzeit in den Einstellungen. Hier nur ein
        guter Start.
      </p>

      <div class="ob-fields">
        <div class="ob-field">
          <div class="ob-field-head">
            <div class="ob-field-label">Tagesziel</div>
            <div class="ob-field-help">
              Wörter pro Tag. Wird in der Statusleiste und auf der Startseite
              angezeigt. 250 ist ein realistischer Default für tägliches Schreiben.
            </div>
          </div>
          <div class="ob-goal">
            <input
              type="number"
              min={settingsStore.DAILY_WORD_GOAL_MIN}
              max={settingsStore.DAILY_WORD_GOAL_MAX}
              step={50}
              value={settingsStore.dailyWordGoal()}
              onChange={(e) => {
                const n = Number(e.currentTarget.value);
                if (Number.isFinite(n)) void settingsStore.setDailyWordGoal(n);
              }}
            />
            <span class="ob-goal-unit">Wörter</span>
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

/* ---- Icons ---- */
function IconBlocks() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}
function IconBolt() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="13 2 4 14 12 14 11 22 20 10 12 10 13 2" />
    </svg>
  );
}
function IconFlame() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2c2 4-2 6-2 9a4 4 0 0 0 8 0c0-2-1-3-2-4 .5 4-2 5-2 5C13 8 10 7 12 2z" />
      <path d="M8 13c-1 1-2 3-2 5a6 6 0 0 0 12 0" />
    </svg>
  );
}
function IconCmd() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6z" />
    </svg>
  );
}
