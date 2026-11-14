"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Flame, Plus, Snowflake, Trophy } from "lucide-react";

import { HabitCheckinControl } from "@/components/habit-checkin-control";
import { useLanguage } from "@/components/language-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatSchedule, getHabitIcon } from "@/lib/habit-ui";
import { isHabitDayComplete } from "@/lib/habit-target";
import { cn } from "@/lib/utils";
import type { Checkin, Habit } from "@/db/schema";

/**
 * Dashboard client shell: today list with animated check-off, day progress
 * ring (inline SVG, no charting library), freeze bank card and top-3 streaks.
 */

/** Radius of the progress ring inside its 200×200 viewBox. */
const RING_RADIUS = 85;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

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
  totalHabits: number;
}

export function DashboardClient({
  today,
  todayItems,
  topStreaks,
  totalFreezes,
  totalHabits,
}: DashboardClientProps) {
  const { t } = useLanguage();
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
        return {
          ...item,
          todayCheckin: checkin,
          done: isHabitDayComplete(item.habit, checkin),
        };
      })
    );
  };

  const localDone = items.filter((i) => i.done).length;
  const localProgress = items.length === 0 ? 0 : localDone / items.length;

  const progressPercent = Math.round(localProgress * 100);

  const todayDescription =
    totalHabits === 0
      ? t("dashboard.createToStart")
      : items.length === 0
        ? t("dashboard.noDue")
        : t("dashboard.doneOf", { done: localDone, total: items.length });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("dashboard.title")}</h1>
        <p className="text-muted-foreground">{t("dashboard.subtitle")}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Today list */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("dashboard.today")}</CardTitle>
            <CardDescription>{todayDescription}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {items.length === 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center gap-3 py-8 text-center"
                >
                  <p className="text-sm text-muted-foreground">
                    {totalHabits === 0
                      ? t("dashboard.emptyNoHabits")
                      : t("dashboard.emptyRest")}
                  </p>
                  {totalHabits === 0 && (
                    <Button asChild size="sm">
                      <Link href="/habits">
                        <Plus data-icon="inline-start" />
                        {t("dashboard.createFirst")}
                      </Link>
                    </Button>
                  )}
                </motion.div>
              )}
              {items.map((item) => {
                const Icon = getHabitIcon(item.habit.icon);
                const isDone = item.done;
                const isSlipped = item.habit.type === "negative" && item.todayCheckin != null;
                const quantTarget =
                  item.habit.type === "quantitative" && item.habit.targetValue != null
                    ? item.habit.targetValue
                    : null;
                const quantValue = Math.max(0, item.todayCheckin?.value ?? 0);
                const progressPct =
                  quantTarget != null && quantTarget > 0
                    ? Math.min(100, Math.round((quantValue / quantTarget) * 100))
                    : 0;
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
                      isDone &&
                        item.habit.type !== "negative" &&
                        "border-emerald-500/40 bg-emerald-500/5",
                      isSlipped && "border-destructive/30 bg-destructive/5"
                    )}
                  >
                    <Icon className="size-4 shrink-0" style={{ color: item.habit.color }} />
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "truncate text-sm font-medium",
                          isDone && item.habit.type !== "negative" && "text-muted-foreground line-through"
                        )}
                      >
                        {item.habit.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatSchedule(item.habit.schedule as never, t)}
                        {item.habit.type === "negative" ? t("dashboard.avoid") : ""}
                      </p>
                      {quantTarget != null && quantTarget > 0 && (
                        <>
                          <p
                            className={cn(
                              "mt-0.5 text-xs font-medium tabular-nums",
                              isDone
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-muted-foreground"
                            )}
                          >
                            {quantValue}/{quantTarget}
                            {item.habit.unit ? ` ${item.habit.unit}` : ""}
                            {isDone ? t("dashboard.goalReached") : ""}
                          </p>
                          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all",
                                isDone && "bg-emerald-500"
                              )}
                              style={{
                                width: `${progressPct}%`,
                                background: isDone ? undefined : item.habit.color,
                              }}
                            />
                          </div>
                        </>
                      )}
                    </div>
                    <Badge variant="secondary" className="gap-1">
                      <Flame className="size-3 text-orange-400" />
                      {item.streak}
                    </Badge>
                    <Badge variant="outline" className="gap-1" title={t("dashboard.freezes")}>
                      <Snowflake className="size-3 text-sky-400" />
                      {item.habit.freezeBank}
                    </Badge>
                    <HabitCheckinControl
                      habit={item.habit}
                      today={today}
                      todayCheckin={item.todayCheckin}
                      variant="dashboard"
                      onChanged={(checkin) => applyResult(item.habit.id, checkin)}
                    />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </CardContent>
        </Card>

        {/* Progress ring */}
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.progress")}</CardTitle>
            <CardDescription>
              {t("dashboard.completed", { done: localDone, total: items.length })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative mx-auto h-48 w-48">
              <svg
                viewBox="0 0 200 200"
                className="size-full -rotate-90"
                role="img"
                aria-label={t("dashboard.progress")}
              >
                <defs>
                  <linearGradient id="dayProgressGradient" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#38bdf8" />
                    <stop offset="55%" stopColor="#a78bfa" />
                    <stop offset="100%" stopColor="#f472b6" />
                  </linearGradient>
                </defs>
                {/* Track */}
                <circle
                  cx="100"
                  cy="100"
                  r={RING_RADIUS}
                  fill="none"
                  stroke="var(--muted)"
                  strokeWidth="30"
                />
                {/* Progress */}
                <circle
                  cx="100"
                  cy="100"
                  r={RING_RADIUS}
                  fill="none"
                  stroke="url(#dayProgressGradient)"
                  strokeWidth="30"
                  strokeLinecap={localProgress > 0 ? "round" : "butt"}
                  strokeDasharray={RING_CIRCUMFERENCE}
                  strokeDashoffset={RING_CIRCUMFERENCE * (1 - localProgress)}
                  className="transition-[stroke-dashoffset] duration-500 ease-out"
                />
              </svg>
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <p className="text-3xl font-bold tabular-nums">{progressPercent}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Freezes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Snowflake className="size-4 text-sky-400" />
              {t("dashboard.freezes")}
            </CardTitle>
            <CardDescription>{t("dashboard.freezesDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">{totalFreezes}</p>
            <p className="text-sm text-muted-foreground">
              {t("dashboard.freezesAvailable")}
            </p>
          </CardContent>
        </Card>

        {/* Top streaks */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="size-4 text-amber-400" />
              {t("dashboard.topStreaks")}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {topStreaks.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("dashboard.noHabits")}</p>
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
