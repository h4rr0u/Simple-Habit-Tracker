"use client";

import { UseFormReturn } from "react-hook-form";

import { useLanguage, type TranslationKey } from "@/components/language-provider";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

/** Short weekday labels, indexed 0 = Sunday. */
const WEEKDAY_KEYS: TranslationKey[] = [
  "weekday.sun",
  "weekday.mon",
  "weekday.tue",
  "weekday.wed",
  "weekday.thu",
  "weekday.fri",
  "weekday.sat",
];

const SCHEDULE_MODE_KEYS: Record<Schedule["mode"], TranslationKey> = {
  daily: "habits.form.schedule.daily",
  weekly: "habits.form.schedule.weekly",
  specific_days: "habits.form.schedule.specificDays",
  flexible: "habits.form.schedule.flexible",
};

const SCHEDULE_MODES = Object.keys(SCHEDULE_MODE_KEYS) as Array<Schedule["mode"]>;

interface ScheduleBuilderProps {
  form: UseFormReturn<Record<string, unknown>>;
}

export function ScheduleBuilder({ form }: ScheduleBuilderProps) {
  const { t } = useLanguage();
  const schedule = form.watch("schedule") as ScheduleFormValue;
  const errors = form.formState.errors;
  const scheduleErrors = errors.schedule as unknown as
    | {
        daysOfWeek?: { message?: string };
        timesPerWeek?: { message?: string };
        intervalDays?: { message?: string };
      }
    | undefined;

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
      <FieldLabel>{t("habits.form.schedule")}</FieldLabel>
      <Select value={schedule.mode} onValueChange={(v) => setMode(v as Schedule["mode"])}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SCHEDULE_MODES.map((mode) => (
            <SelectItem key={mode} value={mode}>
              {t(SCHEDULE_MODE_KEYS[mode])}
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
                {t(WEEKDAY_KEYS[day] ?? "weekday.sun")}
              </button>
            );
          })}
          {scheduleErrors?.daysOfWeek && (
            <FieldError>{scheduleErrors.daysOfWeek.message ?? ""}</FieldError>
          )}
        </div>
      )}

      {schedule.mode === "weekly" && (
        <div className="space-y-1 pt-1">
          <div className="flex items-center gap-3">
            <Input
              type="number"
              min={1}
              max={7}
              step={1}
              inputMode="numeric"
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
            <span className="text-sm text-muted-foreground">
              {t("habits.form.schedule.timesPerWeek")}
            </span>
          </div>
          {scheduleErrors?.timesPerWeek && (
            <FieldError>{scheduleErrors.timesPerWeek.message ?? ""}</FieldError>
          )}
        </div>
      )}

      {schedule.mode === "flexible" && (
        <div className="space-y-1 pt-1">
          <div className="flex items-center gap-3">
            <Input
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
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
            <span className="text-sm text-muted-foreground">
              {t("habits.form.schedule.dayInterval")}
            </span>
          </div>
          {scheduleErrors?.intervalDays && (
            <FieldError>{scheduleErrors.intervalDays.message ?? ""}</FieldError>
          )}
        </div>
      )}

      {schedule.mode === "daily" && (
        <FieldDescription className="pt-1">
          {t("habits.form.schedule.dailyHint")}
        </FieldDescription>
      )}
    </Field>
  );
}
