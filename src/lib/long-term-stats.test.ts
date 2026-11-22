import { describe, expect, it } from "vitest";

import {
  buildLongTermStats,
  LONG_TERM_MONTHS,
  MIN_MONTHS_FOR_LONG_TERM,
  type LongTermHabit,
  type MonthlyCompletionRow,
} from "./long-term-stats";

/** Builds a habit with sensible defaults (binary, daily, created 2024-01-01). */
function habit(overrides: Partial<LongTermHabit> = {}): LongTermHabit {
  return {
    id: 1,
    type: "binary",
    schedule: { mode: "daily" },
    createdAt: new Date(2024, 0, 1),
    ...overrides,
  };
}

/** Builds one aggregated habit-month row. */
function row(
  month: string,
  completed: number,
  checkins = completed,
  habitId = 1
): MonthlyCompletionRow {
  return { habitId, month, completed, checkins };
}

describe("LONG_TERM_MONTHS", () => {
  it("maps the selectable periods to their month counts", () => {
    expect(LONG_TERM_MONTHS).toEqual({ "12": 12, "36": 36, "60": 60 });
  });
});

describe("buildLongTermStats", () => {
  it("computes monthly rates from creation date up to today", () => {
    const stats = buildLongTermStats(
      [habit({ createdAt: new Date(2024, 0, 15) })],
      [row("2024-01", 10), row("2024-02", 20), row("2024-03", 5)],
      "12",
      new Date(2024, 2, 10)
    );

    expect(stats.hasData).toBe(true);
    expect(stats.points.map((point) => point.month)).toEqual([
      "2024-01",
      "2024-02",
      "2024-03",
    ]);
    // Jan 15–31 = 17 days, Feb (leap) = 29, Mar 1–10 = 10.
    expect(stats.points[0].completionRate).toBeCloseTo(10 / 17, 5);
    expect(stats.points[1].completionRate).toBeCloseTo(20 / 29, 5);
    expect(stats.points[2].completionRate).toBeCloseTo(5 / 10, 5);
  });

  it("drops months before the first habit existed", () => {
    const stats = buildLongTermStats(
      [habit({ createdAt: new Date(2023, 11, 1) })],
      [row("2023-12", 20), row("2024-01", 10), row("2024-02", 5)],
      "12",
      new Date(2024, 1, 15)
    );

    expect(stats.points.map((point) => point.month)).toEqual([
      "2023-12",
      "2024-01",
      "2024-02",
    ]);
  });

  it("does not pad a long window with leading zero months", () => {
    const stats = buildLongTermStats(
      [habit({ createdAt: new Date(2023, 11, 1) })],
      [row("2023-12", 10), row("2024-01", 10), row("2024-02", 10)],
      "60",
      new Date(2024, 1, 15)
    );

    expect(stats.points).toHaveLength(3);
  });

  it("reports too little data for a single populated month", () => {
    const stats = buildLongTermStats(
      [habit({ createdAt: new Date(2024, 1, 1) })],
      [],
      "12",
      new Date(2024, 1, 10)
    );

    expect(stats.points).toHaveLength(1);
    expect(stats.hasData).toBe(false);
    expect(stats.points.length).toBeLessThan(MIN_MONTHS_FOR_LONG_TERM);
  });

  it("returns an empty series when there are no habits", () => {
    const stats = buildLongTermStats([], [], "12", new Date(2024, 2, 10));

    expect(stats.points).toEqual([]);
    expect(stats.hasData).toBe(false);
  });

  it("counts only the configured weekdays for specific_days schedules", () => {
    const stats = buildLongTermStats(
      [
        habit({
          schedule: { mode: "specific_days", daysOfWeek: [1, 3, 5] },
        }),
      ],
      [row("2024-01", 7)],
      "12",
      new Date(2024, 0, 31)
    );

    // January 2024: 5 Mondays + 5 Wednesdays + 4 Fridays = 14 scheduled days.
    expect(stats.points[0].completionRate).toBeCloseTo(7 / 14, 5);
  });

  it("uses fractional scheduled units for weekly quotas", () => {
    const stats = buildLongTermStats(
      [habit({ schedule: { mode: "weekly", timesPerWeek: 3 } })],
      [row("2024-01", 10)],
      "12",
      new Date(2024, 0, 31)
    );

    // 31 days × 3/7 ≈ 13.29 scheduled units; 10 completed → 70/93.
    expect(stats.points[0].completionRate).toBeCloseTo(70 / 93, 5);
  });

  it("treats negative-habit check-ins as slips", () => {
    const stats = buildLongTermStats(
      [habit({ type: "negative" })],
      [{ habitId: 1, month: "2024-01", completed: 0, checkins: 4 }],
      "12",
      new Date(2024, 0, 31)
    );

    // 31 scheduled days − 4 slips = 27 clean days.
    expect(stats.points[0].completionRate).toBeCloseTo(27 / 31, 5);
  });

  it("clamps the rate to 100% when check-ins exceed the schedule", () => {
    const stats = buildLongTermStats(
      [habit()],
      [row("2024-01", 40, 40)],
      "12",
      new Date(2024, 0, 31)
    );

    expect(stats.points[0].completionRate).toBe(1);
  });

  it("ignores rows for months outside the window and for other habits", () => {
    const stats = buildLongTermStats(
      [habit({ id: 1 }), habit({ id: 2 })],
      [
        row("2024-01", 10, 10, 1),
        row("2023-01", 10, 10, 1),
        row("2024-01", 10, 10, 2),
        row("2024-01", 10, 10, 99),
      ],
      "12",
      new Date(2024, 0, 31)
    );

    // Two habits × 31 days = 62 scheduled; 20 completed (habit 99 is ignored).
    expect(stats.points[0].completionRate).toBeCloseTo(20 / 62, 5);
  });
});
