import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { HeatmapGrid } from "@/components/heatmap-grid";
import { HabitDetailActions } from "@/components/habit-detail-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/db";
import { checkins } from "@/db/schema";
import { getHabitById } from "@/db/queries";
import { formatSchedule, getHabitIcon } from "@/lib/habit-ui";
import { buildHeatmap } from "@/lib/heatmap";
import { calculateCurrentStreak, calculateLongestStreak, getCompletionRate } from "@/lib/streaks";
import type { Schedule } from "@/types/schedule";

/**
 * Habit detail page: stats, 12-week heatmap and Edit / Archive actions.
 */

export const dynamic = "force-dynamic";

export default async function HabitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const habitId = Number(id);
  if (!Number.isInteger(habitId) || habitId <= 0) notFound();

  const habit = await getHabitById(habitId);
  if (!habit) notFound();

  const rows = await db
    .select()
    .from(checkins)
    .where(eq(checkins.habitId, habitId))
    .orderBy(asc(checkins.date));

  const schedule = habit.schedule as unknown as Schedule;
  const now = new Date();

  const current = calculateCurrentStreak(rows, schedule, habit.freezeBank);
  const longest = calculateLongestStreak(rows, schedule);
  const rate90 = getCompletionRate(rows, schedule, new Date(Date.now() - 90 * 86400000), now);
  const checkinDates = new Set(rows.map((r) => r.date));
  const weeks = buildHeatmap(checkinDates, habit.createdAt, now, 12);

  const Icon = getHabitIcon(habit.icon);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link href="/habits" aria-label="Back to habits">
            <ArrowLeft />
          </Link>
        </Button>
        <Icon className="size-5" style={{ color: habit.color }} />
        <h1 className="text-2xl font-bold tracking-tight">{habit.name}</h1>
        <Badge variant="secondary" className="ml-2">
          {habit.type}
        </Badge>
        <div className="ml-auto">
          <HabitDetailActions habit={habit} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card size="sm">
          <CardHeader>
            <CardDescription>Schedule</CardDescription>
            <CardTitle>{formatSchedule(schedule)}</CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Current streak</CardDescription>
            <CardTitle>{current.streak} 🔥</CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Longest streak</CardDescription>
            <CardTitle>{longest}</CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>90-day completion</CardDescription>
            <CardTitle>{Math.round(rate90 * 100)}%</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Last 12 weeks</CardTitle>
          <CardDescription>Intensity = completed scheduled days.</CardDescription>
        </CardHeader>
        <CardContent>
          <HeatmapGrid weeks={weeks} color={habit.color} />
        </CardContent>
      </Card>
    </div>
  );
}
