import { describe, expect, it } from "vitest";

import { accrueFreezesSince, type FreezableHabit } from "./freeze";

describe("accrueFreezesSince", () => {
  const habit = (freezeBank: number, createdAt: Date): FreezableHabit => ({
    freezeBank,
    createdAt,
  });

  it("grants the first elapsed month boundary and records it", () => {
    const result = accrueFreezesSince(
      habit(0, new Date(2025, 11, 5)), // Dec 5 2025
      new Date(2026, 0, 15), // Jan 15 2026
      null
    );
    expect(result.freezeBank).toBe(1);
    expect(result.accruedThrough).toEqual(new Date(2026, 0, 1));
  });

  it("does not grant the same boundary twice", () => {
    const result = accrueFreezesSince(
      habit(1, new Date(2025, 11, 5)),
      new Date(2026, 0, 20),
      new Date(2026, 0, 1)
    );
    expect(result.freezeBank).toBe(1);
    expect(result.accruedThrough).toEqual(new Date(2026, 0, 1));
  });

  it("grants the next boundary once it has elapsed", () => {
    const result = accrueFreezesSince(
      habit(1, new Date(2025, 11, 5)),
      new Date(2026, 1, 1),
      new Date(2026, 0, 1)
    );
    expect(result.freezeBank).toBe(2);
    expect(result.accruedThrough).toEqual(new Date(2026, 1, 1));
  });

  it("advances the marker at the cap instead of banking hidden grants", () => {
    const result = accrueFreezesSince(
      habit(2, new Date(2025, 6, 1)),
      new Date(2026, 0, 15),
      null
    );
    expect(result.freezeBank).toBe(2);
    expect(result.accruedThrough).toEqual(new Date(2026, 0, 1));
  });

  it("does not accrue before the first boundary", () => {
    const result = accrueFreezesSince(
      habit(0, new Date(2025, 11, 5)),
      new Date(2025, 11, 31),
      null
    );
    expect(result.freezeBank).toBe(0);
    expect(result.accruedThrough).toBeNull();
  });
});
