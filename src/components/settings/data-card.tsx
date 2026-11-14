"use client";

import { useRef, useState } from "react";
import { format } from "date-fns";
import { Database, Download, Upload } from "lucide-react";
import { toast } from "sonner";

import { exportDataAction, importDataAction } from "@/actions/data";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { translateActionError } from "@/lib/action-error";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Data backup card: exports every table to a JSON file and imports a backup
 * back in (replacing the current database contents).
 */

export function DataCard() {
  const { t } = useLanguage();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  const exportData = async () => {
    setExporting(true);
    try {
      const result = await exportDataAction();
      if (!result.ok) {
        toast.error(translateActionError(t, result.error));
        return;
      }
      const blob = new Blob([JSON.stringify(result.data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `habit-tracker-backup-${format(new Date(), "yyyy-MM-dd")}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(t("settings.data.backupDownloaded"));
    } catch {
      toast.error(t("settings.data.exportFailed"));
    } finally {
      setExporting(false);
    }
  };

  const importData = async () => {
    if (!file) {
      toast.error(t("settings.data.pickFile"));
      return;
    }
    const confirmed = window.confirm(t("settings.data.importConfirm"));
    if (!confirmed) return;

    setImporting(true);
    try {
      const json = await file.text();
      const result = await importDataAction({ json });
      if (result.ok) {
        toast.success(
          t("settings.data.imported", {
            habits: result.data.habits,
            checkins: result.data.checkins,
          })
        );
        setFile(null);
        if (fileRef.current) fileRef.current.value = "";
      } else {
        toast.error(translateActionError(t, result.error));
      }
    } catch {
      toast.error(t("settings.data.importFailed"));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="size-5 text-primary" />
          {t("settings.data.title")}
        </CardTitle>
        <CardDescription>{t("settings.data.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={exportData} disabled={exporting}>
            <Download data-icon="inline-start" />
            {exporting ? t("settings.data.exporting") : t("settings.data.export")}
          </Button>
        </div>

        <div className="space-y-2 rounded-lg border border-dashed p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              disabled={importing}
              onClick={() => fileRef.current?.click()}
            >
              <Upload data-icon="inline-start" />
              {file ? file.name : t("settings.data.chooseFile")}
            </Button>
            <Button
              variant="destructive"
              onClick={importData}
              disabled={importing || !file}
            >
              {importing ? t("settings.data.importing") : t("settings.data.import")}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {t("settings.data.importHint")}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
