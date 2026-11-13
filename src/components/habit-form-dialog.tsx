"use client";

import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { createHabitAction, updateHabitAction } from "@/actions/habits";
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
import { HABIT_COLORS, HABIT_ICONS, HABIT_TYPES, getHabitIcon } from "@/lib/habit-ui";
import { ScheduleBuilder, type ScheduleFormValue } from "@/components/schedule-builder";
import type { Habit } from "@/db/schema";
import type { Schedule } from "@/types/schedule";
import { cn } from "@/lib/utils";

/**
 * Create / edit habit dialog: react-hook-form + zod, icon and color
 * pickers, type selector and the flexible schedule builder.
 */

const habitFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(100),
    type: z.enum(["binary", "quantitative", "negative", "timed"]),
    schedule: z.object({
      mode: z.enum(["daily", "weekly", "specific_days", "flexible"]),
      daysOfWeek: z.array(z.number()),
      timesPerWeek: z.number().min(1).max(7),
      intervalDays: z.number().min(1),
    }),
    /** Kept as string for the input; parsed on submit. */
    targetValue: z.string(),
    unit: z.string().max(16),
    icon: z.string(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  })
  .superRefine((data, ctx) => {
    if (data.schedule.mode === "specific_days" && data.schedule.daysOfWeek.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["schedule", "daysOfWeek"],
        message: "Pick at least one day",
      });
    }
    if (
      (data.type === "quantitative" || data.type === "timed") &&
      (data.targetValue === "" ||
        Number.isNaN(Number(data.targetValue)) ||
        Number(data.targetValue) <= 0)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["targetValue"],
        message: "Target must be a positive number",
      });
    }
  });

export type HabitFormValues = z.infer<typeof habitFormSchema>;

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

interface HabitFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog edits this habit instead of creating a new one. */
  habit?: Habit;
}

export function HabitFormDialog({ open, onOpenChange, habit }: HabitFormDialogProps) {
  const isEdit = Boolean(habit);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<HabitFormValues>({
    resolver: zodResolver(habitFormSchema),
    defaultValues: {
      name: habit?.name ?? "",
      type: habit?.type ?? "binary",
      schedule: scheduleToForm(
        (habit?.schedule as unknown as Schedule | undefined) ?? { mode: "daily" }
      ),
      targetValue: habit?.targetValue != null ? String(habit.targetValue) : "",
      unit: habit?.unit ?? "",
      icon: habit?.icon ?? "Dumbbell",
      color: habit?.color ?? HABIT_COLORS[0],
    },
  });

  // Reset the form whenever the dialog is re-opened or the target habit changes.
  useEffect(() => {
    if (open) {
      form.reset({
        name: habit?.name ?? "",
        type: habit?.type ?? "binary",
        schedule: scheduleToForm(
          (habit?.schedule as unknown as Schedule | undefined) ?? { mode: "daily" }
        ),
        targetValue: habit?.targetValue != null ? String(habit.targetValue) : "",
        unit: habit?.unit ?? "",
        icon: habit?.icon ?? "Dumbbell",
        color: habit?.color ?? HABIT_COLORS[0],
      });
    }
  }, [open, habit, form]);

  const type = form.watch("type");
  const color = form.watch("color");
  const icon = form.watch("icon");
  const needsTarget = type === "quantitative" || type === "timed";

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitting(true);
    try {
      const payload = {
        name: values.name,
        type: values.type,
        color: values.color,
        icon: values.icon,
        schedule: formToSchedule(values.schedule),
        targetValue:
          values.type === "quantitative" || values.type === "timed"
            ? Number(values.targetValue)
            : null,
        unit: needsTarget && values.unit ? values.unit : null,
      };

      const result = isEdit && habit
        ? await updateHabitAction({ id: habit.id, ...payload })
        : await createHabitAction(payload);

      if (result.ok) {
        toast.success(isEdit ? "Habit updated" : "Habit created");
        onOpenChange(false);
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Failed to save habit");
    } finally {
      setSubmitting(false);
    }
  });

  const SelectedIcon = getHabitIcon(icon);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit habit" : "New habit"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the habit's details."
              : "Create a new habit to track."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="contents">
          <FieldGroup>
            <Controller
              control={form.control}
              name="name"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="habit-name">Name</FieldLabel>
                  <Input id="habit-name" placeholder="e.g. Morning run" {...field} />
                  {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                </Field>
              )}
            />

            <Controller
              control={form.control}
              name="type"
              render={({ field }) => (
                <Field>
                  <FieldLabel>Type</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HABIT_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label} — {t.description}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                        Target ({type === "timed" ? "minutes" : "units"})
                      </FieldLabel>
                      <Input id="habit-target" type="number" min={1} {...field} />
                      {fieldState.error && (
                        <FieldError>{fieldState.error.message}</FieldError>
                      )}
                    </Field>
                  )}
                />
                <Controller
                  control={form.control}
                  name="unit"
                  render={({ field }) => (
                    <Field>
                      <FieldLabel htmlFor="habit-unit">Unit (optional)</FieldLabel>
                      <Input id="habit-unit" placeholder="e.g. glasses, pages" {...field} />
                    </Field>
                  )}
                />
              </>
            )}

            <Field>
              <FieldLabel>Icon</FieldLabel>
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
              <FieldLabel>Color</FieldLabel>
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

            <div className="flex items-center gap-2 rounded-lg border p-2">
              <SelectedIcon className="size-4" style={{ color }} />
              <span className="text-sm">
                {form.watch("name") || "Habit preview"}
              </span>
            </div>
          </FieldGroup>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {isEdit ? "Save changes" : "Create habit"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
