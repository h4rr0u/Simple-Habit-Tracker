"use client";

import { useRef, useState } from "react";
import { format } from "date-fns";
import { Database, Download, Upload } from "lucide-react";
import { toast } from "sonner";

import { exportDataAction, importDataAction } from "@/actions/data";
import { Button } from "@/components/ui/button";
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
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  const exportData = async () => {
    setExporting(true);
    try {
      const result = await exportDataAction();
      if (!result.ok) {
        toast.error(result.error);
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
      toast.success("Backup downloaded");
    } catch {
      toast.error("Failed to export data");
    } finally {
      setExporting(false);
    }
  };

  const importData = async () => {
    if (!file) {
      toast.error("Pick a backup file first");
      return;
    }
    const confirmed = window.confirm(
      "Importing replaces ALL current data (habits, check-ins, reminders, settings) with the backup contents. Continue?"
    );
    if (!confirmed) return;

    setImporting(true);
    try {
      const json = await file.text();
      const result = await importDataAction({ json });
      if (result.ok) {
        toast.success(
          `Imported ${result.data.habits} habits, ${result.data.checkins} check-ins`
        );
        setFile(null);
        if (fileRef.current) fileRef.current.value = "";
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Failed to import data");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="size-5 text-primary" />
          Data
        </CardTitle>
        <CardDescription>
          Export all data to a JSON backup, or restore from one.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={exportData} disabled={exporting}>
            <Download data-icon="inline-start" />
            {exporting ? "Exporting…" : "Export data"}
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
              {file ? file.name : "Choose backup file…"}
            </Button>
            <Button
              variant="destructive"
              onClick={importData}
              disabled={importing || !file}
            >
              {importing ? "Importing…" : "Import"}
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
            Import replaces all current data with the backup contents — export
            a fresh backup first if you need one.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
