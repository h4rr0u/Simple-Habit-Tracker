import { asc, eq, inArray } from "drizzle-orm";
import { format, startOfDay } from "date-fns";

import { HabitsPageClient, type HabitCardData } from "@/components/habits-page-client";
import { db } from "@/db";
import { checkins } from "@/db/schema";
import { listHabits } from "@/db/queries";
import { calculateCurrentStreak } from "@/lib/streaks";
import { isHabitDueOn, type Schedule } from "@/types/schedule";

/**
 * Habits management page: grid of interactive habit cards with streaks,
 * check-in controls and the create/edit dialog.
 */

export const dynamic = "force-dynamic";

export default async function HabitsPage() {
  const now = new Date();
  const today = format(startOfDay(now), "yyyy-MM-dd");
  const allHabits = await listHabits({ includeArchived: false });

  const habitIds = allHabits.map((h) => h.id);
  const allCheckins = habitIds.length
    ? await db
        .select()
        .from(checkins)
        .where(inArray(checkins.habitId, habitIds))
        .orderBy(asc(checkins.date))
    : [];

  const cards: HabitCardData[] = allHabits.map((habit) => {
    const schedule = habit.schedule as unknown as Schedule;
    const history = allCheckins.filter((c) => c.habitId === habit.id);
    const streakResult = calculateCurrentStreak(history, schedule, habit.freezeBank);
    const todayCheckin = history.find((c) => c.date === today) ?? null;
    const isDueToday = isHabitDueOn(schedule, now);
    return {
      habit,
      streak: streakResult.streak,
      todayCheckin,
      isDueToday,
    };
  });

  return <HabitsPageClient today={today} cards={cards} />;
}
