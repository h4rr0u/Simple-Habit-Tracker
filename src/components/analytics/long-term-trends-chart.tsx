"use client";

import { format, parseISO, type Locale } from "date-fns";
import { enUS, ru } from "date-fns/locale";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useReducedMotion } from "framer-motion";

import { useLanguage } from "@/components/language-provider";
import type { LongTermTrendPoint } from "@/lib/long-term-stats";
import { AXIS_TICK, CHART_COLORS, TOOLTIP_STYLE } from "./chart-theme";

/**
 * Monthly completion-rate line for the long-term trends card.
 *
 * Loaded through `next/dynamic` with `ssr: false`, matching the other charts.
 * `dot={false}` keeps 60 monthly points readable instead of turning the line
 * into a band of dots; the tooltip still resolves the exact month.
 */

const LOCALES: Record<string, Locale> = { ru, en: enUS };

/** One rendered point: raw month plus its localized labels. */
interface TrendRow {
  month: string;
  percent: number;
  label: string;
  fullLabel: string;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function shortMonthLabel(month: string, locale: Locale): string {
  const label = format(parseISO(`${month}-01`), "LLL yy", { locale });
  // date-fns' Russian abbreviations end with a dot ("янв."); the axis reads
  // better without it ("Янв 24").
  return capitalize(label.replace(/\./g, ""));
}

function fullMonthLabel(month: string, locale: Locale): string {
  return capitalize(format(parseISO(`${month}-01`), "LLLL yyyy", { locale }));
}

/** The subset of the props Recharts injects into a custom tooltip we read. */
interface TooltipInjectedProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: unknown }>;
}

function TrendTooltipContent({
  active,
  payload,
  rateLabel,
}: TooltipInjectedProps & { rateLabel: string }) {
  const row = payload?.[0]?.payload as TrendRow | undefined;
  if (!active || !row) return null;

  return (
    <div style={TOOLTIP_STYLE} className="space-y-0.5 px-3 py-2 shadow-md">
      <p className="font-medium text-popover-foreground">{row.fullLabel}</p>
      <p className="text-popover-foreground">
        {rateLabel}: {row.percent}%
      </p>
    </div>
  );
}

interface LongTermTrendsChartProps {
  points: LongTermTrendPoint[];
}

export function LongTermTrendsChart({ points }: LongTermTrendsChartProps) {
  const { t, language } = useLanguage();
  const reduceMotion = useReducedMotion();
  const locale = LOCALES[language] ?? ru;

  const rows: TrendRow[] = points.map((point) => ({
    month: point.month,
    percent: Math.round(point.completionRate * 100),
    label: shortMonthLabel(point.month, locale),
    fullLabel: fullMonthLabel(point.month, locale),
  }));

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid
            stroke={CHART_COLORS.grid}
            strokeDasharray="3 3"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            minTickGap={24}
            interval="preserveStartEnd"
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
            cursor={{ stroke: CHART_COLORS.grid }}
            content={<TrendTooltipContent rateLabel={t("analytics.longTerm.rate")} />}
          />
          <Line
            type="monotone"
            dataKey="percent"
            stroke="var(--chart-1)"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4, fill: "var(--chart-1)" }}
            isAnimationActive={!reduceMotion}
            animationDuration={450}
            animationEasing="ease-out"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
