import { describe, expect, it } from "vitest";

import type { Habit } from "@/db/schema";
import { checkinTogglePlan } from "./habit-ui";

/** Builds a Habit with defaults for habit-ui tests. */
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

describe("checkinTogglePlan", () => {
  it("toggles presence for binary habits", () => {
    expect(checkinTogglePlan(habit({ type: "binary" }), false)).toEqual({ mode: "toggle" });
    expect(checkinTogglePlan(habit({ type: "binary" }), true)).toEqual({ mode: "toggle" });
  });

  it("toggles presence for negative habits", () => {
    expect(checkinTogglePlan(habit({ type: "negative" }), false)).toEqual({ mode: "toggle" });
  });

  it("toggles presence for quantitative habits without a target", () => {
    const h = habit({ type: "quantitative", targetValue: null });
    expect(checkinTogglePlan(h, false)).toEqual({ mode: "toggle" });
    expect(checkinTogglePlan(h, true)).toEqual({ mode: "toggle" });
  });

  it("records the target value when marking an incomplete targeted habit done", () => {
    const h = habit({ type: "timed", targetValue: 30 });
    expect(checkinTogglePlan(h, false)).toEqual({ mode: "value", value: 30 });
  });

  it("records the target value for targeted quantitative habits too", () => {
    const h = habit({ type: "quantitative", targetValue: 10 });
    expect(checkinTogglePlan(h, false)).toEqual({ mode: "value", value: 10 });
  });

  it("clears the check-in when un-checking a completed targeted habit", () => {
    const h = habit({ type: "timed", targetValue: 30 });
    expect(checkinTogglePlan(h, true)).toEqual({ mode: "value", value: null });
  });
});
