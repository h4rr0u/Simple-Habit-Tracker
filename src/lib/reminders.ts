import {
  getCheckinsForRange,
  getHabitSchedule,
  getRemindersForHabit,
  listHabits,
} from "@/db/queries";
import { isHabitDueOn, type Schedule } from "@/types/schedule";

/**
 * Reminder scheduling.
 *
 * A reminder is due in the minute represented by `now` when:
 * - its stored HH:mm time matches the current time (minute precision),
 * - `now` falls on one of its `daysOfWeek`,
 * - it is enabled,
 * - the habit is active (not archived),
 * - the habit is due today per its schedule,
 * - the habit has no check-in recorded for today.
 *
 * Delivery itself (Telegram, notifications) is out of scope here.
 */

/** A reminder together with the habit it belongs to. */
export interface DueReminder {
  reminderId: number;
  habitId: number;
  habitName: string;
  /** HH:mm, as stored. */
  time: string;
  /** Weekdays the reminder fires on (0 = Sunday … 6 = Saturday). */
  daysOfWeek: number[];
}

/** "HH:mm" key for a Date in local time. */
function timeKeyOf(date: Date): string {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** ISO day key (YYYY-MM-DD) for a Date in local time. */
function dayKeyOf(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Returns enabled reminders that fall due within the minute of `now` for
 * habits that are scheduled today and not yet checked in today.
 */
export async function getDueReminders(now: Date = new Date()): Promise<DueReminder[]> {
  const time = timeKeyOf(now);
  const day = dayKeyOf(now);

  const habits = await listHabits({ includeArchived: false });
  const due: DueReminder[] = [];

  for (const habit of habits) {
    const schedule: Schedule = getHabitSchedule(habit);
    if (!isHabitDueOn(schedule, now)) continue;

    const todaysCheckins = await getCheckinsForRange(habit.id, day, day);
    if (todaysCheckins.length > 0) continue;

    const reminders = await getRemindersForHabit(habit.id, { enabledOnly: true });
    for (const reminder of reminders) {
      if (reminder.time !== time) continue;
      if (!reminder.daysOfWeek.includes(now.getDay())) continue;
      due.push({
        reminderId: reminder.id,
        habitId: habit.id,
        habitName: habit.name,
        time: reminder.time,
        daysOfWeek: reminder.daysOfWeek,
      });
    }
  }

  return due;
}
