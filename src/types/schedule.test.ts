import { describe, expect, it } from "vitest";

import { isHabitDueOn, type Schedule } from "./schedule";

/** Wednesday, 5 November 2025. Weekday index: 3. */
const WEDNESDAY = new Date(2025, 10, 5);
/** Sunday, 9 November 2025. Weekday index: 0. */
const SUNDAY = new Date(2025, 10, 9);

/** Anchor for `flexible` schedules: Monday, 2025-11-03. */
const ANCHOR = new Date(2025, 10, 3);

describe("isHabitDueOn", () => {
  it("daily: is due on any day", () => {
    const schedule: Schedule = { mode: "daily" };
    expect(isHabitDueOn(schedule, WEDNESDAY)).toBe(true);
    expect(isHabitDueOn(schedule, SUNDAY)).toBe(true);
  });

  it("specific_days: due only on configured weekdays", () => {
    const schedule: Schedule = { mode: "specific_days", daysOfWeek: [1, 3, 5] };
    expect(isHabitDueOn(schedule, WEDNESDAY)).toBe(true); // Wednesday (3)
    expect(isHabitDueOn(schedule, SUNDAY)).toBe(false); // Sunday (0)
  });

  it("specific_days: returns false when daysOfWeek is missing", () => {
    const schedule: Schedule = { mode: "specific_days" };
    expect(isHabitDueOn(schedule, WEDNESDAY)).toBe(false);
  });

  it("weekly: due on any day while the weekly quota is positive", () => {
    const schedule: Schedule = { mode: "weekly", timesPerWeek: 3 };
    expect(isHabitDueOn(schedule, WEDNESDAY)).toBe(true);
    expect(isHabitDueOn(schedule, SUNDAY)).toBe(true);
  });

  it("weekly: not due when the quota is zero", () => {
    const schedule: Schedule = { mode: "weekly", timesPerWeek: 0 };
    expect(isHabitDueOn(schedule, WEDNESDAY)).toBe(false);
  });

  it("flexible: due every N days counted from the anchor", () => {
    const schedule: Schedule = { mode: "flexible", intervalDays: 3 };
    expect(isHabitDueOn(schedule, ANCHOR, ANCHOR)).toBe(true); // day 0
    expect(isHabitDueOn(schedule, new Date(2025, 10, 6), ANCHOR)).toBe(true); // day 3
    expect(isHabitDueOn(schedule, new Date(2025, 10, 7), ANCHOR)).toBe(false); // day 4
  });

  it("flexible: returns false when intervalDays is missing or invalid", () => {
    expect(isHabitDueOn({ mode: "flexible" }, WEDNESDAY, ANCHOR)).toBe(false);
    expect(
      isHabitDueOn({ mode: "flexible", intervalDays: 0 }, WEDNESDAY, ANCHOR)
    ).toBe(false);
  });

  it("is deterministic regardless of time-of-day components", () => {
    const schedule: Schedule = { mode: "specific_days", daysOfWeek: [3] };
    const morning = new Date(2025, 10, 5, 8, 0, 0);
    const evening = new Date(2025, 10, 5, 23, 59, 59);
    expect(isHabitDueOn(schedule, morning)).toBe(true);
    expect(isHabitDueOn(schedule, evening)).toBe(true);
  });
});
