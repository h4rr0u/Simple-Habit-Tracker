import { addDays, format, startOfDay } from "date-fns";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import { AnalyticsView } from "@/components/analytics/analytics-view";
import { db } from "@/db";
import { checkins, habits, type Checkin, type Habit } from "@/db/schema";
import {
  buildDayContributions,
  buildDailySeries,
  buildHabitHistory,
  buildWeekdaySeries,
  buildYearCells,
  computeRecords,
  getAverageRate,
  type HabitHistory,
} from "@/lib/analytics";
import type { AnalyticsData, HabitSummary } from "@/types/analytics";

/**
 * Analytics page: completion charts, records and the year heatmap.
 *
 * All aggregations run in a Server Component over direct Drizzle queries and
 * are read live on every request, so changes made in another tab or by the
 * Telegram bot show up as soon as the view is refreshed. Rendering is
 * delegated to the client `AnalyticsView`, which owns the translated labels.
 */

export const dynamic = "force-dynamic";

const PERIOD_CHOICES = ["7", "30", "90"] as const;

/** URL filter contract; anything invalid silently falls back to defaults. */
const searchParamsSchema = z.object({
  period: z.enum(PERIOD_CHOICES).default("30"),
  habit: z
    .union([z.literal("all"), z.string().regex(/^\d+$/)])
    .default("all"),
});

/**
 * Loads and aggregates everything the page renders. `todayKey` pins the
 * analysed window to the current local day.
 * `listHabits` is intentionally NOT used here: this loader only needs raw
 * habits, and pages must stay free of the freeze-write path entirely.
 */
async function loadAnalyticsData(
  periodDays: number,
  habitId: number | null,
  todayKey: string
): Promise<{ data: AnalyticsData; habits: HabitSummary[] }> {
  const habitRows = await db
    .select()
    .from(habits)
    .where(
      habitId
        ? and(isNull(habits.archivedAt), eq(habits.id, habitId))
        : isNull(habits.archivedAt)
    )
    .orderBy(asc(habits.id));

  const rowsByHabit = new Map<number, Checkin[]>();
  if (habitRows.length > 0) {
    const rows = await db
      .select()
      .from(checkins)
      .where(
        inArray(
          checkins.habitId,
          habitRows.map((habit) => habit.id)
        )
      )
      .orderBy(asc(checkins.date));
    for (const row of rows) {
      const bucket = rowsByHabit.get(row.habitId);
      if (bucket) bucket.push(row);
      else rowsByHabit.set(row.habitId, [row]);
    }
  }

  const histories: HabitHistory[] = habitRows.map((habit: Habit) =>
    buildHabitHistory(habit, rowsByHabit.get(habit.id) ?? [])
  );
  const scope = habitId
    ? histories.filter((history) => history.habit.id === habitId)
    : histories;

  const [y, m, d] = todayKey.split("-").map(Number);
  const today = new Date(y, m - 1, d);
  const from = addDays(today, -(periodDays - 1));

  const contributions = buildDayContributions(scope, from, today);
  const scheduledTotal = contributions.reduce(
    (sum, day) => sum + day.scheduled,
    0
  );

  return {
    data: {
      daily: buildDailySeries(contributions),
      weekdays: buildWeekdaySeries(contributions),
      averageRate: getAverageRate(contributions),
      scheduledTotal,
      // Records stay global (across all habits) regardless of the filter.
      records: computeRecords(histories, from, today),
      year: buildYearCells(scope, addDays(today, -364), today),
    },
    habits: habitRows.map((habit) => ({ id: habit.id, name: habit.name })),
  };
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const parsed = searchParamsSchema.safeParse({
    period: raw.period,
    habit: raw.habit,
  });
  const period = parsed.success ? parsed.data.period : "30";
  const habitKey = parsed.success ? parsed.data.habit : "all";
  const periodDays = Number(period);
  const habitId = habitKey === "all" ? null : Number(habitKey);

  const todayKey = format(startOfDay(new Date()), "yyyy-MM-dd");
  const { data, habits: habitSummaries } = await loadAnalyticsData(
    periodDays,
    habitId,
    todayKey
  );

  return (
    <AnalyticsView
      period={period}
      habitId={habitKey}
      habits={habitSummaries}
      data={habitSummaries.length === 0 ? null : data}
    />
  );
}
