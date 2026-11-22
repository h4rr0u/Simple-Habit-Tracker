"use client";

import { Languages } from "lucide-react";

import {
  LANGUAGE_OPTIONS,
  useLanguage,
  type Language,
} from "@/components/language-provider";
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

/**
 * Language settings: switches the UI dictionary instantly. The choice is
 * persisted in localStorage by the LanguageProvider, so no page reload and
 * no URL change are involved.
 */
export function LanguageCard() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Languages className="size-5 text-primary-text" />
          {t("settings.language.title")}
        </CardTitle>
        <CardDescription>{t("settings.language.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="max-w-xs space-y-2">
          <Label htmlFor="language">{t("settings.language.label")}</Label>
          <Select
            value={language}
            onValueChange={(value) => setLanguage(value as Language)}
          >
            <SelectTrigger id="language" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGE_OPTIONS.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
