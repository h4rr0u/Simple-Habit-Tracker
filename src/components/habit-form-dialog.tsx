"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { createHabitAction, updateHabitAction } from "@/actions/habits";
import { notifyHabitMutation } from "@/components/habit-sync";
import { useLanguage, type TranslationKey } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { translateActionError } from "@/lib/action-error";
import { HABIT_COLORS, HABIT_ICONS, HABIT_TYPES, getHabitIcon } from "@/lib/habit-ui";
import type { HabitTypeValue } from "@/lib/habit-ui";
import { ScheduleBuilder, type ScheduleFormValue } from "@/components/schedule-builder";
import { TEMPLATE_CATEGORY_KEYS, type HabitTemplate } from "@/lib/templates";
import type { Habit } from "@/db/schema";
import type { Schedule } from "@/types/schedule";
import { cn } from "@/lib/utils";

/**
 * Create / edit habit dialog: react-hook-form + zod, icon and color
 * pickers, type selector and the flexible schedule builder.
 */

/**
 * Builds the validation schema with translated messages. Rebuilt only when the
 * language changes, so the memoised resolver stays referentially stable.
 */
function createHabitFormSchema(t: (key: TranslationKey) => string) {
  return z
    .object({
      name: z
        .string()
        .trim()
        .min(1, t("habits.form.errors.nameRequired"))
        .max(100, t("habits.form.errors.nameTooLong")),
      type: z.enum(["binary", "quantitative", "negative", "timed"]),
      schedule: z.object({
        mode: z.enum(["daily", "weekly", "specific_days", "flexible"]),
        daysOfWeek: z.array(z.number()),
        // Validated conditionally in `superRefine`: inactive modes must not block
        // submit with errors the user cannot see.
        timesPerWeek: z.number(),
        intervalDays: z.number(),
      }),
      /** Kept as string for the input; parsed on submit. */
      targetValue: z.string(),
      unit: z.string().trim(),
      category: z
        .string()
        .trim()
        .max(50, t("habits.form.errors.categoryTooLong")),
      /** Comma-separated input; the Server Action splits and trims it. */
      tags: z.string().superRefine((value, ctx) => {
        const tags = value
          .split(",")
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0);
        if (tags.some((tag) => tag.length > 20)) {
          ctx.addIssue({
            code: "custom",
            message: t("habits.form.errors.tagTooLong"),
          });
        }
      }),
      icon: z.string(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    })
    .superRefine((data, ctx) => {
      if (data.schedule.mode === "specific_days" && data.schedule.daysOfWeek.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["schedule", "daysOfWeek"],
          message: t("habits.form.errors.pickDay"),
        });
      }
      if (data.schedule.mode === "weekly") {
        const quota = data.schedule.timesPerWeek;
        if (!Number.isInteger(quota) || quota < 1) {
          ctx.addIssue({
            code: "custom",
            path: ["schedule", "timesPerWeek"],
            message: t("habits.form.errors.minOncePerWeek"),
          });
        } else if (quota > 7) {
          ctx.addIssue({
            code: "custom",
            path: ["schedule", "timesPerWeek"],
            message: t("habits.form.errors.maxSevenPerWeek"),
          });
        }
      }
      if (data.schedule.mode === "flexible") {
        if (!Number.isInteger(data.schedule.intervalDays) || data.schedule.intervalDays < 1) {
          ctx.addIssue({
            code: "custom",
            path: ["schedule", "intervalDays"],
            message: t("habits.form.errors.intervalMin"),
          });
        }
      }
      if (data.type === "quantitative" || data.type === "timed") {
        const target = data.targetValue.trim();
        if (!/^\d+$/.test(target) || Number(target) <= 0) {
          ctx.addIssue({
            code: "custom",
            path: ["targetValue"],
            message: t("habits.form.errors.targetPositive"),
          });
        }
        if (data.unit.trim().length > 16) {
          ctx.addIssue({
            code: "custom",
            path: ["unit"],
            message: t("habits.form.errors.unitTooLong"),
          });
        }
      }
    });
}

export type HabitFormValues = z.infer<ReturnType<typeof createHabitFormSchema>>;

/** Display labels for the habit type picker. */
const HABIT_TYPE_KEYS: Record<
  HabitTypeValue,
  { label: TranslationKey; description: TranslationKey }
> = {
  binary: {
    label: "habits.form.type.binary.label",
    description: "habits.form.type.binary.description",
  },
  quantitative: {
    label: "habits.form.type.quantitative.label",
    description: "habits.form.type.quantitative.description",
  },
  negative: {
    label: "habits.form.type.negative.label",
    description: "habits.form.type.negative.description",
  },
  timed: {
    label: "habits.form.type.timed.label",
    description: "habits.form.type.timed.description",
  },
};

function scheduleToForm(schedule: Schedule): ScheduleFormValue {
  return {
    mode: schedule.mode,
    daysOfWeek: schedule.daysOfWeek ?? [],
    timesPerWeek: schedule.timesPerWeek ?? 3,
    intervalDays: schedule.intervalDays ?? 2,
  };
}

function formToSchedule(value: ScheduleFormValue): Schedule {
  switch (value.mode) {
    case "daily":
      return { mode: "daily" };
    case "weekly":
      return { mode: "weekly", timesPerWeek: value.timesPerWeek };
    case "specific_days":
      return { mode: "specific_days", daysOfWeek: value.daysOfWeek };
    case "flexible":
      return { mode: "flexible", intervalDays: value.intervalDays };
  }
}

/**
 * Builds the form's initial values. An edited habit wins over a template;
 * otherwise the template is translated and mapped onto the same fields.
 */
function toFormValues(
  habit: Habit | undefined,
  template: HabitTemplate | null | undefined,
  t: (key: TranslationKey) => string
): HabitFormValues {
  if (habit) {
    return {
      name: habit.name,
      type: habit.type,
      schedule: scheduleToForm(
        (habit.schedule as unknown as Schedule | undefined) ?? { mode: "daily" }
      ),
      targetValue: habit.targetValue != null ? String(habit.targetValue) : "",
      unit: habit.unit ?? "",
      category: habit.category ?? "",
      tags: (habit.tags ?? []).join(", "),
      icon: habit.icon ?? "Dumbbell",
      color: habit.color ?? HABIT_COLORS[0],
    };
  }

  if (template) {
    return {
      name: t(template.nameKey),
      type: template.type,
      schedule: scheduleToForm(template.schedule),
      targetValue:
        template.targetValue != null ? String(template.targetValue) : "",
      unit: template.unit ?? "",
      category: t(TEMPLATE_CATEGORY_KEYS[template.category]),
      tags: "",
      icon: template.icon,
      color: template.color,
    };
  }

  return {
    name: "",
    type: "binary",
    schedule: scheduleToForm({ mode: "daily" }),
    targetValue: "",
    unit: "",
    category: "",
    tags: "",
    icon: "Dumbbell",
    color: HABIT_COLORS[0],
  };
}

interface HabitFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog edits this habit instead of creating a new one. */
  habit?: Habit;
  /** Pre-fills the create form when the user picks a ready-made habit. */
  template?: HabitTemplate | null;
  /** Existing categories offered as datalist suggestions. */
  categories?: string[];
}

export function HabitFormDialog({
  open,
  onOpenChange,
  habit,
  template,
  categories = [],
}: HabitFormDialogProps) {
  const { t } = useLanguage();
  const isEdit = Boolean(habit);
  const habitId = habit?.id ?? null;
  const templateId = template?.id ?? null;
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const habitRef = useRef(habit);
  habitRef.current = habit;
  const templateRef = useRef(template);
  templateRef.current = template;
  // Keeps the reset effect stable across language changes: the prefilled name
  // must not be overwritten while the user is editing the form.
  const tRef = useRef(t);
  tRef.current = t;

  const schema = useMemo(() => createHabitFormSchema(t), [t]);

  const form = useForm<HabitFormValues>({
    resolver: zodResolver(schema),
    defaultValues: toFormValues(habit, template, t),
  });

  // Reset only when the dialog opens or switches to another habit/template.
  // Depending on the whole objects would wipe edits whenever an RSC refresh
  // produced a new habit with identical data.
  useEffect(() => {
    if (!open) return;
    form.reset(toFormValues(habitRef.current, templateRef.current, tRef.current));
  }, [open, habitId, templateId, form]);

  const type = form.watch("type");
  const color = form.watch("color");
  const icon = form.watch("icon");
  const needsTarget = type === "quantitative" || type === "timed";

  const onSubmit = form.handleSubmit(async (values) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const unit = values.unit.trim();
      const category = values.category.trim();
      const payload = {
        name: values.name,
        type: values.type,
        color: values.color,
        icon: values.icon,
        schedule: formToSchedule(values.schedule),
        targetValue:
          values.type === "quantitative" || values.type === "timed"
            ? Number(values.targetValue.trim())
            : null,
        unit: needsTarget && unit ? unit : null,
        category: category || null,
        tags: values.tags,
      };

      const result = isEdit && habit
        ? await updateHabitAction({ id: habit.id, ...payload })
        : await createHabitAction(payload);

      if (result.ok) {
        notifyHabitMutation();
        toast.success(
          isEdit ? t("habits.form.updated") : t("habits.form.created")
        );
        onOpenChange(false);
      } else {
        toast.error(translateActionError(t, result.error));
      }
    } catch {
      toast.error(t("habits.form.saveFailed"));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  });

  const SelectedIcon = getHabitIcon(icon);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("habits.form.editTitle") : t("habits.form.createTitle")}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? t("habits.form.editDescription")
              : t("habits.form.createDescription")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="contents" aria-busy={submitting}>
          <FieldGroup>
            <Controller
              control={form.control}
              name="name"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="habit-name">{t("habits.form.name")}</FieldLabel>
                  <Input
                    id="habit-name"
                    placeholder={t("habits.form.namePlaceholder")}
                    {...field}
                  />
                  {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                </Field>
              )}
            />

            <Controller
              control={form.control}
              name="type"
              render={({ field }) => (
                <Field>
                  <FieldLabel>{t("habits.form.type")}</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HABIT_TYPES.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {t(HABIT_TYPE_KEYS[option.value].label)} —{" "}
                          {t(HABIT_TYPE_KEYS[option.value].description)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            />

            <Controller
              control={form.control}
              name="category"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="habit-category">
                    {t("habits.form.category")}
                  </FieldLabel>
                  <Input
                    id="habit-category"
                    list="habit-category-options"
                    autoComplete="off"
                    placeholder={t("habits.form.categoryPlaceholder")}
                    {...field}
                  />
                  <datalist id="habit-category-options">
                    {categories.map((category) => (
                      <option key={category} value={category} />
                    ))}
                  </datalist>
                  {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                </Field>
              )}
            />

            <Controller
              control={form.control}
              name="tags"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="habit-tags">{t("habits.form.tags")}</FieldLabel>
                  <Input
                    id="habit-tags"
                    autoComplete="off"
                    placeholder={t("habits.form.tagsPlaceholder")}
                    {...field}
                  />
                  {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                </Field>
              )}
            />

            <Controller
              control={form.control}
              name="schedule"
              render={() => <ScheduleBuilder form={form as never} />}
            />

            {needsTarget && (
              <>
                <Controller
                  control={form.control}
                  name="targetValue"
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="habit-target">
                        {t(
                          type === "timed"
                            ? "habits.form.targetMinutes"
                            : "habits.form.targetUnits"
                        )}
                      </FieldLabel>
                      <Input
                        id="habit-target"
                        type="number"
                        min={1}
                        step={1}
                        inputMode="numeric"
                        {...field}
                      />
                      {fieldState.error && (
                        <FieldError>{fieldState.error.message}</FieldError>
                      )}
                    </Field>
                  )}
                />
                <Controller
                  control={form.control}
                  name="unit"
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="habit-unit">{t("habits.form.unit")}</FieldLabel>
                      <Input
                        id="habit-unit"
                        placeholder={t("habits.form.unitPlaceholder")}
                        {...field}
                      />
                      {fieldState.error && (
                        <FieldError>{fieldState.error.message}</FieldError>
                      )}
                    </Field>
                  )}
                />
              </>
            )}

            <Field>
              <FieldLabel>{t("habits.form.icon")}</FieldLabel>
              <div className="grid grid-cols-8 gap-1.5">
                {HABIT_ICONS.map((name) => {
                  const IconComp = getHabitIcon(name);
                  const active = icon === name;
                  return (
                    <button
                      key={name}
                      type="button"
                      aria-label={name}
                      onClick={() => form.setValue("icon", name, { shouldDirty: true })}
                      className={cn(
                        "flex size-8 items-center justify-center rounded-md border transition-colors",
                        active
                          ? "border-primary bg-primary/15 text-foreground"
                          : "border-border hover:bg-muted"
                      )}
                    >
                      <IconComp className="size-4" />
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field>
              <FieldLabel>{t("habits.form.color")}</FieldLabel>
              <div className="flex flex-wrap gap-1.5">
                {HABIT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={c}
                    onClick={() => form.setValue("color", c, { shouldDirty: true })}
                    className="flex size-7 items-center justify-center rounded-full ring-offset-2 transition-all ring-offset-background"
                    style={{
                      background: c,
                      boxShadow: color === c ? `0 0 0 2px ${c}` : undefined,
                    }}
                  >
                    {color === c && <Check className="size-3.5 text-white" />}
                  </button>
                ))}
              </div>
            </Field>

            <div className="flex min-w-0 items-center gap-2 rounded-lg border p-2">
              <SelectedIcon className="size-4 shrink-0" style={{ color }} />
              <span className="min-w-0 flex-1 truncate text-sm">
                {form.watch("name") || t("habits.form.preview")}
              </span>
            </div>
          </FieldGroup>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => onOpenChange(false)}
            >
              {t("habits.form.cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              {isEdit ? t("habits.form.save") : t("habits.form.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
