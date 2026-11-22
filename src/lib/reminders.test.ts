import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Checkin, Habit, Reminder } from "@/db/schema";

vi.mock("@/db/queries", () => ({
  listHabits: vi.fn(),
  getReminderCandidatesAt: vi.fn(),
  getCheckinsForHabitsOnDate: vi.fn(),
  getHabitSchedule: vi.fn((habit: Habit) => habit.schedule),
}));

import {
  getCheckinsForHabitsOnDate,
  getReminderCandidatesAt,
  getHabitSchedule,
  listHabits,
} from "@/db/queries";
import { getDueReminders } from "./reminders";

/** 09:00 on a Friday, the minute the test reminders fire at. */
const NOW = new Date(2026, 10, 13, 9, 0, 0);

/** Friday, matching {@link NOW}. */
const FRIDAY = 5;

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
    category: null,
    tags: [],
    freezeBank: 0,
    createdAt: new Date(2020, 0, 1),
    archivedAt: null,
    ...overrides,
  };
}

function makeCheckin(habitId = 1, value: number | null = null): Checkin {
  return {
    id: 1,
    habitId,
    date: "2026-11-13",
    value,
    note: null,
    createdAt: new Date(2020, 0, 1),
  };
}

function makeReminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: 10,
    habitId: 1,
    time: "09:00",
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    enabled: true,
    ...overrides,
  };
}

/** Wires the candidate join for one habit + reminder pair. */
function candidateFor(habit: Habit, reminder: Reminder = makeReminder()) {
  vi.mocked(getReminderCandidatesAt).mockResolvedValue([{ habit, reminder }]);
}

describe("getDueReminders", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getHabitSchedule).mockImplementation((habit) => habit.schedule as never);
    vi.mocked(getReminderCandidatesAt).mockResolvedValue([]);
    vi.mocked(getCheckinsForHabitsOnDate).mockResolvedValue([]);
  });

  it("is due for a binary habit that has no check-in today", async () => {
    candidateFor(makeHabit());

    await expect(getDueReminders(NOW)).resolves.toHaveLength(1);
  });

  it("is suppressed for a binary habit that is already checked in", async () => {
    candidateFor(makeHabit());
    vi.mocked(getCheckinsForHabitsOnDate).mockResolvedValue([makeCheckin()]);

    await expect(getDueReminders(NOW)).resolves.toHaveLength(0);
  });

  it("stays due for a quantitative habit below its target", async () => {
    candidateFor(makeHabit({ type: "quantitative", targetValue: 3 }));
    vi.mocked(getCheckinsForHabitsOnDate).mockResolvedValue([makeCheckin(1, 1)]);

    await expect(getDueReminders(NOW)).resolves.toHaveLength(1);
  });

  it("is suppressed for a quantitative habit once the target is reached", async () => {
    candidateFor(makeHabit({ type: "quantitative", targetValue: 3 }));
    vi.mocked(getCheckinsForHabitsOnDate).mockResolvedValue([makeCheckin(1, 3)]);

    await expect(getDueReminders(NOW)).resolves.toHaveLength(0);
  });

  it("is suppressed for a negative habit after a slip is logged", async () => {
    candidateFor(makeHabit({ type: "negative" }));
    vi.mocked(getCheckinsForHabitsOnDate).mockResolvedValue([makeCheckin()]);

    await expect(getDueReminders(NOW)).resolves.toHaveLength(0);
  });

  it("skips reminders whose weekday does not include today", async () => {
    candidateFor(makeHabit(), makeReminder({ daysOfWeek: [1] }));

    await expect(getDueReminders(NOW)).resolves.toHaveLength(0);
  });

  it("matches check-ins to the right habit in a batch", async () => {
    const first = makeHabit({ id: 1, name: "First" });
    const second = makeHabit({ id: 2, name: "Second" });
    vi.mocked(getReminderCandidatesAt).mockResolvedValue([
      { habit: first, reminder: makeReminder({ id: 10, habitId: 1 }) },
      { habit: second, reminder: makeReminder({ id: 11, habitId: 2 }) },
    ]);
    vi.mocked(getCheckinsForHabitsOnDate).mockResolvedValue([makeCheckin(2)]);

    const due = await getDueReminders(NOW);

    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ habitId: 1, habitName: "First", reminderId: 10 });
  });

  it("uses the batched queries and never lists habits", async () => {
    candidateFor(makeHabit());

    await getDueReminders(NOW);

    expect(vi.mocked(getReminderCandidatesAt)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(getReminderCandidatesAt)).toHaveBeenCalledWith("09:00");
    expect(vi.mocked(getCheckinsForHabitsOnDate)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(getCheckinsForHabitsOnDate)).toHaveBeenCalledWith(
      [1],
      "2026-11-13"
    );
    expect(vi.mocked(listHabits)).not.toHaveBeenCalled();
  });

  it("returns early when no reminder fires this minute", async () => {
    await expect(getDueReminders(NOW)).resolves.toHaveLength(0);
    expect(vi.mocked(getCheckinsForHabitsOnDate)).not.toHaveBeenCalled();
  });

  it("exposes the day-of-week filter of each reminder", async () => {
    candidateFor(makeHabit());
    vi.mocked(getCheckinsForHabitsOnDate).mockResolvedValue([]);

    const [due] = await getDueReminders(NOW);

    expect(due.daysOfWeek).toContain(FRIDAY);
  });
});
