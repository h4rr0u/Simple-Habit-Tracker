"use client";

import { UseFormReturn } from "react-hook-form";
import { CalendarDays, Repeat, Hash, SlidersHorizontal } from "lucide-react";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { dowLabel } from "@/lib/habit-ui";
import { cn } from "@/lib/utils";
import type { Schedule } from "@/types/schedule";

/**
 * Flexible schedule builder inside the habit form: mode selector plus
 * per-mode fields (weekdays, weekly quota, or an N-days interval).
 */

export interface ScheduleFormValue {
  mode: Schedule["mode"];
  daysOfWeek: number[];
  timesPerWeek: number;
  intervalDays: number;
}

const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const SCHEDULE_MODE_LABELS: Record<Schedule["mode"], string> = {
  daily: "Every day",
  weekly: "Times per week",
  specific_days: "Specific days",
  flexible: "Every N days",
};

interface ScheduleBuilderProps {
  form: UseFormReturn<Record<string, unknown>>;
}

export function ScheduleBuilder({ form }: ScheduleBuilderProps) {
  const schedule = form.watch("schedule") as ScheduleFormValue;
  const errors = form.formState.errors;

  const setMode = (mode: Schedule["mode"]) => {
    const current = form.getValues("schedule") as ScheduleFormValue;
    form.setValue("schedule", { ...current, mode }, { shouldDirty: true });
  };

  const toggleDay = (day: number) => {
    // Read the live form value: rapid successive clicks share one render,
    // so the watched `schedule` closure would be stale and drop days.
    const current = form.getValues("schedule") as ScheduleFormValue;
    const days = current.daysOfWeek ?? [];
    const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
    form.setValue("schedule", { ...current, daysOfWeek: next }, { shouldDirty: true });
  };

  return (
    <Field>
      <FieldLabel>Schedule</FieldLabel>
      <Select value={schedule.mode} onValueChange={(v) => setMode(v as Schedule["mode"])}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(SCHEDULE_MODE_LABELS) as Array<Schedule["mode"]>).map((mode) => (
            <SelectItem key={mode} value={mode}>
              {SCHEDULE_MODE_LABELS[mode]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {schedule.mode === "specific_days" && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {DOW_ORDER.map((day) => {
            const active = (schedule.daysOfWeek ?? []).includes(day);
            return (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                className={cn(
                  "h-8 min-w-9 rounded-lg border px-2 text-xs font-medium transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background hover:bg-muted"
                )}
              >
                {dowLabel(day)}
              </button>
            );
          })}
          {(errors.schedule as unknown as { daysOfWeek?: { message?: string } })?.daysOfWeek && (
            <FieldError>
              {((errors.schedule as unknown as { daysOfWeek?: { message?: string } })
                .daysOfWeek?.message) ?? ""}
            </FieldError>
          )}
        </div>
      )}

      {schedule.mode === "weekly" && (
        <div className="flex items-center gap-3 pt-1">
          <Input
            type="number"
            min={1}
            max={7}
            value={schedule.timesPerWeek}
            onChange={(e) => {
              const current = form.getValues("schedule") as ScheduleFormValue;
              form.setValue(
                "schedule",
                { ...current, timesPerWeek: Number(e.target.value) },
                { shouldDirty: true }
              );
            }}
            className="w-20"
          />
          <span className="text-sm text-muted-foreground">times per week</span>
        </div>
      )}

      {schedule.mode === "flexible" && (
        <div className="flex items-center gap-3 pt-1">
          <Input
            type="number"
            min={1}
            value={schedule.intervalDays}
            onChange={(e) => {
              const current = form.getValues("schedule") as ScheduleFormValue;
              form.setValue(
                "schedule",
                { ...current, intervalDays: Number(e.target.value) },
                { shouldDirty: true }
              );
            }}
            className="w-20"
          />
          <span className="text-sm text-muted-foreground">day interval</span>
        </div>
      )}

      {schedule.mode === "daily" && (
        <FieldDescription className="pt-1">
          This habit is due every day.
        </FieldDescription>
      )}
    </Field>
  );
}
