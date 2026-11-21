import { addDays, format, startOfDay } from "date-fns";

import type { Checkin, Habit } from "@/db/schema";
import {
  buildDayContributions,
  buildHabitHistory,
  type HabitHistory,
} from "@/lib/analytics";
import { buildCompletionCheckins } from "@/lib/habit-target";
import {
  formatReportValue,
  reportPeriodLabel,
  reportScheduleLabel,
  reportTypeLabel,
  translateReport,
  type ReportLanguage,
} from "@/lib/report-i18n";
import {
  calculateCurrentStreak,
  calculateLongestStreak,
} from "@/lib/streaks";
import type {
  ReportData,
  ReportHabit,
  ReportPeriod,
  ReportTotals,
} from "@/types/reports";
import type { Schedule } from "@/types/schedule";

/**
 * Pure report builder for the CSV export and the print-friendly PDF route.
 *
 * Streaks and completion units are delegated to the existing analytics/streak
 * engines, so the report never re-implements schedule or freeze logic. Each
 * habit's window is clamped to its creation day: days before a habit existed
 * must not count as missed scheduled days.
 */

const PERIOD_DAYS: Record<Exclude<ReportPeriod, "all">, number> = {
  "7": 7,
  "30": 30,
};

const CSV_BOM = "\uFEFF";
const CSV_NEWLINE = "\r\n";

/** ISO day key (YYYY-MM-DD). */
function toKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** Later of two dates. */
function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

/** Formats scheduled/completed units with one decimal place. */
function formatDays(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** Formats a 0..1 rate as a whole percentage. */
function formatRate(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/** Report window before per-habit creation-day clamping. */
export function reportRange(
  period: ReportPeriod,
  habits: Habit[],
  today: Date
): { from: Date; to: Date } {
  const to = startOfDay(today);
  if (period === "all") {
    if (habits.length === 0) return { from: to, to };
    const earliest = habits.reduce(
      (min, habit) => Math.min(min, startOfDay(habit.createdAt).getTime()),
      Number.POSITIVE_INFINITY
    );
    const from = new Date(earliest);
    return { from: from <= to ? from : to, to };
  }
  return { from: addDays(to, -(PERIOD_DAYS[period] - 1)), to };
}

/** Builds one habit row, including its raw check-in history in the window. */
function buildHabitReport(
  habit: Habit,
  rows: Checkin[],
  from: Date,
  to: Date
): ReportHabit {
  const schedule = habit.schedule as unknown as Schedule;
  // Negative habits store slips; buildCompletionCheckins inverts them into
  // clean scheduled days. Passing `to` keeps the pure builder deterministic.
  const history: HabitHistory =
    habit.type === "negative"
      ? {
          habit,
          schedule,
          effective: buildCompletionCheckins(habit, rows, to),
        }
      : buildHabitHistory(habit, rows);

  const effectiveFrom = maxDate(from, startOfDay(habit.createdAt));
  const contributions =
    effectiveFrom <= to
      ? buildDayContributions([history], effectiveFrom, to)
      : [];

  let scheduledDays = 0;
  let completedDays = 0;
  for (const day of contributions) {
    scheduledDays += day.scheduled;
    completedDays += day.completed;
  }

  const fromKey = toKey(effectiveFrom);
  const toKeyStr = toKey(to);
  const checkins = rows
    .filter((row) => row.date >= fromKey && row.date <= toKeyStr)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => ({ date: row.date, value: row.value }));

  return {
    id: habit.id,
    name: habit.name,
    type: habit.type,
    color: habit.color,
    unit: habit.unit,
    schedule,
    scheduledDays,
    completedDays,
    completionRate: scheduledDays === 0 ? 0 : completedDays / scheduledDays,
    currentStreak: calculateCurrentStreak(
      history.effective,
      schedule,
      habit.freezeBank,
      to,
      habit.createdAt
    ).streak,
    longestStreak: calculateLongestStreak(
      history.effective,
      schedule,
      habit.createdAt
    ),
    checkins,
  };
}

/**
 * Builds a complete, serializable report snapshot.
 *
 * `rowsByHabit` contains raw check-ins (not pre-filtered by target), so the
 * history section can show below-target values and slips as well.
 */
export function buildReport(
  habits: Habit[],
  rowsByHabit: ReadonlyMap<number, Checkin[]>,
  period: ReportPeriod,
  today: Date = new Date()
): ReportData {
  const { from, to } = reportRange(period, habits, today);
  const reportHabits = habits.map((habit) =>
    buildHabitReport(habit, rowsByHabit.get(habit.id) ?? [], from, to)
  );

  const totals = reportHabits.reduce<ReportTotals>(
    (acc, habit) => ({
      scheduledDays: acc.scheduledDays + habit.scheduledDays,
      completedDays: acc.completedDays + habit.completedDays,
      completionRate: 0,
      checkins: acc.checkins + habit.checkins.length,
    }),
    { scheduledDays: 0, completedDays: 0, completionRate: 0, checkins: 0 }
  );
  totals.completionRate =
    totals.scheduledDays === 0
      ? 0
      : totals.completedDays / totals.scheduledDays;

  return {
    period,
    from: toKey(from),
    to: toKey(to),
    generatedAt: new Date().toISOString(),
    habits: reportHabits,
    totals,
  };
}

/**
 * Excel uses the system list separator, which is `;` on most Russian and
 * European locales and `,` on English ones. Matching the delimiter to the
 * report language (and declaring it with Excel's `sep=` directive) keeps the
 * file readable by double-clicking on both, while the English file stays a
 * plain RFC 4180 document.
 */
const CSV_DELIMITERS: Record<ReportLanguage, string> = { ru: ";", en: "," };

/** Escapes a value for RFC 4180 CSV with the given delimiter. */
function csvCell(value: string, delimiter: string): string {
  if (
    value.includes(delimiter) ||
    value.includes('"') ||
    /[\r\n]/.test(value)
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Generates the CSV file content. The BOM makes Excel detect UTF-8, and CRLF
 * line endings plus RFC 4180 quoting keep the file portable.
 */
export function buildCsv(
  report: ReportData,
  language: ReportLanguage
): string {
  const t = (key: Parameters<typeof translateReport>[1]) =>
    translateReport(language, key);
  const periodLabel = reportPeriodLabel(language, report.period);
  const delimiter = CSV_DELIMITERS[language];

  const headers = [
    t("reports.column.habit"),
    t("reports.column.type"),
    t("reports.column.schedule"),
    t("reports.column.period"),
    t("reports.column.scheduled"),
    t("reports.column.completed"),
    t("reports.column.rate"),
    t("reports.column.currentStreak"),
    t("reports.column.longestStreak"),
    t("reports.column.checkins"),
    t("reports.column.history"),
  ];

  const rows = report.habits.map((habit) => [
    habit.name,
    reportTypeLabel(language, habit.type),
    reportScheduleLabel(language, habit.schedule),
    periodLabel,
    formatDays(habit.scheduledDays),
    formatDays(habit.completedDays),
    formatRate(habit.completionRate),
    String(habit.currentStreak),
    String(habit.longestStreak),
    String(habit.checkins.length),
    habit.checkins
      .map((checkin) => {
        const value = formatReportValue(language, habit, checkin.value);
        return `${checkin.date}: ${value}`;
      })
      .join(" | "),
  ]);

  const lines = [headers, ...rows].map((row) =>
    row.map((cell) => csvCell(cell, delimiter)).join(delimiter)
  );
  const directive = delimiter === "," ? "" : `sep=${delimiter}${CSV_NEWLINE}`;

  return `${CSV_BOM}${directive}${lines.join(CSV_NEWLINE)}${CSV_NEWLINE}`;
}

