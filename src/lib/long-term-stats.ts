import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  startOfDay,
  startOfMonth,
  subMonths,
} from "date-fns";

import type { HabitType } from "@/db/schema";
import { isHabitDueOn, type Schedule } from "@/types/schedule";

/**
 * Long-term (multi-year) monthly completion trends.
 *
 * The database only aggregates raw check-ins per habit and month
 * (`getLongTermStats` in `src/db/queries.ts`), so no check-in rows ever leave
 * SQLite. The scheduled side is derived here from the (small) habit list,
 * reusing the same `isHabitDueOn` engine as the rest of the analytics page
 * instead of duplicating schedule rules in SQL.
 */

/** Selectable look-back windows, in months, keyed by the URL value. */
export const LONG_TERM_PERIODS = ["12", "36", "60"] as const;

export type LongTermPeriod = (typeof LONG_TERM_PERIODS)[number];

/** Number of months each selectable period covers. */
export const LONG_TERM_MONTHS: Record<LongTermPeriod, number> = {
  "12": 12,
  "36": 36,
  "60": 60,
};

/**
 * A trend needs at least two populated months; a single point is not a trend.
 * Below this the UI shows the "not enough data" empty state.
 */
export const MIN_MONTHS_FOR_LONG_TERM = 2;

/** Habit fields needed to compute scheduled units (no check-ins). */
export interface LongTermHabit {
  id: number;
  type: HabitType;
  schedule: Schedule;
  createdAt: Date;
}

/**
 * One habit-month returned by the SQL aggregation.
 *
 * `completed` counts check-ins that meet the habit target (positive habits);
 * `checkins` counts every row, which for negative habits are slips.
 */
export interface MonthlyCompletionRow {
  habitId: number;
  /** Calendar month as `YYYY-MM`. */
  month: string;
  completed: number;
  checkins: number;
}

/** One point of the long-term line chart. */
export interface LongTermTrendPoint {
  /** Calendar month as `YYYY-MM`. */
  month: string;
  /** Completion rate for the month, 0..1 (0 when nothing was scheduled). */
  completionRate: number;
}

/** Result passed to the "long-term trends" card. */
export interface LongTermStats {
  points: LongTermTrendPoint[];
  /** False → the UI renders the insufficient-data empty state. */
  hasData: boolean;
}

/**
 * Scheduled units one habit contributes in `[monthStart, monthEnd]`.
 *
 * Weekly-quota habits contribute `timesPerWeek / 7` per active day, matching
 * `contribute()` in `src/lib/analytics.ts`; every other mode contributes one
 * unit per due day. Days before `createdAt` are never scheduled.
 */
function scheduledUnitsInMonth(
  habit: LongTermHabit,
  monthStart: Date,
  monthEnd: Date
): number {
  const created = startOfDay(habit.createdAt);
  const start = created > monthStart ? created : monthStart;
  if (start > monthEnd) return 0;

  const days = eachDayOfInterval({ start, end: monthEnd });

  if (habit.schedule.mode === "weekly") {
    const quota = habit.schedule.timesPerWeek ?? 0;
    return quota > 0 ? (quota / 7) * days.length : 0;
  }

  let scheduled = 0;
  for (const day of days) {
    if (isHabitDueOn(habit.schedule, day, habit.createdAt)) scheduled += 1;
  }
  return scheduled;
}

/**
 * Builds the monthly completion series for the selected window.
 *
 * Months before the first habit was created are dropped, so a five-year
 * selection on a young account starts at the first tracked month instead of
 * drawing a long flat zero line. Months inside the tracked range stay in the
 * series even when nothing was completed, so gaps are visible.
 */
export function buildLongTermStats(
  habits: LongTermHabit[],
  rows: MonthlyCompletionRow[],
  period: LongTermPeriod,
  today: Date = new Date()
): LongTermStats {
  const end = startOfDay(today);
  const monthCount = LONG_TERM_MONTHS[period];
  const firstMonth = startOfMonth(subMonths(end, monthCount - 1));

  const completions = new Map<string, MonthlyCompletionRow>();
  for (const row of rows) {
    completions.set(`${row.habitId}:${row.month}`, row);
  }

  const points: LongTermTrendPoint[] = [];
  let monthsWithData = 0;
  let started = false;

  for (let index = 0; index < monthCount; index += 1) {
    const monthStart = addMonths(firstMonth, index);
    const monthKey = format(monthStart, "yyyy-MM");
    const monthEnd = startOfDay(endOfMonth(monthStart));
    const effectiveEnd = monthEnd > end ? end : monthEnd;
    if (monthStart > effectiveEnd) continue;

    let scheduled = 0;
    let completed = 0;

    for (const habit of habits) {
      const habitScheduled = scheduledUnitsInMonth(habit, monthStart, effectiveEnd);
      if (habitScheduled <= 0) continue;
      scheduled += habitScheduled;

      const row = completions.get(`${habit.id}:${monthKey}`);
      if (habit.type === "negative") {
        // A check-in on a negative habit is a slip, not a completion.
        const slips = row?.checkins ?? 0;
        completed += Math.max(habitScheduled - slips, 0);
      } else {
        // A check-in on a non-due day must not push the rate above 100%.
        completed += Math.min(row?.completed ?? 0, habitScheduled);
      }
    }

    if (scheduled > 0) {
      started = true;
      monthsWithData += 1;
    }
    if (!started) continue;

    const rate = scheduled > 0 ? completed / scheduled : 0;
    points.push({
      month: monthKey,
      completionRate: Math.min(1, Math.max(0, rate)),
    });
  }

  return {
    points,
    hasData: monthsWithData >= MIN_MONTHS_FOR_LONG_TERM,
  };
}
