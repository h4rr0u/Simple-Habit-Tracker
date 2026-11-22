"use client";

import { useMemo } from "react";

import { useLanguage } from "@/components/language-provider";
import type { YearHeatCell } from "@/types/analytics";
import { HEAT_VARS } from "./chart-theme";

/**
 * 365-day heatmap: colour intensity = share of completed habits for the day.
 * Rendered as a plain CSS grid with native tooltips to keep the client
 * bundle and hydration cost minimal.
 */

interface YearHeatmapProps {
  cells: YearHeatCell[];
}

/** Intensity level 0..4 for a day's completion rate; -1 = no data. */
function levelFor(rate: number): number {
  if (rate < 0) return -1;
  if (rate === 0) return 0;
  if (rate < 0.25) return 1;
  if (rate < 0.5) return 2;
  if (rate < 0.75) return 3;
  return 4;
}

export function YearHeatmap({ cells }: YearHeatmapProps) {
  const { t } = useLanguage();
  const weeks = useMemo(() => {
    const columns: YearHeatCell[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      columns.push(cells.slice(i, i + 7));
    }
    return columns;
  }, [cells]);

  if (cells.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
        {t("analytics.heatmap.empty")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-[3px] overflow-x-auto pb-1">
        {weeks.map((week, index) => (
          <div key={index} className="flex flex-col gap-[3px]">
            {week.map((cell) => {
              const level = levelFor(cell.rate);
              return (
                <span
                  key={cell.date}
                  title={`${cell.date}${level < 0 ? "" : ` — ${Math.round(cell.rate * 100)}%`}`}
                  className="size-3 rounded-[3px]"
                  style={{
                    background:
                      level < 0
                        ? "transparent"
                        : level === 0
                          ? "var(--muted)"
                          : HEAT_VARS[level - 1],
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>{t("analytics.heatmap.less")}</span>
        <span
          className="size-3 rounded-[3px]"
          style={{ background: "var(--muted)" }}
        />
        {HEAT_VARS.map((heatVar) => (
          <span
            key={heatVar}
            className="size-3 rounded-[3px]"
            style={{ background: heatVar }}
          />
        ))}
        <span>{t("analytics.heatmap.more")}</span>
      </div>
    </div>
  );
}