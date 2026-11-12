import { addDays, format, startOfDay } from "date-fns";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import Link from "next/link";
import { Suspense } from "react";
import { unstable_cache } from "next/cache";
import { z } from "zod";

import { AnalyticsFilters } from "@/components/analytics/analytics-filters";
import { AverageRadialChart } from "@/components/analytics/average-radial-chart";
import { CompletionLineChart } from "@/components/analytics/completion-line-chart";
import { formatPercent } from "@/components/analytics/chart-theme";
import { WeekdayBarChart } from "@/components/analytics/weekday-bar-chart";
import { YearHeatmap } from "@/components/analytics/year-heatmap";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import type {
  AnalyticsData,
  HabitRecordStat,
  HabitSummary,
} from "@/types/analytics";

/**
 * Analytics page: completion charts, records and the year heatmap.
 *
 * All aggregations run in a Server Component over direct Drizzle queries and
 * are memoized with `unstable_cache` (60s) so filters toggle cheaply.
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

const PERIOD_LABELS: Record<(typeof PERIOD_CHOICES)[number], string> = {
  "7": "Last 7 days",
  "30": "Last 30 days",
  "90": "Last 90 days",
};

/**
 * Loads and aggregates everything the page renders. `todayKey` pins the
 * analysed window so the cache stays coherent for the whole day.
 * `listHabits` is intentionally NOT used here: it has a freeze-accrual
 * DB-write side effect that must not run inside a cached function.
 */
const loadAnalyticsData = unstable_cache(
  async (
    periodDays: number,
    habitId: number | null,
    todayKey: string
  ): Promise<{ data: AnalyticsData; habits: HabitSummary[] }> => {
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
  },
  ["analytics-v1"],
  { revalidate: 60 }
);

function RecordCard({
  label,
  stat,
  formatValue,
}: {
  label: string;
  stat: HabitRecordStat | null;
  formatValue: (stat: HabitRecordStat) => string;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle>{stat ? formatValue(stat) : "—"}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">
          {stat ? stat.name : "No data yet"}
        </p>
      </CardContent>
    </Card>
  );
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

  if (habitSummaries.length === 0) {
    const habitMissing = habitId !== null;
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <Card>
          <CardHeader>
            <CardTitle>
              {habitMissing ? "Habit not found" : "No habits to analyse yet"}
            </CardTitle>
            <CardDescription>
              {habitMissing
                ? "The selected habit doesn't exist or has been archived."
                : "Create your first habit to see completion charts and records here."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/habits">
                {habitMissing ? "Back to habits" : "Go to habits"}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const periodLabel = PERIOD_LABELS[period];
  const hasData = data.scheduledTotal > 0;
  const { longestStreak, mostStable, mostProblematic } = data.records;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <div className="ml-auto">
          <Suspense fallback={null}>
            <AnalyticsFilters
              habits={habitSummaries}
              period={period}
              habitId={habitKey}
            />
          </Suspense>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <RecordCard
          label="Longest streak"
          stat={longestStreak}
          formatValue={(stat) => `${stat.longestStreak} 🔥`}
        />
        <RecordCard
          label="Most stable"
          stat={mostStable}
          formatValue={(stat) => formatPercent(stat.completionRate ?? 0)}
        />
        <RecordCard
          label="Needs attention"
          stat={mostProblematic}
          formatValue={(stat) => formatPercent(stat.completionRate ?? 0)}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Daily completion</CardTitle>
            <CardDescription>{periodLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            <CompletionLineChart data={data.daily} hasData={hasData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Average completion</CardTitle>
            <CardDescription>{periodLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            <AverageRadialChart averageRate={data.averageRate} hasData={hasData} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Completion by weekday</CardTitle>
          <CardDescription>{periodLabel}</CardDescription>
        </CardHeader>
        <CardContent>
          <WeekdayBarChart weekdays={data.weekdays} hasData={hasData} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Year in review</CardTitle>
          <CardDescription>
            Share of scheduled habits completed each day, last 365 days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <YearHeatmap cells={data.year} />
        </CardContent>
      </Card>
    </div>
  );
}
