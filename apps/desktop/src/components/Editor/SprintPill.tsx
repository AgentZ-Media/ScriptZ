import { Show, createEffect, createSignal, onCleanup } from "solid-js";
import "./SprintPill.css";

const SPRINT_ROOT_CLASS = "sprint";

const PRESETS = [5, 15, 25] as const;
const DEFAULT_MIN = 15;

/** Schreib-Sprint - kleiner Pomodoro-Timer unten rechts im Editor.
 *  Drei Presets (5/15/25 Min), Start/Pause/Reset. Lokaler State, kein
 *  Server-Roundtrip; Wortzunahme während des Sprints wird vom
 *  normalen Save-Pfad ohnehin ins daily_word_log eingerechnet. */
export function SprintPill() {
  const [open, setOpen] = createSignal(false);
  const [running, setRunning] = createSignal(false);
  const [minutes, setMinutes] = createSignal<number>(DEFAULT_MIN);
  const [secondsLeft, setSecondsLeft] = createSignal<number>(DEFAULT_MIN * 60);

  createEffect(() => {
    if (!running()) return;
    const t = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          setRunning(false);
          // Audio-Cue wäre nett, aber ohne Asset behalten wir es ruhig.
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    onCleanup(() => clearInterval(t));
  });

  function start(min: number) {
    setMinutes(min);
    setSecondsLeft(min * 60);
    setRunning(true);
  }
  function reset() {
    setRunning(false);
    setSecondsLeft(minutes() * 60);
  }
  function chooseMinutes(m: number) {
    setMinutes(m);
    setSecondsLeft(m * 60);
    setRunning(false);
  }

  function fmt(s: number): string {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }

  const progress = () => {
    const total = minutes() * 60;
    if (total <= 0) return 0;
    return Math.max(0, Math.min(100, ((total - secondsLeft()) / total) * 100));
  };

  // Esc schließt nur das Panel (nicht den Sprint).
  function onPanelKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  // Outside-Click schließt das Panel. Capture-Phase, damit ein Klick auf
  // die Pille selbst (toggle) sauber durchgeht ohne dass der Listener
  // erst close-then-open feuert.
  createEffect(() => {
    if (!open()) return;
    const onDown = (ev: MouseEvent) => {
      const t = ev.target as HTMLElement | null;
      if (t?.closest(`.${SPRINT_ROOT_CLASS}`)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown, true);
    onCleanup(() => document.removeEventListener("mousedown", onDown, true));
  });

  return (
    <div class={SPRINT_ROOT_CLASS}>
      <Show when={open()}>
        <div class="sprint-panel" onClick={(e) => e.stopPropagation()} onKeyDown={onPanelKey}>
          <div class="sprint-clock">{fmt(secondsLeft())}</div>
          <div class="sprint-bar"><span style={`width:${progress()}%`} /></div>
          <div class="sprint-meta">Schreib-Sprint · ohne Unterbrechung</div>
          <div class="sprint-presets">
            {PRESETS.map((m) => (
              <button
                classList={{ "is-on": minutes() === m }}
                onClick={() => chooseMinutes(m)}
              >
                {m} Min
              </button>
            ))}
          </div>
          <div class="sprint-actions">
            <Show
              when={!running()}
              fallback={
                <button class="btn btn-primary" onClick={() => setRunning(false)}>
                  Pause
                </button>
              }
            >
              <button class="btn btn-primary" onClick={() => start(minutes())}>
                Start
              </button>
            </Show>
            <button class="btn" onClick={reset}>Reset</button>
          </div>
        </div>
      </Show>
      <button
        class="sprint-pill"
        classList={{ "is-running": running() }}
        onClick={() => setOpen((o) => !o)}
        title={running() ? "Sprint läuft" : "Schreib-Sprint starten"}
      >
        <span class="sprint-pill-ic" aria-hidden="true">
          <Show when={running()} fallback={<SparkleIcon />}>
            <FocusIcon />
          </Show>
        </span>
        <span class="sprint-pill-label">
          <Show when={running()} fallback={"Sprint"}>{fmt(secondsLeft())}</Show>
        </span>
      </button>
    </div>
  );
}

function SparkleIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 3l1.9 4.6 4.6 1.9-4.6 1.9L12 16l-1.9-4.6L5.5 9.5 10.1 7.6z" />
    </svg>
  );
}
function FocusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
