import {
  getCheckinsForHabitsOnDate,
  getHabitSchedule,
  getReminderCandidatesAt,
} from "@/db/queries";
import type { Checkin, Habit, Reminder } from "@/db/schema";
import { isHabitDayComplete } from "@/lib/habit-target";
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
 * - the day is not already complete: binary habits are skipped once checked
 *   in, quantitative/timed habits only once their target is reached, and
 *   negative habits once a slip is logged.
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
 *
 * Runs in two queries instead of one per habit: a reminder/habit join for the
 * current minute, then one batched check-in lookup for the involved habits.
 */
export async function getDueReminders(now: Date = new Date()): Promise<DueReminder[]> {
  const time = timeKeyOf(now);
  const day = dayKeyOf(now);
  const dayOfWeek = now.getDay();

  const candidates = await getReminderCandidatesAt(time);
  if (candidates.length === 0) return [];

  // Group candidates per habit so the schedule/completion work happens once
  // per habit even when it has several reminders at the same minute.
  const habitsById = new Map<number, Habit>();
  const remindersByHabit = new Map<number, Reminder[]>();
  for (const { habit, reminder } of candidates) {
    if (!habitsById.has(habit.id)) habitsById.set(habit.id, habit);
    const bucket = remindersByHabit.get(habit.id);
    if (bucket) bucket.push(reminder);
    else remindersByHabit.set(habit.id, [reminder]);
  }

  const checkins = await getCheckinsForHabitsOnDate([...habitsById.keys()], day);
  const todayCheckinByHabit = new Map<number, Checkin>();
  for (const checkin of checkins) {
    todayCheckinByHabit.set(checkin.habitId, checkin);
  }

  const due: DueReminder[] = [];
  for (const habit of habitsById.values()) {
    const schedule: Schedule = getHabitSchedule(habit);
    if (!isHabitDueOn(schedule, now, habit.createdAt)) continue;

    const todaysCheckin = todayCheckinByHabit.get(habit.id) ?? null;

    // A negative habit's check-in is a slip, so it must not be treated as a
    // completed day (isHabitDayComplete would invert the meaning).
    const dayComplete =
      habit.type === "negative"
        ? todaysCheckin != null
        : isHabitDayComplete(habit, todaysCheckin);
    if (dayComplete) continue;

    for (const reminder of remindersByHabit.get(habit.id) ?? []) {
      if (!reminder.daysOfWeek.includes(dayOfWeek)) continue;
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
