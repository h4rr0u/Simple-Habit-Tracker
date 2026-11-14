"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Plus, SquareCheck, Undo2, X } from "lucide-react";
import { toast } from "sonner";

import {
  incrementCheckinAction,
  setCheckinValueAction,
  toggleCheckinAction,
} from "@/actions/habits";
import { notifyHabitMutation } from "@/components/habit-sync";
import { useLanguage } from "@/components/language-provider";
import { TimerHabitControl } from "@/components/timer-habit-control";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { translateActionError } from "@/lib/action-error";
import { isHabitDayComplete } from "@/lib/habit-target";
import { cn } from "@/lib/utils";
import type { Checkin, Habit } from "@/db/schema";

/**
 * Per-type check-in control shared by the dashboard and habit cards.
 *
 * - binary: checkbox (dashboard) or button (cards);
 * - quantitative: number input + save button, never a checkbox;
 * - timed: stopwatch + minutes progress, never a checkbox;
 * - negative: red "Log slip" / "Undo slip" action with inverted completion;
 * - rest days: every control is disabled.
 */

export interface HabitCheckinControlProps {
  habit: Habit;
  /** ISO date (YYYY-MM-DD) used for check-ins. */
  today: string;
  todayCheckin: Checkin | null;
  disabled?: boolean;
  variant?: "dashboard" | "card";
  onChanged?: (checkin: Checkin | null) => void;
}

/** Builds the optimistic check-in row returned to the parent view. */
function localCheckin(
  habitId: number,
  date: string,
  value: number | null
): Checkin {
  return {
    id: 0,
    habitId,
    date,
    value,
    note: null,
    createdAt: new Date(),
  };
}

export function HabitCheckinControl({
  habit,
  today,
  todayCheckin,
  disabled = false,
  variant = "card",
  onChanged,
}: HabitCheckinControlProps) {
  const { t } = useLanguage();
  const [text, setText] = useState(
    todayCheckin?.value != null ? String(todayCheckin.value) : ""
  );
  const [pending, setPending] = useState(false);

  // Keep the input mirror in sync when a mutation lands from this tab, another
  // tab, the bot or a refresh. Only the stored value is a dependency, so
  // typing is never interrupted by unrelated renders.
  const storedValue = todayCheckin?.value ?? null;
  useEffect(() => {
    setText(storedValue != null ? String(storedValue) : "");
  }, [storedValue]);

  const complete = isHabitDayComplete(habit, todayCheckin);
  const isDashboard = variant === "dashboard";
  const buttonSize = isDashboard ? "sm" : "default";
  const quantButtonSize = isDashboard ? "icon-xs" : "icon";

  const toggle = async () => {
    if (disabled || pending) return;
    setPending(true);
    try {
      const result = await toggleCheckinAction({ habitId: habit.id, date: today });
      if (!result.ok) {
        toast.error(translateActionError(t, result.error));
        return;
      }

      const checked = result.data === "checked";
      const next = checked ? localCheckin(habit.id, today, null) : null;
      onChanged?.(next);
      notifyHabitMutation();

      if (habit.type === "negative") {
        if (checked) {
          toast.warning(t("checkin.slipLogged", { name: habit.name }));
        } else {
          toast.success(t("checkin.backOnTrack", { name: habit.name }));
        }
      } else if (checked) {
        toast.success(t("checkin.done", { name: habit.name }));
      } else {
        toast.success(t("checkin.removed", { name: habit.name }));
      }
    } catch {
      toast.error(t("checkin.failed"));
    } finally {
      setPending(false);
    }
  };

  const saveValue = async () => {
    if (disabled || pending) return;

    const trimmed = text.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (parsed != null && (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0)) {
      toast.error(t("checkin.invalidNumber"));
      return;
    }

    const value = parsed != null && parsed > 0 ? parsed : null;
    setPending(true);
    try {
      const result = await setCheckinValueAction({
        habitId: habit.id,
        date: today,
        value,
      });
      if (!result.ok) {
        toast.error(translateActionError(t, result.error));
        return;
      }

      onChanged?.(value != null ? localCheckin(habit.id, today, value) : null);
      notifyHabitMutation();

      if (value != null) {
        const unit = habit.unit ? ` ${habit.unit}` : "";
        toast.success(
          t("checkin.savedValue", { name: habit.name, value: `${value}${unit}` })
        );
      } else {
        toast.success(t("checkin.removed", { name: habit.name }));
      }
    } catch {
      toast.error(t("checkin.saveFailed"));
    } finally {
      setPending(false);
    }
  };

  const increment = async () => {
    if (disabled || pending) return;
    setPending(true);
    try {
      const result = await incrementCheckinAction({
        habitId: habit.id,
        date: today,
      });
      if (!result.ok) {
        toast.error(translateActionError(t, result.error));
        return;
      }

      const nextValue = result.data;
      onChanged?.(localCheckin(habit.id, today, nextValue));
      notifyHabitMutation();

      const unit = habit.unit ? ` ${habit.unit}` : "";
      if (habit.targetValue != null && nextValue >= habit.targetValue) {
        toast.success(
          t("checkin.goalReached", {
            progress: `${nextValue}/${habit.targetValue}${unit}`,
          })
        );
      } else {
        toast.success(
          t("checkin.savedValue", {
            name: habit.name,
            value: `${nextValue}${unit}`,
          })
        );
      }
    } catch {
      toast.error(t("checkin.failed"));
    } finally {
      setPending(false);
    }
  };

  if (habit.type === "timed") {
    return (
      <TimerHabitControl
        habit={habit}
        today={today}
        todayCheckin={todayCheckin}
        disabled={disabled}
        onChanged={onChanged}
      />
    );
  }

  if (habit.type === "quantitative") {
    return (
      <div className={cn("flex items-center gap-2", isDashboard ? "shrink-0" : "w-full")}>
        <Input
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          value={text}
          disabled={disabled || pending}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void saveValue();
            }
          }}
          placeholder={
            habit.targetValue
              ? t("checkin.targetPlaceholder", { value: habit.targetValue })
              : t("checkin.valuePlaceholder")
          }
          aria-label={t("checkin.valueAria", { name: habit.name })}
          className={cn(isDashboard && "h-7 w-16")}
        />
        <Button
          size={isDashboard ? "xs" : "sm"}
          onClick={() => void increment()}
          disabled={disabled || pending || complete}
          aria-label={t("checkin.addOneAria", { name: habit.name })}
        >
          {pending ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Plus data-icon="inline-start" />
          )}
          +1
        </Button>
        <Button
          variant="outline"
          size={quantButtonSize}
          onClick={() => void saveValue()}
          disabled={disabled || pending}
          aria-label={t("checkin.saveValueAria", { name: habit.name })}
        >
          {pending ? <Loader2 className="animate-spin" /> : <Check />}
        </Button>
      </div>
    );
  }

  if (habit.type === "negative") {
    return (
      <Button
        variant="destructive"
        size={buttonSize}
        onClick={() => void toggle()}
        disabled={disabled || pending}
        aria-pressed={todayCheckin != null}
        className={cn(isDashboard ? "shrink-0" : "w-full")}
      >
        {pending ? (
          <Loader2 className="animate-spin" />
        ) : todayCheckin ? (
          <Undo2 data-icon="inline-start" />
        ) : (
          <X data-icon="inline-start" />
        )}
        {todayCheckin ? t("checkin.undoSlip") : t("checkin.logSlip")}
      </Button>
    );
  }

  if (isDashboard) {
    return (
      <Checkbox
        checked={complete}
        disabled={disabled || pending}
        onCheckedChange={() => void toggle()}
        aria-label={t("checkin.checkInAria", { name: habit.name })}
      />
    );
  }

  return (
    <Button
      onClick={() => void toggle()}
      disabled={disabled || pending}
      variant={complete ? "secondary" : "default"}
      className="w-full"
    >
      {pending ? (
        <Loader2 className="animate-spin" />
      ) : complete ? (
        <Undo2 data-icon="inline-start" />
      ) : (
        <SquareCheck data-icon="inline-start" />
      )}
      {complete ? t("checkin.undo") : t("checkin.checkIn")}
    </Button>
  );
}
