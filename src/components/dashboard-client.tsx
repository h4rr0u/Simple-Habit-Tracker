"use client";

import { useEffect, useState } from "react";
import {
  motion,
  AnimatePresence,
} from "framer-motion";
import { Check, Flame, Plus, Snowflake, Trophy } from "lucide-react";
import {
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
} from "recharts";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { formatSchedule, getHabitIcon } from "@/lib/habit-ui";
import { cn } from "@/lib/utils";
import type { Checkin, Habit } from "@/db/schema";

/**
 * Dashboard client shell: today list with animated check-off, day progress
 * ring (Recharts RadialBar), freeze bank card and top-3 streaks.
 */

export interface TodayItem {
  habit: Habit;
  streak: number;
  todayCheckin: Checkin | null;
  done: boolean;
  isDueToday: boolean;
}

interface DashboardClientProps {
  today: string;
  todayItems: TodayItem[];
  topStreaks: Array<{ habit: Habit; streak: number }>;
  totalFreezes: number;
}

export function DashboardClient({
  today,
  todayItems,
  topStreaks,
  totalFreezes,
}: DashboardClientProps) {
  // Local mirror so the UI updates instantly without waiting for revalidation,
  // resynced whenever the server sends fresh data.
  const [items, setItems] = useState(todayItems);

  useEffect(() => {
    setItems(todayItems);
  }, [todayItems]);

  const applyResult = (habitId: number, checkin: Checkin | null) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.habit.id !== habitId) return item;
        const done = (() => {
          if (!checkin) return false;
          if (item.habit.type === "quantitative" || item.habit.type === "timed") {
            return item.habit.targetValue
              ? (checkin.value ?? 0) >= item.habit.targetValue
              : true;
          }
          return true;
        })();
        return { ...item, todayCheckin: checkin, done };
      })
    );
  };

  const handleToggle = async (habit: Habit) => {
    const result = await toggleCheckinAction({ habitId: habit.id, date: today });
    if (result.ok) {
      if (result.data === "checked") {
        toast.success(`"${habit.name}" done!`);
        applyResult(habit.id, { habitId: habit.id, date: today, value: null, note: null, id: 0, createdAt: new Date() });
      } else {
        applyResult(habit.id, null);
      }
    } else {
      toast.error(result.error);
    }
  };

  const handleSetValue = async (habit: Habit, value: number) => {
    const result = await setCheckinValueAction({
      habitId: habit.id,
      date: today,
      value: value > 0 ? value : null,
    });
    if (result.ok) {
      applyResult(habit.id, value > 0 ? { habitId: habit.id, date: today, value, note: null, id: 0, createdAt: new Date() } : null);
    } else {
      toast.error(result.error);
    }
  };

  const localDone = items.filter((i) => i.done).length;
  const localProgress = items.length === 0 ? 0 : localDone / items.length;

  const progressData = [
    { name: "progress", value: Math.round(localProgress * 100), fill: "var(--primary)" },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Today at a glance.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Today list */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Today</CardTitle>
            <CardDescription>
              {items.length === 0
                ? "Nothing scheduled for today — enjoy your rest."
                : `${localDone} of ${items.length} done`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {items.length === 0 && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  Nothing scheduled for today.
                </motion.p>
              )}
              {items.map((item) => {
                const Icon = getHabitIcon(item.habit.icon);
                const isDone = item.done;
                return (
                  <motion.div
                    key={item.habit.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border p-3 transition-colors",
                      isDone && "bg-primary/5"
                    )}
                  >
                    <motion.span
                      key={`check-${isDone}`}
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 22 }}
                    >
                      <Checkbox
                        checked={isDone}
                        onCheckedChange={() => handleToggle(item.habit)}
                        aria-label={`Check in ${item.habit.name}`}
                      />
                    </motion.span>
                    <Icon className="size-4 shrink-0" style={{ color: item.habit.color }} />
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "truncate text-sm font-medium",
                          isDone && "text-muted-foreground line-through"
                        )}
                      >
                        {item.habit.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatSchedule(item.habit.schedule as never)}
                      </p>
                    </div>
                    <Badge variant="secondary" className="gap-1">
                      <Flame className="size-3 text-orange-400" />
                      {item.streak}
                    </Badge>
                    {(item.habit.type === "quantitative" || item.habit.type === "timed") && (
                      <QuantQuickInput
                        habit={item.habit}
                        value={item.todayCheckin?.value ?? 0}
                        onSetValue={(v) => handleSetValue(item.habit, v)}
                      />
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </CardContent>
        </Card>

        {/* Progress ring */}
        <Card>
          <CardHeader>
            <CardTitle>Day progress</CardTitle>
            <CardDescription>
              {localDone} / {items.length} completed
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart
                  data={progressData}
                  innerRadius="70%"
                  outerRadius="100%"
                  startAngle={90}
                  endAngle={-270}
                >
                  <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                  <RadialBar
                    dataKey="value"
                    background={{ fill: "var(--muted)" }}
                    cornerRadius={12}
                    fill="var(--primary)"
                  />
                </RadialBarChart>
              </ResponsiveContainer>
            </div>
            <p className="-mt-32 text-center text-3xl font-bold tabular-nums">
              {Math.round(localProgress * 100)}%
            </p>
            <div className="mt-24" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Freezes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Snowflake className="size-4 text-sky-400" />
              Freezes
            </CardTitle>
            <CardDescription>
              Across all active habits. Next accrual: the 1st of next month.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">{totalFreezes}</p>
            <p className="text-sm text-muted-foreground">
              available (max 2 per habit, +1 monthly)
            </p>
          </CardContent>
        </Card>

        {/* Top streaks */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="size-4 text-amber-400" />
              Top streaks
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {topStreaks.length === 0 && (
              <p className="text-sm text-muted-foreground">No habits yet.</p>
            )}
            {topStreaks.map(({ habit, streak }, index) => {
              const Icon = getHabitIcon(habit.icon);
              return (
                <div key={habit.id} className="flex items-center gap-2">
                  <span className="w-5 text-sm font-semibold text-muted-foreground">
                    {index + 1}.
                  </span>
                  <Icon className="size-4" style={{ color: habit.color }} />
                  <span className="flex-1 truncate text-sm">{habit.name}</span>
                  <Badge variant="secondary" className="gap-1">
                    <Flame className="size-3 text-orange-400" />
                    {streak}
                  </Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Quick numeric input used for quantitative habits on the dashboard. */
function QuantQuickInput({
  habit,
  value,
  onSetValue,
}: {
  habit: Habit;
  value: number;
  onSetValue: (value: number) => void;
}) {
  const [text, setText] = useState(value ? String(value) : "");
  const commit = () => {
    const n = Number(text);
    if (text === "" || Number.isNaN(n)) return;
    onSetValue(Math.floor(n));
  };
  return (
    <div className="flex items-center gap-1">
      <Input
        type="number"
        className="h-7 w-16"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
        placeholder={habit.targetValue ? String(habit.targetValue) : "0"}
      />
      <Button
        variant="outline"
        size="icon-xs"
        aria-label={`Add one to ${habit.name}`}
        onClick={() => onSetValue(value + 1)}
      >
        <Plus />
      </Button>
    </div>
  );
}
