import type { Habit } from "@/db/schema";

/**
 * Target helpers shared by the web UI, analytics and the Telegram bot.
 *
 * Check-in values and habit targets do not always share a unit: `quantitative`
 * habits count in the habit's own units, while `timed` habits store elapsed
 * seconds but keep their target in minutes.
 */

/** Smallest habit shape needed to resolve a target. */
type TargetHabit = Pick<Habit, "type" | "targetValue">;

/**
 * The habit's target expressed in the same unit as stored check-in values.
 * Returns `null` when the habit has no target.
 */
export function targetUnits(habit: TargetHabit): number | null {
  if (habit.targetValue == null || habit.targetValue <= 0) return null;
  return habit.type === "timed" ? habit.targetValue * 60 : habit.targetValue;
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
