"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { HabitCard } from "@/components/habit-card";
import { HabitFormDialog } from "@/components/habit-form-dialog";
import { Button } from "@/components/ui/button";
import type { Checkin, Habit } from "@/db/schema";

/**
 * Client shell for /habits: "+ New habit" button with dialog, grid of
 * HabitCards and an empty state.
 */

export interface HabitCardData {
  habit: Habit;
  streak: number;
  todayCheckin: Checkin | null;
  isDueToday: boolean;
}

interface HabitsPageClientProps {
  today: string;
  cards: HabitCardData[];
}

export function HabitsPageClient({ today, cards }: HabitsPageClientProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Habits</h1>
          <p className="text-muted-foreground">
            Manage your habits: create, edit and archive.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus data-icon="inline-start" />
          New habit
        </Button>
      </div>
      <HabitFormDialog open={dialogOpen} onOpenChange={setDialogOpen} />

      {cards.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-16 text-center">
          <Plus className="size-8 text-muted-foreground" />
          <p className="font-medium">No habits yet</p>
          <p className="text-sm text-muted-foreground">
            Create your first habit to start tracking.
          </p>
          <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
            <Plus data-icon="inline-start" />
            New habit
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {cards.map((card) => (
            <HabitCard
              key={card.habit.id}
              habit={card.habit}
              today={today}
              todayCheckin={card.todayCheckin ?? undefined}
              streak={card.streak}
              isDueToday={card.isDueToday}
            />
          ))}
        </div>
      )}
    </div>
  );
}
