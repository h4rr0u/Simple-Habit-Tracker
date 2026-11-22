"use client";

import { useMemo, useState } from "react";
import { FilterX, Plus, Sparkles } from "lucide-react";

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
import type { HabitTemplate } from "@/lib/templates";

/**
 * Client shell for /habits: "+ New habit" button with dialog, category
 * filter, grid of HabitCards and an empty state.
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

export function HabitsPageClient({ today, cards }: HabitsPageClientProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [templateGalleryOpen, setTemplateGalleryOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<HabitTemplate | null>(
    null
  );
  const [category, setCategory] = useState(ALL_CATEGORIES);
  const { t } = useLanguage();

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
        ? cards
        : cards.filter((card) => card.habit.category === category),
    [cards, category]
  );

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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleCards.map((card) => (
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
