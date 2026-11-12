"use client";

import { parseISO, format } from "date-fns";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { DailyCompletionPoint } from "@/types/analytics";
import { AXIS_TICK, CHART_COLORS, TOOLTIP_STYLE } from "./chart-theme";

/** Daily completion rate over the selected period, as a line chart. */

interface CompletionLineChartProps {
  data: DailyCompletionPoint[];
  /** False → renders the empty-state placeholder instead of the chart. */
  hasData: boolean;
}

export function CompletionLineChart({ data, hasData }: CompletionLineChartProps) {
  if (!hasData) {
    return <ChartEmpty message="Nothing scheduled in this period yet." />;
  }

  const points = data.map((point) => ({ ...point, percent: Math.round(point.rate * 100) }));

  return (
    <div className="h-60">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
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
            formatter={(value) => [`${value}%`, "Completed"]}
          />
          <Line
            type="monotone"
            dataKey="percent"
            stroke={CHART_COLORS.primary}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Shared empty-state placeholder for chart cards. */
export function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="flex h-60 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
      {message}
    </div>
  );
}