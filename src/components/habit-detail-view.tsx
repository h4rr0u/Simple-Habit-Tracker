"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { HeatmapGrid } from "@/components/heatmap-grid";
import { HabitDetailActions } from "@/components/habit-detail-actions";
import {
  useLanguage,
  type TranslationKey,
} from "@/components/language-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  formatSchedule,
  getHabitIcon,
  getLabelBadgeClass,
  type HabitTypeValue,
} from "@/lib/habit-ui";
import { cn } from "@/lib/utils";
import type { Habit } from "@/db/schema";
import type { HeatmapWeek } from "@/lib/heatmap";
import type { Schedule } from "@/types/schedule";

/**
 * Client shell for the habit detail page: the server computes stats and the
 * heatmap, while every label goes through the language provider.
 */

const TYPE_LABEL_KEYS: Record<HabitTypeValue, TranslationKey> = {
  binary: "habits.form.type.binary.label",
  quantitative: "habits.form.type.quantitative.label",
  negative: "habits.form.type.negative.label",
  timed: "habits.form.type.timed.label",
};

interface HabitDetailViewProps {
  habit: Habit;
  schedule: Schedule;
  stats: {
    current: number;
    longest: number;
    rate90: number;
  };
  weeks: HeatmapWeek[];
  /** Existing categories offered as datalist suggestions in the edit dialog. */
  categories?: string[];
}

export function HabitDetailView({
  habit,
  schedule,
  stats,
  weeks,
  categories = [],
}: HabitDetailViewProps) {
  const { t } = useLanguage();
  const Icon = getHabitIcon(habit.icon);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link href="/habits" aria-label={t("habitDetail.back")}>
            <ArrowLeft />
          </Link>
        </Button>
        <Icon className="size-5 shrink-0" style={{ color: habit.color }} />
        <h1
          className="min-w-0 flex-1 truncate text-2xl font-bold tracking-tight"
          title={habit.name}
        >
          {habit.name}
        </h1>
        <Badge variant="secondary" className="ml-2 shrink-0">
          {t(TYPE_LABEL_KEYS[habit.type])}
        </Badge>
        {habit.category && (
          <Badge
            variant="outline"
            className={cn("shrink-0", getLabelBadgeClass(habit.category))}
          >
            {habit.category}
          </Badge>
        )}
        {(habit.tags ?? []).map((tag) => (
          <Badge
            key={tag}
            variant="outline"
            className={cn("hidden shrink-0 sm:inline-flex", getLabelBadgeClass(tag))}
          >
            #{tag}
          </Badge>
        ))}
        <div className="ml-auto shrink-0">
          <HabitDetailActions habit={habit} categories={categories} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card size="sm">
          <CardHeader>
            <CardDescription>{t("habitDetail.schedule")}</CardDescription>
            <CardTitle>{formatSchedule(schedule, t)}</CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>{t("habitDetail.currentStreak")}</CardDescription>
            <CardTitle>{stats.current} 🔥</CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>{t("habitDetail.longestStreak")}</CardDescription>
            <CardTitle>{stats.longest}</CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>{t("habitDetail.completion90")}</CardDescription>
            <CardTitle>{Math.round(stats.rate90 * 100)}%</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("habitDetail.last12Weeks")}</CardTitle>
          <CardDescription>{t("habitDetail.intensity")}</CardDescription>
        </CardHeader>
        <CardContent>
          <HeatmapGrid weeks={weeks} color={habit.color} />
        </CardContent>
      </Card>
    </div>
  );
}
