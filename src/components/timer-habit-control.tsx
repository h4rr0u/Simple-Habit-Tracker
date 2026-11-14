"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Pause, Play, RotateCcw, Timer } from "lucide-react";
import { toast } from "sonner";

import { setCheckinValueAction } from "@/actions/habits";
import { notifyHabitMutation } from "@/components/habit-sync";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { translateActionError } from "@/lib/action-error";
import { meetsHabitTarget, targetUnits } from "@/lib/habit-target";
import { formatDuration } from "@/lib/habit-ui";
import type { Checkin, Habit } from "@/db/schema";

/**
 * Simple stopwatch for `timed` habits (no background mode): start / pause,
 * save elapsed seconds into today's check-in. Pausing saves automatically, so
 * the value survives navigation and is visible in the other views.
 *
 * The stopwatch never runs past the habit target: once the target is reached
 * it stops and saves exactly the target value, so a completed day cannot keep
 * accumulating time (e.g. 15:03 / 15:00).
 */

interface TimerHabitControlProps {
  habit: Habit;
  today: string;
  todayCheckin: Checkin | null;
  disabled?: boolean;
  onChanged?: (checkin: Checkin | null) => void;
}

function localCheckin(habitId: number, date: string, value: number | null): Checkin {
  return {
    id: 0,
    habitId,
    date,
    value,
    note: null,
    createdAt: new Date(),
  };
}

export function TimerHabitControl({
  habit,
  today,
  todayCheckin,
  disabled = false,
  onChanged,
}: TimerHabitControlProps) {
  const { t } = useLanguage();
  const target = targetUnits(habit);
  const serverValue = todayCheckin?.value ?? 0;

  const [elapsed, setElapsed] = useState(() =>
    target != null ? Math.min(serverValue, target) : serverValue
  );
  const [running, setRunning] = useState(false);
  const [pending, setPending] = useState(false);
  const startRef = useRef<number | null>(null);
  const baseRef = useRef(target != null ? Math.min(serverValue, target) : serverValue);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastServerValueRef = useRef(serverValue);

  const save = async (seconds: number) => {
    setPending(true);
    try {
      const result = await setCheckinValueAction({
        habitId: habit.id,
        date: today,
        value: seconds > 0 ? seconds : null,
      });
      if (result.ok) {
        lastServerValueRef.current = seconds;
        onChanged?.(seconds > 0 ? localCheckin(habit.id, today, seconds) : null);
        notifyHabitMutation();
        toast.success(
          seconds > 0
            ? t("timer.saved", {
                duration: formatDuration(seconds),
                name: habit.name,
              })
            : t("timer.cleared", { name: habit.name })
        );
      } else {
        toast.error(translateActionError(t, result.error));
      }
    } catch {
      toast.error(t("timer.saveFailed"));
    } finally {
      setPending(false);
    }
  };

  // Keep the latest save callback without restarting the ticking effect (the
  // parent re-creates `onChanged` on every render).
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });

  useEffect(() => {
    if (!running) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    startRef.current = Date.now();
    intervalRef.current = setInterval(() => {
      if (startRef.current == null) return;
      const next = baseRef.current + Math.floor((Date.now() - startRef.current) / 1000);

      // Stop the stopwatch at the target instead of overshooting it.
      if (target != null && next >= target) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        startRef.current = null;
        baseRef.current = target;
        setElapsed(target);
        setRunning(false);
        void saveRef.current(target);
        return;
      }

      setElapsed(next);
    }, 500);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [running, target]);

  // Sync external changes (another tab, the bot or a refresh) without
  // clobbering the live stopwatch or the value that is currently being saved.
  useEffect(() => {
    if (running) return;
    if (serverValue === lastServerValueRef.current) return;
    lastServerValueRef.current = serverValue;
    const next = target != null ? Math.min(serverValue, target) : serverValue;
    setElapsed(next);
    baseRef.current = next;
  }, [serverValue, running, target]);

  const pause = () => {
    if (!running) return;
    setRunning(false);
    baseRef.current = elapsed;
    void save(elapsed);
  };

  const clear = () => {
    if (running || pending) return;
    baseRef.current = 0;
    lastServerValueRef.current = 0;
    setElapsed(0);
    void save(0);
  };

  const done = elapsed > 0 && meetsHabitTarget(habit, elapsed);
  const atTarget = target != null && elapsed >= target;

  return (
    <div className="flex w-full items-center gap-2">
      <span className="flex items-center gap-1.5 font-mono text-sm tabular-nums">
        <Timer className="size-4 text-muted-foreground" />
        {formatDuration(elapsed)}
        {habit.targetValue ? (
          <span className="text-muted-foreground">/ {formatDuration(habit.targetValue * 60)}</span>
        ) : null}
        {done ? (
          <Check
            className="size-3.5 text-emerald-500"
            aria-label={t("timer.targetReached")}
          />
        ) : null}
      </span>
      {running ? (
        <Button
          variant="outline"
          size="sm"
          onClick={pause}
          disabled={disabled}
          className="ml-auto"
        >
          <Pause data-icon="inline-start" />
          {t("timer.pause")}
        </Button>
      ) : atTarget ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={clear}
          disabled={disabled || pending}
          className="ml-auto"
        >
          {pending ? (
            <Loader2 className="animate-spin" />
          ) : (
            <RotateCcw data-icon="inline-start" />
          )}
          {t("common.clear")}
        </Button>
      ) : (
        <Button
          variant={done ? "secondary" : "default"}
          size="sm"
          onClick={() => setRunning(true)}
          disabled={disabled || pending}
          className="ml-auto"
        >
          {pending ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Play data-icon="inline-start" />
          )}
          {elapsed > 0 ? t("timer.resume") : t("timer.start")}
        </Button>
      )}
    </div>
  );
}
