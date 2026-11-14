import { and, asc, between, eq, isNull, sql } from "drizzle-orm";

import { accrueFreezes } from "@/lib/freeze";
import { db } from "./index";
import {
  checkins,
  habits,
  reminderLog,
  reminders,
  settings,
  userPreferences,
  type Checkin,
  type Habit,
  type InterfaceLanguage,
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

/**
 * Inserts a check-in, or removes the existing one when it already exists.
 *
 * Runs inside a transaction so the read and the follow-up write see the same
 * snapshot. A concurrent insert of the same (habitId, date) is swallowed by
 * `ON CONFLICT DO NOTHING`, so a rapid double tap never surfaces a raw
 * SQLite UNIQUE constraint error.
 */
export async function toggleCheckin(
  habitId: number,
  date: string,
  value?: number | null,
  note?: string | null
): Promise<"checked" | "unchecked"> {
  return db.transaction((tx): "checked" | "unchecked" => {
    const existing = tx
      .select({ id: checkins.id })
      .from(checkins)
      .where(and(eq(checkins.habitId, habitId), eq(checkins.date, date)))
      .get();

    if (existing) {
      tx.delete(checkins).where(eq(checkins.id, existing.id)).run();
      return "unchecked";
    }

    const data: NewCheckin = { habitId, date, note: note ?? null };
    if (value !== undefined && value !== null) {
      data.value = value;
    }

    tx.insert(checkins)
      .values(data)
      .onConflictDoNothing({ target: [checkins.habitId, checkins.date] })
      .run();
    return "checked";
  });
}

/**
 * Atomically adds one to a check-in for a day, capped at `targetValue` when
 * one is configured. The row is created with value 1 when it is missing.
 *
 * The increment is a single `INSERT … ON CONFLICT DO UPDATE` statement, so
 * concurrent calls cannot lose each other's writes (no read-modify-write
 * window) and the unique (habitId, date) index is never violated.
 * Returns the resulting stored value.
 */
export async function incrementCheckin(
  habitId: number,
  date: string,
  targetValue?: number | null
): Promise<number> {
  const limit = targetValue != null && targetValue > 0 ? targetValue : null;
  const nextValue =
    limit == null
      ? sql`max(coalesce(${checkins.value}, 0), 0) + 1`
      : sql`min(max(coalesce(${checkins.value}, 0), 0) + 1, ${limit})`;

  const [row] = await db
    .insert(checkins)
    .values({ habitId, date, value: 1 })
    .onConflictDoUpdate({
      target: [checkins.habitId, checkins.date],
      set: { value: nextValue },
    })
    .returning({ value: checkins.value });

  return row?.value ?? 1;
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
  return db.transaction((tx) => {
    // The reminder_log table references reminders without ON DELETE CASCADE
    // in the migrated schema, so its rows must be cleared first (otherwise
    // SQLite rejects the delete with "FOREIGN KEY constraint failed").
    tx.delete(reminderLog).where(eq(reminderLog.reminderId, id)).run();
    const result = tx.delete(reminders).where(eq(reminders.id, id)).run();
    return result.changes > 0;
  });
}

/** Enables or disables a reminder. */
export async function updateReminderEnabled(id: number, enabled: boolean): Promise<void> {
  await db.update(reminders).set({ enabled }).where(eq(reminders.id, id));
}

/* ---------------------------- reminder log ---------------------------- */

/**
 * Claims the one-send slot for a reminder on a day: inserts the log row and
 * reports whether this call was the one that claimed it. Later calls with
 * the same (reminderId, date) are no-ops that return false.
 */
export async function markReminderSent(
  reminderId: number,
  habitId: number,
  date: string
): Promise<boolean> {
  const result = await db
    .insert(reminderLog)
    .values({ reminderId, habitId, date })
    .onConflictDoNothing()
    .run();
  return result.changes > 0;
}

/** Releases a claimed slot (used when the delivery itself failed). */
export async function unmarkReminderSent(
  reminderId: number,
  date: string
): Promise<boolean> {
  const result = await db
    .delete(reminderLog)
    .where(
      and(eq(reminderLog.reminderId, reminderId), eq(reminderLog.date, date))
    )
    .run();
  return result.changes > 0;
}

/** Outcome of trying to use a reminder's "+1" button. */
export type ReminderTapResult = "claimed" | "already-tapped" | "not-found";

/**
 * Marks a sent reminder as used, so each reminder message can add progress
 * at most once. The conditional update is atomic: two rapid taps race and
 * only the first gets "claimed".
 */
export async function claimReminderTap(
  reminderId: number,
  habitId: number,
  date: string
): Promise<ReminderTapResult> {
  const [row] = await db
    .select({ id: reminderLog.id, tappedAt: reminderLog.tappedAt })
    .from(reminderLog)
    .where(
      and(
        eq(reminderLog.reminderId, reminderId),
        eq(reminderLog.habitId, habitId),
        eq(reminderLog.date, date)
      )
    );
  if (!row) return "not-found";
  if (row.tappedAt != null) return "already-tapped";

  const result = await db
    .update(reminderLog)
    .set({ tappedAt: new Date() })
    .where(and(eq(reminderLog.id, row.id), isNull(reminderLog.tappedAt)))
    .run();
  return result.changes > 0 ? "claimed" : "already-tapped";
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

/* --------------------------- user preferences ------------------------- */

/** Language used by the Telegram bot. */
export type BotLanguage = InterfaceLanguage;

/** Fixed primary key of the single `user_preferences` row. */
const USER_PREFERENCES_ID = 1;

/** Returns the bot language, defaulting to Russian when unset. */
export async function getBotLanguage(): Promise<BotLanguage> {
  const [row] = await db
    .select({ language: userPreferences.language })
    .from(userPreferences)
    .where(eq(userPreferences.id, USER_PREFERENCES_ID));
  return row?.language ?? "ru";
}

/** Persists the bot language in the single `user_preferences` row. */
export async function setBotLanguage(language: BotLanguage): Promise<void> {
  await db
    .insert(userPreferences)
    .values({ id: USER_PREFERENCES_ID, language })
    .onConflictDoUpdate({
      target: userPreferences.id,
      set: { language },
    });
}

/* ------------------------------- helpers ------------------------------ */

/** Returns the parsed Schedule of a habit with a runtime fallback. */
export function getHabitSchedule(habit: Habit): Schedule {
  return habit.schedule as unknown as Schedule;
}
