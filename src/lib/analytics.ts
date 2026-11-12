import { eachDayOfInterval, format, startOfDay, startOfWeek } from "date-fns";

import type { Checkin, Habit } from "@/db/schema";
import type {
  AnalyticsRecords,
  DailyCompletionPoint,
  HabitRecordStat,
  WeekdayCompletionPoint,
  YearHeatCell,
} from "@/types/analytics";
import { isHabitDueOn, type Schedule } from "@/types/schedule";
import {
  calculateLongestStreak,
  type StreakCheckin,
} from "./streaks";

/**
 * Pure analytics aggregations for the /analytics page.
 *
 * A habit-day counts as "completed" when a check-in exists and meets the
 * habit's target (presence is enough for binary/negative habits). Weekly-quota
 * habits contribute `timesPerWeek / 7` scheduled units per day and earn one
 * unit per counting check-in (capped at the quota), so rates stay comparable
 * across schedule modes.
 */

/** Monday-based week start, matching the streak engine. */
const WEEK_STARTS_ON = 1;

/** A habit with its parsed schedule and effective (target-met) check-ins. */
export interface HabitHistory {
  habit: Habit;
  schedule: Schedule;
  /** Check-ins whose value meets the habit target (all of them for binary/negative). */
  effective: StreakCheckin[];
}

/** Per-day aggregation unit shared by every analytics view. */
export interface DayContribution {
  /** ISO date key (YYYY-MM-DD). */
  date: string;
  /** 0 = Sunday … 6 = Saturday. */
  dayOfWeek: number;
  /** Scheduled units for the day (fractional for weekly quotas). */
  scheduled: number;
  /** Completed units for the day. */
  completed: number;
}

/** True when a check-in value satisfies the habit's target. */
function meetsTarget(habit: Habit, value: number | null | undefined): boolean {
  if (habit.type === "quantitative" || habit.type === "timed") {
    return habit.targetValue ? (value ?? 0) >= habit.targetValue : true;
  }
  return true;
}

/** Parses an ISO day key back into a local Date (midnight). */
function fromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Monday-based week-start key of a date. */
function weekKeyOf(date: Date): string {
  return format(startOfWeek(date, { weekStartsOn: WEEK_STARTS_ON }), "yyyy-MM-dd");
}

/**
 * Groups raw check-ins per habit and drops the ones below target, producing
 * the input for every analytics aggregation.
 */
export function buildHabitHistory(habit: Habit, rows: Checkin[]): HabitHistory {
  const effective = rows
    .filter((row) => meetsTarget(habit, row.value))
    .map((row) => ({ date: row.date, value: row.value }));
  return { habit, schedule: habit.schedule as unknown as Schedule, effective };
}

/** Prepared per-habit lookup structures for day-by-day scanning. */
interface PreparedHabit {
  schedule: Schedule;
  dates: Set<string>;
  /** Weekly mode only: week-start key → ascending check-in dates of that week. */
  weekDates: Map<string, string[]>;
}

function prepare(history: HabitHistory): PreparedHabit {
  const dates = new Set(history.effective.map((c) => c.date));
  const weekDates = new Map<string, string[]>();
  if (history.schedule.mode === "weekly") {
    const sorted = [...history.effective].sort((a, b) => a.date.localeCompare(b.date));
    for (const checkin of sorted) {
      const weekKey = weekKeyOf(fromKey(checkin.date));
      const bucket = weekDates.get(weekKey);
      if (bucket) bucket.push(checkin.date);
      else weekDates.set(weekKey, [checkin.date]);
    }
  }
  return { schedule: history.schedule, dates, weekDates };
}

const ZERO_CONTRIBUTION = { scheduled: 0, completed: 0 } as const;

/** Scheduled/completed units one habit contributes on a given day. */
function contribute(prepared: PreparedHabit, day: Date, key: string) {
  const schedule = prepared.schedule;

  if (schedule.mode === "weekly") {
    const quota = schedule.timesPerWeek ?? 0;
    if (quota <= 0) return ZERO_CONTRIBUTION;
    const week = prepared.weekDates.get(weekKeyOf(day)) ?? [];
    const countUpTo = countDatesUpTo(week, key);
    const counts = prepared.dates.has(key) && countUpTo <= quota;
    return { scheduled: quota / 7, completed: counts ? 1 : 0 };
  }

  if (!isHabitDueOn(schedule, day)) return ZERO_CONTRIBUTION;
  return { scheduled: 1, completed: prepared.dates.has(key) ? 1 : 0 };
}

/** Count of ISO keys in an ascending list that are <= `key`. */
function countDatesUpTo(ascending: string[], key: string): number {
  let count = 0;
  for (const date of ascending) {
    if (date <= key) count++;
    else break;
  }
  return count;
}

/**
 * Per-day scheduled/completed contributions over [from, to] for each habit.
 * Days on which nothing is scheduled report zeros (rate 0).
 */
export function buildDayContributions(
  histories: HabitHistory[],
  from: Date,
  to: Date
): DayContribution[] {
  const prepared = histories.map(prepare);
  return eachDayOfInterval({ start: startOfDay(from), end: startOfDay(to) }).map((day) => {
    const key = format(day, "yyyy-MM-dd");
    let scheduled = 0;
    let completed = 0;
    for (const habit of prepared) {
      const { scheduled: s, completed: c } = contribute(habit, day, key);
      scheduled += s;
      completed += c;
    }
    return { date: key, dayOfWeek: day.getDay(), scheduled, completed };
  });
}

/** Daily completion-rate series (0..1) for the line chart. */
export function buildDailySeries(contributions: DayContribution[]): DailyCompletionPoint[] {
  return contributions.map(({ date, scheduled, completed }) => ({
    date,
    rate: scheduled === 0 ? 0 : completed / scheduled,
  }));
}

/**
 * Completion rates aggregated by weekday, returned Monday-first
 * (Mon … Sun) for chart readability.
 */
export function buildWeekdaySeries(
  contributions: DayContribution[]
): WeekdayCompletionPoint[] {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const scheduled = new Array<number>(7).fill(0);
  const completed = new Array<number>(7).fill(0);
  for (const { dayOfWeek, scheduled: s, completed: c } of contributions) {
    scheduled[dayOfWeek] += s;
    completed[dayOfWeek] += c;
  }
  return order.map((dayOfWeek) => ({
    dayOfWeek,
    rate: scheduled[dayOfWeek] === 0 ? 0 : completed[dayOfWeek] / scheduled[dayOfWeek],
  }));
}

/** Average completion rate over the period (0..1); 0 when nothing scheduled. */
export function getAverageRate(contributions: DayContribution[]): number {
  let scheduled = 0;
  let completed = 0;
  for (const { scheduled: s, completed: c } of contributions) {
    scheduled += s;
    completed += c;
  }
  return scheduled === 0 ? 0 : completed / scheduled;
}

/**
 * Records across the given habits: longest all-time streak and the most
 * stable / most problematic habit by completion rate over [from, to].
 * Rates use the same day-contribution model as the charts, so every number
 * on the /analytics page stays consistent. Habits with no scheduled days
 * in the period are excluded from the rate-based records.
 */
export function computeRecords(
  histories: HabitHistory[],
  from: Date,
  to: Date
): AnalyticsRecords {
  const stats: (HabitRecordStat & { scheduled: number })[] = histories.map((history) => {
    const contributions = buildDayContributions([history], from, to);
    let scheduled = 0;
    let completed = 0;
    for (const day of contributions) {
      scheduled += day.scheduled;
      completed += day.completed;
    }
    return {
      habitId: history.habit.id,
      name: history.habit.name,
      color: history.habit.color,
      longestStreak: calculateLongestStreak(history.effective, history.schedule),
      completionRate: scheduled === 0 ? 0 : completed / scheduled,
      scheduled,
    };
  });

  // Habits with at least one scheduled day in the period.
  const rateCandidates = stats.filter((stat) => stat.scheduled > 0);

  const longestStreak = stats.length
    ? stats.reduce((best, stat) => (stat.longestStreak > best.longestStreak ? stat : best))
    : null;
  const mostStable = rateCandidates.length
    ? rateCandidates.reduce((best, stat) =>
        stat.completionRate > best.completionRate ? stat : best
      )
    : null;
  const mostProblematic = rateCandidates.length
    ? rateCandidates.reduce((worst, stat) =>
        stat.completionRate < worst.completionRate ? stat : worst
      )
    : null;

  return { longestStreak, mostStable, mostProblematic };
}

/**
 * Year-heatmap cells: per-day share of completed habits across the given
 * habits. Days before the earliest habit creation date are -1 (no data).
 */
export function buildYearCells(
  histories: HabitHistory[],
  from: Date,
  to: Date
): YearHeatCell[] {
  const contributions = buildDayContributions(histories, from, to);
  const minCreated = histories.length
    ? Math.min(...histories.map((h) => startOfDay(h.habit.createdAt).getTime()))
    : Number.POSITIVE_INFINITY;

  return contributions.map(({ date, scheduled, completed }) => {
    const rate =
      fromKey(date).getTime() < minCreated
        ? -1
        : scheduled === 0
          ? 0
          : completed / scheduled;
    return { date, rate };
  });
}
