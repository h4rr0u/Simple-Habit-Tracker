import { addDays, format, startOfDay } from "date-fns";
import { asc, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import { AnalyticsView } from "@/components/analytics/analytics-view";
import { db } from "@/db";
import { getLongTermStats } from "@/db/queries";
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
import {
  computeCorrelations,
  type CorrelationResult,
} from "@/lib/correlations";
import {
  LONG_TERM_PERIODS,
  type LongTermPeriod,
  type LongTermStats,
} from "@/lib/long-term-stats";
import {
  computeTimePatternStats,
  type TimePatternStats,
} from "@/lib/time-stats";
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
  // Long-term trend window (12 / 36 / 60 months). Kept in the URL so the
  // server aggregates exactly the selected window; the client never slices it.
  trend: z.enum(LONG_TERM_PERIODS).default("12"),
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
  todayKey: string,
  trend: LongTermPeriod
): Promise<{
  data: AnalyticsData;
  /** All active habits, for the filter dropdown. */
  habits: HabitSummary[];
  /** False when there is nothing to chart (no habits, or the filter missed). */
  hasScope: boolean;
  correlations: CorrelationResult;
  /** Weekday/time-of-day patterns over the last 90 days. */
  timePatterns: TimePatternStats;
  /** Monthly completion trend over the selected multi-year window. */
  longTerm: LongTermStats;
}> {
  // All active habits are loaded so the filter dropdown stays complete and
  // the correlation block always compares the full habit set; the selected
  // habit is then applied in memory (still two queries in total).
  const allHabitRows = await db
    .select()
    .from(habits)
    .where(isNull(habits.archivedAt))
    .orderBy(asc(habits.id));
  const habitRows = habitId
    ? allHabitRows.filter((habit) => habit.id === habitId)
    : allHabitRows;

  const rowsByHabit = new Map<number, Checkin[]>();
  if (allHabitRows.length > 0) {
    const rows = await db
      .select()
      .from(checkins)
      .where(
        inArray(
          checkins.habitId,
          allHabitRows.map((habit) => habit.id)
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

  const [y, m, d] = todayKey.split("-").map(Number);
  const today = new Date(y, m - 1, d);
  const from = addDays(today, -(periodDays - 1));

  const contributions = buildDayContributions(histories, from, today);
  const scheduledTotal = contributions.reduce(
    (sum, day) => sum + day.scheduled,
    0
  );

  // Correlations always look at the last 90 days across all active habits,
  // independent of the period/habit filters, and reuse the check-ins already
  // loaded for the charts.
  const correlations = computeCorrelations(
    allHabitRows,
    Array.from(rowsByHabit.values()).flat(),
    { from: addDays(today, -89), to: today }
  );

  // Time patterns also use a fixed 90-day window and, like correlations, ignore
  // the period/habit filters so the block stays stable while the user browses
  // habits. Negative habits are skipped: their rows record slips, not
  // completions.
  const patternFrom = format(addDays(today, -89), "yyyy-MM-dd");
  const patternRows = allHabitRows
    .filter((habit) => habit.type !== "negative")
    .flatMap((habit) => rowsByHabit.get(habit.id) ?? [])
    .filter((row) => row.date >= patternFrom && row.date <= todayKey);
  const timePatterns = computeTimePatternStats(patternRows);

  // One SQL query groups check-ins by habit-month; the selected window lives in
  // the URL so the client never filters years of points itself.
  const longTerm = await getLongTermStats(trend, today);

  return {
    data: {
      daily: buildDailySeries(contributions),
      weekdays: buildWeekdaySeries(contributions),
      averageRate: getAverageRate(contributions),
      scheduledTotal,
      // Records stay global (across all habits) regardless of the filter.
      records: computeRecords(histories, from, today),
      year: buildYearCells(histories, addDays(today, -364), today),
    },
    habits: allHabitRows.map((habit) => ({ id: habit.id, name: habit.name })),
    hasScope: habitRows.length > 0,
    correlations,
    timePatterns,
    longTerm,
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
    trend: raw.trend,
  });
  const period = parsed.success ? parsed.data.period : "30";
  const habitKey = parsed.success ? parsed.data.habit : "all";
  const trend = parsed.success ? parsed.data.trend : "12";
  const periodDays = Number(period);
  const habitId = habitKey === "all" ? null : Number(habitKey);

  const todayKey = format(startOfDay(new Date()), "yyyy-MM-dd");
  const {
    data,
    habits: habitSummaries,
    hasScope,
    correlations,
    timePatterns,
    longTerm,
  } = await loadAnalyticsData(periodDays, habitId, todayKey, trend);

  return (
    <AnalyticsView
      period={period}
      habitId={habitKey}
      trend={trend}
      habits={habitSummaries}
      data={hasScope ? data : null}
      correlations={correlations}
      timePatterns={timePatterns}
      longTerm={longTerm}
    />
  );
}
