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
import type { Habit } from "@/db/schema";

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

/* ----------------------------- type meta ------------------------------ */

export type HabitTypeValue = "binary" | "quantitative" | "negative" | "timed";

export interface HabitTypeMeta {
  value: HabitTypeValue;
  label: string;
  description: string;
}

export const HABIT_TYPES: HabitTypeMeta[] = [
  {
    value: "binary",
    label: "Binary",
    description: "Simple done / not done (e.g. meditate)",
  },
  {
    value: "quantitative",
    label: "Quantitative",
    description: "Count towards a target (e.g. 8 glasses of water)",
  },
  {
    value: "negative",
    label: "Negative",
    description: "Something to avoid — a check-in marks a slip",
  },
  {
    value: "timed",
    label: "Timed",
    description: "Time spent towards a goal (e.g. 30 min reading)",
  },
];

/* ---------------------------- formatting ------------------------------ */

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Weekday short label for a 0..6 index (0 = Sunday). */
export function dowLabel(dayOfWeek: number): string {
  return DOW_LABELS[dayOfWeek] ?? "";
}

/** Human-readable schedule summary, e.g. "Every day" / "Mon, Wed, Fri". */
export function formatSchedule(schedule: Schedule): string {
  switch (schedule.mode) {
    case "daily":
      return "Every day";
    case "weekly":
      return `${schedule.timesPerWeek ?? 0}× per week`;
    case "specific_days": {
      const days = schedule.daysOfWeek ?? [];
      if (days.length === 0) return "No days selected";
      if (days.length === 7) return "Every day";
      return days
        .slice()
        .sort((a, b) => a - b)
        .map((d) => DOW_LABELS[d])
        .join(", ");
    }
    case "flexible":
      return `Every ${schedule.intervalDays ?? 1} day(s)`;
    default:
      return "Custom";
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

/* ---------------------------- checkin toggle --------------------------- */

/**
 * How a checkbox-style toggle should complete a check-in for this habit.
 * Presence-based habits (binary/negative, or quantitative/timed without a
 * target) use a plain toggle; habits with a target record the target value
 * when checked (the checkbox asserts completion) and clear the day when
 * un-checked, so the stored value actually satisfies the target.
 */
export function checkinTogglePlan(
  habit: Habit,
  currentlyDone: boolean
): { mode: "toggle" } | { mode: "value"; value: number | null } {
  const target = habit.targetValue;
  const targeted =
    (habit.type === "quantitative" || habit.type === "timed") &&
    target != null &&
    target > 0;
  if (!targeted) return { mode: "toggle" };
  return { mode: "value", value: currentlyDone ? null : target };
}
