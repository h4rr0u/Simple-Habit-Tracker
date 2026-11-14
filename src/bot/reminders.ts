import { Bot } from "grammy";
import { schedule, type ScheduledTask } from "node-cron";

import {
  getHabitById,
  getTelegramChatId,
  markReminderSent,
  unmarkReminderSent,
} from "@/db/queries";
import { getDueReminders } from "@/lib/reminders";
import { getChatLanguage } from "./language";
import { buildReminderMessage } from "./messages";
import { getTodayViews, todayKey } from "./today";

/**
 * Reminder delivery for Telegram.
 *
 * Every minute the cron picks up the reminders that are due right now
 * (phase 2's {@link getDueReminders} already filters out completed habits),
 * claims the one-send slot per (reminderId, date) in `reminder_log`, and
 * sends the message to the bound chat. A claimed slot whose delivery failed
 * is released again so a restarted process can retry.
 */

export interface ReminderSweepResult {
  /** Reminders due in this minute. */
  evaluated: number;
  /** Slots newly claimed in reminder_log (duplicates are skipped silently). */
  claimed: number;
  /** Successfully delivered messages. */
  sent: number;
  /** Failed deliveries (their claim is released for retry). */
  failed: number;
}

/** Sends Telegram messages for every reminder due at `now`. */
export async function runReminderSweep(now: Date = new Date()): Promise<ReminderSweepResult> {
  const result: ReminderSweepResult = { evaluated: 0, claimed: 0, sent: 0, failed: 0 };

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("[reminders] TELEGRAM_BOT_TOKEN is not set.");
    return result;
  }

  const due = await getDueReminders(now);
  result.evaluated = due.length;
  if (due.length === 0) return result;

  const chatId = await getTelegramChatId();
  if (chatId == null) {
    console.warn("[reminders] no chat is linked yet — send /start to the bot first.");
    return result;
  }

  // Today's view carries streaks and partial progress for the due habits.
  const views = await getTodayViews(now);
  const viewByHabit = new Map(views.map((view) => [view.habit.id, view]));

  const api = new Bot(token).api;
  const day = todayKey(now);
  const language = await getChatLanguage(chatId);

  for (const reminder of due) {
    const claimed = await markReminderSent(reminder.reminderId, reminder.habitId, day);
    if (!claimed) {
      console.log(`[reminders] duplicate suppressed for habit ${reminder.habitId} on ${day}`);
      continue;
    }
    result.claimed++;

    const view = viewByHabit.get(reminder.habitId);
    const habit = view?.habit ?? (await getHabitById(reminder.habitId));
    if (!habit) continue;

    const { text, keyboard } = buildReminderMessage(
      reminder,
      view?.streak ?? 0,
      habit,
      view?.todayCheckin ?? null,
      { language }
    );
    try {
      await api.sendMessage(chatId, text, { parse_mode: "HTML", reply_markup: keyboard });
      result.sent++;
    } catch (error) {
      result.failed++;
      await unmarkReminderSent(reminder.reminderId, day);
      console.error(`[reminders] failed to send reminder for habit ${reminder.habitId}:`, error);
    }
  }

  return result;
}

/** Validates the token eagerly; the cron cannot work without it. */
function requireToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error(
      "[reminders] TELEGRAM_BOT_TOKEN is not set.\n" +
        "Create a bot with @BotFather, then put the token into the .env file:\n" +
        "  TELEGRAM_BOT_TOKEN=123456:ABC-DEF..."
    );
    process.exit(1);
  }
  return token;
}

/**
 * Starts the every-minute cron. Returns the task so tests/embedders can
 * stop it.
 */
export function startReminderCron(): ScheduledTask {
  requireToken();
  const task = schedule(
    "* * * * *",
    async () => {
      try {
        const result = await runReminderSweep();
        if (result.evaluated > 0) {
          console.log(
            `[reminders] sweep: ${result.evaluated} due, ${result.sent} sent, ` +
              `${result.claimed - result.sent} duplicates suppressed, ${result.failed} failed`
          );
        }
      } catch (error) {
        console.error("[reminders] sweep failed:", error);
      }
    },
    { name: "habit-reminders", noOverlap: true }
  );
  console.log('[reminders] cron started — pattern "* * * * *" (every minute)');
  return task;
}
