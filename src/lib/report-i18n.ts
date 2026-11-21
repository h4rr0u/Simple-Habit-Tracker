import type { HabitType } from "@/db/schema";
import en from "@/locales/en.json";
import ru from "@/locales/ru.json";
import type { ReportHabit, ReportPeriod } from "@/types/reports";
import type { Schedule } from "@/types/schedule";

/**
 * Server-side translation helper for report files.
 *
 * The UI language lives in localStorage, so server-rendered CSV/PDF routes
 * receive it as a `lang` query parameter. This module mirrors the lightweight
 * interpolation used by `LanguageProvider` without pulling client code into
 * Server Components or Route Handlers.
 */

export type ReportLanguage = "ru" | "en";
export type ReportTranslationKey = keyof typeof ru;

const dictionaries = { ru, en } as const;

const WEEKDAY_KEYS = [
  "weekday.sun",
  "weekday.mon",
  "weekday.tue",
  "weekday.wed",
  "weekday.thu",
  "weekday.fri",
  "weekday.sat",
] as const satisfies ReadonlyArray<ReportTranslationKey>;

const TYPE_KEYS: Record<HabitType, ReportTranslationKey> = {
  binary: "habits.form.type.binary.label",
  quantitative: "habits.form.type.quantitative.label",
  negative: "habits.form.type.negative.label",
  timed: "habits.form.type.timed.label",
};

/** Looks up a report dictionary key and interpolates `{placeholders}`. */
export function translateReport(
  language: ReportLanguage,
  key: ReportTranslationKey,
  vars?: Record<string, string | number>
): string {
  const template = dictionaries[language][key] ?? ru[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match
  );
}

/** Localized label for the report period selector and file headers. */
export function reportPeriodLabel(
  language: ReportLanguage,
  period: ReportPeriod
): string {
  switch (period) {
    case "7":
      return translateReport(language, "analytics.period.7");
    case "30":
      return translateReport(language, "analytics.period.30");
    case "all":
      return translateReport(language, "analytics.period.all");
  }
}

/** Localized habit type label (reuses the habit form dictionaries). */
export function reportTypeLabel(
  language: ReportLanguage,
  type: HabitType
): string {
  return translateReport(language, TYPE_KEYS[type]);
}

/** Localized schedule description. */
export function reportScheduleLabel(
  language: ReportLanguage,
  schedule: Schedule
): string {
  switch (schedule.mode) {
    case "daily":
      return translateReport(language, "schedule.everyDay");
    case "weekly": {
      const count = schedule.timesPerWeek ?? 0;
      return count === 1
        ? translateReport(language, "schedule.oncePerWeek")
        : translateReport(language, "schedule.timesPerWeek", { count });
    }
    case "specific_days": {
      const days = schedule.daysOfWeek ?? [];
      if (days.length === 0) {
        return translateReport(language, "schedule.noDaysSelected");
      }
      return days
        .map((day) => translateReport(language, WEEKDAY_KEYS[day] ?? "weekday.sun"))
        .join(", ");
    }
    case "flexible":
      return translateReport(language, "schedule.everyNDays", {
        count: schedule.intervalDays ?? 1,
      });
  }
}

/**
 * Human-readable value for a check-in row. Negative habits store slips, binary
 * check-ins have no value, and timed habits store seconds while the UI shows
 * minutes.
 */
export function formatReportValue(
  language: ReportLanguage,
  habit: Pick<ReportHabit, "type" | "unit">,
  value: number | null
): string {
  if (habit.type === "negative") {
    return translateReport(language, "habits.card.slipped");
  }
  if (value == null) return "✓";
  if (habit.type === "timed") {
    return `${Math.round(value / 60)} ${translateReport(language, "reports.minutes")}`;
  }
  return habit.unit ? `${value} ${habit.unit}` : String(value);
}
