import { and, asc, between, eq, isNull } from "drizzle-orm";

import { db } from "./index";
import {
  checkins,
  habits,
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

/** Lists active (non-archived) habits, optionally including archived ones. */
export async function listHabits(options?: { includeArchived?: boolean }): Promise<Habit[]> {
  const query = db.select().from(habits).orderBy(asc(habits.createdAt));
  if (!options?.includeArchived) {
    return query.where(isNull(habits.archivedAt));
  }
  return query;
}

export async function getHabitById(id: number): Promise<Habit | undefined> {
  const [habit] = await db.select().from(habits).where(eq(habits.id, id));
  return habit;
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

/* ------------------------------- settings ----------------------------- */

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

/* ------------------------------- helpers ------------------------------ */

/** Returns the parsed Schedule of a habit with a runtime fallback. */
export function getHabitSchedule(habit: Habit): Schedule {
  return habit.schedule as unknown as Schedule;
}
