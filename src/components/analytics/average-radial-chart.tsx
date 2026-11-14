"use client";

import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from "recharts";

import { useLanguage } from "@/components/language-provider";
import { ChartEmpty } from "./chart-empty";
import { formatPercent } from "./chart-theme";

/** Average completion rate over the selected period, as a radial gauge. */

interface AverageRadialChartProps {
  /** Average rate over the period, 0..1. */
  averageRate: number;
  hasData: boolean;
}

export function AverageRadialChart({ averageRate, hasData }: AverageRadialChartProps) {
  const { t } = useLanguage();

  if (!hasData) {
    return <ChartEmpty />;
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
          <defs>
            <linearGradient id="averageGradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="55%" stopColor="#a78bfa" />
              <stop offset="100%" stopColor="#f472b6" />
            </linearGradient>
          </defs>
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar
            dataKey="value"
            fill="url(#averageGradient)"
            cornerRadius={12}
            background={{ fill: "var(--muted)" }}
            isAnimationActive={false}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tracking-tight">{formatPercent(averageRate)}</span>
        <span className="text-xs text-muted-foreground">
          {t("analytics.chart.averageCompleted")}
        </span>
      </div>
    </div>
  );
}