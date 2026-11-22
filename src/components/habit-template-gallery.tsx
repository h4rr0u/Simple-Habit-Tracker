"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Sparkles } from "lucide-react";

import { useLanguage } from "@/components/language-provider";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getHabitIcon, getLabelBadgeClass } from "@/lib/habit-ui";
import {
  HABIT_TEMPLATES,
  TEMPLATE_CATEGORIES,
  TEMPLATE_CATEGORY_KEYS,
  type HabitTemplate,
} from "@/lib/templates";
import { cn } from "@/lib/utils";

/**
 * Gallery of ready-made habits. Picking a card hands the template back to the
 * page, which closes the gallery and opens the pre-filled habit form.
 */

interface HabitTemplateGalleryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (template: HabitTemplate) => void;
}

/** Sentinel for the "all templates" tab (category values are canonical labels). */
const ALL_CATEGORIES = "__all__";

export function HabitTemplateGallery({
  open,
  onOpenChange,
  onSelect,
}: HabitTemplateGalleryProps) {
  const { t } = useLanguage();
  const reduceMotion = useReducedMotion();
  const [category, setCategory] = useState<string>(ALL_CATEGORIES);

  const visibleTemplates = useMemo(
    () =>
      category === ALL_CATEGORIES
        ? HABIT_TEMPLATES
        : HABIT_TEMPLATES.filter((template) => template.category === category),
    [category]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary-text" />
            {t("habits.templates.title")}
          </DialogTitle>
          <DialogDescription>
            {t("habits.templates.description")}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={category} onValueChange={setCategory}>
          <TabsList className="h-auto w-full flex-wrap justify-start">
            <TabsTrigger value={ALL_CATEGORIES}>
              {t("habits.templates.all")}
            </TabsTrigger>
            {TEMPLATE_CATEGORIES.map((value) => (
              <TabsTrigger key={value} value={value}>
                {t(TEMPLATE_CATEGORY_KEYS[value])}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {visibleTemplates.length === 0 ? (
          <p className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
            {t("habits.templates.empty")}
          </p>
        ) : (
          <motion.div
            key={category}
            className="grid gap-3 sm:grid-cols-2"
            initial="hidden"
            animate="show"
            variants={{ hidden: {}, show: {} }}
          >
            {visibleTemplates.map((template, index) => {
              const Icon = getHabitIcon(template.icon);
              const categoryLabel = t(
                TEMPLATE_CATEGORY_KEYS[template.category]
              );
              return (
                <motion.button
                  key={template.id}
                  type="button"
                  onClick={() => onSelect(template)}
                  variants={{
                    hidden: { opacity: 0, y: 10 },
                    show: { opacity: 1, y: 0 },
                  }}
                  transition={{
                    duration: reduceMotion ? 0 : 0.22,
                    delay: reduceMotion ? 0 : index * 0.05,
                    ease: "easeOut",
                  }}
                  whileHover={reduceMotion ? undefined : { y: -2 }}
                  whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                  className="group flex h-full flex-col gap-2 rounded-xl border bg-card p-3 text-left transition-colors hover:border-primary/60 hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="flex size-9 shrink-0 items-center justify-center rounded-lg"
                      style={{
                        backgroundColor: `${template.color}1f`,
                        color: template.color,
                      }}
                    >
                      <Icon className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="font-medium leading-tight">
                        {t(template.nameKey)}
                      </p>
                      <Badge
                        variant="outline"
                        className={cn(getLabelBadgeClass(categoryLabel))}
                      >
                        {categoryLabel}
                      </Badge>
                    </div>
                  </div>
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {t(template.descKey)}
                  </p>
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </DialogContent>
    </Dialog>
  );
}
