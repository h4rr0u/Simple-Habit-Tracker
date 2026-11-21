import { eachDayOfInterval, format, startOfDay } from "date-fns";

import type { Checkin, Habit } from "@/db/schema";

/**
 * Habit correlation analysis for the /analytics page.
 *
 * For every unordered pair of habits (A, B) the module compares the
 * conditional probability of completing B on days when A was completed with
 * the probability on days when A was not:
 *
 *   delta = P(B | A) - P(B | ~A)
 *
 * A delta above the threshold is a positive association ("doing A makes B more
 * likely"), a delta below the negative threshold is a negative association.
 * Only strong associations are returned, sorted by magnitude.
 *
 * Completion rules:
 * - `binary`: a check-in exists;
 * - `quantitative` / `timed`: a check-in exists with `value > 0`;
 * - `negative`: a check-in records a slip, so a day counts as completed when
 *   there is no check-in for it (matching the rest of the analytics engine).
 */

const DAY_KEY = "yyyy-MM-dd";

/** Minimum shape required from a habit. */
export type CorrelationHabit = Pick<
  Habit,
  "id" | "name" | "type" | "createdAt"
>;

/** Minimum shape required from a check-in. */
export type CorrelationCheckin = Pick<Checkin, "habitId" | "date" | "value">;

/** One statistically relevant association between two habits. */
export interface HabitPairCorrelation {
  /** Habit whose completion is the condition. */
  habitA: { id: number; name: string };
  /** Habit whose completion is being predicted. */
  habitB: { id: number; name: string };
  /** P(B | A): share of A-days on which B was also completed, 0..1. */
  pBGivenA: number;
  /** P(B | ~A): share of non-A-days on which B was completed, 0..1. */
  pBGivenNotA: number;
  /** `pBGivenA - pBGivenNotA`, in -1..1. */
  delta: number;
  /** Number of days A was completed (the P(B | A) sample size). */
  support: number;
}

/** Result of a correlation scan, ready to be serialized to the client. */
export interface CorrelationResult {
  /** Strong positive associations, strongest first. */
  positive: HabitPairCorrelation[];
  /** Strong negative associations, strongest first. */
  negative: HabitPairCorrelation[];
  /** Distinct days with at least one check-in inside the window. */
  trackedDays: number;
  /** False when there is not enough history to draw conclusions. */
  hasEnoughData: boolean;
}

/** Tuning knobs for {@link computeCorrelations}. */
export interface CorrelationOptions {
  /** First day of the analysed window (inclusive). */
  from: Date;
  /** Last day of the analysed window (inclusive). */
  to: Date;
  /** Minimum distinct tracked days required. Defaults to 7. */
  minTrackedDays?: number;
  /** Minimum samples on each side of A (completed / not completed). Defaults to 3. */
  minSamples?: number;
  /** Absolute delta required to report a correlation. Defaults to 0.15. */
  threshold?: number;
  /** How many correlations to return per direction. Defaults to 3. */
  limit?: number;
}

/** ISO day key for a date. */
function toKey(date: Date): string {
  return format(startOfDay(date), DAY_KEY);
}

/** Conditional-probability counters for one direction of a habit pair. */
interface ConditionalStats {
  /** Days the condition habit was completed (the P(target | condition) sample). */
  conditionDays: number;
  /** Days the condition habit was not completed (the P(target | ~condition) sample). */
  otherDays: number;
  /** P(target | condition), 0..1. */
  pTargetGivenCondition: number;
  /** P(target | ~condition), 0..1. */
  pTargetGivenNotCondition: number;
}

/** Counts how often `target` was completed with and without `condition`. */
function conditionalStats(
  condition: Set<string>,
  target: Set<string>,
  days: string[],
  startKey: string
): ConditionalStats {
  let conditionDays = 0;
  let otherDays = 0;
  let targetWithCondition = 0;
  let targetWithoutCondition = 0;

  for (const day of days) {
    if (day < startKey) continue;
    const targetDone = target.has(day);
    if (condition.has(day)) {
      conditionDays++;
      if (targetDone) targetWithCondition++;
    } else {
      otherDays++;
      if (targetDone) targetWithoutCondition++;
    }
  }

  return {
    conditionDays,
    otherDays,
    pTargetGivenCondition:
      conditionDays === 0 ? 0 : targetWithCondition / conditionDays,
    pTargetGivenNotCondition:
      otherDays === 0 ? 0 : targetWithoutCondition / otherDays,
  };
}

/**
 * Computes the strongest positive and negative habit associations over the
 * given window.
 *
 * Days before either habit in a pair was created are ignored, so a newly added
 * habit does not look "not completed" for the whole history.
 */
export function computeCorrelations(
  habits: CorrelationHabit[],
  checkins: CorrelationCheckin[],
  options: CorrelationOptions
): CorrelationResult {
  const {
    from,
    to,
    minTrackedDays = 7,
    minSamples = 3,
    threshold = 0.15,
    limit = 3,
  } = options;

  const start = startOfDay(from);
  const end = startOfDay(to);
  const empty: CorrelationResult = {
    positive: [],
    negative: [],
    trackedDays: 0,
    hasEnoughData: false,
  };

  if (habits.length < 2 || start > end) return empty;

  const days = eachDayOfInterval({ start, end }).map(toKey);
  const windowDays = new Set(days);

  // Group check-ins per habit and remember which days have any activity.
  const rowsByHabit = new Map<number, CorrelationCheckin[]>();
  const tracked = new Set<string>();
  for (const checkin of checkins) {
    if (!windowDays.has(checkin.date)) continue;
    tracked.add(checkin.date);
    const bucket = rowsByHabit.get(checkin.habitId);
    if (bucket) bucket.push(checkin);
    else rowsByHabit.set(checkin.habitId, [checkin]);
  }

  const trackedDays = tracked.size;
  if (trackedDays < minTrackedDays) {
    return { ...empty, trackedDays };
  }

  // Resolve completed days per habit once, then reuse for every pair.
  const completedDays = new Map<number, Set<string>>();
  for (const habit of habits) {
    const rows = rowsByHabit.get(habit.id) ?? [];
    const createdKey = toKey(habit.createdAt);
    const completed = new Set<string>();

    if (habit.type === "negative") {
      const slips = new Set(rows.map((row) => row.date));
      for (const day of days) {
        if (day >= createdKey && !slips.has(day)) completed.add(day);
      }
    } else {
      for (const row of rows) {
        if (row.date < createdKey) continue;
        if (habit.type === "quantitative" || habit.type === "timed") {
          if ((row.value ?? 0) > 0) completed.add(row.date);
        } else {
          completed.add(row.date);
        }
      }
    }

    completedDays.set(habit.id, completed);
  }

  const pairs: HabitPairCorrelation[] = [];

  for (let i = 0; i < habits.length; i++) {
    for (let j = i + 1; j < habits.length; j++) {
      const habitA = habits[i];
      const habitB = habits[j];
      const aDays = completedDays.get(habitA.id);
      const bDays = completedDays.get(habitB.id);
      if (!aDays || !bDays) continue;

      const createdA = toKey(habitA.createdAt);
      const createdB = toKey(habitB.createdAt);
      const pairStart = createdA > createdB ? createdA : createdB;

      // A pair can be informative in either direction (A→B or B→A); evaluate
      // both and keep the stronger association so the result does not depend
      // on the order the habits happen to have in the database.
      const forward = conditionalStats(aDays, bDays, days, pairStart);
      const backward = conditionalStats(bDays, aDays, days, pairStart);

      const forwardUsable =
        forward.conditionDays >= minSamples &&
        forward.otherDays >= minSamples;
      const backwardUsable =
        backward.conditionDays >= minSamples &&
        backward.otherDays >= minSamples;
      if (!forwardUsable && !backwardUsable) continue;

      const forwardDelta = forwardUsable
        ? forward.pTargetGivenCondition - forward.pTargetGivenNotCondition
        : Number.NEGATIVE_INFINITY;
      const backwardDelta = backwardUsable
        ? backward.pTargetGivenCondition - backward.pTargetGivenNotCondition
        : Number.NEGATIVE_INFINITY;

      const useForward = Math.abs(forwardDelta) >= Math.abs(backwardDelta);
      const stats = useForward ? forward : backward;
      const delta = useForward ? forwardDelta : backwardDelta;

      if (delta > threshold || delta < -threshold) {
        const condition = useForward ? habitA : habitB;
        const target = useForward ? habitB : habitA;
        pairs.push({
          habitA: { id: condition.id, name: condition.name },
          habitB: { id: target.id, name: target.name },
          pBGivenA: stats.pTargetGivenCondition,
          pBGivenNotA: stats.pTargetGivenNotCondition,
          delta,
          support: stats.conditionDays,
        });
      }
    }
  }

  const positive = pairs
    .filter((pair) => pair.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, limit);
  const negative = pairs
    .filter((pair) => pair.delta < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, limit);

  return {
    positive,
    negative,
    trackedDays,
    // Reaching this point means the tracked-day minimum was met.
    hasEnoughData: true,
  };
}
