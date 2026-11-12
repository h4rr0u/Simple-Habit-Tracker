import { and, asc, between, eq, isNull } from "drizzle-orm";

import { accrueFreezes } from "@/lib/freeze";
import { db } from "./index";
import {
  checkins,
  habits,
  reminderLog,
  reminders,
  settings,
  type Checkin,
  type Habit,
  type NewCheckin,
  type NewHabit,
  type NewReminder,
  type Reminder,
} from "./schema";
import type { Schedule } from "@/types/schedule";

/* ------------------------------- habits ------------------------------- */

export async function createHabit(data: Omit<NewHabit, "id" | "createdAt">): Promise<Habit> {
  const [habit] = await db.insert(habits).values(data).returning();
  return habit;
}

export async function updateHabit(
  id: number,
  data: Partial<Omit<NewHabit, "id" | "createdAt">>
): Promise<Habit | undefined> {
  const [habit] = await db
    .update(habits)
    .set(data)
    .where(eq(habits.id, id))
    .returning();
  return habit;
}

/** Soft-archives a habit by stamping `archivedAt`. */
export async function archiveHabit(id: number): Promise<Habit | undefined> {
  const [habit] = await db
    .update(habits)
    .set({ archivedAt: new Date() })
    .where(eq(habits.id, id))
    .returning();
  return habit;
}

/**
 * Lazily accrues freezes for a habit on read: when the monthly accrual
 * points (the 1st of each month since `createdAt`) grant more than the
 * stored balance, the new balance is persisted and returned. Habits at
 * the cap are left untouched. Archived habits are skipped.
 */
function withAccruedFreezes(habit: Habit, now: Date): Habit {
  if (habit.archivedAt) return habit;
  const next = accrueFreezes(habit, now);
  if (next === habit.freezeBank) return habit;
  db.update(habits).set({ freezeBank: next }).where(eq(habits.id, habit.id)).run();
  return { ...habit, freezeBank: next };
}

/** Lists active (non-archived) habits, optionally including archived ones. */
export async function listHabits(options?: { includeArchived?: boolean }): Promise<Habit[]> {
  const query = db.select().from(habits).orderBy(asc(habits.createdAt));
  const rows = options?.includeArchived ? await query : await query.where(isNull(habits.archivedAt));
  const now = new Date();
  return rows.map((habit) => withAccruedFreezes(habit, now));
}

export async function getHabitById(id: number): Promise<Habit | undefined> {
  const [habit] = await db.select().from(habits).where(eq(habits.id, id));
  return habit ? withAccruedFreezes(habit, new Date()) : undefined;
}

/* ------------------------------- checkins ----------------------------- */

/** Returns check-ins for a habit within an inclusive ISO date range (YYYY-MM-DD). */
export async function getCheckinsForRange(
  habitId: number,
  from: string,
  to: string
): Promise<Checkin[]> {
  return db
    .select()
    .from(checkins)
    .where(and(eq(checkins.habitId, habitId), between(checkins.date, from, to)))
    .orderBy(asc(checkins.date));
}

/** Returns the full check-in history of a habit, oldest first. */
export async function getCheckinsForHabit(habitId: number): Promise<Checkin[]> {
  return db
    .select()
    .from(checkins)
    .where(eq(checkins.habitId, habitId))
    .orderBy(asc(checkins.date));
}

/** Inserts a check-in, or removes the existing one when it already exists. */
export async function toggleCheckin(
  habitId: number,
  date: string,
  value?: number | null,
  note?: string | null
): Promise<"checked" | "unchecked"> {
  const [existing] = await db
    .select()
    .from(checkins)
    .where(and(eq(checkins.habitId, habitId), eq(checkins.date, date)));

  if (existing) {
    await db.delete(checkins).where(eq(checkins.id, existing.id));
    return "unchecked";
  }

  const data: NewCheckin = { habitId, date, note: note ?? null };
  if (value !== undefined && value !== null) {
    data.value = value;
  }
  await db.insert(checkins).values(data);
  return "checked";
}

/**
 * Inserts a check-in or overwrites its recorded value.
 * A `value` of null or <= 0 removes the check-in (clears the day).
 */
export async function upsertCheckin(
  habitId: number,
  date: string,
  value: number | null
): Promise<"set" | "cleared"> {
  const [existing] = await db
    .select()
    .from(checkins)
    .where(and(eq(checkins.habitId, habitId), eq(checkins.date, date)));

  if (value === null || value <= 0) {
    if (existing) {
      await db.delete(checkins).where(eq(checkins.id, existing.id));
    }
    return "cleared";
  }

  if (existing) {
    await db.update(checkins).set({ value }).where(eq(checkins.id, existing.id));
    return "set";
  }

  await db.insert(checkins).values({ habitId, date, value });
  return "set";
}

/* ------------------------------ reminders ----------------------------- */

export async function getRemindersForHabit(
  habitId: number,
  options?: { enabledOnly?: boolean }
): Promise<Reminder[]> {
  const conditions = options?.enabledOnly
    ? and(eq(reminders.habitId, habitId), eq(reminders.enabled, true))
    : eq(reminders.habitId, habitId);
  return db.select().from(reminders).where(conditions).orderBy(asc(reminders.time));
}

export async function createReminder(data: NewReminder): Promise<Reminder> {
  const [reminder] = await db.insert(reminders).values(data).returning();
  return reminder;
}

/** Lists every reminder regardless of habit or enabled state. */
export async function listReminders(): Promise<Reminder[]> {
  return db.select().from(reminders).orderBy(asc(reminders.time));
}

/** Deletes a reminder; returns true when a row was actually removed. */
export async function deleteReminder(id: number): Promise<boolean> {
  const result = await db.delete(reminders).where(eq(reminders.id, id)).run();
  return result.changes > 0;
}

/** Enables or disables a reminder. */
export async function updateReminderEnabled(id: number, enabled: boolean): Promise<void> {
  await db.update(reminders).set({ enabled }).where(eq(reminders.id, id));
}

/* ---------------------------- reminder log ---------------------------- */

/**
 * Claims the one-send slot for a habit on a day: inserts the log row and
 * reports whether this call was the one that claimed it. Later calls with
 * the same (habitId, date) are no-ops that return false.
 */
export async function markReminderSent(habitId: number, date: string): Promise<boolean> {
  const result = await db
    .insert(reminderLog)
    .values({ habitId, date })
    .onConflictDoNothing()
    .run();
  return result.changes > 0;
}

/** Releases a claimed slot (used when the delivery itself failed). */
export async function unmarkReminderSent(habitId: number, date: string): Promise<boolean> {
  const result = await db
    .delete(reminderLog)
    .where(and(eq(reminderLog.habitId, habitId), eq(reminderLog.date, date)))
    .run();
  return result.changes > 0;
}

/* ------------------------------- settings ----------------------------- */

/** Settings key under which the bound Telegram chat id is stored. */
export const TELEGRAM_CHAT_ID_KEY = "telegramChatId";

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key));
  return row?.value as T | undefined;
}

/** Inserts a setting or updates the value when the key already exists. */
export async function upsertSetting<T>(key: string, value: T): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}

/** Returns the chat id the bot is bound to, if any. */
export async function getTelegramChatId(): Promise<number | undefined> {
  return getSetting<number>(TELEGRAM_CHAT_ID_KEY);
}

/** Binds the bot to a chat id. */
export async function setTelegramChatId(chatId: number): Promise<void> {
  await upsertSetting(TELEGRAM_CHAT_ID_KEY, chatId);
}

/* ------------------------------- helpers ------------------------------ */

/** Returns the parsed Schedule of a habit with a runtime fallback. */
export function getHabitSchedule(habit: Habit): Schedule {
  return habit.schedule as unknown as Schedule;
}
