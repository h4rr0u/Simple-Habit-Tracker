import { describe, expect, it } from "vitest";

import type { Checkin, Habit } from "@/db/schema";
import {
  buildCompletionCheckins,
  isHabitDayComplete,
  isHabitDueOnDate,
  meetsHabitTarget,
  targetUnits,
} from "./habit-target";

/** Builds a Habit with defaults for habit-target tests. */
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
    freezeBank: 0,
    createdAt: new Date(2020, 0, 1),
    archivedAt: null,
    ...overrides,
  };
}

/** Builds a Checkin with defaults for habit-target tests. */
function checkin(date: string, value: number | null = null): Checkin {
  return {
    id: 1,
    habitId: 1,
    date,
    value,
    note: null,
    createdAt: new Date(2020, 0, 1),
  };
}

describe("targetUnits", () => {
  it("returns null for habits without a target", () => {
    expect(targetUnits(habit({ type: "binary" }))).toBeNull();
    expect(targetUnits(habit({ type: "quantitative", targetValue: null }))).toBeNull();
    expect(targetUnits(habit({ type: "timed", targetValue: null }))).toBeNull();
  });

  it("keeps quantitative targets as-is (stored in units)", () => {
    expect(targetUnits(habit({ type: "quantitative", targetValue: 8 }))).toBe(8);
  });

  it("converts timed targets from minutes to stored seconds", () => {
    expect(targetUnits(habit({ type: "timed", targetValue: 30 }))).toBe(1800);
  });
});

describe("meetsHabitTarget", () => {
  it("treats any check-in as done for presence-based habits", () => {
    expect(meetsHabitTarget(habit({ type: "binary" }), null)).toBe(true);
    expect(meetsHabitTarget(habit({ type: "negative" }), null)).toBe(true);
  });

  it("treats presence as done for untargeted quantitative/timed habits", () => {
    expect(meetsHabitTarget(habit({ type: "quantitative" }), null)).toBe(true);
    expect(meetsHabitTarget(habit({ type: "timed" }), null)).toBe(true);
  });

  it("compares quantitative values against the unit target", () => {
    const h = habit({ type: "quantitative", targetValue: 8 });
    expect(meetsHabitTarget(h, 3)).toBe(false);
    expect(meetsHabitTarget(h, 8)).toBe(true);
    expect(meetsHabitTarget(h, null)).toBe(false);
  });

  it("compares timed values in seconds against the minute target", () => {
    const h = habit({ type: "timed", targetValue: 30 });
    expect(meetsHabitTarget(h, 600)).toBe(false);
    expect(meetsHabitTarget(h, 1800)).toBe(true);
    expect(meetsHabitTarget(h, null)).toBe(false);
  });
});

describe("isHabitDayComplete", () => {
  it("requires a check-in for binary habits", () => {
    const h = habit({ type: "binary" });
    expect(isHabitDayComplete(h, null)).toBe(false);
    expect(isHabitDayComplete(h, checkin("2020-01-01"))).toBe(true);
  });

  it("inverts negative habits: a clean day is complete, a slip is not", () => {
    const h = habit({ type: "negative" });
    expect(isHabitDayComplete(h, null)).toBe(true);
    expect(isHabitDayComplete(h, checkin("2020-01-01"))).toBe(false);
  });

  it("compares quantitative and timed values against the target", () => {
    const quant = habit({ type: "quantitative", targetValue: 8 });
    expect(isHabitDayComplete(quant, checkin("2020-01-01", 3))).toBe(false);
    expect(isHabitDayComplete(quant, checkin("2020-01-01", 8))).toBe(true);

    const timed = habit({ type: "timed", targetValue: 30 });
    expect(isHabitDayComplete(timed, checkin("2020-01-01", 600))).toBe(false);
    expect(isHabitDayComplete(timed, checkin("2020-01-01", 1800))).toBe(true);
  });
});

describe("buildCompletionCheckins", () => {
  it("filters positive habits by their target", () => {
    const h = habit({ type: "quantitative", targetValue: 8 });
    const rows = [
      checkin("2020-01-01", 3),
      checkin("2020-01-02", 8),
      checkin("2020-01-03", 12),
    ];
    expect(
      buildCompletionCheckins(h, rows, new Date(2020, 0, 3)).map((row) => row.date)
    ).toEqual(["2020-01-02", "2020-01-03"]);
  });

  it("turns clean scheduled days into completions for negative habits", () => {
    const h = habit({ type: "negative", createdAt: new Date(2020, 0, 1) });
    const rows = [checkin("2020-01-02")];
    expect(
      buildCompletionCheckins(h, rows, new Date(2020, 0, 3)).map((row) => row.date)
    ).toEqual(["2020-01-01", "2020-01-03"]);
  });

  it("caps weekly negative completions at the weekly quota", () => {
    const h = habit({
      type: "negative",
      schedule: { mode: "weekly", timesPerWeek: 2 },
      createdAt: new Date(2020, 0, 1),
    });
    const completion = buildCompletionCheckins(h, [], new Date(2020, 0, 7));
    expect(completion).toHaveLength(4);
  });
});

describe("isHabitDueOnDate", () => {
  it("anchors flexible schedules to the creation day", () => {
    const h = habit({
      schedule: { mode: "flexible", intervalDays: 3 },
      createdAt: new Date(2020, 0, 2),
    });
    expect(isHabitDueOnDate(h, new Date(2020, 0, 2))).toBe(true);
    expect(isHabitDueOnDate(h, new Date(2020, 0, 3))).toBe(false);
    expect(isHabitDueOnDate(h, new Date(2020, 0, 5))).toBe(true);
  });
});
