import { getISODay, parseISO } from "date-fns";

import type { Checkin } from "@/db/schema";

/**
 * Time-pattern aggregations for the /analytics page.
 *
 * The module is intentionally pure: it receives check-in rows and returns
 * serializable statistics, so the Server Component can reuse the rows already
 * loaded for the other analytics charts and the client can render the result
 * without extra queries.
 *
 * Only successful check-ins are counted: a row with `value === null` (a plain
 * tick) or `value > 0` (progress on a quantitative/timed habit) counts, while
 * a zero-value row does not. Callers should pass rows of positive habits only;
 * a check-in on a negative habit records a slip, not a completion.
 */

/** Minimum shape required from a check-in. */
export type TimeStatsCheckin = Pick<Checkin, "date" | "value" | "createdAt">;

/** Aggregated check-ins for one ISO weekday. */
export interface DayOfWeekStat {
  /** ISO weekday: 1 = Monday … 7 = Sunday. */
  dayIndex: number;
  /** Number of successful check-ins on this weekday. */
  count: number;
  /** Share of all successful check-ins, 0..100 (one decimal). */
  percentage: number;
}

/** The four parts of the day used by the time-of-day breakdown. */
export type TimeOfDayPeriod = "morning" | "afternoon" | "evening" | "night";

/** Aggregated check-ins for one part of the day. */
export interface TimeOfDayStat {
  period: TimeOfDayPeriod;
  /** Number of successful check-ins in this period. */
  count: number;
  /** Share of all successful check-ins, 0..100 (one decimal). */
  percentage: number;
}

/** Both breakdowns plus the sample size used by the empty state. */
export interface TimePatternStats {
  dayOfWeek: DayOfWeekStat[];
  timeOfDay: TimeOfDayStat[];
  /** Total successful check-ins analysed. */
  total: number;
}

/**
 * Below this many successful check-ins the breakdowns are too noisy to show,
 * so the UI renders an empty state instead.
 */
export const MIN_CHECKINS_FOR_PATTERNS = 5;

/** Period order used by the UI (and by the returned array). */
export const TIME_OF_DAY_PERIODS: readonly TimeOfDayPeriod[] = [
  "morning",
  "afternoon",
  "evening",
  "night",
] as const;

/** A check-in counts when it has no value (a tick) or positive progress. */
function isSuccessfulCheckin(checkin: TimeStatsCheckin): boolean {
  return checkin.value == null || checkin.value > 0;
}

/** Rounds a share to one decimal so the payload stays compact and stable. */
function toPercentage(count: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

/**
 * Maps a local hour (0..23) to a part of the day:
 *
 * - morning:   05:00 – 11:59
 * - afternoon: 12:00 – 16:59
 * - evening:   17:00 – 21:59
 * - night:     22:00 – 04:59
 */
export function getPeriodForHour(hour: number): TimeOfDayPeriod {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

/**
 * Groups successful check-ins by ISO weekday (Monday first).
 *
 * The check-in `date` (the day the habit is marked for) is used rather than
 * `createdAt`, so back-filled check-ins count towards the day they belong to.
 */
export function getDayOfWeekStats(
  checkins: TimeStatsCheckin[]
): DayOfWeekStat[] {
  const counts = [0, 0, 0, 0, 0, 0, 0];

  for (const checkin of checkins) {
    if (!isSuccessfulCheckin(checkin)) continue;
    const date = parseISO(checkin.date);
    if (Number.isNaN(date.getTime())) continue;
    // getISODay: 1 = Monday … 7 = Sunday.
    counts[getISODay(date) - 1] += 1;
  }

  const total = counts.reduce((sum, count) => sum + count, 0);

  return counts.map((count, index) => ({
    dayIndex: index + 1,
    count,
    percentage: toPercentage(count, total),
  }));
}

/**
 * Groups successful check-ins by the local time of day they were recorded.
 *
 * `createdAt` is a JS Date from SQLite; `getHours()` reads the server's local
 * time. Habit Tracker is local-first, so the server and the user share the same
 * clock — no UTC conversion is applied here.
 */
export function getTimeOfDayStats(
  checkins: TimeStatsCheckin[]
): TimeOfDayStat[] {
  const counts: Record<TimeOfDayPeriod, number> = {
    morning: 0,
    afternoon: 0,
    evening: 0,
    night: 0,
  };

  for (const checkin of checkins) {
    if (!isSuccessfulCheckin(checkin)) continue;
    if (Number.isNaN(checkin.createdAt.getTime())) continue;
    counts[getPeriodForHour(checkin.createdAt.getHours())] += 1;
  }

  const total = TIME_OF_DAY_PERIODS.reduce(
    (sum, period) => sum + counts[period],
    0
  );

  return TIME_OF_DAY_PERIODS.map((period) => ({
    period,
    count: counts[period],
    percentage: toPercentage(counts[period], total),
  }));
}

/** Computes both breakdowns in a single pass over the rows. */
export function computeTimePatternStats(
  checkins: TimeStatsCheckin[]
): TimePatternStats {
  const dayOfWeek = getDayOfWeekStats(checkins);
  const total = dayOfWeek.reduce((sum, day) => sum + day.count, 0);

  return {
    dayOfWeek,
    timeOfDay: getTimeOfDayStats(checkins),
    total,
  };
}
