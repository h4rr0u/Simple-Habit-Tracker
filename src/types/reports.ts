import type { HabitType } from "@/db/schema";
import type { Schedule } from "@/types/schedule";

/**
 * Shared types for the analytics report export (CSV + print/PDF).
 *
 * The report is a snapshot of the active habits over a selected period. It is
 * intentionally independent of the analytics charts: the same numbers can be
 * rendered as CSV or as a print-friendly HTML document.
 */

export const REPORT_PERIODS = ["7", "30", "all"] as const;

/** Report window: last 7 days, last 30 days, or all tracked history. */
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

/** One raw check-in included in a habit's history. */
export interface ReportCheckin {
  /** ISO day key (YYYY-MM-DD). */
  date: string;
  value: number | null;
}

/** Per-habit row of the report. */
export interface ReportHabit {
  id: number;
  name: string;
  type: HabitType;
  color: string;
  unit: string | null;
  schedule: Schedule;
  /** Scheduled units in the period (fractional for weekly quotas). */
  scheduledDays: number;
  /** Completed units in the period. */
  completedDays: number;
  /** Completion rate, 0..1. */
  completionRate: number;
  /** Current streak, using the existing freeze-aware streak engine. */
  currentStreak: number;
  /** Longest all-time streak. */
  longestStreak: number;
  /** Raw check-ins (including slips and below-target values) in the period. */
  checkins: ReportCheckin[];
}

/** Totals across every habit in the report. */
export interface ReportTotals {
  scheduledDays: number;
  completedDays: number;
  completionRate: number;
  checkins: number;
}

/** Everything needed to render the CSV or print report. */
export interface ReportData {
  period: ReportPeriod;
  /** ISO day key of the first day in the report. */
  from: string;
  /** ISO day key of the last day in the report. */
  to: string;
  /** ISO timestamp of report generation. */
  generatedAt: string;
  habits: ReportHabit[];
  totals: ReportTotals;
}
