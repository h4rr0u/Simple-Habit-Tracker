/**
 * Shared analytics types for the /analytics page.
 * All rates are numbers in 0..1; the UI renders them as percentages.
 */

/** A single day of the daily completion-rate series. */
export interface DailyCompletionPoint {
  /** ISO date key (YYYY-MM-DD). */
  date: string;
  /** Completion rate for the day, 0..1 (0 when nothing was scheduled). */
  rate: number;
}

/** Aggregated completion rate for one weekday. */
export interface WeekdayCompletionPoint {
  /** 0 = Sunday … 6 = Saturday. */
  dayOfWeek: number;
  /** Aggregated completion rate for this weekday, 0..1. */
  rate: number;
}

/** Per-habit statistics used to derive the records block. */
export interface HabitRecordStat {
  habitId: number;
  name: string;
  color: string;
  /** Longest run of consecutive scheduled completions (all-time). */
  longestStreak: number;
  /** Completion rate over the analysed period, 0..1. */
  completionRate: number;
}

/** Records block: best and worst habits over the analysed scope. */
export interface AnalyticsRecords {
  longestStreak: HabitRecordStat | null;
  mostStable: HabitRecordStat | null;
  mostProblematic: HabitRecordStat | null;
}

/** A single day cell of the year heatmap. */
export interface YearHeatCell {
  /** ISO date key (YYYY-MM-DD). */
  date: string;
  /** Share of completed habits for the day, 0..1; -1 = before tracking started. */
  rate: number;
}

/** Everything the /analytics page renders, JSON-serializable for caching. */
export interface AnalyticsData {
  /** Completion rate per day over the selected period. */
  daily: DailyCompletionPoint[];
  /** Completion rate aggregated by weekday over the selected period. */
  weekdays: WeekdayCompletionPoint[];
  /** Average completion rate over the selected period, 0..1. */
  averageRate: number;
  /** Total scheduled habit-days in the period (0 = nothing scheduled). */
  scheduledTotal: number;
  records: AnalyticsRecords;
  /** Year heatmap cells (365 days ending today). */
  year: YearHeatCell[];
}

/** Habit summary passed to the filter controls. */
export interface HabitSummary {
  id: number;
  name: string;
}
