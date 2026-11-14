import { describe, expect, it } from "vitest";

import type { Schedule } from "@/types/schedule";
import {
  calculateCurrentStreak,
  calculateFreezeConsumption,
  calculateLongestStreak,
  getCompletionRate,
  getDayOfWeekPatterns,
  type StreakCheckin,
} from "./streaks";

/** Thursday, 6 November 2025. Weekday index: 4. */
const NOW = new Date(2025, 10, 6);

/** Builds an ISO day key for a local date. */
function key(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Shorthand check-in factory. */
function c(y: number, m: number, d: number): StreakCheckin {
  return { date: key(y, m, d) };
}

const DAILY: Schedule = { mode: "daily" };

describe("calculateCurrentStreak (daily)", () => {
  it("returns zeros for an empty history", () => {
    expect(calculateCurrentStreak([], DAILY, 0, NOW)).toEqual({
      streak: 0,
      freezesUsed: 0,
      freezesRemaining: 0,
    });
  });

  it("counts a single check-in today as a streak of 1", () => {
    const checkins = [c(2025, 11, 6)];
    expect(calculateCurrentStreak(checkins, DAILY, 0, NOW)).toEqual({
      streak: 1,
      freezesUsed: 0,
      freezesRemaining: 0,
    });
  });

  it("does not count a checked-in yesterday followed by an unchecked today as broken", () => {
    // Today (Nov 6) not yet checked; yesterday is done — streak stays 1.
    const checkins = [c(2025, 11, 5)];
    expect(calculateCurrentStreak(checkins, DAILY, 0, NOW).streak).toBe(1);
  });

  it("resets to 0 on a gap with no freezes available", () => {
    // Gap on Nov 4, freeze bank empty: streak ends at the gap.
    const checkins = [c(2025, 11, 2), c(2025, 11, 3), c(2025, 11, 5), c(2025, 11, 6)];
    const result = calculateCurrentStreak(checkins, DAILY, 0, NOW);
    expect(result.streak).toBe(2); // only Nov 5 and Nov 6
    expect(result.freezesUsed).toBe(0);
  });

  it("spends a freeze on a gap and preserves the streak", () => {
    const checkins = [c(2025, 11, 2), c(2025, 11, 3), c(2025, 11, 5), c(2025, 11, 6)];
    const result = calculateCurrentStreak(checkins, DAILY, 1, NOW);
    // Frozen Nov 4 keeps the run alive but does not grow it: 4 done days.
    expect(result.streak).toBe(4);
    expect(result.freezesUsed).toBe(1);
    expect(result.freezesRemaining).toBe(0);
  });

  it("spends multiple freezes up to the available balance", () => {
    // Gaps on Nov 2 and Nov 4; bank of 2 covers both.
    const checkins = [
      c(2025, 11, 1),
      c(2025, 11, 3),
      c(2025, 11, 5),
      c(2025, 11, 6),
    ];
    const result = calculateCurrentStreak(checkins, DAILY, 2, NOW);
    // Both gaps frozen (preserved, not grown): 4 done days remain.
    expect(result.streak).toBe(4);
    expect(result.freezesUsed).toBe(2);
    expect(result.freezesRemaining).toBe(0);
  });

  it("reset happens when freezes run out mid-walk", () => {
    // Gap on Nov 4 (covered by the last freeze) and Nov 2 (not covered).
    const checkins = [c(2025, 11, 1), c(2025, 11, 3), c(2025, 11, 5), c(2025, 11, 6)];
    const result = calculateCurrentStreak(checkins, DAILY, 1, NOW);
    expect(result.streak).toBe(3); // Nov 4 frozen, Nov 5..6; walk stops at Nov 2
    expect(result.freezesUsed).toBe(1);
    expect(result.freezesRemaining).toBe(0);
  });

  it("settles a trailing missed day when the run behind it is reachable", () => {
    // Nov 4 and 5 missed, today still unchecked, Nov 3 done, bank of 2.
    const result = calculateCurrentStreak([c(2025, 11, 3)], DAILY, 2, NOW);
    expect(result.streak).toBe(1);
    expect(result.freezesUsed).toBe(2);
    expect(result.freezesRemaining).toBe(0);
  });

  it("refunds leading gaps when the bank cannot carry the run", () => {
    // Nov 3-5 missed, Nov 2 done, bank of 2: the run is already lost, so the
    // two freezes must not be consumed for nothing.
    const checkins = [c(2025, 11, 2)];
    const result = calculateCurrentStreak(checkins, DAILY, 2, NOW);
    expect(result.streak).toBe(0);
    expect(result.freezesUsed).toBe(0);
    expect(result.freezesRemaining).toBe(2);

    const plan = calculateFreezeConsumption(checkins, DAILY, 2, NOW);
    expect(plan.paidUnits).toEqual([]);
    expect(plan.blockedUnit).toBe("2025-11-03");
  });
});

describe("calculateCurrentStreak with persisted freeze history", () => {
  it("does not spend a freeze again for a gap that was already paid", () => {
    const checkins = [c(2025, 11, 2), c(2025, 11, 3), c(2025, 11, 5), c(2025, 11, 6)];
    const result = calculateCurrentStreak(checkins, DAILY, 1, NOW, new Date(0), {
      paid: new Set(["2025-11-04"]),
    });

    expect(result.streak).toBe(4);
    expect(result.freezesUsed).toBe(0);
    expect(result.freezesRemaining).toBe(1);
  });

  it("keeps a blocked gap broken even when a freeze is available", () => {
    const checkins = [c(2025, 11, 2), c(2025, 11, 3), c(2025, 11, 5), c(2025, 11, 6)];
    const result = calculateCurrentStreak(checkins, DAILY, 1, NOW, new Date(0), {
      blocked: new Set(["2025-11-04"]),
    });

    expect(result.streak).toBe(2); // Nov 5 and Nov 6 only
    expect(result.freezesUsed).toBe(0);
    expect(result.freezesRemaining).toBe(1);
  });

  it("reports the gaps a walk would pay and the one that blocks it", () => {
    const checkins = [c(2025, 11, 1), c(2025, 11, 3), c(2025, 11, 5), c(2025, 11, 6)];
    const plan = calculateFreezeConsumption(checkins, DAILY, 1, NOW);

    expect(plan.paidUnits).toEqual(["2025-11-04"]);
    expect(plan.blockedUnit).toBe("2025-11-02");
    expect(plan.freezesRemaining).toBe(0);
  });

  it("recovers a paid weekly gap without spending again", () => {
    const weekly: Schedule = { mode: "weekly", timesPerWeek: 3 };
    const checkins = [
      c(2025, 10, 27),
      c(2025, 10, 29),
      c(2025, 11, 3),
      c(2025, 11, 4),
      c(2025, 11, 6),
    ];
    // The week of Oct 27 is under quota but was paid earlier.
    const result = calculateCurrentStreak(checkins, weekly, 1, NOW, new Date(0), {
      paid: new Set(["2025-10-27"]),
    });

    expect(result.streak).toBe(1); // the current week only (paid weeks do not grow)
    expect(result.freezesUsed).toBe(0);
    expect(result.freezesRemaining).toBe(1);
  });

  it("pays for a trailing missed day so opening the app keeps the run", () => {
    // Nov 5 was missed and today (Nov 6) is still unchecked. There is no
    // completed day newer than the gap, but the run behind it is real, so a
    // freeze should cover it when the app settles the day.
    const checkins = [c(2025, 11, 1), c(2025, 11, 2), c(2025, 11, 3), c(2025, 11, 4)];
    const result = calculateCurrentStreak(checkins, DAILY, 1, NOW);

    expect(result.streak).toBe(4);
    expect(result.freezesUsed).toBe(1);
    expect(result.freezesRemaining).toBe(0);

    const plan = calculateFreezeConsumption(checkins, DAILY, 1, NOW);
    expect(plan.paidUnits).toEqual(["2025-11-05"]);
    expect(plan.blockedUnit).toBeNull();
  });

  it("does not spend a trailing weekly freeze when nothing completed lies behind it", () => {
    const weekly: Schedule = { mode: "weekly", timesPerWeek: 3 };
    // Current week and last week are both under quota; no completed week exists.
    const checkins = [c(2025, 10, 29), c(2025, 11, 4)];
    const result = calculateCurrentStreak(checkins, weekly, 1, NOW);

    expect(result.streak).toBe(0);
    expect(result.freezesUsed).toBe(0);
    expect(result.freezesRemaining).toBe(1);
  });
});

describe("calculateCurrentStreak (weekly)", () => {
  const WEEKLY3: Schedule = { mode: "weekly", timesPerWeek: 3 };

  it("under quota: the current in-progress week is skipped, not broken", () => {
    // Current week (Mon Nov 3): 2 of 3 done — pending, does not break the run.
    const checkins = [c(2025, 11, 4), c(2025, 11, 6)];
    const result = calculateCurrentStreak(checkins, WEEKLY3, 0, NOW);
    expect(result.streak).toBe(0);
    expect(result.freezesUsed).toBe(0);
  });

  it("counts a current week that has already met the quota", () => {
    const checkins = [c(2025, 11, 3), c(2025, 11, 4), c(2025, 11, 6)];
    expect(calculateCurrentStreak(checkins, WEEKLY3, 0, NOW).streak).toBe(1);
  });

  it("under quota in a past week with no freezes: streak stops before it", () => {
    // Last week (Mon Oct 27): only 2 of 3. Current week: full 3.
    const checkins = [
      c(2025, 10, 27),
      c(2025, 10, 29),
      c(2025, 11, 3),
      c(2025, 11, 4),
      c(2025, 11, 6),
    ];
    const result = calculateCurrentStreak(checkins, WEEKLY3, 0, NOW);
    expect(result.streak).toBe(1);
    expect(result.freezesUsed).toBe(0);
  });

  it("under quota in a past week with a freeze: the streak is preserved", () => {
    const checkins = [
      c(2025, 10, 27),
      c(2025, 10, 29),
      c(2025, 11, 3),
      c(2025, 11, 4),
      c(2025, 11, 6),
    ];
    const result = calculateCurrentStreak(checkins, WEEKLY3, 1, NOW);
    // The under-quota week is frozen (preserved, not grown): 1 done week.
    expect(result.streak).toBe(1);
    expect(result.freezesUsed).toBe(1);
    expect(result.freezesRemaining).toBe(0);
  });
});

describe("calculateCurrentStreak (specific_days)", () => {
  it("only counts scheduled weekdays", () => {
    const schedule: Schedule = { mode: "specific_days", daysOfWeek: [2, 4] }; // Tue, Thu
    // Nov 4 (Tue) and Nov 6 (Thu) done; unscheduled days are ignored.
    const checkins = [c(2025, 11, 4), c(2025, 11, 6)];
    const result = calculateCurrentStreak(checkins, schedule, 0, NOW);
    expect(result.streak).toBe(2);
  });

  it("spends a freeze only when a scheduled day was missed", () => {
    const schedule: Schedule = { mode: "specific_days", daysOfWeek: [2, 4] };
    // History: Oct 30 (Thu) done; Nov 4 (Tue) missed, Nov 6 (Thu) done.
    const checkins = [c(2025, 10, 30), c(2025, 11, 6)];
    const result = calculateCurrentStreak(checkins, schedule, 1, NOW);
    // Nov 4 frozen keeps the run alive but does not grow it. No other
    // scheduled day (Tue/Thu) was missed in between.
    expect(result.streak).toBe(2);
    expect(result.freezesUsed).toBe(1);
    expect(result.freezesRemaining).toBe(0);
  });
});

describe("calculateLongestStreak", () => {
  it("finds the longest historical run across gaps", () => {
    // Runs of 3 (Nov 1..3) and 4 (Nov 5..8).
    const checkins = [
      c(2025, 11, 1),
      c(2025, 11, 2),
      c(2025, 11, 3),
      c(2025, 11, 5),
      c(2025, 11, 6),
      c(2025, 11, 7),
      c(2025, 11, 8),
    ];
    expect(calculateLongestStreak(checkins, DAILY)).toBe(4);
  });

  it("returns 0 for an empty history", () => {
    expect(calculateLongestStreak([], DAILY)).toBe(0);
  });

  it("skips unscheduled days for specific_days", () => {
    const schedule: Schedule = { mode: "specific_days", daysOfWeek: [2] }; // Tuesdays
    const checkins = [c(2025, 10, 28), c(2025, 11, 4), c(2025, 11, 11)];
    expect(calculateLongestStreak(checkins, schedule)).toBe(3);
  });
});

describe("getCompletionRate", () => {
  it("computes the share of completed scheduled days", () => {
    // Nov 3..7: 5 scheduled days, 3 completed.
    const checkins = [c(2025, 11, 3), c(2025, 11, 5), c(2025, 11, 7)];
    const rate = getCompletionRate(
      checkins,
      DAILY,
      new Date(2025, 10, 3),
      new Date(2025, 10, 7)
    );
    expect(rate).toBeCloseTo(3 / 5);
  });

  it("returns 0 for an empty range or nothing scheduled", () => {
    expect(
      getCompletionRate([], DAILY, new Date(2025, 10, 3), new Date(2025, 10, 7))
    ).toBe(0);
  });

  it("ignores check-ins outside the range", () => {
    const checkins = [c(2025, 10, 1), c(2025, 11, 3)];
    const rate = getCompletionRate(
      checkins,
      DAILY,
      new Date(2025, 10, 3),
      new Date(2025, 10, 4)
    );
    expect(rate).toBeCloseTo(1 / 2);
  });
});

describe("getDayOfWeekPatterns", () => {
  it("aggregates completion per weekday", () => {
    // Nov 5 .. Nov 13: two Wednesdays (Nov 5, 12) — 1 done; two Thursdays (Nov 6, 13) — 2 done.
    const checkins = [c(2025, 11, 5), c(2025, 11, 6), c(2025, 11, 13)];
    const patterns = getDayOfWeekPatterns(
      checkins,
      DAILY,
      new Date(2025, 10, 5),
      new Date(2025, 10, 13)
    );
    const wednesday = patterns.find((p) => p.dayOfWeek === 3);
    const thursday = patterns.find((p) => p.dayOfWeek === 4);
    const monday = patterns.find((p) => p.dayOfWeek === 1);
    expect(wednesday?.completionRate).toBeCloseTo(0.5);
    expect(thursday?.completionRate).toBeCloseTo(1);
    expect(monday?.completionRate).toBe(0);
  });

  it("always returns seven entries", () => {
    const patterns = getDayOfWeekPatterns(
      [],
      DAILY,
      new Date(2025, 10, 5),
      new Date(2025, 10, 7)
    );
    expect(patterns).toHaveLength(7);
  });
});
