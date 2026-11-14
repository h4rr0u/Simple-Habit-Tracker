"use client";

import { useEffect, useState } from "react";
import { Palette } from "lucide-react";

import {
  ACCENT_OPTIONS,
  DENSITY_OPTIONS,
  DEFAULT_ACCENT,
  DEFAULT_DENSITY,
  applyAccent,
  applyDensity,
  getStoredAccent,
  getStoredDensity,
  type AccentId,
  type DensityId,
} from "@/lib/appearance";
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
import { cn } from "@/lib/utils";

/**
 * Appearance settings: accent color swatches and interface density.
 * Preferences are stored in localStorage and applied to <html> instantly.
 */

const ACCENT_LABEL_KEYS: Record<AccentId, TranslationKey> = {
  blue: "settings.appearance.accent.blue",
  violet: "settings.appearance.accent.violet",
  emerald: "settings.appearance.accent.emerald",
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
  const [accent, setAccent] = useState<AccentId>(DEFAULT_ACCENT);
  const [density, setDensity] = useState<DensityId>(DEFAULT_DENSITY);

  // Read localStorage after mount: the server render always shows the
  // defaults, so hydration stays consistent.
  useEffect(() => {
    setAccent(getStoredAccent());
    setDensity(getStoredDensity());
  }, []);

  const pickAccent = (next: AccentId) => {
    setAccent(next);
    applyAccent(next);
  };

  const pickDensity = (next: DensityId) => {
    setDensity(next);
    applyDensity(next);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="size-5 text-primary" />
          {t("settings.appearance.title")}
        </CardTitle>
        <CardDescription>{t("settings.appearance.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>{t("settings.appearance.accent")}</Label>
          <div className="flex flex-wrap gap-2">
            {ACCENT_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => pickAccent(option.id)}
                aria-pressed={accent === option.id}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                  accent === option.id
                    ? "border-primary bg-primary/10 ring-2 ring-ring/40"
                    : "border-border hover:bg-muted"
                )}
              >
                <span
                  className="size-4 rounded-full border border-black/10"
                  style={{ backgroundColor: option.swatch }}
                />
                {t(ACCENT_LABEL_KEYS[option.id])}
              </button>
            ))}
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
