import { describe, expect, it } from "vitest";

import { accrueFreezes, type FreezableHabit } from "./freeze";

describe("accrueFreezes", () => {
  const NOW = new Date(2026, 0, 15); // Jan 15 2026

  it("grants a freeze for the first elapsed month boundary", () => {
    const habit: FreezableHabit = {
      freezeBank: 0,
      createdAt: new Date(2025, 11, 5), // Dec 5 2025
    };
    // First point: Jan 1 2026 <= Jan 15 -> +1.
    expect(accrueFreezes(habit, NOW)).toBe(1);
  });

  it("grants nothing before the first month boundary", () => {
    const habit: FreezableHabit = {
      freezeBank: 0,
      createdAt: new Date(2025, 11, 5),
    };
    expect(accrueFreezes(habit, new Date(2025, 11, 31))).toBe(0);
  });

  it("caps the balance at 2", () => {
    const habit: FreezableHabit = {
      freezeBank: 1,
      createdAt: new Date(2025, 6, 1), // Jul 1 2025 -> 6 elapsed boundaries
    };
    // 1 + min(6, cap) -> capped at 2.
    expect(accrueFreezes(habit, NOW)).toBe(2);
  });

  it("does not accrue when already at the cap", () => {
    const habit: FreezableHabit = { freezeBank: 2, createdAt: new Date(2025, 0, 1) };
    expect(accrueFreezes(habit, NOW)).toBe(2);
  });

  it("does not accrue when now is before createdAt", () => {
    expect(
      accrueFreezes({ freezeBank: 0, createdAt: new Date(2026, 5, 1) }, new Date(2026, 0, 15))
    ).toBe(0);
  });
});
