import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { HabitDetailView } from "@/components/habit-detail-view";
import { db } from "@/db";
import { checkins } from "@/db/schema";
import { getFreezeHistories, getHabitById, listHabitCategories } from "@/db/queries";
import { buildCompletionCheckins } from "@/lib/habit-target";
import { buildHeatmap } from "@/lib/heatmap";
import { calculateCurrentStreak, calculateLongestStreak, getCompletionRate } from "@/lib/streaks";
import type { Schedule } from "@/types/schedule";

/**
 * Habit detail page: stats, 12-week heatmap and Edit / Archive actions.
 */

export const dynamic = "force-dynamic";

export default async function HabitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const habitId = Number(id);
  if (!Number.isInteger(habitId) || habitId <= 0) notFound();

  const habit = await getHabitById(habitId);
  if (!habit) notFound();

  const freezeHistories = await getFreezeHistories();
  const categories = await listHabitCategories();

  const rows = await db
    .select()
    .from(checkins)
    .where(eq(checkins.habitId, habitId))
    .orderBy(asc(checkins.date));

  const schedule = habit.schedule as unknown as Schedule;
  const now = new Date();
  const completion = buildCompletionCheckins(habit, rows, now);

  const current = calculateCurrentStreak(
    completion,
    schedule,
    habit.freezeBank,
    now,
    habit.createdAt,
    freezeHistories.get(habitId)
  );
  const longest = calculateLongestStreak(completion, schedule, habit.createdAt);
  const rate90 = getCompletionRate(
    completion,
    schedule,
    new Date(Date.now() - 90 * 86400000),
    now,
    habit.createdAt
  );
  const checkinDates = new Set(completion.map((r) => r.date));
  const weeks = buildHeatmap(checkinDates, habit.createdAt, now, 12);

  return (
    <HabitDetailView
      habit={habit}
      schedule={schedule}
      stats={{
        current: current.streak,
        longest,
        rate90,
      }}
      weeks={weeks}
      categories={categories}
    />
  );
}
