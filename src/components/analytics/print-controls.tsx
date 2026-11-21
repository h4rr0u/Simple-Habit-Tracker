"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ArrowLeft, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Print-page toolbar.
 *
 * It hides the app shell on screen (via `data-print-view` in globals.css),
 * opens the browser's native print dialog on mount, and keeps a manual button
 * for browsers that block or cancel the automatic dialog. PDF export is just
 * "Save as PDF" in that dialog — no server-side PDF renderer is involved.
 */

export function PrintControls({
  backLabel,
  printLabel,
  hint,
}: {
  backLabel: string;
  printLabel: string;
  hint: string;
}) {
  useEffect(() => {
    document.body.dataset.printView = "true";
    const timer = window.setTimeout(() => window.print(), 500);

    return () => {
      window.clearTimeout(timer);
      delete document.body.dataset.printView;
    };
  }, []);

  return (
    <div className="print:hidden flex flex-wrap items-center justify-between gap-3 border-b pb-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" asChild>
          <Link href="/analytics">
            <ArrowLeft data-icon="inline-start" />
            {backLabel}
          </Link>
        </Button>
        <Button onClick={() => window.print()}>
          <Printer data-icon="inline-start" />
          {printLabel}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
