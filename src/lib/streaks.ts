import {
  addDays,
  eachDayOfInterval,
  format,
  isSameDay,
  startOfDay,
  startOfWeek,
} from "date-fns";

import { isHabitDueOn, type Schedule } from "@/types/schedule";

/**
 * Pure streak-computation engine.
 *
 * All functions are side-effect free and accept plain data, which makes them
 * trivially unit-testable. Completion is presence-based: a scheduled day is
 * "completed" when a check-in exists for it. Callers working with
 * quantitative/timed habits may pre-filter check-ins that meet their target
 * before passing them in.
 */

/** Minimal check-in shape accepted by the streak engine. */
export interface StreakCheckin {
  /** ISO date (YYYY-MM-DD), local to the user. */
  date: string;
  /** Recorded value. Completion is presence-based, so it is not inspected. */
  value?: number | null;
}

/** Result of {@link calculateCurrentStreak}. */
export interface CurrentStreak {
  /** Consecutive scheduled completions ending today; freeze-preserved gaps keep the streak but do not grow it. */
  streak: number;
  /** Freezes spent while walking back from today. */
  freezesUsed: number;
  /** What remains of the bank after the walk. */
  freezesRemaining: number;
}

/**
 * Gaps that have already been handled by a previous walk and persisted by the
 * caller. Keys are ISO day keys (weekly schedules use their Monday week-start
 * key).
 *
 * - `paid`: gaps already covered by a spent freeze, so they are traversed
 *   without spending again;
 * - `blocked`: gaps that ended a streak because no freeze was available at the
 *   time. They keep ending the streak even if a freeze is accrued later, so a
 *   monthly refill cannot resurrect a streak that was already lost.
 */
export interface FreezeHistory {
  paid?: ReadonlySet<string>;
  blocked?: ReadonlySet<string>;
}

/** Side-effect-free description of what a streak walk would consume. */
export interface FreezeConsumptionPlan {
  /** Gaps the walk would cover with a freeze right now. */
  paidUnits: string[];
  /** First gap that ends the streak because no freeze is left, if any. */
  blockedUnit: string | null;
  /** Freeze balance left after covering `paidUnits`. */
  freezesRemaining: number;
}

/** Internal walk result, including the gaps that need to be persisted. */
interface StreakWalk {
  streak: number;
  freezesUsed: number;
  freezesRemaining: number;
  paidUnits: string[];
  blockedUnit: string | null;
}

/** Completion rate for a single weekday (0 = Sunday … 6 = Saturday). */
export interface DayOfWeekPattern {
  dayOfWeek: number;
  completionRate: number;
}

/** Monday-based week start used for all weekly computations. */
const WEEK_STARTS_ON = 1;

/** Converts a Date to its ISO day key (YYYY-MM-DD). */
function toKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** Parses an ISO day key back into a local Date (midnight). */
function fromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Monday-based week-start key for a date. */
function weekKeyOf(date: Date): string {
  return toKey(startOfWeek(date, { weekStartsOn: WEEK_STARTS_ON }));
}

/** Lexicographically smallest ISO day key (ISO keys sort chronologically). */
function minDateKey(checkins: StreakCheckin[]): string {
  return checkins.reduce((min, c) => (c.date < min ? c.date : min), checkins[0].date);
}

/** Lexicographically largest ISO day key. */
function maxDateKey(checkins: StreakCheckin[]): string {
  return checkins.reduce((max, c) => (c.date > max ? c.date : max), checkins[0].date);
}

/** Groups check-ins by Monday-based week-start key, counting per week. */
function groupByWeek(checkins: StreakCheckin[]): Map<string, number> {
  const weeks = new Map<string, number>();
  for (const c of checkins) {
    const key = weekKeyOf(fromKey(c.date));
    weeks.set(key, (weeks.get(key) ?? 0) + 1);
  }
  return weeks;
}

/** Check-ins limited to the inclusive [from, to] range. */
function filterInRange(checkins: StreakCheckin[], from: Date, to: Date): StreakCheckin[] {
  const fromKeyStr = toKey(from);
  const toKeyStr = toKey(to);
  return checkins.filter((c) => c.date >= fromKeyStr && c.date <= toKeyStr);
}

/** Shared empty history used when the caller has no persisted state. */
const EMPTY_KEYS: ReadonlySet<string> = new Set();

/**
 * Backward walk shared by {@link calculateCurrentStreak} and
 * {@link calculateFreezeConsumption}.
 *
 * The order of the gap checks matters: already-paid gaps are traversed even
 * before a completion has been seen, so a freeze spent yesterday still bridges
 * a pending today to the completed run behind it. A fresh gap is provisionally
 * paid while nothing has been counted yet; those leading gaps are only
 * committed once the walk actually reaches a completed unit. Once a
 * completion has been counted, each gap is paid immediately (the streak is
 * preserved across it, even if the walk later blocks). A leading run of gaps
 * that never reaches a completion is refunded: the streak was already lost, so
 * paying would not have saved anything.
 */
function walkCurrentStreak(
  checkins: StreakCheckin[],
  schedule: Schedule,
  freezeBank: number,
  now: Date,
  anchorDate: Date,
  history?: FreezeHistory
): StreakWalk {
  const paid = history?.paid ?? EMPTY_KEYS;
  const blocked = history?.blocked ?? EMPTY_KEYS;

  if (checkins.length === 0) {
    return {
      streak: 0,
      freezesUsed: 0,
      freezesRemaining: freezeBank,
      paidUnits: [],
      blockedUnit: null,
    };
  }

  const today = startOfDay(now);

  if (schedule.mode === "weekly") {
    const quota = schedule.timesPerWeek ?? 0;
    if (quota <= 0) {
      return {
        streak: 0,
        freezesUsed: 0,
        freezesRemaining: freezeBank,
        paidUnits: [],
        blockedUnit: null,
      };
    }
    const doneWeeks = groupByWeek(checkins);
    const currentWeek = startOfWeek(today, { weekStartsOn: WEEK_STARTS_ON });
    const earliestWeek = startOfWeek(fromKey(minDateKey(checkins)), {
      weekStartsOn: WEEK_STARTS_ON,
    });

    let streak = 0;
    let freezesUsed = 0;
    let freezesRemaining = freezeBank;
    const paidUnits: string[] = [];
    // Leading gaps are paid provisionally: they only count once a completed
    // week is reached, otherwise the streak was already lost and the freezes
    // would have bought nothing.
    let pendingPaid: string[] = [];
    let blockedUnit: string | null = null;

    for (let week = currentWeek; week >= earliestWeek; week = addDays(week, -7)) {
      const key = toKey(week);
      if ((doneWeeks.get(key) ?? 0) >= quota) {
        streak++;
        paidUnits.push(...pendingPaid);
        pendingPaid = [];
        continue;
      }
      if (isSameDay(week, currentWeek)) continue; // week is still in progress
      if (blocked.has(key)) {
        blockedUnit = key;
        break;
      }
      if (paid.has(key)) continue; // already covered by a spent freeze
      if (freezesRemaining > 0) {
        freezesRemaining--;
        if (streak > 0) {
          paidUnits.push(key);
        } else {
          pendingPaid.push(key);
        }
        continue;
      }
      blockedUnit = key;
      break; // missed week without a freeze: the current streak ends here
    }

    if (pendingPaid.length > 0) {
      freezesRemaining += pendingPaid.length;
      pendingPaid = [];
    }
    freezesUsed = paidUnits.length;
    return { streak, freezesUsed, freezesRemaining, paidUnits, blockedUnit };
  }

  // daily, specific_days and flexible walk day by day.
  const doneDays = new Set(checkins.map((c) => c.date));
  const earliest = fromKey(minDateKey(checkins));

  let streak = 0;
  let freezesUsed = 0;
  let freezesRemaining = freezeBank;
  const paidUnits: string[] = [];
  let pendingPaid: string[] = [];
  let blockedUnit: string | null = null;

  for (let day = today; day >= earliest; day = addDays(day, -1)) {
    if (!isHabitDueOn(schedule, day, anchorDate)) continue;
    const key = toKey(day);
    if (doneDays.has(key)) {
      streak++;
      paidUnits.push(...pendingPaid);
      pendingPaid = [];
      continue;
    }
    if (isSameDay(day, today)) continue; // today is not over yet
    if (blocked.has(key)) {
      blockedUnit = key;
      break;
    }
    if (paid.has(key)) continue; // already covered by a spent freeze
    if (freezesRemaining > 0) {
      freezesRemaining--;
      if (streak > 0) {
        paidUnits.push(key);
      } else {
        pendingPaid.push(key);
      }
      continue;
    }
    blockedUnit = key;
    break; // missed day without a freeze: the current streak ends here
  }

  if (pendingPaid.length > 0) {
    freezesRemaining += pendingPaid.length;
    pendingPaid = [];
  }
  freezesUsed = paidUnits.length;
  return { streak, freezesUsed, freezesRemaining, paidUnits, blockedUnit };
}

/**
 * Current streak: consecutive scheduled completions ending today.
 *
 * Walks scheduled days backwards from `now`:
 * - a completed day grows the streak;
 * - today, if still unchecked, is pending and neither breaks nor grows it;
 * - a missed past day spends one freeze when available (the streak is
 *   preserved but not grown) and resets the streak to 0 otherwise.
 *
 * `history` carries gaps that were already paid for or already blocked in a
 * previous walk; passing it makes repeated reads stable instead of spending
 * the same freeze again on every render.
 *
 * For `weekly` the unit is a week: a week with >= `timesPerWeek` check-ins
 * counts once; the in-progress current week is skipped while below quota.
 */
export function calculateCurrentStreak(
  checkins: StreakCheckin[],
  schedule: Schedule,
  freezeBank: number,
  now: Date = new Date(),
  /** Anchor for `flexible` schedules (habit creation day); epoch by default. */
  anchorDate: Date = new Date(0),
  history?: FreezeHistory
): CurrentStreak {
  const walk = walkCurrentStreak(
    checkins,
    schedule,
    freezeBank,
    now,
    anchorDate,
    history
  );
  return {
    streak: walk.streak,
    freezesUsed: walk.freezesUsed,
    freezesRemaining: walk.freezesRemaining,
  };
}

/**
 * Reports which gaps a walk would consume right now, without persisting
 * anything. The `paidUnits`/`blockedUnit` result is meant to be stored by the
 * caller (see `syncHabitFreezes`), so a later render does not pay twice.
 */
export function calculateFreezeConsumption(
  checkins: StreakCheckin[],
  schedule: Schedule,
  freezeBank: number,
  now: Date = new Date(),
  /** Anchor for `flexible` schedules (habit creation day); epoch by default. */
  anchorDate: Date = new Date(0),
  history?: FreezeHistory
): FreezeConsumptionPlan {
  const walk = walkCurrentStreak(
    checkins,
    schedule,
    freezeBank,
    now,
    anchorDate,
    history
  );
  return {
    paidUnits: walk.paidUnits,
    blockedUnit: walk.blockedUnit,
    freezesRemaining: walk.freezesRemaining,
  };
}

/**
 * Longest streak over the whole history: the maximal run of consecutive
 * scheduled completions (weeks with >= quota for `weekly`). Historical gaps
 * always break a run — freeze spending for past gaps is not replayed.
 */
export function calculateLongestStreak(
  checkins: StreakCheckin[],
  schedule: Schedule,
  /** Anchor for `flexible` schedules (habit creation day); epoch by default. */
  anchorDate: Date = new Date(0)
): number {
  if (checkins.length === 0) return 0;

  if (schedule.mode === "weekly") {
    const quota = schedule.timesPerWeek ?? 0;
    if (quota <= 0) return 0;
    const doneWeeks = groupByWeek(checkins);
    const weekKeys = [...doneWeeks.keys()].sort();
    let best = 0;
    let run = 0;
    for (let week = fromKey(weekKeys[0]); week <= fromKey(weekKeys[weekKeys.length - 1]); week = addDays(week, 7)) {
      if ((doneWeeks.get(toKey(week)) ?? 0) >= quota) {
        run++;
        best = Math.max(best, run);
      } else {
        run = 0;
      }
    }
    return best;
  }

  const doneDays = new Set(checkins.map((c) => c.date));
  let best = 0;
  let run = 0;
  for (let day = fromKey(minDateKey(checkins)); day <= fromKey(maxDateKey(checkins)); day = addDays(day, 1)) {
    if (!isHabitDueOn(schedule, day, anchorDate)) continue;
    if (doneDays.has(toKey(day))) {
      run++;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  return best;
}

/**
 * Share of completed scheduled days in [from, to] as a number in 0..1.
 * For `weekly` the unit is the weekly quota: completed units never exceed
 * `timesPerWeek` per week (over-completion is not rewarded).
 * Returns 0 when nothing is scheduled in the range.
 */
export function getCompletionRate(
  checkins: StreakCheckin[],
  schedule: Schedule,
  from: Date,
  to: Date,
  /** Anchor for `flexible` schedules (habit creation day); epoch by default. */
  anchorDate: Date = new Date(0)
): number {
  const inRange = filterInRange(checkins, from, to);
  const days = eachDayOfInterval({ start: startOfDay(from), end: startOfDay(to) });

  if (schedule.mode === "weekly") {
    const quota = schedule.timesPerWeek ?? 0;
    if (quota <= 0 || days.length === 0) return 0;
    const weeks = new Set(days.map((d) => weekKeyOf(d)));
    const doneWeeks = groupByWeek(inRange);
    let completedUnits = 0;
    for (const key of weeks) {
      completedUnits += Math.min(doneWeeks.get(key) ?? 0, quota);
    }
    return completedUnits / (weeks.size * quota);
  }

  const doneDays = new Set(inRange.map((c) => c.date));
  let scheduled = 0;
  let completed = 0;
  for (const day of days) {
    if (!isHabitDueOn(schedule, day, anchorDate)) continue;
    scheduled++;
    if (doneDays.has(toKey(day))) completed++;
  }
  return scheduled === 0 ? 0 : completed / scheduled;
}

/**
 * Per-weekday completion rates for analytics like "I slip on Wednesdays".
 * Always returns seven entries (0 = Sunday … 6 = Saturday); weekdays with no
 * scheduled days in the range have a rate of 0.
 */
export function getDayOfWeekPatterns(
  checkins: StreakCheckin[],
  schedule: Schedule,
  from: Date,
  to: Date,
  /** Anchor for `flexible` schedules (habit creation day); epoch by default. */
  anchorDate: Date = new Date(0)
): DayOfWeekPattern[] {
  const inRange = filterInRange(checkins, from, to);
  const doneDays = new Set(inRange.map((c) => c.date));

  const scheduled = new Array<number>(7).fill(0);
  const completed = new Array<number>(7).fill(0);
  for (const day of eachDayOfInterval({ start: startOfDay(from), end: startOfDay(to) })) {
    if (!isHabitDueOn(schedule, day, anchorDate)) continue;
    const dow = day.getDay();
    scheduled[dow]++;
    if (doneDays.has(toKey(day))) completed[dow]++;
  }

  return scheduled.map((count, dayOfWeek) => ({
    dayOfWeek,
    completionRate: count === 0 ? 0 : completed[dayOfWeek] / count,
  }));
}
