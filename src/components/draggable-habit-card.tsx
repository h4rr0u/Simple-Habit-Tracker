"use client";

import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useDraggable } from "@dnd-kit/core";

import { HabitCard } from "@/components/habit-card";
import { cn } from "@/lib/utils";
import type { Checkin, Habit } from "@/db/schema";

/**
 * Draggable wrapper around {@link HabitCard} for the /habits Grid Canvas.
 *
 * The card is a plain grid item positioned by its stored `positionX` /
 * `positionY`; dnd-kit only supplies the pointer transform while dragging.
 * There is no sortable list, so neighbours never shift on their own and empty
 * cells stay empty.
 *
 * Only a long press starts a drag (see the PointerSensor delay in
 * `HabitsPageClient`), so a normal click still reaches the check-in controls
 * and the habit link. Pointer-downs on interactive elements are ignored
 * entirely, which keeps the controls usable even when held.
 */

interface DraggableHabitCardProps {
  /** dnd-kit identifier — the habit id as a string. */
  id: string;
  habit: Habit;
  /** ISO date (YYYY-MM-DD) used for check-ins. */
  today: string;
  todayCheckin?: Checkin;
  streak: number;
  isDueToday: boolean;
}

/** Elements that keep their own pointer behaviour; long-press must not drag. */
const INTERACTIVE_SELECTOR =
  "button, a, input, textarea, select, [role='slider'], [role='checkbox'], [data-no-drag]";

export function DraggableHabitCard({ id, ...card }: DraggableHabitCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
  });

  const style: CSSProperties = {
    gridColumn: card.habit.positionX + 1,
    gridRow: card.habit.positionY + 1,
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest(INTERACTIVE_SELECTOR)) return;
    listeners?.onPointerDown?.(event);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative min-w-0 rounded-xl outline-none",
        isDragging && "z-20"
      )}
      {...attributes}
      {...listeners}
      onPointerDown={handlePointerDown}
    >
      <HabitCard {...card} isDragging={false} dimmed={isDragging} />
    </div>
  );
}
