"use client";

import dynamic from "next/dynamic";

import { useLanguage } from "@/components/language-provider";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  MIN_CHECKINS_FOR_PATTERNS,
  type TimePatternStats,
} from "@/lib/time-stats";

/**
 * "Time of day and weekday" card for /analytics.
 *
 * The server pre-computes the counts, so this component only renders them.
 * The card chrome and the empty state live here (they need no charting code);
 * Recharts itself is pulled in by a client-only chunk, matching the rest of
 * the analytics page.
 */

const TimePatternCharts = dynamic(
  () =>
    import("@/components/analytics/time-pattern-charts").then(
      (mod) => mod.TimePatternCharts
    ),
  { ssr: false, loading: () => <div className="h-72" /> }
);

interface TimePatternsBlockProps {
  stats: TimePatternStats;
}

export function TimePatternsBlock({ stats }: TimePatternsBlockProps) {
  const { t } = useLanguage();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("analytics.timePatterns.title")}</CardTitle>
        <CardDescription>
          {t("analytics.timePatterns.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {stats.total < MIN_CHECKINS_FOR_PATTERNS ? (
          <div className="flex min-h-32 items-center justify-center rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            {t("analytics.timePatterns.empty")}
          </div>
        ) : (
          <TimePatternCharts stats={stats} />
        )}
      </CardContent>
    </Card>
  );
}
