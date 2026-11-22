"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Check, Monitor, Moon, Palette, Sun } from "lucide-react";

import {
  ACCENT_OPTIONS,
  DENSITY_OPTIONS,
  DEFAULT_DENSITY,
  applyDensity,
  getStoredDensity,
  type AccentId,
  type DensityId,
} from "@/lib/appearance";
import { useAccent } from "@/components/accent-provider";
import { useLanguage } from "@/components/language-provider";
import type { TranslationKey } from "@/components/language-provider";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/**
 * Appearance settings: theme (system / light / dark), accent palette and
 * interface density. Theme selection lives in next-themes; the accent is
 * mirrored onto <html data-accent> and persisted in localStorage.
 */

const THEME_OPTIONS = [
  {
    id: "system",
    labelKey: "settings.appearance.theme.system" as TranslationKey,
    icon: Monitor,
  },
  {
    id: "light",
    labelKey: "settings.appearance.theme.light" as TranslationKey,
    icon: Sun,
  },
  {
    id: "dark",
    labelKey: "settings.appearance.theme.dark" as TranslationKey,
    icon: Moon,
  },
] as const;

const ACCENT_LABEL_KEYS: Record<AccentId, TranslationKey> = {
  blue: "settings.appearance.accent.blue",
  violet: "settings.appearance.accent.violet",
  emerald: "settings.appearance.accent.emerald",
  orange: "settings.appearance.accent.orange",
  rose: "settings.appearance.accent.rose",
};

const DENSITY_LABEL_KEYS: Record<DensityId, TranslationKey> = {
  comfortable: "settings.appearance.density.comfortable",
  compact: "settings.appearance.density.compact",
};

const DENSITY_HINT_KEYS: Record<DensityId, TranslationKey> = {
  comfortable: "settings.appearance.density.comfortableHint",
  compact: "settings.appearance.density.compactHint",
};

export function AppearanceCard() {
  const { t } = useLanguage();
  const { accent, setAccent } = useAccent();
  const { theme, setTheme } = useTheme();
  const [density, setDensity] = useState<DensityId>(DEFAULT_DENSITY);
  // next-themes cannot know the stored theme during SSR; keep the server and
  // first client render on the app default, then sync after mount.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDensity(getStoredDensity());
  }, []);

  const activeTheme = (mounted ? theme : null) ?? "dark";

  const pickDensity = (next: DensityId) => {
    setDensity(next);
    applyDensity(next);
  };

  const selectedAccentLabel = t(ACCENT_LABEL_KEYS[accent]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="size-5 text-primary-text" />
          {t("settings.appearance.title")}
        </CardTitle>
        <CardDescription>{t("settings.appearance.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>{t("settings.appearance.theme")}</Label>
          <Tabs value={activeTheme} onValueChange={setTheme}>
            <TabsList>
              {THEME_OPTIONS.map((option) => {
                const Icon = option.icon;
                return (
                  <TabsTrigger key={option.id} value={option.id} className="min-w-24">
                    <Icon />
                    <span>{t(option.labelKey)}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <Label>{t("settings.appearance.accent")}</Label>
            <span className="text-sm text-muted-foreground">{selectedAccentLabel}</span>
          </div>
          <div
            className="flex flex-wrap items-center gap-2"
            role="group"
            aria-label={t("settings.appearance.accent")}
          >
            {ACCENT_OPTIONS.map((option) => {
              const active = accent === option.id;
              const label = t(ACCENT_LABEL_KEYS[option.id]);
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setAccent(option.id)}
                  aria-pressed={active}
                  aria-label={label}
                  title={label}
                  className={cn(
                    "relative flex size-10 items-center justify-center rounded-full transition-transform hover:scale-105",
                    "focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none",
                    active ? "ring-2 ring-ring" : "ring-1 ring-border"
                  )}
                >
                  <span
                    className={cn(
                      "size-8 rounded-full border border-black/10",
                      option.swatchClass
                    )}
                  />
                  {active ? (
                    <Check
                      className="absolute size-4 text-white drop-shadow-sm"
                      strokeWidth={3}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="density">{t("settings.appearance.density")}</Label>
          <Select
            value={density}
            onValueChange={(value) => pickDensity(value as DensityId)}
          >
            <SelectTrigger id="density" className="max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DENSITY_OPTIONS.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {t(DENSITY_LABEL_KEYS[option.id])} — {t(DENSITY_HINT_KEYS[option.id])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
