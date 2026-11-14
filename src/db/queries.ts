import { format, startOfDay } from "date-fns";
import { and, asc, between, eq, isNull, sql } from "drizzle-orm";

import { accrueFreezesSince } from "@/lib/freeze";
import { buildCompletionCheckins } from "@/lib/habit-target";
import {
  calculateFreezeConsumption,
  type FreezeHistory,
} from "@/lib/streaks";
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

/* ---------------------------- freeze state ---------------------------- */

/**
 * Settings key holding the persisted freeze bookkeeping. No schema change is
 * needed: the key-value `settings` table already exists.
 *
 * Shape: `{ [habitId]: { accruedThrough, paid, blocked } }`.
 */
export const FREEZE_STATE_KEY = "freezeState";

/** Persisted freeze bookkeeping for one habit. */
interface StoredHabitFreezeState {
  /** Latest monthly accrual point already granted (YYYY-MM-DD). */
  accruedThrough?: string;
  /** Gaps already covered by a spent freeze. */
  paid?: string[];
  /** Gaps that ended a streak for lack of a freeze. */
  blocked?: string[];
}

/** Parsed freeze bookkeeping keyed by string habit id. */
type FreezeStateMap = Record<string, StoredHabitFreezeState>;

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Local ISO day key (YYYY-MM-DD). */
function toDateKey(date: Date): string {
  return format(startOfDay(date), "yyyy-MM-dd");
}

/** Parses a stored ISO day key; malformed values are ignored. */
function parseDateKey(key: string | undefined | null): Date | null {
  if (!key || !DATE_KEY_RE.test(key)) return null;
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** Validates and normalizes the JSON stored under {@link FREEZE_STATE_KEY}. */
function parseFreezeState(value: unknown): FreezeStateMap {
  if (!value || typeof value !== "object") return {};

  const state: FreezeStateMap = {};
  for (const [habitId, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;

    const parsed: StoredHabitFreezeState = {};
    if (typeof entry.accruedThrough === "string" && DATE_KEY_RE.test(entry.accruedThrough)) {
      parsed.accruedThrough = entry.accruedThrough;
    }
    if (isStringArray(entry.paid)) {
      parsed.paid = [...new Set(entry.paid.filter((key) => DATE_KEY_RE.test(key)))];
    }
    if (isStringArray(entry.blocked)) {
      parsed.blocked = [...new Set(entry.blocked.filter((key) => DATE_KEY_RE.test(key)))];
    }
    state[habitId] = parsed;
  }
  return state;
}

/** Freeze state plus a dirty flag, so a read pass writes at most once. */
interface FreezeStateContext {
  state: FreezeStateMap;
  dirty: boolean;
}

function readFreezeState(): FreezeStateContext {
  const row = db
    .select()
    .from(settings)
    .where(eq(settings.key, FREEZE_STATE_KEY))
    .get();
  return { state: parseFreezeState(row?.value), dirty: false };
}

function persistFreezeState(context: FreezeStateContext): void {
  if (!context.dirty) return;
  db.insert(settings)
    .values({ key: FREEZE_STATE_KEY, value: context.state })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: context.state },
    })
    .run();
}

/** Paired `paid`/`blocked` gap sets for the streak walk. */
function freezeHistoryOf(entry: StoredHabitFreezeState): FreezeHistory {
  return {
    paid: new Set(entry.paid ?? []),
    blocked: new Set(entry.blocked ?? []),
  };
}

/**
 * Atomically subtracts spent freezes from a habit's bank, clamped at zero.
 *
 * The subtraction happens inside a single `UPDATE` statement, so concurrent
 * spenders cannot lose each other's writes. `currentFreezeBank` is only used
 * to short-circuit no-op calls and as a fallback when the habit is gone.
 *
 * @returns the resulting freeze bank.
 */
export async function applyFreezeConsumption(
  habitId: number,
  currentFreezeBank: number,
  freezesUsed: number
): Promise<number> {
  const spend = Number.isFinite(freezesUsed) ? Math.max(0, Math.floor(freezesUsed)) : 0;
  const current = Number.isFinite(currentFreezeBank)
    ? Math.max(0, Math.floor(currentFreezeBank))
    : 0;
  if (spend === 0 || current === 0) return current;

  const [row] = await db
    .update(habits)
    .set({ freezeBank: spentFreezeBank(spend) })
    .where(eq(habits.id, habitId))
    .returning({ freezeBank: habits.freezeBank });

  return row?.freezeBank ?? Math.max(current - spend, 0);
}

/** SQL expression `max(coalesce(freeze_bank, 0) - spend, 0)`. */
function spentFreezeBank(spend: number) {
  return sql<number>`max(coalesce(${habits.freezeBank}, 0) - ${spend}, 0)`;
}

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
 * Lazily accrues freezes for a habit on read using the persisted accrual
 * marker, so each monthly point is granted exactly once even while the bank is
 * at the cap. New balances and markers are written once per read pass.
 * Archived habits are skipped.
 */
function withAccruedFreezes(
  habit: Habit,
  now: Date,
  context: FreezeStateContext
): Habit {
  if (habit.archivedAt) return habit;

  const key = String(habit.id);
  const entry = context.state[key] ?? {};
  const accrual = accrueFreezesSince(habit, now, parseDateKey(entry.accruedThrough));
  const marker = accrual.accruedThrough ? toDateKey(accrual.accruedThrough) : null;

  if ((entry.accruedThrough ?? null) !== marker) {
    context.state[key] = { ...entry, accruedThrough: marker ?? undefined };
    context.dirty = true;
  }

  if (accrual.freezeBank !== habit.freezeBank) {
    db.update(habits)
      .set({ freezeBank: accrual.freezeBank })
      .where(eq(habits.id, habit.id))
      .run();
    return { ...habit, freezeBank: accrual.freezeBank };
  }

  return habit;
}

/** Lists active (non-archived) habits, optionally including archived ones. */
export async function listHabits(options?: { includeArchived?: boolean }): Promise<Habit[]> {
  const query = db.select().from(habits).orderBy(asc(habits.createdAt));
  const rows = options?.includeArchived ? await query : await query.where(isNull(habits.archivedAt));
  const now = new Date();
  const freezeState = readFreezeState();
  const result = rows.map((habit) => withAccruedFreezes(habit, now, freezeState));
  persistFreezeState(freezeState);
  return result;
}

export async function getHabitById(id: number): Promise<Habit | undefined> {
  const [habit] = await db.select().from(habits).where(eq(habits.id, id));
  if (!habit) return undefined;

  const freezeState = readFreezeState();
  const result = withAccruedFreezes(habit, new Date(), freezeState);
  persistFreezeState(freezeState);
  return result;
}

/**
 * Returns the persisted `paid`/`blocked` gap sets for every habit. Renders use
 * this read-only view to keep the streak walk stable; mutations go through
 * {@link syncHabitFreezes}.
 */
export async function getFreezeHistories(): Promise<Map<number, FreezeHistory>> {
  const state = readFreezeState().state;
  const histories = new Map<number, FreezeHistory>();

  for (const [key, entry] of Object.entries(state)) {
    const habitId = Number(key);
    if (!Number.isInteger(habitId) || habitId <= 0) continue;
    histories.set(habitId, freezeHistoryOf(entry));
  }
  return histories;
}

/**
 * Reconciles one habit's freezes in a single synchronous transaction:
 * accrues elapsed monthly points, walks the streak with the persisted
 * paid/blocked history, deducts the freezes the walk actually needs, and
 * records the newly paid/blocked gaps.
 *
 * This is the write side of the freeze system; renders only read it.
 *
 * @returns the number of freezes spent by this call (0 when already settled).
 */
export async function syncHabitFreezes(
  habitId: number,
  now: Date = new Date()
): Promise<number> {
  return db.transaction((tx): number => {
    const habit = tx.select().from(habits).where(eq(habits.id, habitId)).get();
    if (!habit || habit.archivedAt) return 0;

    const stateRow = tx
      .select()
      .from(settings)
      .where(eq(settings.key, FREEZE_STATE_KEY))
      .get();
    const context: FreezeStateContext = {
      state: parseFreezeState(stateRow?.value),
      dirty: false,
    };
    const entryKey = String(habitId);
    const entry = context.state[entryKey] ?? {};
    let dirty = false;

    const accrual = accrueFreezesSince(
      habit,
      now,
      parseDateKey(entry.accruedThrough)
    );
    let freezeBank = habit.freezeBank;
    if (accrual.freezeBank !== freezeBank) {
      tx.update(habits)
        .set({ freezeBank: accrual.freezeBank })
        .where(eq(habits.id, habitId))
        .run();
      freezeBank = accrual.freezeBank;
    }

    const marker = accrual.accruedThrough ? toDateKey(accrual.accruedThrough) : null;
    if ((entry.accruedThrough ?? null) !== marker) {
      entry.accruedThrough = marker ?? undefined;
      dirty = true;
    }

    const rows = tx
      .select()
      .from(checkins)
      .where(eq(checkins.habitId, habitId))
      .orderBy(asc(checkins.date))
      .all();
    const completion = buildCompletionCheckins(habit, rows, now);
    const plan = calculateFreezeConsumption(
      completion,
      habit.schedule as unknown as Schedule,
      freezeBank,
      now,
      habit.createdAt,
      freezeHistoryOf(entry)
    );

    let spent = 0;
    if (plan.paidUnits.length > 0) {
      // Same clamped expression as `applyFreezeConsumption`, executed through
      // the transaction handle so the deduction and the paid-gap state commit
      // together.
      const updated = tx
        .update(habits)
        .set({ freezeBank: spentFreezeBank(plan.paidUnits.length) })
        .where(eq(habits.id, habitId))
        .returning({ freezeBank: habits.freezeBank })
        .get();
      freezeBank = updated?.freezeBank ?? Math.max(freezeBank - plan.paidUnits.length, 0);
      spent = plan.paidUnits.length;

      entry.paid = [...new Set([...(entry.paid ?? []), ...plan.paidUnits])];
      dirty = true;
    }

    if (plan.blockedUnit && !(entry.blocked ?? []).includes(plan.blockedUnit)) {
      entry.blocked = [...(entry.blocked ?? []), plan.blockedUnit];
      dirty = true;
    }

    if (dirty) {
      context.state[entryKey] = entry;
      tx.insert(settings)
        .values({ key: FREEZE_STATE_KEY, value: context.state })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: context.state },
        })
        .run();
    }

    return spent;
  }, { behavior: "immediate" });
}

/**
 * Reconciles every active habit, for the midnight/catch-up sync.
 * @returns the total number of freezes spent.
 */
export async function syncAllFreezes(now: Date = new Date()): Promise<number> {
  const rows = await db
    .select({ id: habits.id })
    .from(habits)
    .where(isNull(habits.archivedAt));

  let spent = 0;
  for (const row of rows) {
    spent += await syncHabitFreezes(row.id, now);
  }
  return spent;
}

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
