import { InlineKeyboard } from "grammy";

import { isHabitDayComplete } from "@/lib/habit-target";
import type { Checkin, Habit } from "@/db/schema";
import type { DueReminder } from "@/lib/reminders";
import type { Schedule } from "@/types/schedule";
import {
  botDictionaries,
  DEFAULT_BOT_LANGUAGE,
  type BotDictionary,
  type BotLanguage,
} from "./dictionaries";

export { pluralDays } from "./dictionaries";

/**
 * Pure message/keyboard builders and callback-data codecs for the Telegram
 * bot. No I/O here — everything accepts plain data so it can be unit-tested
 * and reused by both the long-polling bot and the reminder cron.
 */

/* --------------------------- callback data ---------------------------- */

export type BotCallback =
  | {
      kind: "toggle";
      habitId: number;
      /** Reminder HH:mm, used to keep a reminder message a reminder after a tap. */
      time?: string;
    }
  | { kind: "input"; habitId: number }
  /**
   * Adds one to a quantitative check-in. Reminder messages carry their
   * reminder id (used to enforce one tap per message) and HH:mm (used to
   * re-render the same message with fresh progress).
   */
  | {
      kind: "increment";
      habitId: number;
      source: "today" | "reminder";
      reminderId?: number;
      time?: string;
    }
  /** Inert callback for buttons that should look disabled (e.g. goal reached). */
  | { kind: "noop" }
  /** Main-menu navigation: today's digest, stats, web hint, or greeting. */
  | { kind: "menu_today" }
  | { kind: "menu_stats" }
  | { kind: "menu_web" }
  | { kind: "menu_main" }
  /** Language picker: persists the chosen interface language. */
  | { kind: "language"; language: BotLanguage };

const TOGGLE_PREFIX = "ck:";
const INPUT_PREFIX = "in:";
const INCREMENT_PREFIX = "inc:";
const LANGUAGE_PREFIX = "lang_";
const NOOP = "noop";
const MENU_TODAY = "menu_today";
const MENU_STATS = "menu_stats";
const MENU_WEB = "menu_web";
const MENU_MAIN = "menu_main";

/** Serializes a callback into Telegram callback_data (≤ 64 bytes). */
export function buildCallbackData(callback: BotCallback): string {
  switch (callback.kind) {
    case "toggle": {
      const time = callback.time ? `:${callback.time}` : "";
      return `${TOGGLE_PREFIX}${callback.habitId}${time}`;
    }
    case "input":
      return `${INPUT_PREFIX}${callback.habitId}`;
    case "increment": {
      if (callback.source === "today") {
        return `${INCREMENT_PREFIX}${callback.habitId}`;
      }
      if (callback.reminderId != null) {
        const time = callback.time ? `:${callback.time}` : "";
        return `${INCREMENT_PREFIX}${callback.habitId}:${callback.reminderId}${time}`;
      }
      return callback.time
        ? `${INCREMENT_PREFIX}${callback.habitId}:${callback.time}`
        : `${INCREMENT_PREFIX}${callback.habitId}`;
    }
    case "noop":
      return NOOP;
    case "menu_today":
      return MENU_TODAY;
    case "menu_stats":
      return MENU_STATS;
    case "menu_web":
      return MENU_WEB;
    case "menu_main":
      return MENU_MAIN;
    case "language":
      return `${LANGUAGE_PREFIX}${callback.language}`;
  }
}

/** "HH:mm" as used in reminder callback payloads. */
const TIME_PATTERN = /^\d{2}:\d{2}$/;

/** Parses Telegram callback_data; returns null for unknown payloads. */
export function parseCallbackData(data: string): BotCallback | null {
  if (data === NOOP) return { kind: "noop" };
  if (data === MENU_TODAY) return { kind: "menu_today" };
  if (data === MENU_STATS) return { kind: "menu_stats" };
  if (data === MENU_WEB) return { kind: "menu_web" };
  if (data === MENU_MAIN) return { kind: "menu_main" };

  if (data.startsWith(LANGUAGE_PREFIX)) {
    const language = data.slice(LANGUAGE_PREFIX.length);
    return language === "ru" || language === "en"
      ? { kind: "language", language }
      : null;
  }

  if (data.startsWith(TOGGLE_PREFIX)) {
    const [idPart, ...rest] = data.slice(TOGGLE_PREFIX.length).split(":");
    const habitId = Number(idPart);
    if (!Number.isInteger(habitId) || habitId <= 0) return null;
    if (rest.length === 0) return { kind: "toggle", habitId };
    if (rest.length === 2) {
      const time = rest.join(":");
      return TIME_PATTERN.test(time)
        ? { kind: "toggle", habitId, time }
        : null;
    }
    return null;
  }
  if (data.startsWith(INPUT_PREFIX)) {
    const habitId = Number(data.slice(INPUT_PREFIX.length));
    return Number.isInteger(habitId) && habitId > 0 ? { kind: "input", habitId } : null;
  }
  if (data.startsWith(INCREMENT_PREFIX)) {
    const [idPart, ...rest] = data.slice(INCREMENT_PREFIX.length).split(":");
    const habitId = Number(idPart);
    if (!Number.isInteger(habitId) || habitId <= 0) return null;
    if (rest.length === 0) {
      return { kind: "increment", habitId, source: "today" };
    }
    // New format: inc:<habitId>:<reminderId>:<HH:mm>
    if (rest.length === 3) {
      const reminderId = Number(rest[0]);
      const time = `${rest[1]}:${rest[2]}`;
      if (!Number.isInteger(reminderId) || reminderId <= 0) return null;
      return TIME_PATTERN.test(time)
        ? { kind: "increment", habitId, source: "reminder", reminderId, time }
        : null;
    }
    // Legacy messages (sent before reminder ids were encoded): inc:<id>:<HH:mm>
    if (rest.length === 2) {
      const time = rest.join(":");
      return TIME_PATTERN.test(time)
        ? { kind: "increment", habitId, source: "reminder", time }
        : null;
    }
    return null;
  }
  return null;
}

/* ------------------------------ helpers ------------------------------- */

/** Dictionary for a language, falling back to Russian for unknown values. */
function dictionaryFor(language: BotLanguage = DEFAULT_BOT_LANGUAGE): BotDictionary {
  return botDictionaries[language] ?? botDictionaries[DEFAULT_BOT_LANGUAGE];
}

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
function statusSuffix(
  habit: Habit,
  todayCheckin: Checkin | null,
  dictionary: BotDictionary
): string {
  if (todayCheckin == null) return "";
  if (habit.type === "negative") return dictionary.todaySlippedSuffix;
  if (habit.type === "quantitative") {
    const value = todayCheckin.value ?? 0;
    const target = habit.targetValue ? `/${habit.targetValue}` : "";
    const unit = habit.unit ? ` ${escapeHtml(habit.unit)}` : "";
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
  return isHabitDayComplete(habit, todayCheckin);
}

/** "X/Y" (or just "X" without a target) progress for quantitative habits. */
function quantitativeProgress(habit: Habit, todayCheckin: Checkin | null): string {
  const value = Math.max(0, todayCheckin?.value ?? 0);
  return habit.targetValue != null && habit.targetValue > 0
    ? `${value}/${habit.targetValue}`
    : String(value);
}

/** Button label for a habit's action row. */
function actionLabel(
  habit: Habit,
  done: boolean,
  dictionary: BotDictionary
): string {
  const name = escapeHtml(habit.name);
  switch (habit.type) {
    case "timed":
      return dictionary.actionTimed(name);
    case "negative":
      return done ? dictionary.actionSlipLog(name) : dictionary.actionSlipUndo(name);
    default:
      return done ? dictionary.actionUndo(name) : dictionary.actionMark(name);
  }
}

/** Localized one-line schedule summary for the /today digest. */
function formatBotSchedule(
  schedule: Schedule,
  dictionary: BotDictionary
): string {
  switch (schedule.mode) {
    case "daily":
      return dictionary.scheduleEveryDay;
    case "weekly": {
      const times = schedule.timesPerWeek ?? 0;
      return times === 1
        ? dictionary.scheduleOncePerWeek
        : dictionary.scheduleTimesPerWeek(times);
    }
    case "specific_days": {
      const days = schedule.daysOfWeek ?? [];
      if (days.length === 0) return dictionary.scheduleNoDays;
      if (days.length === 7) return dictionary.scheduleEveryDay;
      return days
        .slice()
        .sort((a, b) => a - b)
        .map((day) => dictionary.weekdayShort(day))
        .join(", ");
    }
    case "flexible":
      return dictionary.scheduleEveryNDays(schedule.intervalDays ?? 1);
    default:
      return dictionary.scheduleCustom;
  }
}

/** Callback kind used to act on a habit from the keyboard. */
export function actionCallbackKind(
  habit: Pick<Habit, "type">
): "toggle" | "input" {
  return habit.type === "timed" ? "input" : "toggle";
}

interface ActionButtonOptions {
  source: "today" | "reminder";
  /** Reminder id, carried so repeat taps on one reminder can be blocked. */
  reminderId?: number;
  /** Reminder HH:mm, used to re-render the same message with fresh progress. */
  time?: string;
  /** True once this reminder's "+1" button has been used. */
  tapped?: boolean;
}

/**
 * Primary action button for a habit: quantity gets a "+1 (X/Y)" counter,
 * everything else keeps its toggle/value-input behaviour.
 */
function actionButton(
  habit: Habit,
  todayCheckin: Checkin | null,
  options: ActionButtonOptions,
  dictionary: BotDictionary
): { label: string; callback: BotCallback } {
  const done = isHabitDone(habit, todayCheckin);
  if (habit.type === "quantitative") {
    if (done) {
      return { label: dictionary.actionQuantDone, callback: { kind: "noop" } };
    }
    if (options.tapped) {
      return {
        label: dictionary.actionQuantTapped(quantitativeProgress(habit, todayCheckin)),
        callback: { kind: "noop" },
      };
    }
    return {
      label: dictionary.actionQuantIncrement(quantitativeProgress(habit, todayCheckin)),
      callback: {
        kind: "increment",
        habitId: habit.id,
        source: options.source,
        reminderId: options.reminderId,
        time: options.time,
      },
    };
  }
  const kind = actionCallbackKind(habit);
  const callback: BotCallback =
    kind === "toggle"
      ? {
          kind,
          habitId: habit.id,
          time: options.source === "reminder" ? options.time : undefined,
        }
      : { kind, habitId: habit.id };
  return {
    label: actionLabel(habit, done, dictionary),
    callback,
  };
}

/* ------------------------------ main menu ----------------------------- */

/** Default address of the local web UI. */
export const WEB_APP_URL = "http://localhost:3000";

/** Appends the shared "back to main menu" row to a keyboard. */
function withBackToMain(
  keyboard: InlineKeyboard,
  dictionary: BotDictionary
): InlineKeyboard {
  const rows = keyboard.inline_keyboard;
  // grammY seeds a keyboard with one empty row; don't add a blank one above.
  if (rows.length > 0 && rows[rows.length - 1].length > 0) keyboard.row();
  return keyboard.text(
    dictionary.backToMainButton,
    buildCallbackData({ kind: "menu_main" })
  );
}

/**
 * Returns the url only when Telegram accepts it as a button target. Telegram
 * rejects loopback/host-less links ("Wrong HTTP URL"), which is exactly what
 * `http://localhost:3000` is, so such links must degrade to callback buttons.
 */
export function telegramSafeUrl(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  const isLoopback =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "[::1]" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local");
  return isLoopback ? null : value;
}

export interface MainMenuOptions {
  /** Donation link; hidden when blank or not a Telegram-safe url. */
  donationUrl?: string | null;
  /** Web UI address; link buttons need a publicly reachable url. */
  webUrl?: string | null;
  /** Interface language of the menu copy. */
  language?: BotLanguage;
}

/**
 * The /start greeting with the inline main menu: today's habits, stats and
 * a shortcut to the web app (plus the donation link when configured).
 * Kept free of HTML tags so repeated taps can refresh only the keyboard.
 */
export function buildMainMenuMessage(options: MainMenuOptions = {}): BotMessage {
  const dictionary = dictionaryFor(options.language);
  const webUrl = telegramSafeUrl(options.webUrl);

  const keyboard = new InlineKeyboard()
    .text(
      dictionary.menuTodayButton,
      buildCallbackData({ kind: "menu_today" })
    )
    .row()
    .text(
      dictionary.menuStatsButton,
      buildCallbackData({ kind: "menu_stats" })
    );

  if (webUrl) {
    keyboard.url(dictionary.menuWebButton, webUrl);
  } else {
    // Telegram forbids localhost link buttons: show the address in the chat instead.
    keyboard.text(
      dictionary.menuWebButton,
      buildCallbackData({ kind: "menu_web" })
    );
  }

  const support = telegramSafeUrl(options.donationUrl);
  if (support) keyboard.row().url(dictionary.menuSupportButton, support);

  return {
    text: dictionary.mainGreeting,
    keyboard,
  };
}

/**
 * Explains where the web UI lives. Used when the configured address is not a
 * public url (Telegram refuses to put `http://localhost:3000` in a button),
 * so the address is printed as plain text and clients auto-linkify it.
 */
export function buildWebAppMessage(
  webUrl: string | null | undefined,
  language: BotLanguage = DEFAULT_BOT_LANGUAGE
): BotMessage {
  const dictionary = dictionaryFor(language);
  const address = webUrl?.trim() || WEB_APP_URL;
  return {
    text:
      `${dictionary.webTitle}\n\n` +
      `${dictionary.webIntro}\n\n` +
      `${escapeHtml(address)}\n\n` +
      dictionary.webHint,
    keyboard: withBackToMain(new InlineKeyboard(), dictionary),
  };
}

/** Aggregated numbers shown by the "Моя статистика" view. */
export interface TodayStats {
  /** Best current streak among today's habits. */
  streak: number;
  /** Habits already done today. */
  done: number;
  /** Habits scheduled today. */
  total: number;
}

/** Renders the "Моя статистика" view with a way back to the main menu. */
export function buildStatsMessage(
  stats: TodayStats,
  language: BotLanguage = DEFAULT_BOT_LANGUAGE
): BotMessage {
  const dictionary = dictionaryFor(language);
  return {
    text:
      `${dictionary.statsTitle}\n\n` +
      `${dictionary.statsStreak(stats.streak)}\n` +
      dictionary.statsDone(stats.done, stats.total),
    keyboard: withBackToMain(new InlineKeyboard(), dictionary),
  };
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
 * "+1" for quantitative, value input for timed).
 */
export function buildTodayMessage(
  items: TodayHabitView[],
  options: { today: string; language?: BotLanguage }
): BotMessage {
  const dictionary = dictionaryFor(options.language);
  const keyboard = new InlineKeyboard();

  if (items.length === 0) {
    return {
      text: `${dictionary.todayTitle(options.today)}\n\n${dictionary.todayEmpty}`,
      keyboard: withBackToMain(keyboard, dictionary),
    };
  }

  const lines: string[] = [];
  for (const [index, item] of items.entries()) {
    const { habit, todayCheckin, streak } = item;
    const done = isHabitDone(habit, todayCheckin);
    if (index > 0) keyboard.row(); // line break before each button but the first
    const action = actionButton(habit, todayCheckin, { source: "today" }, dictionary);
    keyboard.text(action.label, buildCallbackData(action.callback));

    const icon =
      habit.type === "negative"
        ? done
          ? "✅"
          : "❌"
        : done
          ? "✅"
          : "⬜";
    const streakPart = `🔥 ${streak}`;
    const negativePart =
      habit.type === "negative" ? dictionary.todayAvoidSuffix : "";
    const goalPart =
      habit.type === "quantitative" && done && habit.targetValue != null
        ? dictionary.todayGoalSuffix
        : "";
    const schedulePart = formatBotSchedule(
      habit.schedule as unknown as Schedule,
      dictionary
    );
    lines.push(
      `${icon} <b>${escapeHtml(habit.name)}</b> — ${streakPart}${statusSuffix(habit, todayCheckin, dictionary)}${goalPart}`
    );
    lines.push(`   <i>${escapeHtml(schedulePart + negativePart)}</i>`);
  }

  return {
    text: `${dictionary.todayTitle(options.today)}\n\n${lines.join("\n")}`,
    keyboard: withBackToMain(keyboard, dictionary),
  };
}

/* ------------------------------ reminders ------------------------------ */

/**
 * Renders a single-habit reminder. Quantitative habits show today's progress
 * and a "+1" counter; other types keep their mark-done/value-input button.
 * Pass `tapped` when re-rendering a message whose button was already used.
 */
export function buildReminderMessage(
  due: DueReminder,
  streak: number,
  habit: Habit,
  todayCheckin: Checkin | null = null,
  options: { tapped?: boolean; language?: BotLanguage } = {}
): BotMessage {
  const dictionary = dictionaryFor(options.language);
  const done = isHabitDone(habit, todayCheckin);
  const isQuantitative = habit.type === "quantitative";
  const streakPart =
    streak > 0 ? dictionary.reminderStreak(streak) : "";
  const progressPart = isQuantitative
    ? dictionary.reminderProgress(
        quantitativeProgress(habit, todayCheckin),
        habit.unit ? ` ${escapeHtml(habit.unit)}` : ""
      )
    : "";
  const goalPart =
    isQuantitative && done && habit.targetValue != null
      ? `\n${dictionary.todayGoalBanner}`
      : "";
  const text =
    `⏰ <b>${escapeHtml(due.habitName)}</b>\n` +
    `${dictionary.reminderScheduled(due.time)}${streakPart}${progressPart}${goalPart}\n\n` +
    dictionary.reminderFooter;

  const keyboard = new InlineKeyboard();
  if (isQuantitative) {
    const action = actionButton(
      habit,
      todayCheckin,
      {
        source: "reminder",
        reminderId: due.reminderId > 0 ? due.reminderId : undefined,
        time: due.time,
        tapped: options.tapped,
      },
      dictionary
    );
    keyboard.text(action.label, buildCallbackData(action.callback));
  } else {
    const label =
      habit.type === "timed"
        ? dictionary.reminderTimedButton
        : habit.type === "negative"
          ? dictionary.reminderSlipButton
          : dictionary.reminderDoneButton;
    const kind = actionCallbackKind(habit);
    const callback: BotCallback =
      kind === "toggle"
        ? { kind, habitId: due.habitId, time: due.time }
        : { kind, habitId: due.habitId };
    keyboard.text(label, buildCallbackData(callback));
  }

  return { text, keyboard };
}

/* ------------------------------ /support ------------------------------ */

/**
 * Renders the /support reply. A non-blank donation url yields a message with a
 * "💖 Поддержать" url button; otherwise a polite note that donations are off
 * for this build (no keyboard at all).
 */
export function buildSupportMessage(
  url: string | null | undefined,
  language: BotLanguage = DEFAULT_BOT_LANGUAGE
): BotMessage {
  const dictionary = dictionaryFor(language);
  const donationUrl = url?.trim();
  if (!donationUrl) {
    return { text: dictionary.supportDisabled };
  }
  return {
    text: `${dictionary.supportTitle}\n\n${dictionary.supportBody}`,
    keyboard: new InlineKeyboard().url(
      dictionary.supportButton,
      donationUrl
    ),
  };
}

/* ------------------------------ /language ----------------------------- */

/** Language picker with two inline buttons and a way back to the menu. */
export function buildLanguageMessage(
  language: BotLanguage = DEFAULT_BOT_LANGUAGE
): BotMessage {
  const dictionary = dictionaryFor(language);
  const keyboard = new InlineKeyboard()
    .text(
      dictionary.languageRuButton,
      buildCallbackData({ kind: "language", language: "ru" })
    )
    .row()
    .text(
      dictionary.languageEnButton,
      buildCallbackData({ kind: "language", language: "en" })
    );

  return {
    text: dictionary.languagePrompt,
    keyboard: withBackToMain(keyboard, dictionary),
  };
}

/** Confirmation shown after a language button is pressed, in the new language. */
export function buildLanguageChangedMessage(
  language: BotLanguage = DEFAULT_BOT_LANGUAGE
): BotMessage {
  const dictionary = dictionaryFor(language);
  return {
    text: dictionary.languageChanged,
    keyboard: withBackToMain(new InlineKeyboard(), dictionary),
  };
}
