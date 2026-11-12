/**
 * Schedule types for flexible habit scheduling.
 *
 * Modes:
 * - `daily`          — every day.
 * - `weekly`         — N times per week (timesPerWeek), any days.
 * - `specific_days`  — on specific days of the week (daysOfWeek).
 * - `flexible`       — every N days (intervalDays), counting from createdAt.
 */
export type ScheduleMode = "daily" | "weekly" | "specific_days" | "flexible";

export interface Schedule {
  mode: ScheduleMode;
  /** Days of the week (0 = Sunday … 6 = Saturday). Only for `specific_days`. */
  daysOfWeek?: number[];
  /** Target number of check-ins per week. Only for `weekly`. */
  timesPerWeek?: number;
  /** Interval in days between due dates. Only for `flexible`. */
  intervalDays?: number;
}

/** Checks that a date's weekday is present in the given days list. */
function isDayOfWeekDue(daysOfWeek: number[], date: Date): boolean {
  return daysOfWeek.includes(date.getDay());
}

/**
 * Determines whether a habit is due on the given date
 * according to its schedule mode.
 */
export function isHabitDueOn(
  schedule: Schedule,
  date: Date,
  /** Reference point for `flexible` intervals (defaults to epoch). */
  anchorDate: Date = new Date(0)
): boolean {
  switch (schedule.mode) {
    case "daily":
      return true;
    case "specific_days":
      return schedule.daysOfWeek
        ? isDayOfWeekDue(schedule.daysOfWeek, date)
        : false;
    case "weekly":
      return (schedule.timesPerWeek ?? 0) > 0;
    case "flexible":
      return schedule.intervalDays
        ? schedule.intervalDays > 0 &&
            daysBetween(anchorDate, date) % schedule.intervalDays === 0
        : false;
    default: {
      const exhaustive: never = schedule.mode;
      return exhaustive;
    }
  }
}

/** Whole-day difference between two dates (positive if b > a). */
function daysBetween(a: Date, b: Date): number {
  const aStart = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const bStart = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((bStart - aStart) / 86_400_000);
}
