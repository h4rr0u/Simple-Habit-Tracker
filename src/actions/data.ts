"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/actions/settings";
import { db } from "@/db/index";
import {
  checkins,
  habits,
  reminderLog,
  reminders,
  settings,
  habitTypeEnum,
} from "@/db/schema";
import type {
  BackupCheckin,
  BackupFile,
  BackupHabit,
  BackupReminder,
} from "@/types/backup";

/**
 * Server Actions for full-data export / import (backups and migration) in
 * /settings. Same contract as the other actions — Zod-validated input
 * returning `{ ok: true, data } | { ok: false, error }`.
 *
 * The backup contains habits, check-ins, reminders and settings. The
 * reminder_log table is deliberately excluded: it is derived delivery state,
 * and a restored database simply starts sending reminders again.
 */

/** Flattens a ZodError into a single human-readable message. */
function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input";
}

/** Extracts a message from an unknown thrown value. */
function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}

/* ------------------------------- schemas ------------------------------- */

const scheduleSchema = z.object({
  mode: z.enum(["daily", "weekly", "specific_days", "flexible"]),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  timesPerWeek: z.number().int().min(1).max(7).optional(),
  intervalDays: z.number().int().min(1).max(366).optional(),
});

const backupHabitSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().default(null),
  type: z.enum(habitTypeEnum).default("binary"),
  color: z.string().min(1).max(32).default("#3b82f6"),
  icon: z.string().max(64).nullable().default(null),
  schedule: scheduleSchema,
  targetValue: z.number().int().min(0).nullable().default(null),
  unit: z.string().max(32).nullable().default(null),
  freezeBank: z.number().int().min(0).max(99).default(0),
  createdAt: z.coerce.date(),
  archivedAt: z.coerce.date().nullable().default(null),
});

const backupCheckinSchema = z.object({
  id: z.number().int().positive(),
  habitId: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  value: z.number().int().min(0).nullable().default(null),
  note: z.string().max(2000).nullable().default(null),
  createdAt: z.coerce.date(),
});

const backupReminderSchema = z.object({
  id: z.number().int().positive(),
  habitId: z.number().int().positive(),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:mm (24h)"),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  enabled: z.boolean().default(true),
});

const backupSettingSchema = z.object({
  key: z.string().min(1).max(128),
  value: z.unknown(),
});

const backupFileSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string().min(1),
  habits: z.array(backupHabitSchema).default([]),
  checkins: z.array(backupCheckinSchema).default([]),
  reminders: z.array(backupReminderSchema).default([]),
  settings: z.array(backupSettingSchema).default([]),
});

const importInputSchema = z.object({
  /** Raw contents of the uploaded backup file. */
  json: z.string().min(2),
});

/* -------------------------------- export ------------------------------- */

/** Serializes a row's timestamps to ISO strings for the JSON backup. */
function toBackupHabit(habit: typeof habits.$inferSelect): BackupHabit {
  return {
    id: habit.id,
    name: habit.name,
    description: habit.description,
    type: habit.type,
    color: habit.color,
    icon: habit.icon,
    schedule: habit.schedule as BackupHabit["schedule"],
    targetValue: habit.targetValue,
    unit: habit.unit,
    freezeBank: habit.freezeBank,
    createdAt: habit.createdAt.toISOString(),
    archivedAt: habit.archivedAt ? habit.archivedAt.toISOString() : null,
  };
}

function toBackupCheckin(
  checkin: typeof checkins.$inferSelect
): BackupCheckin {
  return {
    id: checkin.id,
    habitId: checkin.habitId,
    date: checkin.date,
    value: checkin.value,
    note: checkin.note,
    createdAt: checkin.createdAt.toISOString(),
  };
}

function toBackupReminder(
  reminder: typeof reminders.$inferSelect
): BackupReminder {
  return {
    id: reminder.id,
    habitId: reminder.habitId,
    time: reminder.time,
    daysOfWeek: reminder.daysOfWeek,
    enabled: reminder.enabled,
  };
}

/** Returns every table as a versioned JSON-safe backup object. */
export async function exportDataAction(): Promise<ActionResult<BackupFile>> {
  try {
    const [habitRows, checkinRows, reminderRows, settingRows] =
      await Promise.all([
        db.select().from(habits),
        db.select().from(checkins),
        db.select().from(reminders),
        db.select().from(settings),
      ]);

    return {
      ok: true,
      data: {
        version: 1,
        exportedAt: new Date().toISOString(),
        habits: habitRows.map(toBackupHabit),
        checkins: checkinRows.map(toBackupCheckin),
        reminders: reminderRows.map(toBackupReminder),
        settings: settingRows.map((row) => ({
          key: row.key,
          value: row.value,
        })),
      },
    };
  } catch (error) {
    return { ok: false, error: toErrorMessage(error) };
  }
}

/* -------------------------------- import ------------------------------- */

/**
 * Replaces the whole database contents with the uploaded backup, inside a
 * single transaction. Ids are preserved, so historical references keep
 * pointing at the same habits.
 */
export async function importDataAction(
  input: z.input<typeof importInputSchema>
): Promise<
  ActionResult<{
    habits: number;
    checkins: number;
    reminders: number;
    settings: number;
  }>
> {
  const parsedInput = importInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return { ok: false, error: firstIssueMessage(parsedInput.error) };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(parsedInput.data.json);
  } catch {
    return { ok: false, error: "Backup file is not valid JSON" };
  }

  const parsed = backupFileSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Invalid backup file: ${firstIssueMessage(parsed.error)}`,
    };
  }
  const data = parsed.data;

  // Foreign keys would reject orphans mid-transaction; fail early with a
  // clear message instead.
  const habitIds = new Set(data.habits.map((habit) => habit.id));
  const orphan = [...data.checkins, ...data.reminders].find(
    (row) => !habitIds.has(row.habitId)
  );
  if (orphan) {
    return {
      ok: false,
      error: `Backup references habit ${orphan.habitId} which is not in the file`,
    };
  }

  try {
    // better-sqlite3 is synchronous: the transaction callback must be sync
    // and execute statements with .run().
    db.transaction((tx) => {
      tx.delete(reminderLog).run();
      tx.delete(checkins).run();
      tx.delete(reminders).run();
      tx.delete(habits).run();
      tx.delete(settings).run();

      if (data.habits.length > 0) {
        tx.insert(habits).values(data.habits).run();
      }
      if (data.checkins.length > 0) {
        tx.insert(checkins).values(data.checkins).run();
      }
      if (data.reminders.length > 0) {
        tx.insert(reminders).values(data.reminders).run();
      }
      const settingsRows = data.settings.filter(
        (row) => row.value !== undefined && row.value !== null
      );
      if (settingsRows.length > 0) {
        tx
          .insert(settings)
          .values(settingsRows.map((row) => ({ key: row.key, value: row.value })))
          .run();
      }
    }, { behavior: "immediate" });
  } catch (error) {
    return { ok: false, error: toErrorMessage(error) };
  }

  revalidatePath("/", "layout");
  return {
    ok: true,
    data: {
      habits: data.habits.length,
      checkins: data.checkins.length,
      reminders: data.reminders.length,
      settings: data.settings.length,
    },
  };
}
