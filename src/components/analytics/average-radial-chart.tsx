"use client";

import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from "recharts";

import { CHART_COLORS, formatPercent } from "./chart-theme";
import { ChartEmpty } from "./completion-line-chart";

/** Average completion rate over the selected period, as a radial gauge. */

interface AverageRadialChartProps {
  /** Average rate over the period, 0..1. */
  averageRate: number;
  hasData: boolean;
}

export function AverageRadialChart({ averageRate, hasData }: AverageRadialChartProps) {
  if (!hasData) {
    return <ChartEmpty message="Nothing scheduled in this period yet." />;
  }

  const percent = Math.round(averageRate * 100);

  return (
    <div className="relative mx-auto h-60 w-full max-w-60">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          data={[{ name: "average", value: percent }]}
          innerRadius="72%"
          outerRadius="100%"
          startAngle={90}
          endAngle={-270}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar
            dataKey="value"
            fill={CHART_COLORS.primary}
            cornerRadius={12}
            background={{ fill: "var(--muted)" }}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tracking-tight">{formatPercent(averageRate)}</span>
        <span className="text-xs text-muted-foreground">completed</span>
      </div>
    </div>
  );
}