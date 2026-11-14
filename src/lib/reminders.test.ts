import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Checkin, Habit, Reminder } from "@/db/schema";

vi.mock("@/db/queries", () => ({
  listHabits: vi.fn(),
  getCheckinsForRange: vi.fn(),
  getRemindersForHabit: vi.fn(),
  getHabitSchedule: vi.fn((habit: Habit) => habit.schedule),
}));

import {
  getCheckinsForRange,
  getRemindersForHabit,
  getHabitSchedule,
  listHabits,
} from "@/db/queries";
import { getDueReminders } from "./reminders";

/** 09:00 on a Friday, the minute the test reminders fire at. */
const NOW = new Date(2026, 10, 13, 9, 0, 0);

function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 1,
    name: "Test habit",
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

const reminder: Reminder = {
  id: 10,
  habitId: 1,
  time: "09:00",
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  enabled: true,
};

describe("getDueReminders", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getHabitSchedule).mockImplementation((habit) => habit.schedule as never);
    vi.mocked(getRemindersForHabit).mockResolvedValue([reminder]);
  });

  it("is due for a binary habit that has no check-in today", async () => {
    vi.mocked(listHabits).mockResolvedValue([makeHabit()]);
    vi.mocked(getCheckinsForRange).mockResolvedValue([]);

    await expect(getDueReminders(NOW)).resolves.toHaveLength(1);
  });

  it("is suppressed for a binary habit that is already checked in", async () => {
    vi.mocked(listHabits).mockResolvedValue([makeHabit()]);
    vi.mocked(getCheckinsForRange).mockResolvedValue([makeCheckin()]);

    await expect(getDueReminders(NOW)).resolves.toHaveLength(0);
  });

  it("stays due for a quantitative habit below its target", async () => {
    vi.mocked(listHabits).mockResolvedValue([
      makeHabit({ type: "quantitative", targetValue: 3 }),
    ]);
    vi.mocked(getCheckinsForRange).mockResolvedValue([makeCheckin(1)]);

    await expect(getDueReminders(NOW)).resolves.toHaveLength(1);
  });

  it("is suppressed for a quantitative habit once the target is reached", async () => {
    vi.mocked(listHabits).mockResolvedValue([
      makeHabit({ type: "quantitative", targetValue: 3 }),
    ]);
    vi.mocked(getCheckinsForRange).mockResolvedValue([makeCheckin(3)]);

    await expect(getDueReminders(NOW)).resolves.toHaveLength(0);
  });

  it("is suppressed for a negative habit after a slip is logged", async () => {
    vi.mocked(listHabits).mockResolvedValue([makeHabit({ type: "negative" })]);
    vi.mocked(getCheckinsForRange).mockResolvedValue([makeCheckin()]);

    await expect(getDueReminders(NOW)).resolves.toHaveLength(0);
  });
});
