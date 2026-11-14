import {
  getTelegramChatId,
  listHabits,
  listReminders,
} from "@/db/queries";
import { SettingsClient, type ReminderRow } from "@/components/settings/settings-client";

/**
 * Settings page: Telegram binding (chat id) and per-habit reminders.
 */

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [chatId, habits, reminders] = await Promise.all([
    getTelegramChatId(),
    listHabits({ includeArchived: false }),
    listReminders(),
  ]);

  // Optional donation link. Read on the server (the page is dynamic) and passed
  // down as a prop, so the card simply disappears when the variable is unset.
  const donationUrl = process.env.DONATION_URL?.trim() || null;

  const habitNames = new Map(habits.map((habit) => [habit.id, habit.name]));
  const rows: ReminderRow[] = reminders.map((reminder) => ({
    id: reminder.id,
    habitId: reminder.habitId,
    habitName: habitNames.get(reminder.habitId) ?? null,
    time: reminder.time,
    daysOfWeek: reminder.daysOfWeek,
    enabled: reminder.enabled,
  }));

  return (
    <SettingsClient
      chatId={chatId ?? null}
      habits={habits.map((habit) => ({ id: habit.id, name: habit.name, color: habit.color }))}
      reminders={rows}
      donationUrl={donationUrl}
    />
  );
}
