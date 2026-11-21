"use client";

import { useState } from "react";
import { Download, FileText, Printer } from "lucide-react";

import {
  useLanguage,
  type TranslationKey,
} from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { REPORT_PERIODS, type ReportPeriod } from "@/types/reports";

/**
 * Export block on /analytics: pick a report period and download CSV or open
 * the print-friendly route (where the browser's print dialog can save a PDF).
 * The language travels in the query string because the server routes cannot
 * read the localStorage-backed language context.
 */

const PERIOD_LABEL_KEYS: Record<ReportPeriod, TranslationKey> = {
  "7": "analytics.period.7",
  "30": "analytics.period.30",
  all: "analytics.period.all",
};

export function ExportReportCard() {
  const { t, language } = useLanguage();
  const [period, setPeriod] = useState<ReportPeriod>("30");
  const query = `period=${period}&lang=${language}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="size-5 text-primary" />
          {t("analytics.export.title")}
        </CardTitle>
        <CardDescription>
          {t("analytics.export.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label
            htmlFor="report-period"
            className="text-xs font-medium text-muted-foreground"
          >
            {t("analytics.export.period")}
          </label>
          <Select
            value={period}
            onValueChange={(value) => setPeriod(value as ReportPeriod)}
          >
            <SelectTrigger
              id="report-period"
              className="w-48"
              aria-label={t("analytics.export.period")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REPORT_PERIODS.map((option) => (
                <SelectItem key={option} value={option}>
                  {t(PERIOD_LABEL_KEYS[option])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <a href={`/api/reports/csv?${query}`}>
              <Download data-icon="inline-start" />
              {t("analytics.export.csv")}
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a
              href={`/analytics/print?${query}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Printer data-icon="inline-start" />
              {t("analytics.export.pdf")}
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
