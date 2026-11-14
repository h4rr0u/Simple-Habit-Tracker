import { asc, inArray } from "drizzle-orm";
import { format, startOfDay } from "date-fns";

import { HabitsPageClient, type HabitCardData } from "@/components/habits-page-client";
import { db } from "@/db";
import { checkins, type Checkin } from "@/db/schema";
import { listHabits, getFreezeHistories } from "@/db/queries";
import { buildCompletionCheckins, isHabitDueOnDate } from "@/lib/habit-target";
import { calculateCurrentStreak } from "@/lib/streaks";
import type { Schedule } from "@/types/schedule";

/**
 * Habits management page: grid of interactive habit cards with streaks,
 * check-in controls and the create/edit dialog.
 */

export const dynamic = "force-dynamic";

export default async function HabitsPage() {
  const now = new Date();
  const today = format(startOfDay(now), "yyyy-MM-dd");
  const allHabits = await listHabits({ includeArchived: false });
  const freezeHistories = await getFreezeHistories();

  const habitIds = allHabits.map((h) => h.id);
  const allCheckins = habitIds.length
    ? await db
        .select()
        .from(checkins)
        .where(inArray(checkins.habitId, habitIds))
        .orderBy(asc(checkins.date))
    : [];

  // Group once instead of filtering the whole list per habit.
  const checkinsByHabit = new Map<number, Checkin[]>();
  for (const checkin of allCheckins) {
    const bucket = checkinsByHabit.get(checkin.habitId);
    if (bucket) bucket.push(checkin);
    else checkinsByHabit.set(checkin.habitId, [checkin]);
  }

  const cards: HabitCardData[] = allHabits.map((habit) => {
    const schedule = habit.schedule as unknown as Schedule;
    const history = checkinsByHabit.get(habit.id) ?? [];
    const completion = buildCompletionCheckins(habit, history, now);
    const streakResult = calculateCurrentStreak(
      completion,
      schedule,
      habit.freezeBank,
      now,
      habit.createdAt,
      freezeHistories.get(habit.id)
    );
    const todayCheckin = history.find((c) => c.date === today) ?? null;
    const isDueToday = isHabitDueOnDate(habit, now);
    return {
      habit,
      streak: streakResult.streak,
      todayCheckin,
      isDueToday,
    };
  });

  return <HabitsPageClient today={today} cards={cards} />;
}
