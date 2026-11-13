import { asc, inArray } from "drizzle-orm";
import { format, startOfDay } from "date-fns";

import { DashboardClient } from "@/components/dashboard-client";
import { db } from "@/db";
import { checkins } from "@/db/schema";
import { listHabits } from "@/db/queries";
import { meetsHabitTarget } from "@/lib/habit-target";
import { calculateCurrentStreak } from "@/lib/streaks";
import { isHabitDueOn, type Schedule } from "@/types/schedule";

/**
 * Dashboard: today's scheduled habits with quick check-off, day progress
 * ring, freeze banks and top-3 streaks.
 */

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
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

  const todayItems = allHabits
    .map((habit) => {
      const schedule = habit.schedule as unknown as Schedule;
      const history = allCheckins.filter((c) => c.habitId === habit.id);
      const todayCheckin = history.find((c) => c.date === today) ?? null;
      const streakResult = calculateCurrentStreak(history, schedule, habit.freezeBank);

      // A habit counts as done today when a check-in exists and meets its target.
      const done = todayCheckin ? meetsHabitTarget(habit, todayCheckin.value) : false;

      return {
        habit,
        streak: streakResult.streak,
        todayCheckin,
        done,
        isDueToday: isHabitDueOn(schedule, now),
      };
    })
    .filter((item) => item.isDueToday);

  const topStreaks = [...allHabits]
    .map((habit) => {
      const schedule = habit.schedule as unknown as Schedule;
      const history = allCheckins.filter((c) => c.habitId === habit.id);
      const streak = calculateCurrentStreak(history, schedule, habit.freezeBank);
      return { habit, streak: streak.streak };
    })
    .sort((a, b) => b.streak - a.streak)
    .slice(0, 3);

  const totalFreezes = allHabits.reduce((sum, h) => sum + h.freezeBank, 0);

  return (
    <DashboardClient
      today={today}
      todayItems={todayItems}
      topStreaks={topStreaks}
      totalFreezes={totalFreezes}
    />
  );
}
