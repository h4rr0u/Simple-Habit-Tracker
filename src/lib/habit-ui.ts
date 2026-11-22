import type { LucideIcon } from "lucide-react";
import {
  AlarmClock,
  Apple,
  Ban,
  BedDouble,
  Bike,
  BookOpen,
  Brain,
  Cigarette,
  Coffee,
  Code,
  Dumbbell,
  Droplets,
  Flame,
  Footprints,
  Gamepad2,
  GlassWater,
  Heart,
  Languages,
  Leaf,
  Moon,
  Music,
  PenLine,
  PiggyBank,
  Pill,
  Salad,
  Smile,
  Sparkles,
  Sprout,
  Star,
  Sun,
  Target,
  Timer,
  Wallet,
} from "lucide-react";

import type { Schedule } from "@/types/schedule";
import type { TranslationKey, TranslationVars } from "@/components/language-provider";

/**
 * Shared UI constants and helpers for habit presentation: icon set, color
 * palette, type metadata and schedule formatting.
 */

/* ------------------------------- icons -------------------------------- */

/** Icon names available in the picker (all exist in lucide-react). */
export const HABIT_ICONS = [
  "Dumbbell",
  "BookOpen",
  "Droplets",
  "Footprints",
  "Moon",
  "Sun",
  "Heart",
  "Brain",
  "Languages",
  "Apple",
  "Salad",
  "Coffee",
  "Cigarette",
  "Pill",
  "Music",
  "Bike",
  "PenLine",
  "Code",
  "Wallet",
  "PiggyBank",
  "Sprout",
  "Star",
  "Target",
  "Sparkles",
  "AlarmClock",
  "GlassWater",
  "BedDouble",
  "Smile",
  "Flame",
  "Timer",
  "Ban",
  "Leaf",
  "Gamepad2",
] as const;

export type HabitIconName = (typeof HABIT_ICONS)[number];

/** Name -> component map for the picker set. */
const ICON_MAP: Record<string, LucideIcon> = {
  Dumbbell,
  BookOpen,
  Droplets,
  Footprints,
  Moon,
  Sun,
  Heart,
  Brain,
  Languages,
  Cigarette,
  Coffee,
  Apple,
  Salad,
  Pill,
  Music,
  Bike,
  PenLine,
  Code,
  Wallet,
  PiggyBank,
  Sprout,
  Star,
  Target,
  Sparkles,
  AlarmClock,
  GlassWater,
  BedDouble,
  Smile,
  Flame,
  Timer,
  Ban,
  Leaf,
  Gamepad2,
};

/** Resolves a stored icon name to its Lucide component (falls back to Target). */
export function getHabitIcon(name: string | null | undefined): LucideIcon {
  if (name && ICON_MAP[name]) return ICON_MAP[name];
  return Target;
}

/* ------------------------------- colors ------------------------------- */

/** Accent palette for habit color strips and charts. */
export const HABIT_COLORS = [
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#64748b", // slate
] as const;

/* --------------------------- category/tags ---------------------------- */

/**
 * Tailwind classes for category and tag badges. The palette is fixed and the
 * tone is picked from a hash of the label, so a given category or tag keeps
 * the same color across cards and renders.
 */
const LABEL_TONES = [
  "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  "border-success/30 bg-success/10 text-success",
  "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300",
  "border-lime-500/30 bg-lime-500/10 text-lime-700 dark:text-lime-300",
] as const;

/** Stable badge color classes for a category or tag label. */
export function getLabelBadgeClass(label: string): string {
  let hash = 0;
  for (let i = 0; i < label.length; i += 1) {
    hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  }
  return LABEL_TONES[hash % LABEL_TONES.length];
}

/* ----------------------------- type meta ------------------------------ */

export type HabitTypeValue = "binary" | "quantitative" | "negative" | "timed";

export interface HabitTypeMeta {
  value: HabitTypeValue;
}

export const HABIT_TYPES: HabitTypeMeta[] = [
  { value: "binary" },
  { value: "quantitative" },
  { value: "negative" },
  { value: "timed" },
];

/* ---------------------------- formatting ------------------------------ */

/** Translation helper accepted by the schedule formatters. */
export type ScheduleTranslator = (
  key: TranslationKey,
  vars?: TranslationVars
) => string;

const WEEKDAY_KEYS = [
  "weekday.sun",
  "weekday.mon",
  "weekday.tue",
  "weekday.wed",
  "weekday.thu",
  "weekday.fri",
  "weekday.sat",
] as const satisfies readonly TranslationKey[];

/** Weekday short label for a 0..6 index (0 = Sunday). */
export function dowLabel(dayOfWeek: number, t: ScheduleTranslator): string {
  const key = WEEKDAY_KEYS[dayOfWeek];
  return key ? t(key) : "";
}

/** Human-readable schedule summary, e.g. "Every day" / "Mon, Wed, Fri". */
export function formatSchedule(schedule: Schedule, t: ScheduleTranslator): string {
  switch (schedule.mode) {
    case "daily":
      return t("schedule.everyDay");
    case "weekly": {
      const times = schedule.timesPerWeek ?? 0;
      return times === 1
        ? t("schedule.oncePerWeek")
        : t("schedule.timesPerWeek", { count: times });
    }
    case "specific_days": {
      const days = schedule.daysOfWeek ?? [];
      if (days.length === 0) return t("schedule.noDaysSelected");
      if (days.length === 7) return t("schedule.everyDay");
      return days
        .slice()
        .sort((a, b) => a - b)
        .map((d) => dowLabel(d, t))
        .join(", ");
    }
    case "flexible":
      return t("schedule.everyNDays", { count: schedule.intervalDays ?? 1 });
    default:
      return t("schedule.custom");
  }
}

/** Formats seconds as "1h 05m 30s" / "05m 30s" style timer labels. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  if (hours > 0) return `${hours}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

