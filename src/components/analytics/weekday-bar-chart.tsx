"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useReducedMotion } from "framer-motion";

import { useLanguage, type TranslationKey } from "@/components/language-provider";
import type { WeekdayCompletionPoint } from "@/types/analytics";
import { ChartEmpty } from "./chart-empty";
import { AXIS_TICK, CHART_COLORS, SERIES_COLORS, TOOLTIP_STYLE } from "./chart-theme";

/** Completion rate aggregated by weekday ("I slip on Wednesdays"). */

/** Short weekday labels, indexed 0 = Sunday. */
const WEEKDAY_KEYS: TranslationKey[] = [
  "weekday.sun",
  "weekday.mon",
  "weekday.tue",
  "weekday.wed",
  "weekday.thu",
  "weekday.fri",
  "weekday.sat",
];

/** Builds chart data ordered Monday-first. */
function toWeekdayRows(
  weekdays: WeekdayCompletionPoint[],
  label: (dayOfWeek: number) => string
) {
  const byDow = new Map(weekdays.map((p) => [p.dayOfWeek, p]));
  return [1, 2, 3, 4, 5, 6, 0].map((dayOfWeek) => {
    const rate = byDow.get(dayOfWeek)?.rate ?? 0;
    return { label: label(dayOfWeek), percent: Math.round(rate * 100) };
  });
}

interface WeekdayBarChartProps {
  weekdays: WeekdayCompletionPoint[];
  hasData: boolean;
}

export function WeekdayBarChart({ weekdays, hasData }: WeekdayBarChartProps) {
  const { t } = useLanguage();
  const reduceMotion = useReducedMotion();

  if (!hasData) {
    return <ChartEmpty />;
  }

  const rows = toWeekdayRows(weekdays, (dayOfWeek) =>
    t(WEEKDAY_KEYS[dayOfWeek] ?? "weekday.sun")
  );

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
            formatter={(value) => [`${value}%`, t("analytics.chart.completed")]}
          />
          <Bar
            dataKey="percent"
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
            isAnimationActive={!reduceMotion}
            animationDuration={450}
            animationEasing="ease-out"
          >
            {rows.map((row, index) => (
              <Cell key={row.label} fill={SERIES_COLORS[index]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
