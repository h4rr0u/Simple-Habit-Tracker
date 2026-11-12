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

  const habitNames = new Map(habits.map((habit) => [habit.id, habit.name]));
  const rows: ReminderRow[] = reminders.map((reminder) => ({
    id: reminder.id,
    habitId: reminder.habitId,
    habitName: habitNames.get(reminder.habitId) ?? "Unknown habit",
    time: reminder.time,
    daysOfWeek: reminder.daysOfWeek,
    enabled: reminder.enabled,
  }));

  return (
    <SettingsClient
      chatId={chatId ?? null}
      habits={habits.map((habit) => ({ id: habit.id, name: habit.name, color: habit.color }))}
      reminders={rows}
    />
  );
}
