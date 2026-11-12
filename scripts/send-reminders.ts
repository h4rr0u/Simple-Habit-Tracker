import { shutdown } from "node-cron";

import { startReminderCron } from "@/bot/reminders";

/**
 * Reminder cron runner: evaluates due reminders every minute and delivers
 * them via Telegram. Deduplication is guaranteed by the reminder_log
 * unique (habitId, date) index, so restarting the process mid-minute never
 * sends the same reminder twice.
 *
 * Run with: npm run reminders:dev
 */

console.log("[reminders] starting habit reminder scheduler...");
startReminderCron();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    console.log(`[reminders] received ${signal}, shutting down...`);
    void shutdown().finally(() => process.exit(0));
  });
}
