"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Flame, Plus, SquareCheck } from "lucide-react";
import { toast } from "sonner";

import { setCheckinValueAction, toggleCheckinAction } from "@/actions/habits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TimerHabitControl } from "@/components/timer-habit-control";
import { formatSchedule, getHabitIcon } from "@/lib/habit-ui";
import { cn } from "@/lib/utils";
import type { Checkin, Habit } from "@/db/schema";

/**
 * Interactive habit card for the /habits grid: streak badge, schedule,
 * per-type check-in control and color strip.
 */

interface HabitCardProps {
  habit: Habit;
  /** ISO date (YYYY-MM-DD) used for check-ins. */
  today: string;
  todayCheckin?: Checkin;
  streak: number;
  isDueToday: boolean;
  className?: string;
}

export function HabitCard({
  habit,
  today,
  todayCheckin,
  streak,
  isDueToday,
  className,
}: HabitCardProps) {
  const Icon = getHabitIcon(habit.icon);
  const [value, setValue] = useState(
    todayCheckin?.value != null ? String(todayCheckin.value) : ""
  );
  const [pending, setPending] = useState(false);
  const [justDone, setJustDone] = useState(false);

  /** Whether today's check-in satisfies the habit (presence for binary/negative, target for others). */
  const done = useMemo(() => {
    if (!todayCheckin) return false;
    if (habit.type === "binary" || habit.type === "negative") return true;
    if (!habit.targetValue) return true;
    return (todayCheckin.value ?? 0) >= habit.targetValue;
  }, [todayCheckin, habit.type, habit.targetValue]);

  const handleToggle = async () => {
    setPending(true);
    try {
      const result = await toggleCheckinAction({ habitId: habit.id, date: today });
      if (result.ok) {
        if (result.data === "checked") {
          setJustDone(true);
          setTimeout(() => setJustDone(false), 700);
          toast.success(`"${habit.name}" checked in`);
        } else {
          toast.info(`"${habit.name}" check-in removed`);
        }
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Failed to update check-in");
    } finally {
      setPending(false);
    }
  };

  const handleIncrement = async () => {
    const parsed = value === "" ? 0 : Number(value);
    if (!Number.isFinite(parsed)) {
      toast.error("Enter a number first");
      return;
    }
    setPending(true);
    try {
      const next = Math.floor(parsed) + 1;
      const result = await setCheckinValueAction({
        habitId: habit.id,
        date: today,
        value: next,
      });
      if (result.ok) {
        setValue(String(next));
        toast.success(`"${habit.name}": ${next} ${habit.unit ?? ""}`.trim());
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Failed to save value");
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className={cn("relative gap-4", className)} data-due={isDueToday}>
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: habit.color }}
      />
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4 shrink-0" style={{ color: habit.color }} />
          <Link href={`/habits/${habit.id}`} className="hover:underline">
            {habit.name}
          </Link>
        </CardTitle>
        <CardDescription>
          {formatSchedule(habit.schedule as never)}
          {habit.type === "negative" ? " · avoid" : ""}
        </CardDescription>
        <CardAction className="flex items-center gap-1.5">
          <Badge variant="secondary" className="gap-1">
            <Flame className="size-3 text-orange-400" />
            {streak}
          </Badge>
          {isDueToday && !done && <Badge variant="outline">Due today</Badge>}
        </CardAction>
      </CardHeader>
      <CardContent className="mt-auto flex items-center gap-2">
        {habit.type === "binary" || habit.type === "negative" ? (
          <div className="relative w-full">
            <Button
              onClick={handleToggle}
              disabled={pending}
              variant={done ? "secondary" : "default"}
              className="w-full"
            >
              <SquareCheck data-icon="inline-start" />
              {done ? "Done" : habit.type === "negative" ? "Log slip" : "Check in"}
            </Button>
            <AnimatePresence>
              {justDone && (
                <motion.span
                  initial={{ opacity: 0.6, scale: 0.4 }}
                  animate={{ opacity: 0, scale: 2.2 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.7 }}
                  className="pointer-events-none absolute inset-0 rounded-lg"
                  style={{ background: habit.color }}
                />
              )}
            </AnimatePresence>
          </div>
        ) : habit.type === "quantitative" ? (
          <div className="flex w-full items-center gap-2">
            <Input
              type="number"
              min={0}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={habit.targetValue ? `Target ${habit.targetValue}` : "Value"}
              className="w-full"
            />
            <Button
              onClick={handleIncrement}
              disabled={pending}
              variant="outline"
              size="icon"
              aria-label="Increment and save"
            >
              <Plus />
            </Button>
          </div>
        ) : (
          <TimerHabitControl habit={habit} today={today} todayCheckin={todayCheckin} />
        )}
      </CardContent>
    </Card>
  );
}
