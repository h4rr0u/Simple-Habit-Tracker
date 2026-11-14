import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/** Habit types supported by the tracker. */
export const habitTypeEnum = [
  "binary",
  "quantitative",
  "negative",
  "timed",
] as const;

export type HabitType = (typeof habitTypeEnum)[number];

export const habits = sqliteTable("habits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  type: text("type", { enum: habitTypeEnum })
    .notNull()
    .default("binary"),
  color: text("color").notNull().default("#3b82f6"),
  icon: text("icon"),
  /** JSON-serialized Schedule object (see src/types/schedule.ts). */
  schedule: text("schedule", { mode: "json" }).notNull(),
  /** Target value for quantitative/timed habits (nullable). */
  targetValue: integer("target_value"),
  /** Unit of measurement for quantitative/timed habits (nullable). */
  unit: text("unit"),
  /** Number of available streak freezes. */
  freezeBank: integer("freeze_bank").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  archivedAt: integer("archived_at", { mode: "timestamp" }),
});

export const checkins = sqliteTable(
  "checkins",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    habitId: integer("habit_id")
      .notNull()
      .references(() => habits.id, { onDelete: "cascade" }),
    /** ISO date string (YYYY-MM-DD), local to the user. */
    date: text("date").notNull(),
    /** Value recorded for quantitative/timed habits (nullable). */
    value: integer("value"),
    note: text("note"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex("checkins_habit_date_uq").on(table.habitId, table.date)]
);

export const reminders = sqliteTable("reminders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  habitId: integer("habit_id")
    .notNull()
    .references(() => habits.id, { onDelete: "cascade" }),
  /** Time of day in HH:mm (24h). */
  time: text("time").notNull(),
  /** JSON-serialized array of day-of-week numbers (0 = Sunday … 6). */
  daysOfWeek: text("days_of_week", { mode: "json" })
    .$type<number[]>()
    .notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
});

/** Key-value storage for global settings (e.g. Telegram chatId). */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
});

/** Interface languages supported by the Telegram bot. */
export const languageEnum = ["ru", "en"] as const;

export type InterfaceLanguage = (typeof languageEnum)[number];

/**
 * Single-row table (id = 1) holding installation-wide preferences.
 * Separate from the key-value `settings` table so `language` gets a typed
 * column with a default instead of being another stringly-typed entry.
 */
export const userPreferences = sqliteTable("user_preferences", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  language: text("language", { enum: languageEnum }).notNull().default("ru"),
});

/**
 * One-delivery guard for reminders: a row is written when a specific
 * reminder is sent on a day; the unique (reminderId, date) index makes
 * re-sends idempotent even when the cron process restarts, while still
 * allowing several reminders of the same habit per day (quantitative
 * habits remind at every configured time until their target is reached).
 */
export const reminderLog = sqliteTable(
  "reminder_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Reminder that was sent; null on rows written before per-reminder logs. */
    reminderId: integer("reminder_id").references(() => reminders.id, {
      onDelete: "cascade",
    }),
    habitId: integer("habit_id")
      .notNull()
      .references(() => habits.id, { onDelete: "cascade" }),
    /** ISO date string (YYYY-MM-DD), local to the user. */
    date: text("date").notNull(),
    sentAt: integer("sent_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    /**
     * Set when the recipient used this reminder's "+1" button. A reminder
     * message can add progress at most once, so repeat taps are ignored.
     */
    tappedAt: integer("tapped_at", { mode: "timestamp" }),
  },
  (table) => [
    uniqueIndex("reminder_log_reminder_date_uq").on(table.reminderId, table.date),
  ]
);

export type Habit = typeof habits.$inferSelect;
export type NewHabit = typeof habits.$inferInsert;
export type Checkin = typeof checkins.$inferSelect;
export type NewCheckin = typeof checkins.$inferInsert;
export type Reminder = typeof reminders.$inferSelect;
export type NewReminder = typeof reminders.$inferInsert;
export type Setting = typeof settings.$inferSelect;
export type UserPreferences = typeof userPreferences.$inferSelect;
export type ReminderLog = typeof reminderLog.$inferSelect;
export type NewReminderLog = typeof reminderLog.$inferInsert;
