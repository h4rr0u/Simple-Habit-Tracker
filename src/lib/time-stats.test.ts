import { describe, expect, it } from "vitest";

import {
  computeTimePatternStats,
  getDayOfWeekStats,
  getPeriodForHour,
  getTimeOfDayStats,
  type TimeStatsCheckin,
} from "./time-stats";

/** Builds a successful check-in with sensible defaults (Monday, 09:00). */
function checkin(
  overrides: Partial<TimeStatsCheckin> = {}
): TimeStatsCheckin {
  return {
    date: "2025-11-17",
    value: null,
    createdAt: new Date(2025, 10, 17, 9, 0),
    ...overrides,
  };
}

/** Returns the period that received the only check-in of the sample. */
function periodAt(hours: number, minutes = 0) {
  const stats = getTimeOfDayStats([
    checkin({ createdAt: new Date(2025, 10, 17, hours, minutes) }),
  ]);
  return stats.find((stat) => stat.count === 1)?.period;
}

describe("getPeriodForHour", () => {
  it("maps the hour boundaries to the right period", () => {
    expect(getPeriodForHour(0)).toBe("night");
    expect(getPeriodForHour(4)).toBe("night");
    expect(getPeriodForHour(5)).toBe("morning");
    expect(getPeriodForHour(11)).toBe("morning");
    expect(getPeriodForHour(12)).toBe("afternoon");
    expect(getPeriodForHour(16)).toBe("afternoon");
    expect(getPeriodForHour(17)).toBe("evening");
    expect(getPeriodForHour(21)).toBe("evening");
    expect(getPeriodForHour(22)).toBe("night");
    expect(getPeriodForHour(23)).toBe("night");
  });
});

describe("getTimeOfDayStats", () => {
  it("keeps the exact minute boundaries requested by the UI", () => {
    expect(periodAt(4, 59)).toBe("night");
    expect(periodAt(5, 0)).toBe("morning");
    expect(periodAt(11, 59)).toBe("morning");
    expect(periodAt(12, 0)).toBe("afternoon");
    expect(periodAt(16, 59)).toBe("afternoon");
    expect(periodAt(17, 0)).toBe("evening");
    expect(periodAt(21, 59)).toBe("evening");
    expect(periodAt(22, 0)).toBe("night");
    expect(periodAt(23, 59)).toBe("night");
  });

  it("always returns four periods in display order", () => {
    const stats = getTimeOfDayStats([]);

    expect(stats.map((stat) => stat.period)).toEqual([
      "morning",
      "afternoon",
      "evening",
      "night",
    ]);
    expect(stats.every((stat) => stat.count === 0)).toBe(true);
    expect(stats.every((stat) => stat.percentage === 0)).toBe(true);
  });

  it("counts only successful check-ins", () => {
    const stats = getTimeOfDayStats([
      checkin({ value: null, createdAt: new Date(2025, 10, 17, 9, 0) }),
      checkin({ value: 5, createdAt: new Date(2025, 10, 17, 13, 0) }),
      checkin({ value: 0, createdAt: new Date(2025, 10, 17, 18, 0) }),
    ]);

    expect(stats.find((stat) => stat.period === "morning")?.count).toBe(1);
    expect(stats.find((stat) => stat.period === "afternoon")?.count).toBe(1);
    expect(stats.find((stat) => stat.period === "evening")?.count).toBe(0);
    expect(stats.find((stat) => stat.period === "night")?.count).toBe(0);
  });

  it("computes percentages from the successful total", () => {
    const stats = getTimeOfDayStats([
      checkin({ createdAt: new Date(2025, 10, 17, 9, 0) }),
      checkin({ createdAt: new Date(2025, 10, 17, 10, 0) }),
      checkin({ createdAt: new Date(2025, 10, 17, 13, 0) }),
      checkin({ createdAt: new Date(2025, 10, 17, 23, 0) }),
    ]);

    expect(stats.find((stat) => stat.period === "morning")?.percentage).toBe(50);
    expect(stats.find((stat) => stat.period === "afternoon")?.percentage).toBe(25);
    expect(stats.find((stat) => stat.period === "evening")?.percentage).toBe(0);
    expect(stats.find((stat) => stat.period === "night")?.percentage).toBe(25);
  });
});

describe("getDayOfWeekStats", () => {
  it("groups successful check-ins Monday-first by ISO weekday", () => {
    const stats = getDayOfWeekStats([
      checkin({ date: "2025-11-17" }), // Monday
      checkin({ date: "2025-11-17" }), // Monday
      checkin({ date: "2025-11-23" }), // Sunday
      checkin({ date: "2025-11-19", value: 0 }), // Wednesday, ignored
    ]);

    expect(stats).toHaveLength(7);
    expect(stats.map((stat) => stat.dayIndex)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(stats[0]).toEqual({ dayIndex: 1, count: 2, percentage: 66.7 });
    expect(stats[6]).toEqual({ dayIndex: 7, count: 1, percentage: 33.3 });
    expect(stats[2].count).toBe(0);
  });

  it("returns zeroed stats for an empty sample", () => {
    const stats = getDayOfWeekStats([]);

    expect(stats).toHaveLength(7);
    expect(stats.every((stat) => stat.count === 0)).toBe(true);
    expect(stats.every((stat) => stat.percentage === 0)).toBe(true);
  });

  it("ignores rows with an invalid date key", () => {
    const stats = getDayOfWeekStats([checkin({ date: "not-a-date" })]);

    expect(stats.every((stat) => stat.count === 0)).toBe(true);
  });
});

describe("computeTimePatternStats", () => {
  it("returns both breakdowns and the total sample size", () => {
    const result = computeTimePatternStats([
      checkin({ date: "2025-11-17", createdAt: new Date(2025, 10, 17, 9, 0) }),
      checkin({ date: "2025-11-18", createdAt: new Date(2025, 10, 18, 20, 0) }),
      checkin({ date: "2025-11-18", value: 0 }),
    ]);

    expect(result.total).toBe(2);
    expect(result.dayOfWeek[0].count).toBe(1);
    expect(result.dayOfWeek[1].count).toBe(1);
    expect(result.timeOfDay.find((stat) => stat.period === "morning")?.count).toBe(1);
    expect(result.timeOfDay.find((stat) => stat.period === "evening")?.count).toBe(1);
  });
});
