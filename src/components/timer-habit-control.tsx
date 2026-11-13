"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, Timer } from "lucide-react";
import { toast } from "sonner";

import { setCheckinValueAction } from "@/actions/habits";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/habit-ui";
import type { Checkin, Habit } from "@/db/schema";

/**
 * Simple stopwatch for `timed` habits (no background mode): start / pause,
 * save elapsed seconds into today's check-in.
 */

interface TimerHabitControlProps {
  habit: Habit;
  today: string;
  todayCheckin?: Checkin;
}

export function TimerHabitControl({ habit, today, todayCheckin }: TimerHabitControlProps) {
  const [elapsed, setElapsed] = useState(todayCheckin?.value ?? 0);
  const [running, setRunning] = useState(false);
  const startRef = useRef<number | null>(null);
  const baseRef = useRef(todayCheckin?.value ?? 0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) {
      startRef.current = Date.now();
      intervalRef.current = setInterval(() => {
        if (startRef.current != null) {
          setElapsed(baseRef.current + Math.floor((Date.now() - startRef.current) / 1000));
        }
      }, 500);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  const pause = () => {
    if (!running) return;
    setRunning(false);
    baseRef.current = elapsed;
    void save(elapsed);
  };

  const save = async (seconds: number) => {
    const result = await setCheckinValueAction({
      habitId: habit.id,
      date: today,
      value: seconds > 0 ? seconds : null,
    });
    if (result.ok) {
      toast.success(`Saved ${formatDuration(seconds)} for "${habit.name}"`);
    } else {
      toast.error(result.error);
    }
  };

  const done = habit.targetValue ? elapsed >= habit.targetValue : false;

  return (
    <div className="flex w-full items-center gap-2">
      <span className="flex items-center gap-1.5 font-mono text-sm tabular-nums">
        <Timer className="size-4 text-muted-foreground" />
        {formatDuration(elapsed)}
        {habit.targetValue ? (
          <span className="text-muted-foreground">/ {formatDuration(habit.targetValue * 60)}</span>
        ) : null}
      </span>
      {running ? (
        <Button variant="outline" size="sm" onClick={pause} className="ml-auto">
          <Pause data-icon="inline-start" />
          Pause
        </Button>
      ) : (
        <Button
          variant={done ? "secondary" : "default"}
          size="sm"
          onClick={() => setRunning(true)}
          className="ml-auto"
        >
          <Play data-icon="inline-start" />
          {elapsed > 0 ? "Resume" : "Start"}
        </Button>
      )}
    </div>
  );
}
