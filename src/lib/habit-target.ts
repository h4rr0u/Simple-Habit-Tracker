import { eachDayOfInterval, format, parseISO, startOfDay, startOfWeek } from "date-fns";

import type { Checkin, Habit } from "@/db/schema";
import { isHabitDueOn, type Schedule } from "@/types/schedule";

/**
 * Target/completion helpers shared by the web UI, analytics and the Telegram
 * bot.
 *
 * Check-in values and habit targets do not always share a unit: `quantitative`
 * habits count in the habit's own units, while `timed` habits store elapsed
 * seconds but keep their target in minutes.
 *
 * Negative habits are inverted: a check-in records a slip, so a day is
 * completed only when there is no check-in at all.
 */

/** Smallest habit shape needed to resolve a target. */
type TargetHabit = Pick<Habit, "type" | "targetValue">;

/** Minimal check-in shape used by the completion helpers. */
export interface CompletionCheckin {
  /** ISO date (YYYY-MM-DD), local to the user. */
  date: string;
  value: number | null;
}

/** Monday-based week start, matching the streak engine. */
const WEEK_STARTS_ON = 1;

/** ISO day key for a Date. */
function toKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/**
 * The habit's target expressed in the same unit as stored check-in values.
 * Returns `null` when the habit has no target.
 */
export function targetUnits(habit: TargetHabit): number | null {
  if (habit.targetValue == null || habit.targetValue <= 0) return null;
  return habit.type === "timed" ? habit.targetValue * 60 : habit.targetValue;
}

/**
 * Next value for a quantitative check-in: current + 1, capped at the target
 * when one is configured. A missing/zero row starts at 1.
 */
export function incrementCheckinValue(
  current: number | null | undefined,
  target: number | null | undefined
): number {
  const next = Math.max(0, Math.floor(current ?? 0)) + 1;
  return target != null && target > 0 ? Math.min(next, target) : next;
}

/**
 * Whether a recorded check-in value satisfies the habit's target.
 * Presence-based habits (binary/negative, or untargeted quantitative/timed)
 * are satisfied by any check-in; targeted ones need to reach the target.
 */
export function meetsHabitTarget(habit: TargetHabit, value: number | null): boolean {
  const target = targetUnits(habit);
  if (target == null) return true;
  return (value ?? 0) >= target;
}

/**
 * Whether a day is completed for this habit.
 *
 * - `negative`: complete when no check-in (slip) exists;
 * - `binary`: complete when a check-in exists;
 * - `quantitative` / `timed`: complete when the value meets the target
 *   (presence is enough when no target is configured).
 */
export function isHabitDayComplete(
  habit: TargetHabit,
  checkin: Pick<Checkin, "value"> | null | undefined
): boolean {
  if (habit.type === "negative") return checkin == null;
  if (checkin == null) return false;
  return meetsHabitTarget(habit, checkin.value);
}

/**
 * Converts raw check-ins into completion entries for the streak/analytics
 * engines.
 *
 * Positive habits already represent completions, so their rows are filtered by
 * the habit target and returned. Negative habits store slips, so the result is
 * the set of scheduled days since creation without a slip. For `weekly`
 * negatives at most `timesPerWeek` clean days per week are emitted, matching
 * the quota semantics of the streak engine.
 */
export function buildCompletionCheckins(
  habit: Habit,
  checkins: Checkin[],
  today: Date = new Date()
): CompletionCheckin[] {
  if (habit.type !== "negative") {
    return checkins
      .filter((checkin) => meetsHabitTarget(habit, checkin.value))
      .map((checkin) => ({
        date: checkin.date,
        value: checkin.value,
      }));
  }

  const schedule = habit.schedule as unknown as Schedule;
  const slips = new Set(checkins.map((checkin) => checkin.date));
  const start = startOfDay(habit.createdAt);
  const end = startOfDay(today);
  if (start > end) return [];

  const cleanDays: string[] = [];
  for (const day of eachDayOfInterval({ start, end })) {
    if (!isHabitDueOn(schedule, day, habit.createdAt)) continue;
    const key = toKey(day);
    if (!slips.has(key)) cleanDays.push(key);
  }

  if (schedule.mode !== "weekly") {
    return cleanDays.map((date) => ({ date, value: null }));
  }

  const quota = schedule.timesPerWeek ?? 0;
  if (quota <= 0) return [];

  // Cap clean days per week at the weekly quota so a negative habit cannot
  // overflow its target just by having seven clean days.
  const perWeek = new Map<string, number>();
  const completed: CompletionCheckin[] = [];
  for (const date of cleanDays) {
    const weekStart = toKey(
      startOfWeek(parseISO(date), { weekStartsOn: WEEK_STARTS_ON })
    );
    const count = perWeek.get(weekStart) ?? 0;
    if (count >= quota) continue;
    perWeek.set(weekStart, count + 1);
    completed.push({ date, value: null });
  }
  return completed;
}

/** Whether the habit is due on a date, anchored to its creation day. */
export function isHabitDueOnDate(
  habit: Pick<Habit, "schedule" | "createdAt">,
  date: Date
): boolean {
  return isHabitDueOn(
    habit.schedule as unknown as Schedule,
    date,
    habit.createdAt
  );
}
