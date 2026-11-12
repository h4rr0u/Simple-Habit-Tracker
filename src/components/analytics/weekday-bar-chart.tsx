"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { WeekdayCompletionPoint } from "@/types/analytics";
import { AXIS_TICK, CHART_COLORS, TOOLTIP_STYLE } from "./chart-theme";
import { ChartEmpty } from "./completion-line-chart";

/** Completion rate aggregated by weekday ("I slip on Wednesdays"). */

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Builds chart data ordered Monday-first. */
function toWeekdayRows(weekdays: WeekdayCompletionPoint[]) {
  const byDow = new Map(weekdays.map((p) => [p.dayOfWeek, p]));
  return [1, 2, 3, 4, 5, 6, 0].map((dayOfWeek) => {
    const rate = byDow.get(dayOfWeek)?.rate ?? 0;
    return { label: DAY_LABELS[dayOfWeek], percent: Math.round(rate * 100) };
  });
}

interface WeekdayBarChartProps {
  weekdays: WeekdayCompletionPoint[];
  hasData: boolean;
}

export function WeekdayBarChart({ weekdays, hasData }: WeekdayBarChartProps) {
  if (!hasData) {
    return <ChartEmpty message="Nothing scheduled in this period yet." />;
  }

  const rows = toWeekdayRows(weekdays);

  return (
    <div className="h-60">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
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
            cursor={{ fill: "var(--muted)", opacity: 0.4 }}
            contentStyle={TOOLTIP_STYLE}
            formatter={(value) => [`${value}%`, "Completed"]}
          />
          <Bar
            dataKey="percent"
            fill={CHART_COLORS.primary}
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}