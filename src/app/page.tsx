import { asc, inArray } from "drizzle-orm";
import { format, startOfDay } from "date-fns";

import { DashboardClient } from "@/components/dashboard-client";
import { db } from "@/db";
import { checkins } from "@/db/schema";
import { listHabits, getFreezeHistories } from "@/db/queries";
import {
  buildCompletionCheckins,
  isHabitDayComplete,
  isHabitDueOnDate,
} from "@/lib/habit-target";
import { calculateCurrentStreak } from "@/lib/streaks";
import type { Schedule } from "@/types/schedule";

/**
 * Dashboard: today's scheduled habits with quick check-off, day progress
 * ring, freeze banks and top-3 streaks.
 */

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
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

  const todayItems = allHabits
    .map((habit) => {
      const schedule = habit.schedule as unknown as Schedule;
      const history = allCheckins.filter((c) => c.habitId === habit.id);
      const todayCheckin = history.find((c) => c.date === today) ?? null;
      const completion = buildCompletionCheckins(habit, history, now);
      const streakResult = calculateCurrentStreak(
        completion,
        schedule,
        habit.freezeBank,
        now,
        habit.createdAt,
        freezeHistories.get(habit.id)
      );

      // Negative habits are inverted: a day is complete when no slip exists.
      const done = isHabitDayComplete(habit, todayCheckin);

      return {
        habit,
        streak: streakResult.streak,
        todayCheckin,
        done,
        isDueToday: isHabitDueOnDate(habit, now),
      };
    })
    .filter((item) => item.isDueToday);

  const topStreaks = [...allHabits]
    .map((habit) => {
      const schedule = habit.schedule as unknown as Schedule;
      const history = allCheckins.filter((c) => c.habitId === habit.id);
      const completion = buildCompletionCheckins(habit, history, now);
      const streak = calculateCurrentStreak(
        completion,
        schedule,
        habit.freezeBank,
        now,
        habit.createdAt,
        freezeHistories.get(habit.id)
      );
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
      totalHabits={allHabits.length}
    />
  );
}
