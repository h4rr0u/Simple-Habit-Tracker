"use client";

import { useLanguage } from "@/components/language-provider";

/**
 * Shared empty-state placeholder for chart cards.
 *
 * Lives in its own module so lazily loaded charts do not pull Recharts into
 * the initial bundle just to render the placeholder.
 */
export function ChartEmpty() {
  const { t } = useLanguage();

  return (
    <div className="flex h-60 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
      {t("analytics.chart.empty")}
    </div>
  );
}
