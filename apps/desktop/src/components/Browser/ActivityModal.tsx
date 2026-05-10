import { Show } from "solid-js";
import { Modal } from "~/components/Common/Modal";
import { dailyStatsStore } from "~/stores/dailyStats";
import { settingsStore } from "~/stores/settings";
import { Heatmap } from "./Heatmap";
import "./ActivityModal.css";

export interface ActivityModalProps {
  open: boolean;
  onClose(): void;
}

/** Detail-Modal für die Schreibstatistik. Wird vom Momentum-Strip in
 *  der Browser-Übersicht aufgerufen ("Aktivität ansehen ↗"). Zeigt
 *  drei Aggregat-Karten (Heute, Streak, Insgesamt) plus die volle
 *  365-Tage-Heatmap. Spiegelt damit Chat 2 Variante 1 wider. */
export function ActivityModal(props: ActivityModalProps) {
  const stats = () => dailyStatsStore.stats();
  const goal = () => settingsStore.weeklyWordGoal();
  const wordsThisWeek = () => stats().wordsThisWeek;
  const goalMet = () => wordsThisWeek() >= goal();
  const pct = () => Math.min(100, Math.round((wordsThisWeek() / Math.max(1, goal())) * 100));
  const remaining = () => Math.max(0, goal() - wordsThisWeek());

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title="Aktivität"
      maxWidth={920}
      footer={
        <button class="btn" onClick={props.onClose}>Schließen</button>
      }
    >
      <div class="activity">
        <div class="activity-cards">
          <div class="activity-card">
            <div class="activity-card-label">Diese Woche</div>
            <div class="activity-card-value">
              {wordsThisWeek().toLocaleString("de-DE")}
              <span class="activity-card-unit">/ {goal().toLocaleString("de-DE")}</span>
            </div>
            <div class="activity-card-sub">
              <Show when={goalMet()} fallback={<>Noch {remaining().toLocaleString("de-DE")} Wörter</>}>
                Wochenziel erreicht ✓
              </Show>
            </div>
            <div class={"activity-progress" + (goalMet() ? " is-met" : "")}>
              <span style={`width:${pct()}%`} />
            </div>
          </div>
          <div class="activity-card">
            <div class="activity-card-label">Streak</div>
            <div class="activity-card-value">
              {stats().streakDays}
              <span class="activity-card-unit">{stats().streakDays === 1 ? "Tag" : "Tage"}</span>
            </div>
            <div class="activity-card-sub">
              {stats().activeDays} Schreibtage / 365
            </div>
          </div>
          <div class="activity-card">
            <div class="activity-card-label">Insgesamt</div>
            <div class="activity-card-value">
              {stats().totalWords.toLocaleString("de-DE")}
            </div>
            <div class="activity-card-sub">Wörter im letzten Jahr</div>
          </div>
        </div>

        <div class="activity-heatmap">
          <div class="activity-heatmap-head">
            <div class="activity-heatmap-title">Aktivität · 365 Tage</div>
            <div class="activity-heatmap-sub">
              {stats().activeDays.toLocaleString("de-DE")} aktive Tage
            </div>
          </div>
          <Heatmap dailyWords={stats().dailyWords} />
        </div>
      </div>
    </Modal>
  );
}
