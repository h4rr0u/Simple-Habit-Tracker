import { format } from "date-fns";
import { NextResponse } from "next/server";
import { z } from "zod";

import { loadReportData } from "@/lib/report-data";
import { buildCsv } from "@/lib/report";
import { REPORT_PERIODS, type ReportPeriod } from "@/types/reports";

/**
 * CSV report download.
 *
 * GET /api/reports/csv?period=7|30|all&lang=ru|en
 *
 * The file is generated on demand from SQLite, prefixed with a UTF-8 BOM and
 * sent with a Content-Disposition attachment header so browsers save it
 * directly. No third-party CSV library is needed for this small, fixed schema.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  period: z.enum(REPORT_PERIODS).default("30"),
  lang: z.enum(["ru", "en"]).default("ru"),
});

const DEFAULT_PERIOD: ReportPeriod = "30";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    period: searchParams.get("period") ?? undefined,
    lang: searchParams.get("lang") ?? undefined,
  });
  const period = parsed.success ? parsed.data.period : DEFAULT_PERIOD;
  const language = parsed.success ? parsed.data.lang : "ru";

  const report = await loadReportData(period);
  const csv = buildCsv(report, language);
  const suffix = period === "all" ? "all-time" : `${period}d`;
  const filename = `habit-tracker-report-${suffix}-${format(new Date(), "yyyy-MM-dd")}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
