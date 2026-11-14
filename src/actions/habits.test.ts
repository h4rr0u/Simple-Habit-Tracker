import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Checkin, Habit } from "@/db/schema";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/db/queries", () => ({
  archiveHabit: vi.fn(),
  claimReminderTap: vi.fn(),
  createHabit: vi.fn(),
  getCheckinsForRange: vi.fn(),
  getHabitById: vi.fn(),
  toggleCheckin: vi.fn(),
  updateHabit: vi.fn(),
  upsertCheckin: vi.fn(),
}));

import {
  claimReminderTap,
  getCheckinsForRange,
  getHabitById,
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

function makeCheckin(value: number | null = null): Checkin {
  return {
    id: 1,
    habitId: 1,
    date: "2026-11-13",
    value,
    note: null,
    createdAt: new Date(2020, 0, 1),
  };
}

describe("incrementCheckinAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(upsertCheckin).mockResolvedValue("set");
  });

  it("starts an empty day at 1", async () => {
    vi.mocked(getHabitById).mockResolvedValue(makeHabit());
    vi.mocked(getCheckinsForRange).mockResolvedValue([]);

    const result = await incrementCheckinAction({ habitId: 1, date: "2026-11-13" });

    expect(result).toEqual({ ok: true, data: 1 });
    expect(upsertCheckin).toHaveBeenCalledWith(1, "2026-11-13", 1);
  });

  it("increments an existing check-in", async () => {
    vi.mocked(getHabitById).mockResolvedValue(makeHabit());
    vi.mocked(getCheckinsForRange).mockResolvedValue([makeCheckin(1)]);

    const result = await incrementCheckinAction({ habitId: 1, date: "2026-11-13" });

    expect(result).toEqual({ ok: true, data: 2 });
    expect(upsertCheckin).toHaveBeenCalledWith(1, "2026-11-13", 2);
  });

  it("never exceeds the target", async () => {
    vi.mocked(getHabitById).mockResolvedValue(makeHabit());
    vi.mocked(getCheckinsForRange).mockResolvedValue([makeCheckin(3)]);

    const result = await incrementCheckinAction({ habitId: 1, date: "2026-11-13" });

    expect(result).toEqual({ ok: true, data: 3 });
    expect(upsertCheckin).toHaveBeenCalledWith(1, "2026-11-13", 3);
  });

  it("rejects unknown habits", async () => {
    vi.mocked(getHabitById).mockResolvedValue(undefined);

    const result = await incrementCheckinAction({ habitId: 99, date: "2026-11-13" });

    expect(result.ok).toBe(false);
    expect(upsertCheckin).not.toHaveBeenCalled();
  });
});

describe("incrementReminderCheckinAction", () => {
  beforeEach(() => {
    vi.mocked(getHabitById).mockResolvedValue(makeHabit());
    vi.mocked(getCheckinsForRange).mockResolvedValue([makeCheckin(1)]);
    vi.mocked(claimReminderTap).mockResolvedValue("claimed");
    vi.mocked(upsertCheckin).mockResolvedValue("set");
  });

  it("claims the reminder tap and increments the check-in", async () => {
    const result = await incrementReminderCheckinAction({
      habitId: 1,
      reminderId: 7,
      date: "2026-11-13",
    });

    expect(result).toEqual({ ok: true, data: 2 });
    expect(claimReminderTap).toHaveBeenCalledWith(7, 1, "2026-11-13");
    expect(upsertCheckin).toHaveBeenCalledWith(1, "2026-11-13", 2);
  });

  it("rejects a second tap on the same reminder", async () => {
    vi.mocked(claimReminderTap).mockResolvedValue("already-tapped");

    const result = await incrementReminderCheckinAction({
      habitId: 1,
      reminderId: 7,
      date: "2026-11-13",
    });

    expect(result).toEqual({ ok: false, error: "Это напоминание уже использовано" });
    expect(upsertCheckin).not.toHaveBeenCalled();
  });

  it("still increments when the reminder log row is gone", async () => {
    vi.mocked(claimReminderTap).mockResolvedValue("not-found");

    const result = await incrementReminderCheckinAction({
      habitId: 1,
      reminderId: 7,
      date: "2026-11-13",
    });

    expect(result).toEqual({ ok: true, data: 2 });
    expect(upsertCheckin).toHaveBeenCalledWith(1, "2026-11-13", 2);
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
    expect(upsertCheckin).not.toHaveBeenCalled();
  });
});
