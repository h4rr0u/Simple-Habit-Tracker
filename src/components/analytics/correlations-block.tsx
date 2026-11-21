"use client";

import { TrendingDown, TrendingUp } from "lucide-react";

import { useLanguage } from "@/components/language-provider";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  CorrelationResult,
  HabitPairCorrelation,
} from "@/lib/correlations";
import { cn } from "@/lib/utils";

/**
 * "Correlation analysis" card for /analytics.
 *
 * The server component pre-computes the associations; this client component
 * only renders them with translated copy, so the language can change without
 * a page reload.
 */

interface CorrelationsBlockProps {
  result: CorrelationResult;
}

export function CorrelationsBlock({ result }: CorrelationsBlockProps) {
  const { t } = useLanguage();
  const hasPairs = result.positive.length > 0 || result.negative.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("analytics.correlations.title")}</CardTitle>
        <CardDescription>
          {t("analytics.correlations.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!result.hasEnoughData ? (
          <EmptyState message={t("analytics.correlations.empty")} />
        ) : !hasPairs ? (
          <EmptyState message={t("analytics.correlations.noStrong")} />
        ) : (
          <div className="space-y-3">
            {result.positive.map((pair) => (
              <CorrelationRow
                key={`positive-${pair.habitA.id}-${pair.habitB.id}`}
                pair={pair}
                direction="positive"
              />
            ))}
            {result.negative.map((pair) => (
              <CorrelationRow
                key={`negative-${pair.habitA.id}-${pair.habitB.id}`}
                pair={pair}
                direction="negative"
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CorrelationRow({
  pair,
  direction,
}: {
  pair: HabitPairCorrelation;
  direction: "positive" | "negative";
}) {
  const { t } = useLanguage();
  const isPositive = direction === "positive";
  const Icon = isPositive ? TrendingUp : TrendingDown;
  const percent = Math.round(Math.abs(pair.delta) * 100);
  const message = t(
    isPositive
      ? "analytics.correlations.positive"
      : "analytics.correlations.negative",
    {
      habitA: pair.habitA.name,
      habitB: pair.habitB.name,
      percent,
    }
  );

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3",
        isPositive
          ? "border-emerald-500/25 bg-emerald-500/5"
          : "border-red-500/25 bg-red-500/5"
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
          isPositive
            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : "bg-red-500/10 text-red-600 dark:text-red-400"
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <p className="text-sm leading-relaxed text-foreground">{message}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-32 items-center justify-center rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
