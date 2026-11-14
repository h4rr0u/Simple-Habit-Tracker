"use client";

import { parseISO, format } from "date-fns";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useLanguage } from "@/components/language-provider";
import type { DailyCompletionPoint } from "@/types/analytics";
import { AXIS_TICK, CHART_COLORS, TOOLTIP_STYLE } from "./chart-theme";

/** Daily completion rate over the selected period, as a gradient area+line. */

interface CompletionLineChartProps {
  data: DailyCompletionPoint[];
  /** False → renders the empty-state placeholder instead of the chart. */
  hasData: boolean;
}

export function CompletionLineChart({ data, hasData }: CompletionLineChartProps) {
  const { t } = useLanguage();

  if (!hasData) {
    return <ChartEmpty />;
  }

  const points = data.map((point) => ({ ...point, percent: Math.round(point.rate * 100) }));

  return (
    <div className="h-60">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <defs>
            <linearGradient id="completionStroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="50%" stopColor="#a78bfa" />
              <stop offset="100%" stopColor="#f472b6" />
            </linearGradient>
            <linearGradient id="completionFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(date: string) => format(parseISO(date), "d MMM")}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            minTickGap={28}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickFormatter={(value: number) => `${value}%`}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelFormatter={(date) => format(parseISO(String(date)), "d MMM yyyy")}
            formatter={(value) => [`${value}%`, t("analytics.chart.completed")]}
          />
          <Area
            type="monotone"
            dataKey="percent"
            stroke="none"
            fill="url(#completionFill)"
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="percent"
            stroke="url(#completionStroke)"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4, fill: "#f472b6" }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Shared empty-state placeholder for chart cards. */
export function ChartEmpty() {
  const { t } = useLanguage();

  return (
    <div className="flex h-60 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
      {t("analytics.chart.empty")}
    </div>
  );
}
