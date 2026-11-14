"use client";

import { useMemo } from "react";
import { isSameDay, parseISO } from "date-fns";

import { useLanguage } from "@/components/language-provider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { HeatmapWeek } from "@/lib/heatmap";

/**
 * 12-week heatmap rendered as a CSS Grid of colored cells. Intensity:
 * -1 = before the habit existed (blank), 0 = scheduled & missed, 1 = done.
 */

interface HeatmapGridProps {
  weeks: HeatmapWeek[];
  color: string;
}

export function HeatmapGrid({ weeks, color }: HeatmapGridProps) {
  const { t } = useLanguage();
  const today = useMemo(() => new Date(), []);

  const opacityFor = (level: number): number => {
    if (level < 0) return 0;
    return 0.25 + 0.75 * level;
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-[3px] overflow-x-auto pb-1">
        {weeks.map((week) => (
          <div key={week.weekStart} className="flex flex-col gap-[3px]">
            {week.cells.map((cell) => {
              const isToday = isSameDay(parseISO(cell.date), today);
              return (
                <Tooltip key={cell.date}>
                  <TooltipTrigger asChild>
                    <span
                      className="size-3.5 rounded-[3px] border border-black/5"
                      style={{
                        background: cell.level < 0 ? "transparent" : color,
                        opacity: opacityFor(cell.level),
                        outline: isToday ? `2px solid ${color}` : undefined,
                        outlineOffset: 1,
                      }}
                    />
                  </TooltipTrigger>
                  <TooltipContent>{cell.date}</TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>{t("analytics.heatmap.less")}</span>
        {[0, 0.5, 1].map((level) => (
          <span
            key={level}
            className="size-3 rounded-[3px]"
            style={{ background: level === 0 ? "var(--muted)" : color, opacity: level === 0 ? 1 : 0.25 + 0.75 * level }}
          />
        ))}
        <span>{t("analytics.heatmap.more")}</span>
      </div>
    </div>
  );
}
