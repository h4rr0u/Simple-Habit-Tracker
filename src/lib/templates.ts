import type { TranslationKey } from "@/components/language-provider";
import type { Schedule } from "@/types/schedule";

/**
 * Static catalogue of ready-made habits shown in the template gallery.
 *
 * Templates are pure data: nothing is persisted until the user picks one and
 * submits the (pre-filled) habit form. Display strings are translated through
 * `nameKey` / `descKey`, while categories keep a canonical English label and
 * are localized via `TEMPLATE_CATEGORY_KEYS`.
 */

export const TEMPLATE_CATEGORIES = [
  "Health",
  "Mindfulness",
  "Learning",
  "Productivity",
] as const;

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

/** Translation keys for the canonical category labels. */
export const TEMPLATE_CATEGORY_KEYS: Record<TemplateCategory, TranslationKey> = {
  Health: "habits.templates.category.health",
  Mindfulness: "habits.templates.category.mindfulness",
  Learning: "habits.templates.category.learning",
  Productivity: "habits.templates.category.productivity",
};

export interface HabitTemplate {
  /** Stable unique key (also the prefix of the i18n keys). */
  id: string;
  /** lucide-react icon name; must be present in `HABIT_ICONS`. */
  icon: string;
  /** Canonical category label, localized through `TEMPLATE_CATEGORY_KEYS`. */
  category: TemplateCategory;
  type: "binary" | "quantitative" | "timed" | "negative";
  /** Required for quantitative/timed templates. */
  targetValue?: number;
  /** Optional unit of measurement, e.g. "km" or "L". */
  unit?: string;
  /** Hex accent color used by the habit card and the gallery. */
  color: string;
  schedule: Schedule;
  /** i18n key for the template name. */
  nameKey: TranslationKey;
  /** i18n key for the template description. */
  descKey: TranslationKey;
}

export const HABIT_TEMPLATES: HabitTemplate[] = [
  {
    id: "morning_run",
    icon: "Footprints",
    category: "Health",
    type: "quantitative",
    targetValue: 5,
    unit: "km",
    color: "#3b82f6",
    schedule: { mode: "specific_days", daysOfWeek: [1, 3, 5] },
    nameKey: "template.morning_run.name",
    descKey: "template.morning_run.description",
  },
  {
    id: "read_before_bed",
    icon: "BookOpen",
    category: "Learning",
    type: "timed",
    targetValue: 30,
    color: "#8b5cf6",
    schedule: { mode: "daily" },
    nameKey: "template.read_before_bed.name",
    descKey: "template.read_before_bed.description",
  },
  {
    id: "meditation",
    icon: "Brain",
    category: "Mindfulness",
    type: "timed",
    targetValue: 10,
    color: "#14b8a6",
    schedule: { mode: "daily" },
    nameKey: "template.meditation.name",
    descKey: "template.meditation.description",
  },
  {
    id: "drink_water",
    icon: "GlassWater",
    category: "Health",
    type: "quantitative",
    targetValue: 2,
    unit: "L",
    color: "#06b6d4",
    schedule: { mode: "daily" },
    nameKey: "template.drink_water.name",
    descKey: "template.drink_water.description",
  },
  {
    id: "no_sugar",
    icon: "Ban",
    category: "Health",
    type: "negative",
    color: "#ef4444",
    schedule: { mode: "daily" },
    nameKey: "template.no_sugar.name",
    descKey: "template.no_sugar.description",
  },
  {
    id: "learn_language",
    icon: "Languages",
    category: "Learning",
    type: "timed",
    targetValue: 20,
    color: "#f97316",
    schedule: { mode: "weekly", timesPerWeek: 5 },
    nameKey: "template.learn_language.name",
    descKey: "template.learn_language.description",
  },
  {
    id: "morning_stretch",
    icon: "Heart",
    category: "Health",
    type: "timed",
    targetValue: 10,
    color: "#ec4899",
    schedule: { mode: "daily" },
    nameKey: "template.morning_stretch.name",
    descKey: "template.morning_stretch.description",
  },
  {
    id: "journaling",
    icon: "PenLine",
    category: "Mindfulness",
    type: "binary",
    color: "#64748b",
    schedule: { mode: "daily" },
    nameKey: "template.journaling.name",
    descKey: "template.journaling.description",
  },
  {
    id: "sleep_early",
    icon: "Moon",
    category: "Health",
    type: "binary",
    color: "#eab308",
    schedule: { mode: "daily" },
    nameKey: "template.sleep_early.name",
    descKey: "template.sleep_early.description",
  },
  {
    id: "deep_work",
    icon: "Code",
    category: "Productivity",
    type: "timed",
    targetValue: 90,
    color: "#22c55e",
    schedule: { mode: "specific_days", daysOfWeek: [1, 2, 3, 4, 5] },
    nameKey: "template.deep_work.name",
    descKey: "template.deep_work.description",
  },
];
