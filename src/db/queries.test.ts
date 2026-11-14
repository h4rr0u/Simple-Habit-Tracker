import { readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  claimReminderTap,
  createHabit,
  createReminder,
  deleteReminder,
  incrementCheckin,
  listReminders,
  markReminderSent,
  toggleCheckin,
} from "./queries";
import { checkins, habits, reminderLog, reminders } from "./schema";

const migrationsDir = fileURLToPath(new URL("../../drizzle/", import.meta.url));

function applyMigrations(): void {
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of files) {
    db.$client.exec(readFileSync(path.join(migrationsDir, file), "utf8"));
  }
}

describe("reminder log queries", () => {
  beforeAll(applyMigrations);

  beforeEach(() => {
    db.delete(reminderLog).run();
    db.delete(reminders).run();
    db.delete(habits).run();
  });

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
});

afterAll(() => {
  db.$client.close();
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(`${dbPath}${suffix}`, { force: true });
  }
});
