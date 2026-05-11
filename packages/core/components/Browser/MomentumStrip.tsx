import { Show, createMemo, createSignal } from "solid-js";
import { dailyStatsStore } from "../../stores/dailyStats";
import { settingsStore } from "../../stores/settings";
import { ActivityModal } from "./ActivityModal";
import type { ScriptSummary } from "../../lib/types";
import { stripeBackground } from "../../lib/stripe";
import { t, tPlural, getCurrentLocale } from "../../i18n";
import "./MomentumStrip.css";

export interface MomentumStripProps {
  /** Zuletzt berührtes Skript - klickbar als „Weiterschreiben"-CTA. */
  lastScript: ScriptSummary | null;
  onContinue(script: ScriptSummary): void;
}

/** Ein-Zeiler unter der Begrüßung. Drei Slots:
 *
 *    [Weiterschreiben: <Titel>  →]  [✶ N Tage]  [W heute / Ziel]  [Aktivität ↗]
 *
 *  Die linke Pille ist ein echter „go write"-CTA und bleibt prominent,
 *  die mittleren Pills sind reine Awareness-Anzeiger, die rechte
 *  Aktion öffnet das ActivityModal. Spart laut Re-Design ~240px
 *  vertikal gegenüber drei großen Stat-Karten - die Skript-Liste
 *  steht damit direkt unter dem Strip. */
export function MomentumStrip(props: MomentumStripProps) {
  const stats = () => dailyStatsStore.stats();
  const goal = () => settingsStore.weeklyWordGoal();
  const wordsThisWeek = () => stats().wordsThisWeek;
  const goalMet = () => wordsThisWeek() >= goal();
  const streak = () => stats().streakDays;
  /** Cast-Streifen wie im File-Browser: nach Dialog-Anteil sortiert,
   *  harte Segmente. Fällt auf eine dezente Linie zurück, wenn das
   *  Skript noch keinen Cast hat. */
  const stripeBg = createMemo(
    () =>
      stripeBackground(props.lastScript?.characters ?? [], "to bottom") ??
      "var(--ink-300)",
  );

  const [activityOpen, setActivityOpen] = createSignal(false);

  return (
    <>
      <div class="mom-strip">
        <Show
          when={props.lastScript}
          fallback={
            <div class="mom-strip-empty">
              <span class="mom-strip-label">{t("momentum.empty.label")}</span>
              <span class="mom-strip-empty-sub">
                {t("momentum.empty.sub")}
              </span>
            </div>
          }
        >
          {(s) => (
            <button
              class="mom-strip-continue"
              onClick={() => props.onContinue(s())}
              title={t("momentum.continue.title", { title: s().title })}
            >
              <span class="mom-strip-stripe" style={`background:${stripeBg()};`} />
              <span class="mom-strip-label">{t("momentum.continue.label")}</span>
              <span class="mom-strip-title">{s().title || t("common.untitled")}</span>
              <span class="mom-strip-cta" aria-hidden="true">→</span>
            </button>
          )}
        </Show>

        <span class="mom-strip-divider" aria-hidden="true" />

        <span class="mom-strip-pill" title={t("momentum.streak.title")}>
          <SparkleIcon />
          <strong>{streak()}</strong>
          <span class="mom-strip-pill-label">{tPlural("units.days", streak())}</span>
        </span>

        <span class="mom-strip-pill" title={t("momentum.goal.title", { goal: goal() })}>
          <strong classList={{ "is-met": goalMet() }}>
            {wordsThisWeek().toLocaleString(getCurrentLocale())}
          </strong>
          <span class="mom-strip-pill-label">/ {goal().toLocaleString(getCurrentLocale())} {t("momentum.weekUnit")}</span>
        </span>

        <button
          class="mom-strip-link"
          onClick={() => setActivityOpen(true)}
          title={t("momentum.activity.title")}
        >
          {t("momentum.activity.link")} <span aria-hidden="true">↗</span>
        </button>
      </div>

      <ActivityModal open={activityOpen()} onClose={() => setActivityOpen(false)} />
    </>
  );
}

function SparkleIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
         style="color:var(--char-1);">
      <path d="M12 3l1.9 4.6 4.6 1.9-4.6 1.9L12 16l-1.9-4.6L5.5 9.5 10.1 7.6z" />
    </svg>
  );
}
