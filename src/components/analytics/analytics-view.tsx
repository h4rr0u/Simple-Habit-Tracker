"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { Suspense } from "react";

import { AnalyticsFilters } from "@/components/analytics/analytics-filters";
import { CorrelationsBlock } from "@/components/analytics/correlations-block";
import { ExportReportCard } from "@/components/analytics/export-report-card";
import { formatPercent } from "@/components/analytics/chart-theme";
import { YearHeatmap } from "@/components/analytics/year-heatmap";
import { useLanguage, type TranslationKey } from "@/components/language-provider";
import { TranslatedHeading } from "@/components/translated-heading";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { CorrelationResult } from "@/lib/correlations";
import type {
  AnalyticsData,
  HabitRecordStat,
  HabitSummary,
} from "@/types/analytics";

/**
 * Recharts is heavy and only needed on this page, so the charts are loaded as
 * client-only chunks instead of being part of the initial analytics bundle.
 */
const CompletionLineChart = dynamic(
  () =>
    import("@/components/analytics/completion-line-chart").then(
      (mod) => mod.CompletionLineChart
    ),
  { ssr: false, loading: () => <div className="h-60" /> }
);

const AverageRadialChart = dynamic(
  () =>
    import("@/components/analytics/average-radial-chart").then(
      (mod) => mod.AverageRadialChart
    ),
  { ssr: false, loading: () => <div className="mx-auto h-60 w-full max-w-60" /> }
);

const WeekdayBarChart = dynamic(
  () =>
    import("@/components/analytics/weekday-bar-chart").then(
      (mod) => mod.WeekdayBarChart
    ),
  { ssr: false, loading: () => <div className="h-60" /> }
);

/**
 * Client shell for /analytics: the page is a Server Component that aggregates
 * the data, so every label lives here where it can react to the language
 * context without a page reload.
 */

export type AnalyticsPeriod = "7" | "30" | "90";

const PERIOD_LABEL_KEYS: Record<AnalyticsPeriod, TranslationKey> = {
  "7": "analytics.period.7",
  "30": "analytics.period.30",
  "90": "analytics.period.90",
};

interface AnalyticsViewProps {
  period: AnalyticsPeriod;
  /** "all" or a habit id as string, mirroring the URL contract. */
  habitId: string;
  habits: HabitSummary[];
  /** Null → the "nothing to analyse" empty state. */
  data: AnalyticsData | null;
  /** Habit-pair associations over the last 90 days. */
  correlations: CorrelationResult;
}

export function AnalyticsView({
  period,
  habitId,
  habits,
  data,
  correlations,
}: AnalyticsViewProps) {
  const { t } = useLanguage();

  if (!data) {
    const habitMissing = habitId !== "all";
    return (
      <div className="space-y-4">
        <TranslatedHeading translationKey="analytics.title" />
        <Card>
          <CardHeader>
            <CardTitle>
              {t(
                habitMissing
                  ? "analytics.empty.habitMissingTitle"
                  : "analytics.empty.noHabitsTitle"
              )}
            </CardTitle>
            <CardDescription>
              {t(
                habitMissing
                  ? "analytics.empty.habitMissingDescription"
                  : "analytics.empty.noHabitsDescription"
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/habits">
                {t(
                  habitMissing
                    ? "analytics.empty.backToHabits"
                    : "analytics.empty.goToHabits"
                )}
              </Link>
            </Button>
          </CardContent>
        </Card>
        <ExportReportCard />
      </div>
    );
  }

  const periodLabel = t(PERIOD_LABEL_KEYS[period]);
  const hasData = data.scheduledTotal > 0;
  const { longestStreak, mostStable, mostProblematic } = data.records;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <TranslatedHeading translationKey="analytics.title" />
        <div className="ml-auto">
          <Suspense fallback={null}>
            <AnalyticsFilters
              habits={habits}
              period={period}
              habitId={habitId}
            />
          </Suspense>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <RecordCard
          label={t("analytics.records.longestStreak")}
          stat={longestStreak}
          formatValue={(stat) => `${stat.longestStreak} 🔥`}
        />
        <RecordCard
          label={t("analytics.records.mostStable")}
          stat={mostStable}
          formatValue={(stat) => formatPercent(stat.completionRate ?? 0)}
        />
        <RecordCard
          label={t("analytics.records.needsAttention")}
          stat={mostProblematic}
          formatValue={(stat) => formatPercent(stat.completionRate ?? 0)}
        />
      </div>

      <ExportReportCard />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("analytics.chart.daily")}</CardTitle>
            <CardDescription>{periodLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            <CompletionLineChart data={data.daily} hasData={hasData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("analytics.chart.average")}</CardTitle>
            <CardDescription>{periodLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            <AverageRadialChart averageRate={data.averageRate} hasData={hasData} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("analytics.chart.byWeekday")}</CardTitle>
          <CardDescription>{periodLabel}</CardDescription>
        </CardHeader>
        <CardContent>
          <WeekdayBarChart weekdays={data.weekdays} hasData={hasData} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("analytics.chart.year")}</CardTitle>
          <CardDescription>{t("analytics.chart.yearDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <YearHeatmap cells={data.year} />
        </CardContent>
      </Card>

      <CorrelationsBlock result={correlations} />
    </div>
  );
}

function RecordCard({
  label,
  stat,
  formatValue,
}: {
  label: string;
  stat: HabitRecordStat | null;
  formatValue: (stat: HabitRecordStat) => string;
}) {
  const { t } = useLanguage();

  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle>{stat ? formatValue(stat) : "—"}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">
          {stat ? stat.name : t("analytics.records.noData")}
        </p>
      </CardContent>
    </Card>
  );
}
