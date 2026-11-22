"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";

import { useLanguage, type TranslationKey } from "@/components/language-provider";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LONG_TERM_PERIODS,
  type LongTermPeriod,
  type LongTermStats,
} from "@/lib/long-term-stats";

/**
 * "Long-term trends" card for /analytics.
 *
 * The selected window is URL-driven (`?trend=12|36|60`), so the Server
 * Component aggregates only that window and the client never filters years of
 * points. The card chrome and empty state stay here; Recharts is pulled in by
 * a client-only chunk, matching the rest of the page.
 */

const LongTermTrendsChart = dynamic(
  () =>
    import("@/components/analytics/long-term-trends-chart").then(
      (mod) => mod.LongTermTrendsChart
    ),
  { ssr: false, loading: () => <div className="h-72" /> }
);

const PERIOD_LABEL_KEYS: Record<LongTermPeriod, TranslationKey> = {
  "12": "analytics.longTerm.period.12",
  "36": "analytics.longTerm.period.36",
  "60": "analytics.longTerm.period.60",
};

interface LongTermTrendsBlockProps {
  period: LongTermPeriod;
  stats: LongTermStats;
}

export function LongTermTrendsBlock({ period, stats }: LongTermTrendsBlockProps) {
  const { t } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function updatePeriod(value: string) {
    const params = new URLSearchParams(searchParams);
    params.set("trend", value);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>{t("analytics.longTerm.title")}</CardTitle>
            <CardDescription>{t("analytics.longTerm.description")}</CardDescription>
          </div>
          <Select value={period} onValueChange={updatePeriod}>
            <SelectTrigger
              className="w-36"
              aria-label={t("analytics.longTerm.periodLabel")}
              aria-busy={pending}
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <SelectValue />
              )}
            </SelectTrigger>
            <SelectContent>
              {LONG_TERM_PERIODS.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(PERIOD_LABEL_KEYS[value])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {stats.hasData ? (
          <LongTermTrendsChart points={stats.points} />
        ) : (
          <div className="flex min-h-32 items-center justify-center rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            {t("analytics.longTerm.empty")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
