"use client";

import { memo, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Flame, Snowflake } from "lucide-react";

import { CompletionGlow } from "@/components/completion-glow";
import { HabitCheckinControl } from "@/components/habit-checkin-control";
import { useLanguage } from "@/components/language-provider";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isHabitDayComplete } from "@/lib/habit-target";
import { formatSchedule, getHabitIcon, getLabelBadgeClass } from "@/lib/habit-ui";
import { CARD_SPRING } from "@/lib/motion";
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
  /** Suppresses hover/tap motion while dnd-kit owns the card transform. */
  isDragging?: boolean;
  /**
   * Draws a focus ring around the tile that a keyboard drag is currently
   * moving, so the arrow-key target is visible without a pointer.
   */
  isKeyboardMoving?: boolean;
  /** Fades the card out — used for the source cell while its clone is dragged. */
  dimmed?: boolean;
  className?: string;
}

function HabitCardComponent({
  habit,
  today,
  todayCheckin,
  streak,
  isDueToday,
  isDragging = false,
  isKeyboardMoving = false,
  dimmed = false,
  className,
}: HabitCardProps) {
  const { t } = useLanguage();
  const reduceMotion = useReducedMotion();
  // Hover/tap feedback must never fight the drag transform.
  const interactive = !reduceMotion && !isDragging && !dimmed;
  const Icon = getHabitIcon(habit.icon);
  const [localCheckin, setLocalCheckin] = useState<Checkin | null>(todayCheckin ?? null);

  useEffect(() => {
    setLocalCheckin(todayCheckin ?? null);
  }, [todayCheckin]);

  const done = useMemo(
    () => isDueToday && isHabitDayComplete(habit, localCheckin),
    [habit, isDueToday, localCheckin]
  );
  const slipped = habit.type === "negative" && localCheckin != null;
  const tags = habit.tags ?? [];
  const hasLabels = Boolean(habit.category) || tags.length > 0;

  const quantTarget =
    habit.type === "quantitative" && habit.targetValue != null && habit.targetValue > 0
      ? habit.targetValue
      : null;
  const quantValue = Math.max(0, localCheckin?.value ?? 0);
  const progressPct =
    quantTarget != null ? Math.min(100, Math.round((quantValue / quantTarget) * 100)) : 0;

  return (
    <motion.div
      className={cn(
        "relative h-full rounded-xl transition-opacity duration-150",
        dimmed && "opacity-40",
        isKeyboardMoving &&
          "ring-2 ring-primary ring-offset-2 ring-offset-background",
        className
      )}
      whileHover={interactive ? { y: -4, scale: 1.01 } : undefined}
      whileTap={interactive ? { scale: 0.98 } : undefined}
      transition={CARD_SPRING}
    >
      <Card
        className={cn(
          "relative h-full gap-4 transition-shadow duration-200",
          !isDragging && "hover:shadow-lg",
          done && habit.type !== "negative" && "border-emerald-500/40 bg-emerald-500/5",
          isDragging && "scale-[1.02] shadow-2xl ring-2 ring-primary/40"
        )}
        data-due={isDueToday}
      >
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-1"
          style={{ background: habit.color }}
        />
        <CardHeader>
          <CardTitle className="flex min-w-0 items-center gap-2">
            <Icon className="size-4 shrink-0" style={{ color: habit.color }} />
            <Link
              href={`/habits/${habit.id}`}
              className="min-w-0 truncate hover:underline"
              title={habit.name}
            >
              {habit.name}
            </Link>
          </CardTitle>
          <CardDescription>
            {formatSchedule(habit.schedule as never, t)}
            {habit.type === "negative" ? t("dashboard.avoid") : ""}
          </CardDescription>
          <CardAction className="flex items-center gap-1.5">
            <Badge variant="secondary" className="gap-1">
              <Flame className="size-3 text-orange-400" />
              {streak}
            </Badge>
            <Badge variant="outline" className="gap-1" title={t("dashboard.freezes")}>
              <Snowflake className="size-3 text-sky-400" />
              {habit.freezeBank}
            </Badge>
            {!isDueToday ? (
              <Badge variant="outline">{t("habits.card.restDay")}</Badge>
            ) : habit.type === "negative" ? (
              slipped ? (
                <Badge variant="destructive">{t("habits.card.slipped")}</Badge>
              ) : (
                <Badge variant="secondary">{t("habits.card.onTrack")}</Badge>
              )
            ) : done ? (
              <Badge variant="secondary">{t("habits.card.done")}</Badge>
            ) : (
              <Badge variant="outline">{t("habits.card.dueToday")}</Badge>
            )}
          </CardAction>
        </CardHeader>
        <CardContent className="mt-auto flex flex-col gap-3">
          {hasLabels && (
            <div className="flex flex-wrap gap-1">
              {habit.category && (
                <Badge
                  variant="outline"
                  className={cn("max-w-full truncate", getLabelBadgeClass(habit.category))}
                >
                  {habit.category}
                </Badge>
              )}
              {tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="outline"
                  className={cn("max-w-full truncate", getLabelBadgeClass(tag))}
                >
                  #{tag}
                </Badge>
              ))}
            </div>
          )}
          {quantTarget != null && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{t("habits.card.progress")}</span>
                <span
                  className={cn(
                    "font-medium tabular-nums",
                    done
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-muted-foreground"
                  )}
                >
                  {quantValue}/{quantTarget}
                  {habit.unit ? ` ${habit.unit}` : ""}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    done && "bg-emerald-500"
                  )}
                  style={{
                    width: `${progressPct}%`,
                    background: done ? undefined : habit.color,
                  }}
                />
              </div>
              {done && (
                <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  {t("habits.card.goalReached")}
                </p>
              )}
            </div>
          )}
          <HabitCheckinControl
            habit={habit}
            today={today}
            todayCheckin={localCheckin}
            disabled={!isDueToday}
            variant="card"
            onChanged={setLocalCheckin}
          />
        </CardContent>
      </Card>
      <CompletionGlow
        active={done && habit.type !== "negative"}
        className="rounded-xl"
      />
    </motion.div>
  );
}

/**
 * Memoized so canvas-wide state changes (filtering, dragging another tile,
 * live-region updates) do not re-render every card. The grid keeps the object
 * identity of untouched cards, so only the tile whose props actually changed
 * re-renders.
 */
export const HabitCard = memo(HabitCardComponent);
