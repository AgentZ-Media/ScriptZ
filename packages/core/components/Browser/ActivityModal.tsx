import { Show } from "solid-js";
import { Modal } from "../Common/Modal";
import { dailyStatsStore } from "../../stores/dailyStats";
import { settingsStore } from "../../stores/settings";
import { Heatmap } from "./Heatmap";
import { t, tPlural, getCurrentLocale } from "../../i18n";
import "./ActivityModal.css";

export interface ActivityModalProps {
  open: boolean;
  onClose(): void;
}

/** Detail-Modal für die Schreibstatistik. Wird vom Momentum-Strip in
 *  der Browser-Übersicht aufgerufen ("Aktivität ansehen ↗"). Zeigt
 *  drei Aggregat-Karten (Diese Woche, Streak, Insgesamt) plus die volle
 *  365-Tage-Heatmap. */
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
      title={t("activity.title")}
      maxWidth={920}
      footer={
        <button class="btn" onClick={props.onClose}>{t("common.close")}</button>
      }
    >
      <div class="activity">
        <div class="activity-cards">
          <div class="activity-card">
            <div class="activity-card-label">{t("activity.thisWeek")}</div>
            <div class="activity-card-value">
              {wordsThisWeek().toLocaleString(getCurrentLocale())}
              <span class="activity-card-unit">/ {goal().toLocaleString(getCurrentLocale())}</span>
            </div>
            <div class="activity-card-sub">
              <Show when={goalMet()} fallback={<>{t("activity.remainingWords", { count: remaining().toLocaleString(getCurrentLocale()) })}</>}>
                {t("activity.goalMet")}
              </Show>
            </div>
            <div class={"activity-progress" + (goalMet() ? " is-met" : "")}>
              <span style={`width:${pct()}%`} />
            </div>
          </div>
          <div class="activity-card">
            <div class="activity-card-label">{t("activity.streak")}</div>
            <div class="activity-card-value">
              {stats().streakDays}
              <span class="activity-card-unit">{tPlural("units.days", stats().streakDays)}</span>
            </div>
            <div class="activity-card-sub">
              {t("activity.activeDays", { count: stats().activeDays })}
            </div>
          </div>
          <div class="activity-card">
            <div class="activity-card-label">{t("activity.total")}</div>
            <div class="activity-card-value">
              {stats().totalWords.toLocaleString(getCurrentLocale())}
            </div>
            <div class="activity-card-sub">{t("activity.wordsLastYear")}</div>
          </div>
        </div>

        <div class="activity-heatmap">
          <div class="activity-heatmap-head">
            <div class="activity-heatmap-title">{t("activity.heatmap.title")}</div>
            <div class="activity-heatmap-sub">
              {t("activity.heatmap.activeDays", { count: stats().activeDays.toLocaleString(getCurrentLocale()) })}
            </div>
          </div>
          <Heatmap dailyWords={stats().dailyWords} />
        </div>
      </div>
    </Modal>
  );
}
