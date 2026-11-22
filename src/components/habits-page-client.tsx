"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { FilterX, Plus, Sparkles } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { toast } from "sonner";

import { moveHabitsAction } from "@/actions/habits";
import { DraggableHabitCard } from "@/components/draggable-habit-card";
import { HabitCard } from "@/components/habit-card";
import { HabitFormDialog } from "@/components/habit-form-dialog";
import { HabitTemplateGallery } from "@/components/habit-template-gallery";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Checkin, Habit } from "@/db/schema";
import {
  cellFromPoint,
  HABIT_GRID_COLUMNS,
  resolveHabitMove,
} from "@/lib/habit-grid";
import type { HabitTemplate } from "@/lib/templates";

/**
 * Client shell for /habits: "+ New habit" button with dialog, category
 * filter, the free-form Grid Canvas of HabitCards and empty states.
 *
 * The canvas is a four-column CSS grid whose rows are unbounded. Every card
 * is pinned to its stored cell (`positionX` / `positionY`), so gaps are real:
 * a habit on row 5 leaves four empty rows above it. Dragging only moves the
 * card that was picked up; no neighbour reflows, and a drop on an occupied
 * cell swaps the two cards.
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

/** Sentinel for the "all categories" option (categories are user text). */
const ALL_CATEGORIES = "__all__";

/**
 * Fixed canvas geometry: four columns, rows at least one card tall.
 *
 * `touchAction: "none"` is what keeps a long press from turning into a page
 * scroll on touch screens: the browser would otherwise start panning and fire
 * `pointercancel`, dropping the tile mid-gesture. Taps still reach the card's
 * controls because the PointerSensor only lifts a card after a 250 ms hold.
 */
const GRID_STYLE: CSSProperties = {
  gridTemplateColumns: `repeat(${HABIT_GRID_COLUMNS}, minmax(0, 1fr))`,
  gridAutoRows: "minmax(10rem, auto)",
  touchAction: "none",
};

/** Parses a computed grid track list ("180px 180px …") into pixel sizes. */
function parseTrackSizes(value: string): number[] {
  if (!value || value === "none") return [];
  return value
    .split(/\s+/)
    .map((part) => Number.parseFloat(part))
    .filter((size) => Number.isFinite(size));
}

export function HabitsPageClient({ today, cards }: HabitsPageClientProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [templateGalleryOpen, setTemplateGalleryOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<HabitTemplate | null>(
    null
  );
  const [category, setCategory] = useState(ALL_CATEGORIES);
  // Local mirror of the server canvas so a dropped tile lands instantly.
  const [orderedCards, setOrderedCards] = useState<HabitCardData[]>(cards);
  const [isDragging, setIsDragging] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Screen-reader feedback for a completed drop (announcements only cover
  // pick-up and cancel because the canvas has no droppable targets).
  const [liveMessage, setLiveMessage] = useState("");
  const gridRef = useRef<HTMLDivElement>(null);
  const { t } = useLanguage();

  // Re-sync when the server sends a new snapshot (refresh, check-in mutation,
  // or the revalidation that follows a successful move).
  useEffect(() => {
    setOrderedCards(cards);
  }, [cards]);

  // On touch screens an unprevented `touchmove` lets the browser start
  // scrolling, which fires `pointercancel` and drops the tile mid-gesture.
  // Blocking the page scroll only while a tile is lifted keeps the drag alive
  // and still allows normal scrolling everywhere else.
  useEffect(() => {
    if (!isDragging) return;
    const blockScroll = (event: TouchEvent) => {
      if (event.cancelable) event.preventDefault();
    };
    document.addEventListener("touchmove", blockScroll, { passive: false });
    return () => document.removeEventListener("touchmove", blockScroll);
  }, [isDragging]);

  // One arrow press moves the lifted card by exactly one canvas cell instead
  // of dnd-kit's default 25 px nudge, which would need a dozen presses.
  const keyboardCoordinateGetter: KeyboardCoordinateGetter = (
    event,
    { currentCoordinates }
  ) => {
    const grid = gridRef.current;
    if (!grid) return undefined;

    const styles = window.getComputedStyle(grid);
    const columnStep =
      (parseTrackSizes(styles.gridTemplateColumns)[0] ?? 0) +
      (Number.parseFloat(styles.columnGap) || 0);
    const rowStep =
      (parseTrackSizes(styles.gridTemplateRows)[0] ?? 0) +
      (Number.parseFloat(styles.rowGap) || 0);

    switch (event.code) {
      case "ArrowRight":
        return { ...currentCoordinates, x: currentCoordinates.x + columnStep };
      case "ArrowLeft":
        return { ...currentCoordinates, x: currentCoordinates.x - columnStep };
      case "ArrowDown":
        return { ...currentCoordinates, y: currentCoordinates.y + rowStep };
      case "ArrowUp":
        return { ...currentCoordinates, y: currentCoordinates.y - rowStep };
      default:
        return undefined;
    }
  };

  const sensors = useSensors(
    // iOS-style long press: drag only starts after holding for 250 ms without
    // moving more than 5 px. A plain click/tap still activates the controls.
    useSensor(PointerSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinateGetter })
  );

  const openCreateDialog = () => {
    setSelectedTemplate(null);
    setDialogOpen(true);
  };

  const handleFormOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) setSelectedTemplate(null);
  };

  const handleTemplateSelect = (template: HabitTemplate) => {
    setTemplateGalleryOpen(false);
    setSelectedTemplate(template);
    setDialogOpen(true);
  };

  // Unique categories present on the user's habits, sorted for the filter.
  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          cards
            .map((card) => card.habit.category)
            .filter((value): value is string => Boolean(value))
        )
      ).sort((a, b) => a.localeCompare(b)),
    [cards]
  );

  const visibleCards = useMemo(
    () =>
      category === ALL_CATEGORIES
        ? orderedCards
        : orderedCards.filter((card) => card.habit.category === category),
    [orderedCards, category]
  );

  const handleDragStart = (event: DragStartEvent) => {
    setIsDragging(true);
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setIsDragging(false);
    setActiveId(null);

    const { active } = event;
    const grid = gridRef.current;
    // `translated` is dnd-kit's post-drag rect and already includes scroll
    // adjustments, which keeps drops accurate if the page scrolled mid-drag.
    const droppedRect = active.rect.current.translated ?? active.rect.current.initial;
    const movingId = Number(active.id);
    const movingCard = orderedCards.find((card) => card.habit.id === movingId);
    if (!grid || !droppedRect || !movingCard) return;

    // Measure the grid once per drop: computed track sizes already reflect
    // the real layout (rows grow with their tallest card), and empty rows
    // below the last card are extrapolated from the last row height.
    const gridRect = grid.getBoundingClientRect();
    const styles = window.getComputedStyle(grid);
    const columnWidths = parseTrackSizes(styles.gridTemplateColumns);
    const rowHeights = parseTrackSizes(styles.gridTemplateRows);
    const columnGap = Number.parseFloat(styles.columnGap) || 0;
    const rowGap = Number.parseFloat(styles.rowGap) || 0;
    const defaultRowHeight =
      rowHeights[rowHeights.length - 1] ??
      grid.firstElementChild?.getBoundingClientRect().height ??
      160;

    // The cell under the centre of the dragged card, not its top-left corner,
    // so a drop feels correct even when the pointer grabs a card near an edge.
    const centerX =
      droppedRect.left - gridRect.left + droppedRect.width / 2;
    const centerY =
      droppedRect.top - gridRect.top + droppedRect.height / 2;

    const target = cellFromPoint(centerX, centerY, {
      columnWidth:
        columnWidths[0] ??
        (gridRect.width - columnGap * (HABIT_GRID_COLUMNS - 1)) /
          HABIT_GRID_COLUMNS,
      columnGap,
      rowHeights,
      rowGap,
      defaultRowHeight,
    });

    // Occupancy is checked against every card, including ones hidden by the
    // category filter, so a move can never create overlapping cells.
    const updates = resolveHabitMove(
      orderedCards.map((card) => ({
        id: card.habit.id,
        positionX: card.habit.positionX,
        positionY: card.habit.positionY,
      })),
      movingId,
      target
    );
    if (updates.length === 0) return;

    const updateById = new Map(updates.map((update) => [update.id, update]));
    const previous = orderedCards;
    const next = orderedCards.map((card) => {
      const update = updateById.get(card.habit.id);
      return update
        ? {
            ...card,
            habit: {
              ...card.habit,
              positionX: update.positionX,
              positionY: update.positionY,
            },
          }
        : card;
    });

    // Optimistic update: the grid settles immediately, the action persists it.
    setOrderedCards(next);
    setLiveMessage(
      t("habits.dnd.movedTo", {
        name: movingCard.habit.name,
        row: target.y + 1,
        column: target.x + 1,
      })
    );

    void moveHabitsAction(
      updates.map((update) => ({
        id: String(update.id),
        positionX: update.positionX,
        positionY: update.positionY,
      }))
    ).then((result) => {
      if (result.ok) return;
      setOrderedCards(previous);
      toast.error(t("habits.dnd.moveFailed"));
    });
  };

  // Localized screen-reader copy: dnd-kit ships English defaults.
  const screenReaderInstructions = useMemo(
    () => ({ draggable: t("habits.dnd.instructions") }),
    [t]
  );

  // Names are looked up across every card (a filtered-out tile can still be
  // the active one).
  const habitNameById = useMemo(
    () => new Map(cards.map((card) => [String(card.habit.id), card.habit.name])),
    [cards]
  );

  const announcements = useMemo<Announcements>(() => {
    const name = (id: UniqueIdentifier) => habitNameById.get(String(id)) ?? "";

    return {
      onDragStart: ({ active }) =>
        t("habits.dnd.pickedUp", { name: name(active.id) }),
      // The canvas has no droppable targets, so the landing cell is announced
      // by the `aria-live` region once the drop has been resolved.
      onDragOver: () => undefined,
      onDragEnd: () => undefined,
      onDragCancel: ({ active }) =>
        t("habits.dnd.cancelled", { name: name(active.id) }),
    };
  }, [t, habitNameById]);

  const activeCard = activeId
    ? orderedCards.find((card) => String(card.habit.id) === activeId)
    : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("habits.title")}</h1>
          <p className="text-muted-foreground">{t("habits.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setTemplateGalleryOpen(true)}>
            <Sparkles data-icon="inline-start" />
            {t("habits.templates.button")}
          </Button>
          <Button onClick={openCreateDialog}>
            <Plus data-icon="inline-start" />
            {t("habits.new")}
          </Button>
        </div>
      </div>
      <HabitTemplateGallery
        open={templateGalleryOpen}
        onOpenChange={setTemplateGalleryOpen}
        onSelect={handleTemplateSelect}
      />
      <HabitFormDialog
        open={dialogOpen}
        onOpenChange={handleFormOpenChange}
        template={selectedTemplate}
        categories={categories}
      />

      {categories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 p-2">
          <span className="pl-1 text-sm text-muted-foreground">
            {t("habits.filters.category")}
          </span>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full sm:w-56" aria-label={t("habits.filters.category")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CATEGORIES}>
                {t("habits.filters.allCategories")}
              </SelectItem>
              {categories.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={category === ALL_CATEGORIES}
            onClick={() => setCategory(ALL_CATEGORIES)}
          >
            <FilterX data-icon="inline-start" />
            {t("habits.filters.reset")}
          </Button>
        </div>
      )}

      {cards.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-16 text-center">
          <Plus className="size-8 text-muted-foreground" />
          <p className="font-medium">{t("habits.emptyTitle")}</p>
          <p className="text-sm text-muted-foreground">
            {t("habits.emptyDescription")}
          </p>
          <Button variant="outline" size="sm" onClick={openCreateDialog}>
            <Plus data-icon="inline-start" />
            {t("habits.new")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTemplateGalleryOpen(true)}
          >
            <Sparkles data-icon="inline-start" />
            {t("habits.templates.button")}
          </Button>
        </div>
      ) : visibleCards.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-16 text-center">
          <FilterX className="size-8 text-muted-foreground" />
          <p className="font-medium">{t("habits.filters.emptyTitle")}</p>
          <p className="text-sm text-muted-foreground">
            {t("habits.filters.emptyDescription")}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCategory(ALL_CATEGORIES)}
          >
            {t("habits.filters.reset")}
          </Button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => {
            setIsDragging(false);
            setActiveId(null);
          }}
          accessibility={{ announcements, screenReaderInstructions }}
        >
          <div ref={gridRef} className="grid gap-4" style={GRID_STYLE}>
            {visibleCards.map((card) => (
              <DraggableHabitCard
                key={card.habit.id}
                id={String(card.habit.id)}
                habit={card.habit}
                today={today}
                todayCheckin={card.todayCheckin ?? undefined}
                streak={card.streak}
                isDueToday={card.isDueToday}
              />
            ))}
          </div>
          {/*
            The lifted copy lives in the overlay so dnd-kit owns its
            `transform`; the source cell only fades out. `pointer-events-none`
            keeps the clone inert: a pointerup at the end of a drag must not
            hit the link or the check-in control inside it. The drop animation
            is off because the grid has already moved the real card to the
            target cell optimistically — animating the clone back to the
            source rect would show a card flying home.
          */}
          <DragOverlay dropAnimation={null} className="pointer-events-none">
            {activeCard && (
              <div className="w-full" aria-hidden="true">
                <HabitCard
                  habit={activeCard.habit}
                  today={today}
                  todayCheckin={activeCard.todayCheckin ?? undefined}
                  streak={activeCard.streak}
                  isDueToday={activeCard.isDueToday}
                  isDragging={true}
                />
              </div>
            )}
          </DragOverlay>
          <p className="sr-only" aria-live="polite">
            {liveMessage}
          </p>
        </DndContext>
      )}
    </div>
  );
}
