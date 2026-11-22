"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Pause, Play, RotateCcw, Timer } from "lucide-react";
import { toast } from "sonner";

import { setCheckinValueAction } from "@/actions/habits";
import { notifyHabitMutation } from "@/components/habit-sync";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { meetsHabitTarget, targetUnits } from "@/lib/habit-target";
import { formatDuration } from "@/lib/habit-ui";
import {
  clearStoredTimer,
  isStoredTimerFromDate,
  readStoredTimer,
  restoredElapsed,
  timerDateKey,
  writeStoredTimer,
} from "@/lib/timer-storage";
import type { Checkin, Habit } from "@/db/schema";

/**
 * Simple stopwatch for `timed` habits (no background mode): start / pause,
 * save elapsed seconds into today's check-in. Pausing saves automatically, so
 * the value survives navigation and is visible in the other views.
 *
 * While running, the segment is mirrored to localStorage (`timer_<habitId>`)
 * so a reload or a closed tab can restore the stopwatch instead of losing the
 * time. When a save fails, the UI rolls back to the value that is actually in
 * the database instead of showing time that was never persisted.
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
  /**
   * `dashboard` sits in a single flex row next to the habit name, so it must
   * not claim the whole width; `card` is stacked and stretches instead.
   */
  variant?: "dashboard" | "card";
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
  variant = "card",
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
  const restoreAttemptedRef = useRef(false);

  /** Puts the visible value back to what is actually stored on the server. */
  const rollback = () => {
    const previous = lastServerValueRef.current;
    const next = target != null ? Math.min(previous, target) : previous;
    baseRef.current = next;
    setElapsed(next);
  };

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
        rollback();
        toast.error(t("timer.saveFailed"));
      }
    } catch {
      rollback();
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

  // Restore a timer that was still running when the page was reloaded or the
  // tab was closed. Runs once per mount: afterwards the stored state is only
  // a mirror of the live stopwatch.
  useEffect(() => {
    if (restoreAttemptedRef.current) return;
    restoreAttemptedRef.current = true;

    const stored = readStoredTimer(habit.id);
    if (!stored) return;

    // A timer left behind on a previous day must not revive today: the time
    // it accumulated belongs to yesterday's check-in. Drop the record instead.
    if (!isStoredTimerFromDate(stored, timerDateKey())) {
      clearStoredTimer(habit.id);
      toast.info(t("timer.discarded"));
      return;
    }

    const restored = restoredElapsed(stored);
    const next = target != null ? Math.min(restored, target) : restored;
    baseRef.current = next;
    setElapsed(next);
    toast.info(t("timer.restored"));

    if (target != null && next >= target) {
      // The target was reached while the page was closed: settle on it.
      clearStoredTimer(habit.id);
      setRunning(false);
      void saveRef.current(target);
      return;
    }

    setRunning(true);
  }, [habit.id, target, t]);

  // Make sure the running segment is written synchronously before the page
  // goes away; the browser may not give us time for a server request.
  useEffect(() => {
    if (!running) return;

    const flush = () => {
      if (startRef.current == null) return;
      const now = Date.now();
      const seconds =
        Math.floor((now - startRef.current) / 1000) + baseRef.current;
      writeStoredTimer(habit.id, {
        startTime: now,
        initialElapsed: target != null ? Math.min(seconds, target) : seconds,
        date: timerDateKey(),
      });
    };

    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
    };
  }, [running, target, habit.id]);

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
        clearStoredTimer(habit.id);
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
  }, [running, target, habit.id]);

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

  const start = () => {
    baseRef.current = elapsed;
    writeStoredTimer(habit.id, {
      startTime: Date.now(),
      initialElapsed: elapsed,
      date: timerDateKey(),
    });
    setRunning(true);
  };

  const pause = () => {
    if (!running) return;
    setRunning(false);
    baseRef.current = elapsed;
    clearStoredTimer(habit.id);
    void save(elapsed);
  };

  const clear = () => {
    if (running || pending) return;
    clearStoredTimer(habit.id);
    baseRef.current = 0;
    setElapsed(0);
    void save(0);
  };

  const done = elapsed > 0 && meetsHabitTarget(habit, elapsed);
  const atTarget = target != null && elapsed >= target;

  return (
    <div
      className={
        variant === "dashboard"
          ? "flex shrink-0 items-center gap-2"
          : "flex w-full items-center gap-2"
      }
    >
      <span className="flex items-center gap-1.5 font-mono text-sm tabular-nums">
        <Timer className="size-4 text-muted-foreground" />
        {formatDuration(elapsed)}
        {habit.targetValue ? (
          <span className="text-muted-foreground">/ {formatDuration(habit.targetValue * 60)}</span>
        ) : null}
        {done ? (
          <Check
            className="size-3.5 text-success"
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
          onClick={start}
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
