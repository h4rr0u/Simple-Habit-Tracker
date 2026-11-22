"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useReducedMotion } from "framer-motion";
import { CloudSun, Moon, Sun, Sunset } from "lucide-react";

import { useLanguage, type TranslationKey } from "@/components/language-provider";
import type {
  DayOfWeekStat,
  TimeOfDayPeriod,
  TimeOfDayStat,
  TimePatternStats,
} from "@/lib/time-stats";
import { AXIS_TICK, CHART_COLORS, TOOLTIP_STYLE } from "./chart-theme";

/**
 * Recharts body of the time-patterns card: weekday bars + time-of-day donut.
 *
 * Loaded through `next/dynamic` with `ssr: false` so Recharts never reaches
 * the server render or the initial analytics bundle.
 */

/** Short weekday labels, indexed 0 = Sunday (matches the shared i18n keys). */
const WEEKDAY_KEYS: TranslationKey[] = [
  "weekday.sun",
  "weekday.mon",
  "weekday.tue",
  "weekday.wed",
  "weekday.thu",
  "weekday.fri",
  "weekday.sat",
];

/** Label + colour + time range for each part of the day. */
const PERIOD_META: Record<
  TimeOfDayPeriod,
  { labelKey: TranslationKey; rangeKey: TranslationKey; color: string }
> = {
  morning: {
    labelKey: "analytics.timePatterns.morning",
    rangeKey: "analytics.timePatterns.morningRange",
    color: "#facc15",
  },
  afternoon: {
    labelKey: "analytics.timePatterns.afternoon",
    rangeKey: "analytics.timePatterns.afternoonRange",
    color: "#38bdf8",
  },
  evening: {
    labelKey: "analytics.timePatterns.evening",
    rangeKey: "analytics.timePatterns.eveningRange",
    color: "#fb923c",
  },
  night: {
    labelKey: "analytics.timePatterns.night",
    rangeKey: "analytics.timePatterns.nightRange",
    color: "#818cf8",
  },
};

const PERIOD_ICONS = {
  morning: Sun,
  afternoon: CloudSun,
  evening: Sunset,
  night: Moon,
} as const;

/** One bar: ISO weekday converted to the shared 0 = Sunday indexing. */
interface WeekdayRow {
  label: string;
  count: number;
  percentage: number;
}

/** One pie slice plus the legend entry that mirrors it. */
interface PeriodRow {
  period: TimeOfDayPeriod;
  label: string;
  range: string;
  count: number;
  percentage: number;
  color: string;
}

function toWeekdayRows(
  stats: DayOfWeekStat[],
  label: (dayOfWeek: number) => string
): WeekdayRow[] {
  const byDay = new Map(stats.map((stat) => [stat.dayIndex, stat]));
  // 1 = Monday … 7 = Sunday; 7 maps back to the Sunday label.
  return [1, 2, 3, 4, 5, 6, 7].map((dayIndex) => {
    const stat = byDay.get(dayIndex);
    return {
      label: label(dayIndex === 7 ? 0 : dayIndex),
      count: stat?.count ?? 0,
      percentage: stat?.percentage ?? 0,
    };
  });
}

function toPeriodRows(
  stats: TimeOfDayStat[],
  t: (key: TranslationKey) => string
): PeriodRow[] {
  return stats.map((stat) => ({
    period: stat.period,
    label: t(PERIOD_META[stat.period].labelKey),
    range: t(PERIOD_META[stat.period].rangeKey),
    count: stat.count,
    percentage: stat.percentage,
    color: PERIOD_META[stat.period].color,
  }));
}

/** Shared tooltip card used by both charts. */
function TooltipCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint?: string;
}) {
  return (
    <div
      style={TOOLTIP_STYLE}
      className="space-y-0.5 px-3 py-2 shadow-md"
    >
      <p className="font-medium text-popover-foreground">{title}</p>
      <p className="text-popover-foreground">{value}</p>
      {hint ? <p className="text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

interface TimePatternChartsProps {
  stats: TimePatternStats;
}

/** The subset of the props Recharts injects into a custom tooltip we read. */
interface TooltipInjectedProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: unknown }>;
}

/** Tooltip for the weekday bars: count plus its share of all check-ins. */
function WeekdayTooltipContent({
  active,
  payload,
  checkinsLabel,
  shareLabel,
}: TooltipInjectedProps & { checkinsLabel: string; shareLabel: string }) {
  const row = payload?.[0]?.payload as WeekdayRow | undefined;
  if (!active || !row) return null;

  return (
    <TooltipCard
      title={row.label}
      value={`${row.count} — ${checkinsLabel}`}
      hint={`${shareLabel}: ${row.percentage}%`}
    />
  );
}

/** Tooltip for the time-of-day donut: period, its hours and its share. */
function PeriodTooltipContent({
  active,
  payload,
  checkinsLabel,
  shareLabel,
}: TooltipInjectedProps & { checkinsLabel: string; shareLabel: string }) {
  const row = payload?.[0]?.payload as PeriodRow | undefined;
  if (!active || !row) return null;

  return (
    <TooltipCard
      title={`${row.label} · ${row.range}`}
      value={`${row.count} — ${checkinsLabel}`}
      hint={`${shareLabel}: ${row.percentage}%`}
    />
  );
}

export function TimePatternCharts({ stats }: TimePatternChartsProps) {
  const { t } = useLanguage();
  const reduceMotion = useReducedMotion();

  const weekdayRows = toWeekdayRows(stats.dayOfWeek, (dayOfWeek) =>
    t(WEEKDAY_KEYS[dayOfWeek] ?? "weekday.sun")
  );
  const periodRows = toPeriodRows(stats.timeOfDay, t);

  const checkinsLabel = t("analytics.timePatterns.checkins");
  const shareLabel = t("analytics.timePatterns.share");

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="min-w-0">
        <h3 className="mb-2 text-sm font-medium">
          {t("analytics.timePatterns.byWeekday")}
        </h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={weekdayRows}
              margin={{ top: 8, right: 4, bottom: 0, left: -20 }}
            >
              <defs>
                <linearGradient id="timePatternBars" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-2)" />
                  <stop offset="100%" stopColor="var(--chart-1)" />
                </linearGradient>
              </defs>
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
                interval={0}
              />
              <YAxis
                allowDecimals={false}
                width={32}
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                content={
                  <WeekdayTooltipContent
                    checkinsLabel={checkinsLabel}
                    shareLabel={shareLabel}
                  />
                }
              />
              <Bar
                dataKey="count"
                fill="url(#timePatternBars)"
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
                isAnimationActive={!reduceMotion}
                animationDuration={450}
                animationEasing="ease-out"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="min-w-0">
        <h3 className="mb-2 text-sm font-medium">
          {t("analytics.timePatterns.byTimeOfDay")}
        </h3>
        <div className="relative h-40">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip
                content={
                  <PeriodTooltipContent
                    checkinsLabel={checkinsLabel}
                    shareLabel={shareLabel}
                  />
                }
              />
              <Pie
                data={periodRows}
                dataKey="count"
                nameKey="label"
                innerRadius="58%"
                outerRadius="92%"
                paddingAngle={2}
                stroke="none"
                isAnimationActive={!reduceMotion}
                animationDuration={450}
                animationEasing="ease-out"
              >
                {periodRows.map((row) => (
                  <Cell key={row.period} fill={row.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-semibold tabular-nums">
              {stats.total}
            </span>
            <span className="w-20 text-center text-[10px] leading-tight text-muted-foreground">
              {t("analytics.timePatterns.total")}
            </span>
          </div>
        </div>

        <ul className="mt-3 grid grid-cols-2 gap-2">
          {periodRows.map((row) => {
            const Icon = PERIOD_ICONS[row.period];
            return (
              <li
                key={row.period}
                className="flex items-center gap-2 rounded-lg border p-2"
              >
                <span
                  className="flex size-7 shrink-0 items-center justify-center rounded-md"
                  style={{ backgroundColor: `${row.color}26`, color: row.color }}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">{row.label}</p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {row.count} · {row.percentage}%
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
