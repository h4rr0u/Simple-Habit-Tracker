import { describe, expect, it } from "vitest";

import type { Checkin, Habit } from "@/db/schema";
import type { Schedule } from "@/types/schedule";
import {
  buildDayContributions,
  buildHabitHistory,
  buildWeekdaySeries,
  buildYearCells,
  computeRecords,
  getAverageRate,
} from "./analytics";

/** Monday, 3 November 2025. */
const FROM = new Date(2025, 10, 3);
/** Wednesday, 5 November 2025. */
const TO = new Date(2025, 10, 5);

/** Builds a Habit with defaults for analytics tests. */
function habit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 1,
    name: "Test",
    description: null,
    type: "binary",
    color: "#3b82f6",
    icon: null,
    schedule: { mode: "daily" },
    targetValue: null,
    unit: null,
    category: null,
    tags: [],
    positionX: 0,
    positionY: 0,
    freezeBank: 0,
    createdAt: new Date(2020, 0, 1),
    archivedAt: null,
    ...overrides,
  };
}

/** Builds a check-in row with defaults. */
function checkin(overrides: Partial<Checkin> = {}): Checkin {
  return {
    id: 1,
    habitId: 1,
    date: "2025-11-03",
    value: null,
    note: null,
    createdAt: new Date(2025, 10, 3),
    ...overrides,
  };
}

function key(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

describe("buildHabitHistory", () => {
  it("keeps all check-ins for presence-based habits", () => {
    const history = buildHabitHistory(habit(), [checkin({ value: null })]);
    expect(history.effective).toHaveLength(1);
  });

  it("drops check-ins below the target for quantitative habits", () => {
    const quantitative = habit({ type: "quantitative", targetValue: 30 });
    const rows = [checkin({ value: 10 }), checkin({ date: key(2025, 11, 4), value: 30 })];
    expect(buildHabitHistory(quantitative, rows).effective.map((c) => c.date)).toEqual([
      key(2025, 11, 4),
    ]);
  });
});

describe("buildDayContributions", () => {
  it("counts scheduled and completed days for a daily habit", () => {
    const history = buildHabitHistory(habit(), [
      checkin(),
      checkin({ date: key(2025, 11, 4) }),
    ]);
    const days = buildDayContributions([history], FROM, TO);
    expect(days.map((d) => d.scheduled)).toEqual([1, 1, 1]);
    expect(days.map((d) => d.completed)).toEqual([1, 1, 0]);
  });

  it("ignores days outside specific_days schedules", () => {
    const monWed: Schedule = { mode: "specific_days", daysOfWeek: [1, 3] };
    const history = buildHabitHistory(habit({ schedule: monWed }), [checkin()]);
    const days = buildDayContributions([history], FROM, TO);
    // Mon 3 scheduled+done, Tue 4 idle, Wed 5 scheduled & missed.
    expect(days.map((d) => d.scheduled)).toEqual([1, 0, 1]);
    expect(days.map((d) => d.completed)).toEqual([1, 0, 0]);
  });

  it("treats a weekly habit as quota/7 scheduled units per day", () => {
    const twiceAWeek: Schedule = { mode: "weekly", timesPerWeek: 2 };
    const rows = [checkin(), checkin({ date: key(2025, 11, 4) }), checkin({ date: key(2025, 11, 5) })];
    const history = buildHabitHistory(habit({ schedule: twiceAWeek }), rows);
    const days = buildDayContributions([history], FROM, TO);
    // Every day is scheduled 2/7; the first two check-ins earn a unit each,
    // the third is above quota and earns nothing.
    expect(days.map((d) => d.scheduled)).toEqual([2 / 7, 2 / 7, 2 / 7]);
    expect(days.map((d) => d.completed)).toEqual([1, 1, 0]);
  });

  it("returns zeros when no habits are given", () => {
    const days = buildDayContributions([], FROM, TO);
    expect(days.map((d) => d.scheduled)).toEqual([0, 0, 0]);
  });
});

describe("buildWeekdaySeries", () => {
  it("returns Monday-first weekday order", () => {
    const series = buildWeekdaySeries(buildDayContributions([], FROM, TO));
    expect(series.map((p) => p.dayOfWeek)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it("aggregates several habits per weekday", () => {
    const a = buildHabitHistory(habit({ id: 1 }), [checkin()]);
    const b = buildHabitHistory(habit({ id: 2 }), []);
    const series = buildWeekdaySeries(buildDayContributions([a, b], FROM, TO));
    // Monday: both scheduled, one done. Tuesday/Wednesday: both scheduled, none done.
    expect(series[0]).toEqual({ dayOfWeek: 1, rate: 0.5 });
    expect(series[1]).toEqual({ dayOfWeek: 2, rate: 0 });
  });
});

describe("getAverageRate", () => {
  it("averages completed over scheduled units", () => {
    const history = buildHabitHistory(habit(), [checkin()]);
    expect(getAverageRate(buildDayContributions([history], FROM, TO))).toBeCloseTo(1 / 3);
  });

  it("returns 0 when nothing is scheduled", () => {
    expect(getAverageRate(buildDayContributions([], FROM, TO))).toBe(0);
  });
});

describe("computeRecords", () => {
  it("picks the longest streak and the most stable / problematic habits", () => {
    const strong = buildHabitHistory(habit({ id: 1, name: "Strong" }), [
      checkin({ habitId: 1 }),
      checkin({ habitId: 1, date: key(2025, 11, 4) }),
      checkin({ habitId: 1, date: key(2025, 11, 5) }),
    ]);
    const weak = buildHabitHistory(habit({ id: 2, name: "Weak" }), []);

    const records = computeRecords([strong, weak], FROM, TO);
    expect(records.mostStable?.habitId).toBe(1);
    expect(records.mostProblematic?.habitId).toBe(2);
    expect(records.longestStreak?.habitId).toBe(1);
  });

  it("excludes habits without scheduled days from rate records", () => {
    const idle = habit({ schedule: { mode: "specific_days", daysOfWeek: [0] } });
    const history = buildHabitHistory(idle, []);
    const records = computeRecords([history], FROM, TO);
    expect(records.mostStable).toBeNull();
    expect(records.mostProblematic).toBeNull();
  });

  it("returns null records for an empty habit list", () => {
    expect(computeRecords([], FROM, TO)).toEqual({
      longestStreak: null,
      mostStable: null,
      mostProblematic: null,
    });
  });
});

describe("buildYearCells", () => {
  it("marks days before the habit existed as -1", () => {
    const recent = habit({ createdAt: new Date(2025, 10, 4) });
    const history = buildHabitHistory(recent, [checkin({ date: key(2025, 11, 4) })]);
    const cells = buildYearCells([history], FROM, TO);
    expect(cells.map((c) => c.rate)).toEqual([-1, 1, 0]);
  });

  it("reports 0 for days after creation with nothing scheduled", () => {
    const idle = habit({ schedule: { mode: "specific_days", daysOfWeek: [0] } });
    const history = buildHabitHistory(idle, []);
    const cells = buildYearCells([history], FROM, TO);
    expect(cells.map((c) => c.rate)).toEqual([0, 0, 0]);
  });
});
