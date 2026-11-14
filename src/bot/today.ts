import { asc, inArray } from "drizzle-orm";
import { format, startOfDay } from "date-fns";

import { db } from "@/db";
import { checkins } from "@/db/schema";
import { listHabits } from "@/db/queries";
import { buildCompletionCheckins } from "@/lib/habit-target";
import { calculateCurrentStreak } from "@/lib/streaks";
import { isHabitDueOn, type Schedule } from "@/types/schedule";
import type { TodayHabitView } from "./messages";

/**
 * Side-effect-free data assembly for the bot's views, shared by the
 * long-polling entry point and the reminder cron. Importing this module
 * never starts the bot.
 */

/** Local ISO day key (YYYY-MM-DD) for a date. */
export function todayKey(now: Date = new Date()): string {
  return format(startOfDay(now), "yyyy-MM-dd");
}

/** Assembles today's scheduled habits with check-in state and streaks. */
export async function getTodayViews(now: Date = new Date()): Promise<TodayHabitView[]> {
  const today = todayKey(now);
  const habits = (await listHabits({ includeArchived: false })).filter((habit) =>
    isHabitDueOn(habit.schedule as unknown as Schedule, now, habit.createdAt)
  );
  if (habits.length === 0) return [];

  const histories = await db
    .select()
    .from(checkins)
    .where(inArray(checkins.habitId, habits.map((habit) => habit.id)))
    .orderBy(asc(checkins.date));

  return habits.map((habit) => {
    const schedule = habit.schedule as unknown as Schedule;
    const history = histories.filter((checkin) => checkin.habitId === habit.id);
    const todayCheckin = history.find((checkin) => checkin.date === today) ?? null;
    const completion = buildCompletionCheckins(habit, history, now);
    const { streak } = calculateCurrentStreak(
      completion,
      schedule,
      habit.freezeBank,
      now,
      habit.createdAt
    );
    return { habit, todayCheckin, streak };
  });
}
