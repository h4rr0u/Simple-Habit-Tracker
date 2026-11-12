import { InlineKeyboard } from "grammy";

import { formatSchedule } from "@/lib/habit-ui";
import type { Checkin, Habit } from "@/db/schema";
import type { DueReminder } from "@/lib/reminders";

/**
 * Pure message/keyboard builders and callback-data codecs for the Telegram
 * bot. No I/O here — everything accepts plain data so it can be unit-tested
 * and reused by both the long-polling bot and the reminder cron.
 */

/* --------------------------- callback data ---------------------------- */

export type BotCallback =
  | { kind: "toggle"; habitId: number }
  | { kind: "input"; habitId: number };

const TOGGLE_PREFIX = "ck:";
const INPUT_PREFIX = "in:";

/** Serializes a callback into Telegram callback_data (≤ 64 bytes). */
export function buildCallbackData(callback: BotCallback): string {
  return callback.kind === "toggle"
    ? `${TOGGLE_PREFIX}${callback.habitId}`
    : `${INPUT_PREFIX}${callback.habitId}`;
}

/** Parses Telegram callback_data; returns null for unknown payloads. */
export function parseCallbackData(data: string): BotCallback | null {
  if (data.startsWith(TOGGLE_PREFIX)) {
    const habitId = Number(data.slice(TOGGLE_PREFIX.length));
    return Number.isInteger(habitId) && habitId > 0 ? { kind: "toggle", habitId } : null;
  }
  if (data.startsWith(INPUT_PREFIX)) {
    const habitId = Number(data.slice(INPUT_PREFIX.length));
    return Number.isInteger(habitId) && habitId > 0 ? { kind: "input", habitId } : null;
  }
  return null;
}

/* ------------------------------ helpers ------------------------------- */

/** Escapes user-provided text for Telegram's HTML parse mode. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** "45m" / "1h 05m" style label for a stored number of seconds. */
export function formatTimedValue(totalSeconds: number | null | undefined): string {
  const s = Math.max(0, Math.floor(totalSeconds ?? 0));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `${minutes}m`;
}

/** Human-readable label for a stored check-in value ("3 glasses" / "15m"). */
export function formatSavedValue(
  habit: Pick<Habit, "type" | "unit">,
  rawValue: number
): string {
  if (habit.type === "timed") return formatTimedValue(rawValue);
  return habit.unit ? `${rawValue} ${habit.unit}` : String(rawValue);
}

/** Parses a bot value input ("12") into a non-negative integer, or null. */
export function parseValueInput(text: string): number | null {
  const cleaned = text.trim();
  if (!/^\d+$/.test(cleaned)) return null;
  return Number(cleaned);
}

/** Per-day status suffix shown after a habit line. */
function statusSuffix(habit: Habit, todayCheckin: Checkin | null): string {
  if (todayCheckin == null) return "";
  if (habit.type === "quantitative") {
    const value = todayCheckin.value ?? 0;
    const target = habit.targetValue ? `/${habit.targetValue}` : "";
    const unit = habit.unit ? ` ${habit.unit}` : "";
    return ` · ${value}${target}${unit}`.trimEnd();
  }
  if (habit.type === "timed") {
    const value = todayCheckin.value ?? 0;
    const target = habit.targetValue ? `/${formatTimedValue(habit.targetValue * 60)}` : "";
    return ` · ${formatTimedValue(value)}${target}`.trimEnd();
  }
  return "";
}
/** Whether today's check-in satisfies the habit (mirrors the web UI logic). */
export function isHabitDone(habit: Habit, todayCheckin: Checkin | null): boolean {
  if (!todayCheckin) return false;
  if (habit.type === "quantitative" || habit.type === "timed") {
    if (!habit.targetValue) return true;
    // quantitative counts in units; timed stores seconds but targets minutes.
    const target = habit.type === "timed" ? habit.targetValue * 60 : habit.targetValue;
    return (todayCheckin.value ?? 0) >= target;
  }
  return true;
}

/** Button label for a habit's action row. */
function actionLabel(habit: Habit, done: boolean): string {
  switch (habit.type) {
    case "quantitative":
      return `✏️ ${habit.name}`;
    case "timed":
      return `⏱ ${habit.name}`;
    default:
      return done ? `↩️ ${habit.name}` : `✅ ${habit.name}`;
  }
}

/** Callback kind used to act on a habit from the keyboard. */
export function actionCallbackKind(habit: Pick<Habit, "type">): BotCallback["kind"] {
  return habit.type === "quantitative" || habit.type === "timed" ? "input" : "toggle";
}

/* ------------------------------- /today ------------------------------- */

/** Everything needed to render one habit in the /today message. */
export interface TodayHabitView {
  habit: Habit;
  todayCheckin: Checkin | null;
  streak: number;
}

export interface BotMessage {
  text: string;
  /** Omitted when there is nothing to attach (e.g. the empty /today state). */
  keyboard?: InlineKeyboard;
}

/**
 * Renders the /today digest: one line per habit scheduled today with its
 * streak, plus an action button per habit (toggle for binary/negative,
 * value input for quantitative/timed).
 */
export function buildTodayMessage(
  items: TodayHabitView[],
  options: { today: string }
): BotMessage {
  const keyboard = new InlineKeyboard();

  if (items.length === 0) {
    return {
      text: `🗓 <b>Today · ${options.today}</b>\n\nNothing scheduled for today 🎉`,
    };
  }

  const lines: string[] = [];
  for (const [index, item] of items.entries()) {
    const { habit, todayCheckin, streak } = item;
    const done = isHabitDone(habit, todayCheckin);
    if (index > 0) keyboard.row(); // line break before each button but the first
    keyboard.text(
      actionLabel(habit, done),
      buildCallbackData({ kind: actionCallbackKind(habit), habitId: habit.id })
    );

    const icon = done ? "✅" : "⬜";
    const streakPart = `🔥 ${streak}`;
    const negativePart = habit.type === "negative" ? " · avoid" : "";
    const schedulePart = formatSchedule(habit.schedule as never);
    lines.push(
      `${icon} <b>${escapeHtml(habit.name)}</b> — ${streakPart}${statusSuffix(habit, todayCheckin)}`
    );
    lines.push(`   <i>${escapeHtml(schedulePart + negativePart)}</i>`);
  }

  return {
    text: `🗓 <b>Today · ${options.today}</b>\n\n${lines.join("\n")}`,
    keyboard,
  };
}

/* ------------------------------ reminders ------------------------------ */

/** Renders a single-habit reminder with a mark-as-done button. */
export function buildReminderMessage(
  due: DueReminder,
  streak: number,
  habit: Pick<Habit, "type">
): BotMessage {
  const streakPart = streak > 0 ? ` · 🔥 Streak: ${streak}` : "";
  const text =
    `⏰ <b>${escapeHtml(due.habitName)}</b>\n` +
    `Scheduled for ${due.time}${streakPart}\n\n` +
    `Don't break the chain!`;

  const keyboard = new InlineKeyboard();
  const label =
    habit.type === "quantitative"
      ? "✏️ Enter value"
      : habit.type === "timed"
        ? "⏱ Log minutes"
        : "✅ Mark done";
  keyboard.text(label, buildCallbackData({ kind: actionCallbackKind(habit), habitId: due.habitId }));

  return { text, keyboard };
}
