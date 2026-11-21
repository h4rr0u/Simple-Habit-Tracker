import { describe, expect, it } from "vitest";

import type { Checkin } from "@/db/schema";
import { computeCorrelations, type CorrelationHabit } from "./correlations";

/** 1 November 2025 — start of the test window. */
const FROM = new Date(2025, 10, 1);
/** 14 November 2025 — end of the default two-week window. */
const TO = new Date(2025, 10, 14);
/** 20 November 2025 — wider window for the weak-correlation case. */
const TO_WIDE = new Date(2025, 10, 20);

/** Builds a habit with defaults for correlation tests. */
function habit(
  id: number,
  name: string,
  overrides: Partial<CorrelationHabit> = {}
): CorrelationHabit {
  return {
    id,
    name,
    type: "binary",
    createdAt: new Date(2020, 0, 1),
    ...overrides,
  };
}

/** ISO day key for a November 2025 day. */
function key(day: number): string {
  return `2025-11-${String(day).padStart(2, "0")}`;
}

/** Builds a check-in row with defaults. */
function checkin(
  habitId: number,
  day: number,
  value: number | null = null
): Pick<Checkin, "habitId" | "date" | "value"> {
  return { habitId, date: key(day), value };
}

describe("computeCorrelations", () => {
  it("returns an empty result when there are no check-ins", () => {
    const result = computeCorrelations([habit(1, "A"), habit(2, "B")], [], {
      from: FROM,
      to: TO,
    });

    expect(result).toEqual({
      positive: [],
      negative: [],
      trackedDays: 0,
      hasEnoughData: false,
    });
  });

  it("needs at least two habits", () => {
    const rows = Array.from({ length: 10 }, (_, index) =>
      checkin(1, index + 1)
    );

    const result = computeCorrelations([habit(1, "A")], rows, {
      from: FROM,
      to: TO,
    });

    expect(result.hasEnoughData).toBe(false);
    expect(result.positive).toEqual([]);
    expect(result.negative).toEqual([]);
  });

  it("reports insufficient data before a week of tracking", () => {
    const rows = [checkin(1, 1), checkin(2, 1), checkin(1, 2)];

    const result = computeCorrelations([habit(1, "A"), habit(2, "B")], rows, {
      from: FROM,
      to: TO,
    });

    expect(result.trackedDays).toBe(2);
    expect(result.hasEnoughData).toBe(false);
    expect(result.positive).toEqual([]);
    expect(result.negative).toEqual([]);
  });

  it("finds a perfect positive correlation", () => {
    const rows = [];
    for (let day = 1; day <= 7; day++) {
      rows.push(checkin(1, day), checkin(2, day));
    }

    const result = computeCorrelations([habit(1, "A"), habit(2, "B")], rows, {
      from: FROM,
      to: TO,
    });

    expect(result.trackedDays).toBe(7);
    expect(result.hasEnoughData).toBe(true);
    expect(result.positive).toHaveLength(1);
    expect(result.negative).toEqual([]);

    const pair = result.positive[0];
    expect(pair.habitA).toEqual({ id: 1, name: "A" });
    expect(pair.habitB).toEqual({ id: 2, name: "B" });
    expect(pair.pBGivenA).toBe(1);
    expect(pair.pBGivenNotA).toBe(0);
    expect(pair.delta).toBeCloseTo(1);
    expect(pair.support).toBe(7);
  });

  it("finds a perfect negative correlation", () => {
    const rows = [];
    for (let day = 1; day <= 7; day++) rows.push(checkin(1, day));
    for (let day = 8; day <= 14; day++) rows.push(checkin(2, day));

    const result = computeCorrelations([habit(1, "A"), habit(2, "B")], rows, {
      from: FROM,
      to: TO,
    });

    expect(result.trackedDays).toBe(14);
    expect(result.hasEnoughData).toBe(true);
    expect(result.negative).toHaveLength(1);
    expect(result.positive).toEqual([]);

    const pair = result.negative[0];
    expect(pair.pBGivenA).toBe(0);
    expect(pair.pBGivenNotA).toBe(1);
    expect(pair.delta).toBeCloseTo(-1);
  });

  it("ignores quantitative check-ins with a zero value", () => {
    const rows = [];
    for (let day = 1; day <= 7; day++) {
      rows.push(checkin(1, day, 10), checkin(2, day));
    }
    for (let day = 8; day <= 14; day++) rows.push(checkin(1, day, 0));

    const result = computeCorrelations(
      [habit(1, "A", { type: "quantitative" }), habit(2, "B")],
      rows,
      { from: FROM, to: TO }
    );

    expect(result.hasEnoughData).toBe(true);
    expect(result.positive).toHaveLength(1);
    expect(result.positive[0].pBGivenA).toBe(1);
    expect(result.positive[0].pBGivenNotA).toBe(0);
  });

  it("does not report weak correlations below the threshold", () => {
    const rows = [];
    for (let day = 1; day <= 10; day++) rows.push(checkin(1, day));
    for (let day = 1; day <= 6; day++) rows.push(checkin(2, day));
    for (let day = 11; day <= 15; day++) rows.push(checkin(2, day));

    const result = computeCorrelations([habit(1, "A"), habit(2, "B")], rows, {
      from: FROM,
      to: TO_WIDE,
    });

    // P(B|A) = 0.6, P(B|~A) = 0.5 → delta 0.1, below the 0.15 threshold.
    expect(result.hasEnoughData).toBe(true);
    expect(result.positive).toEqual([]);
    expect(result.negative).toEqual([]);
  });

  it("inverts negative habits: a check-in is a slip", () => {
    const rows = [];
    for (let day = 1; day <= 7; day++) rows.push(checkin(1, day));
    for (let day = 8; day <= 14; day++) rows.push(checkin(2, day));

    const result = computeCorrelations(
      [habit(1, "A", { type: "negative" }), habit(2, "B")],
      rows,
      { from: FROM, to: TO }
    );

    expect(result.positive).toHaveLength(1);
    expect(result.positive[0].pBGivenA).toBe(1);
    expect(result.positive[0].pBGivenNotA).toBe(0);
  });

  it("returns at most three correlations per direction", () => {
    const habits = [1, 2, 3, 4, 5].map((id) => habit(id, `H${id}`));
    const rows = [];
    for (let day = 1; day <= 7; day++) {
      for (const item of habits) rows.push(checkin(item.id, day));
    }

    const result = computeCorrelations(habits, rows, { from: FROM, to: TO });

    expect(result.positive).toHaveLength(3);
  });
});
