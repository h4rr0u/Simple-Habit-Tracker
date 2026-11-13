import { describe, expect, it } from "vitest";

import type { Habit } from "@/db/schema";
import { meetsHabitTarget, targetUnits } from "./habit-target";

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
