import { readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { addDays, format, startOfDay } from "date-fns";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Integration tests against a throwaway SQLite database. The DB module reads
 * DATABASE_URL at import time, so the path is set in a hoisted block before
 * any module is loaded.
 */
const dbPath = vi.hoisted(() => {
  const dir = (process.env.TEMP ?? process.env.TMP ?? ".").replace(/\\/g, "/");
  const file = `${dir}/habit-tracker-test-${process.pid}-${Date.now()}.db`;
  process.env.DATABASE_URL = file;
  return file;
});

import { db } from "./index";
import {
  archiveHabit,
  claimReminderTap,
  createHabit,
  createReminder,
  deleteReminder,
  getCheckinsForHabitsOnDate,
  getFreezeHistories,
  getHabitById,
  getReminderCandidatesAt,
  incrementCheckin,
  listHabits,
  listReminders,
  markReminderSent,
  syncHabitFreezes,
  toggleCheckin,
  upsertCheckin,
} from "./queries";
import { checkins, habits, reminderLog, reminders, settings } from "./schema";

const migrationsDir = fileURLToPath(new URL("../../drizzle/", import.meta.url));

function applyMigrations(): void {
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of files) {
    db.$client.exec(readFileSync(path.join(migrationsDir, file), "utf8"));
  }
}

beforeAll(applyMigrations);

beforeEach(() => {
  db.delete(reminderLog).run();
  db.delete(reminders).run();
  db.delete(habits).run();
  db.delete(settings).run();
});

describe("reminder log queries", () => {
  it("claims a reminder tap only once", async () => {
    const habit = await createHabit({
      name: "Pills",
      description: null,
      type: "quantitative",
      color: "#3b82f6",
      icon: null,
      schedule: { mode: "daily" } as never,
      targetValue: 3,
      unit: "times",
      freezeBank: 0,
    });
    const reminder = await createReminder({
      habitId: habit.id,
      time: "09:00",
      daysOfWeek: [1, 2, 3, 4, 5],
      enabled: true,
    });
    await markReminderSent(reminder.id, habit.id, "2026-11-13");

    await expect(claimReminderTap(reminder.id, habit.id, "2026-11-13")).resolves.toBe(
      "claimed"
    );
    await expect(claimReminderTap(reminder.id, habit.id, "2026-11-13")).resolves.toBe(
      "already-tapped"
    );
    await expect(claimReminderTap(999, habit.id, "2026-11-13")).resolves.toBe("not-found");
  });

  it("deletes a reminder that already has delivery log rows", async () => {
    const habit = await createHabit({
      name: "Pills",
      description: null,
      type: "quantitative",
      color: "#3b82f6",
      icon: null,
      schedule: { mode: "daily" } as never,
      targetValue: 3,
      unit: "times",
      freezeBank: 0,
    });
    const reminder = await createReminder({
      habitId: habit.id,
      time: "09:00",
      daysOfWeek: [1, 2, 3, 4, 5],
      enabled: true,
    });
    await markReminderSent(reminder.id, habit.id, "2026-11-13");

    await expect(deleteReminder(reminder.id)).resolves.toBe(true);
    await expect(listReminders()).resolves.toEqual([]);
    expect(await db.select().from(reminderLog)).toEqual([]);
  });

  it("increments check-in values atomically and caps them at the target", async () => {
    const habit = await createHabit({
      name: "Water",
      description: null,
      type: "quantitative",
      color: "#3b82f6",
      icon: null,
      schedule: { mode: "daily" } as never,
      targetValue: 3,
      unit: "glasses",
      freezeBank: 0,
    });

    const results = await Promise.all(
      Array.from({ length: 5 }, () => incrementCheckin(habit.id, "2026-11-13", 3))
    );

    expect(results).toEqual([1, 2, 3, 3, 3]);
    const rows = await db.select().from(checkins);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe(3);
  });

  it("toggles a check-in without surfacing unique constraint errors", async () => {
    const habit = await createHabit({
      name: "Read",
      description: null,
      type: "binary",
      color: "#3b82f6",
      icon: null,
      schedule: { mode: "daily" } as never,
      targetValue: null,
      unit: null,
      freezeBank: 0,
    });

    await expect(toggleCheckin(habit.id, "2026-11-13")).resolves.toBe("checked");
    await expect(toggleCheckin(habit.id, "2026-11-13")).resolves.toBe("unchecked");
    await expect(toggleCheckin(habit.id, "2026-11-13")).resolves.toBe("checked");
  });

  it("upserts and clears a check-in value in one transaction", async () => {
    const habit = await createHabit({
      name: "Water",
      description: null,
      type: "quantitative",
      color: "#3b82f6",
      icon: null,
      schedule: { mode: "daily" } as never,
      targetValue: 8,
      unit: "glasses",
      freezeBank: 0,
    });

    await expect(upsertCheckin(habit.id, "2026-11-13", 5)).resolves.toBe("set");
    await expect(upsertCheckin(habit.id, "2026-11-13", 2)).resolves.toBe("set");

    let rows = await db.select().from(checkins);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe(2);

    await expect(upsertCheckin(habit.id, "2026-11-13", null)).resolves.toBe("cleared");
    rows = await db.select().from(checkins);
    expect(rows).toEqual([]);

    // Clearing an absent row is a no-op, not an error.
    await expect(upsertCheckin(habit.id, "2026-11-13", 0)).resolves.toBe("cleared");
  });
});

describe("freeze consumption queries", () => {
  /** Local ISO key for a day offset from today. */
  function dayKey(offset: number): string {
    return format(addDays(startOfDay(new Date()), offset), "yyyy-MM-dd");
  }

  async function seedHabit(freezeBank: number): Promise<number> {
    const habit = await createHabit({
      name: "Stretch",
      description: null,
      type: "binary",
      color: "#3b82f6",
      icon: null,
      schedule: { mode: "daily" } as never,
      targetValue: null,
      unit: null,
      freezeBank,
    });
    return habit.id;
  }

  it("clamps freeze consumption at zero", async () => {
    const habitId = await seedHabit(1);
    // A single missed day spends at most the one available freeze; the bank
    // must never go negative.
    await toggleCheckin(habitId, dayKey(0));
    await toggleCheckin(habitId, dayKey(-3)); // gaps at -2 and -1

    await expect(syncHabitFreezes(habitId)).resolves.toBe(1);

    const [row] = await db
      .select({ freezeBank: habits.freezeBank })
      .from(habits)
      .where(eq(habits.id, habitId));
    expect(row?.freezeBank).toBe(0);
    expect(row?.freezeBank).toBeGreaterThanOrEqual(0);
  });

  it("spends a missed day's freeze once and stays idempotent", async () => {
    const habitId = await seedHabit(2);
    await toggleCheckin(habitId, dayKey(0));
    await toggleCheckin(habitId, dayKey(-2)); // day -1 is missed

    await expect(syncHabitFreezes(habitId)).resolves.toBe(1);
    await expect(syncHabitFreezes(habitId)).resolves.toBe(0);

    const [row] = await db
      .select({ freezeBank: habits.freezeBank })
      .from(habits)
      .where(eq(habits.id, habitId));
    expect(row?.freezeBank).toBe(1);

    const history = (await getFreezeHistories()).get(habitId);
    expect(history?.paid?.has(dayKey(-1))).toBe(true);
  });

  it("blocks a gap once the bank is empty and does not revive it later", async () => {
    const habitId = await seedHabit(1);
    await toggleCheckin(habitId, dayKey(0));
    await toggleCheckin(habitId, dayKey(-2));
    await toggleCheckin(habitId, dayKey(-4)); // gaps at -1 and -3

    await expect(syncHabitFreezes(habitId)).resolves.toBe(1);

    const history = (await getFreezeHistories()).get(habitId);
    expect(history?.paid?.has(dayKey(-1))).toBe(true);
    expect(history?.blocked?.has(dayKey(-3))).toBe(true);

    // A later refill must not retroactively cover the already-lost gap.
    await db
      .update(habits)
      .set({ freezeBank: 2 })
      .where(eq(habits.id, habitId))
      .run();
    await expect(syncHabitFreezes(habitId)).resolves.toBe(0);

    const habit = await getHabitById(habitId);
    expect(habit?.freezeBank).toBe(2);
  });

  it("keeps the bank when a leading gap run cannot reach the old streak", async () => {
    const habitId = await seedHabit(2);
    // Today unchecked; the last three days are missed and only two freezes
    // exist, so the run behind them cannot be reached.
    await toggleCheckin(habitId, dayKey(-4));

    await expect(syncHabitFreezes(habitId)).resolves.toBe(0);

    const habit = await getHabitById(habitId);
    expect(habit?.freezeBank).toBe(2);

    const history = (await getFreezeHistories()).get(habitId);
    expect(history?.paid).toEqual(new Set());
    expect(history?.blocked?.has(dayKey(-3))).toBe(true);
  });

  it("does not refill a spent bank from already-accrued months", async () => {
    const habitId = await seedHabit(0);
    await db
      .update(habits)
      .set({ createdAt: addDays(startOfDay(new Date()), -100) })
      .where(eq(habits.id, habitId))
      .run();

    // Only the write-side sync accrues and advances the persisted marker.
    await syncHabitFreezes(habitId);

    const first = await getHabitById(habitId);
    expect(first?.freezeBank).toBe(2); // every elapsed boundary is granted once

    await db
      .update(habits)
      .set({ freezeBank: 0 })
      .where(eq(habits.id, habitId))
      .run();

    await syncHabitFreezes(habitId);

    const second = await getHabitById(habitId);
    expect(second?.freezeBank).toBe(0); // the marker advanced, so nothing regrants
  });

  it("keeps reads free of freeze writes", async () => {
    const habitId = await seedHabit(0);
    await db
      .update(habits)
      .set({ createdAt: addDays(startOfDay(new Date()), -100) })
      .where(eq(habits.id, habitId))
      .run();

    // Read-only paths must not accrue: months elapsed, but nothing is written
    // until a mutation or the midnight/cron sync runs.
    const listed = (await listHabits()).find((habit) => habit.id === habitId);
    expect(listed?.freezeBank).toBe(0);
    expect(await db.select().from(settings)).toEqual([]);

    const fetched = await getHabitById(habitId);
    expect(fetched?.freezeBank).toBe(0);
    expect(await db.select().from(settings)).toEqual([]);
  });
});

describe("batched reminder queries", () => {
  async function seedHabit(name: string): Promise<number> {
    const habit = await createHabit({
      name,
      description: null,
      type: "binary",
      color: "#3b82f6",
      icon: null,
      schedule: { mode: "daily" } as never,
      targetValue: null,
      unit: null,
      freezeBank: 0,
    });
    return habit.id;
  }

  it("joins only enabled reminders of active habits at the requested time", async () => {
    const activeId = await seedHabit("Active");
    const archivedId = await seedHabit("Archived");
    await archiveHabit(archivedId);

    const activeReminder = await createReminder({
      habitId: activeId,
      time: "09:00",
      daysOfWeek: [5],
      enabled: true,
    });
    await createReminder({
      habitId: activeId,
      time: "10:00",
      daysOfWeek: [5],
      enabled: true,
    });
    await createReminder({
      habitId: activeId,
      time: "09:00",
      daysOfWeek: [5],
      enabled: false,
    });
    await createReminder({
      habitId: archivedId,
      time: "09:00",
      daysOfWeek: [5],
      enabled: true,
    });

    const candidates = await getReminderCandidatesAt("09:00");

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.habit.id).toBe(activeId);
    expect(candidates[0]?.reminder.id).toBe(activeReminder.id);
  });

  it("fetches check-ins for several habits on one date", async () => {
    const first = await seedHabit("First");
    const second = await seedHabit("Second");
    const third = await seedHabit("Third");
    await toggleCheckin(first, "2026-11-13");
    await toggleCheckin(second, "2026-11-13");
    await toggleCheckin(third, "2026-11-12");

    const rows = await getCheckinsForHabitsOnDate(
      [first, second, third],
      "2026-11-13"
    );
    expect(rows.map((row) => row.habitId).sort()).toEqual([first, second].sort());

    await expect(getCheckinsForHabitsOnDate([], "2026-11-13")).resolves.toEqual([]);
  });
});

afterAll(() => {
  db.$client.close();
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(`${dbPath}${suffix}`, { force: true });
  }
});
