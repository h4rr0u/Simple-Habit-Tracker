import { startOfDay } from "date-fns";

/**
 * Freeze bank logic.
 *
 * Every habit holds a small bank of "streak freezes": a missed scheduled day
 * can spend one to preserve the streak (the streak is kept but does not
 * grow). Freezes accrue at a fixed rate with a hard cap, so they never pile
 * up indefinitely.
 */

/** Freezes granted per accrual. */
const FREEZES_PER_MONTH = 1;
/** Maximum balance that can be held at once. */
const FREEZE_CAP = 2;

/** Minimal habit shape needed for accrual. */
export interface FreezableHabit {
  /** Current freeze balance. */
  freezeBank: number;
  /** Creation date — accruals count from here. */
  createdAt: Date;
}

/**
 * Accrues freezes for a habit at the given moment.
 *
 * One freeze is granted for each elapsed accrual point (the 1st of each
 * month) since `createdAt`, up to the cap of 2. When the balance is already
 * at the cap, nothing is granted and the balance stays unchanged — accruals
 * do not accumulate beyond it.
 *
 * @returns the new freeze balance.
 */
export function accrueFreezes(habit: FreezableHabit, now: Date): number {
  if (habit.freezeBank >= FREEZE_CAP) return habit.freezeBank;

  const balance = habit.freezeBank;
  const created = startOfDay(habit.createdAt);
  const today = startOfDay(now);
  if (today < created) return balance;

  let grants = 0;
  // First accrual point strictly after creation: the 1st of the following month.
  let point = startOfDay(new Date(created.getFullYear(), created.getMonth() + 1, 1));
  while (point <= today) {
    grants++;
    point = new Date(point.getFullYear(), point.getMonth() + 1, 1);
  }

  return Math.min(balance + grants, FREEZE_CAP);
}
