import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Habit } from "@/db/schema";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/db/queries", () => ({
  archiveHabit: vi.fn(),
  claimReminderTap: vi.fn(),
  createHabit: vi.fn(),
  getHabitById: vi.fn(),
  incrementCheckin: vi.fn(),
  syncAllFreezes: vi.fn(),
  syncHabitFreezes: vi.fn(),
  toggleCheckin: vi.fn(),
  updateHabit: vi.fn(),
  upsertCheckin: vi.fn(),
}));

import {
  claimReminderTap,
  getHabitById,
  incrementCheckin,
  upsertCheckin,
} from "@/db/queries";
import { incrementCheckinAction, incrementReminderCheckinAction } from "./habits";

function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 1,
    name: "Pills",
    description: null,
    type: "quantitative",
    color: "#3b82f6",
    icon: null,
    schedule: { mode: "daily" },
    targetValue: 3,
    unit: "times",
    freezeBank: 0,
    createdAt: new Date(2020, 0, 1),
    archivedAt: null,
    ...overrides,
  };
}

describe("incrementCheckinAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(incrementCheckin).mockResolvedValue(1);
  });

  it("starts an empty day at 1", async () => {
    vi.mocked(getHabitById).mockResolvedValue(makeHabit());

    const result = await incrementCheckinAction({ habitId: 1, date: "2026-11-13" });

    expect(result).toEqual({ ok: true, data: 1 });
    expect(incrementCheckin).toHaveBeenCalledWith(1, "2026-11-13", 3);
  });

  it("returns the atomically incremented value", async () => {
    vi.mocked(getHabitById).mockResolvedValue(makeHabit());
    vi.mocked(incrementCheckin).mockResolvedValue(2);

    const result = await incrementCheckinAction({ habitId: 1, date: "2026-11-13" });

    expect(result).toEqual({ ok: true, data: 2 });
    expect(incrementCheckin).toHaveBeenCalledWith(1, "2026-11-13", 3);
  });

  it("passes the target through so the query can cap the value", async () => {
    vi.mocked(getHabitById).mockResolvedValue(makeHabit());
    vi.mocked(incrementCheckin).mockResolvedValue(3);

    const result = await incrementCheckinAction({ habitId: 1, date: "2026-11-13" });

    expect(result).toEqual({ ok: true, data: 3 });
    expect(incrementCheckin).toHaveBeenCalledWith(1, "2026-11-13", 3);
  });

  it("rejects unknown habits", async () => {
    vi.mocked(getHabitById).mockResolvedValue(undefined);

    const result = await incrementCheckinAction({ habitId: 99, date: "2026-11-13" });

    expect(result.ok).toBe(false);
    expect(incrementCheckin).not.toHaveBeenCalled();
  });
});

describe("incrementReminderCheckinAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getHabitById).mockResolvedValue(makeHabit());
    vi.mocked(claimReminderTap).mockResolvedValue("claimed");
    vi.mocked(incrementCheckin).mockResolvedValue(2);
  });

  it("claims the reminder tap and increments the check-in", async () => {
    const result = await incrementReminderCheckinAction({
      habitId: 1,
      reminderId: 7,
      date: "2026-11-13",
    });

    expect(result).toEqual({ ok: true, data: 2 });
    expect(claimReminderTap).toHaveBeenCalledWith(7, 1, "2026-11-13");
    expect(incrementCheckin).toHaveBeenCalledWith(1, "2026-11-13", 3);
  });

  it("rejects a second tap on the same reminder", async () => {
    vi.mocked(claimReminderTap).mockResolvedValue("already-tapped");

    const result = await incrementReminderCheckinAction({
      habitId: 1,
      reminderId: 7,
      date: "2026-11-13",
    });

    expect(result).toEqual({ ok: false, error: "Это напоминание уже использовано" });
    expect(incrementCheckin).not.toHaveBeenCalled();
  });

  it("rejects stale reminder buttons whose log row is gone", async () => {
    vi.mocked(claimReminderTap).mockResolvedValue("not-found");

    const result = await incrementReminderCheckinAction({
      habitId: 1,
      reminderId: 7,
      date: "2026-11-13",
    });

    expect(result).toEqual({ ok: false, error: "Напоминание устарело" });
    expect(incrementCheckin).not.toHaveBeenCalled();
    expect(upsertCheckin).not.toHaveBeenCalled();
  });

  it("rejects habits that are not quantitative", async () => {
    vi.mocked(getHabitById).mockResolvedValue(makeHabit({ type: "binary", targetValue: null }));

    const result = await incrementReminderCheckinAction({
      habitId: 1,
      reminderId: 7,
      date: "2026-11-13",
    });

    expect(result.ok).toBe(false);
    expect(claimReminderTap).not.toHaveBeenCalled();
    expect(incrementCheckin).not.toHaveBeenCalled();
  });
});
