import { format, parseISO } from "date-fns";
import { z } from "zod";

import { PrintControls } from "@/components/analytics/print-controls";
import {
  formatReportValue,
  reportPeriodLabel,
  reportScheduleLabel,
  reportTypeLabel,
  translateReport,
  type ReportLanguage,
} from "@/lib/report-i18n";
import { loadReportData } from "@/lib/report-data";
import { REPORT_PERIODS, type ReportPeriod } from "@/types/reports";

/**
 * Print-friendly report at /analytics/print.
 *
 * The route renders a clean HTML document; the "Download PDF" button opens it
 * in a new tab, where PrintControls triggers window.print(). The user chooses
 * "Save as PDF" in the native dialog, so no Puppeteer/jsPDF dependency is
 * needed and the app stays local-first and lightweight.
 */

export const dynamic = "force-dynamic";

const searchParamsSchema = z.object({
  period: z.enum(REPORT_PERIODS).default("30"),
  lang: z.enum(["ru", "en"]).default("ru"),
});

function formatDay(key: string): string {
  return format(parseISO(key), "dd.MM.yyyy");
}

function formatRate(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/** Scheduled/completed units with a decimal only when fractional. */
function formatDays(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export default async function AnalyticsPrintPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const parsed = searchParamsSchema.safeParse({
    period: raw.period,
    lang: raw.lang,
  });
  const period: ReportPeriod = parsed.success ? parsed.data.period : "30";
  const language: ReportLanguage = parsed.success ? parsed.data.lang : "ru";
  const report = await loadReportData(period);

  const t = (
    key: Parameters<typeof translateReport>[1],
    vars?: Record<string, string | number>
  ) => translateReport(language, key, vars);
  const periodLabel = reportPeriodLabel(language, period);

  const summaryColumns = [
    t("reports.column.habit"),
    t("reports.column.type"),
    t("reports.column.schedule"),
    t("reports.column.scheduled"),
    t("reports.column.completed"),
    t("reports.column.rate"),
    t("reports.column.currentStreak"),
    t("reports.column.longestStreak"),
    t("reports.column.checkins"),
  ];

  return (
    <div className="report-page mx-auto w-full max-w-5xl space-y-8 p-4 sm:p-6 print:p-0">
      {/* Set before hydration so the shell is hidden on first paint and print
          styles apply even if the client bundle is slow to load. */}
      <script
        dangerouslySetInnerHTML={{
          __html: 'document.body.dataset.printView="true"',
        }}
      />
      <PrintControls
        backLabel={t("reports.back")}
        printLabel={t("reports.print")}
        hint={t("reports.printHint")}
      />

      <header className="space-y-2 border-b pb-4">
        <h1 className="text-2xl font-bold tracking-tight">
          {t("reports.title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {periodLabel} · {t("reports.generatedAt")}:{" "}
          {format(new Date(report.generatedAt), "dd.MM.yyyy HH:mm")}
        </p>
        <p className="text-sm">
          {t("reports.range", {
            from: formatDay(report.from),
            to: formatDay(report.to),
          })}
        </p>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 pt-1 text-sm">
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">
              {t("reports.totalHabits")}:
            </dt>
            <dd className="font-medium">{report.habits.length}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">
              {t("reports.column.scheduled")}:
            </dt>
            <dd className="font-medium">{formatDays(report.totals.scheduledDays)}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">
              {t("reports.column.completed")}:
            </dt>
            <dd className="font-medium">{formatDays(report.totals.completedDays)}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">
              {t("reports.column.rate")}:
            </dt>
            <dd className="font-medium">{formatRate(report.totals.completionRate)}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">
              {t("reports.column.checkins")}:
            </dt>
            <dd className="font-medium">{report.totals.checkins}</dd>
          </div>
        </dl>
      </header>

      {report.habits.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("reports.noHabits")}</p>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">{t("reports.summary")}</h2>
            <div className="overflow-x-auto">
              <table className="report-table w-full border-collapse text-xs">
                <thead>
                  <tr>
                    {summaryColumns.map((column) => (
                      <th
                        key={column}
                        className="border-b px-2 py-1.5 text-left font-medium whitespace-nowrap"
                      >
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.habits.map((habit) => (
                    <tr key={habit.id} className="align-top">
                      <td className="border-b px-2 py-1.5 font-medium">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            aria-hidden
                            className="inline-block size-2 rounded-full"
                            style={{ backgroundColor: habit.color }}
                          />
                          {habit.name}
                        </span>
                      </td>
                      <td className="border-b px-2 py-1.5">
                        {reportTypeLabel(language, habit.type)}
                      </td>
                      <td className="border-b px-2 py-1.5">
                        {reportScheduleLabel(language, habit.schedule)}
                      </td>
                      <td className="border-b px-2 py-1.5 text-right whitespace-nowrap">
                        {formatDays(habit.scheduledDays)}
                      </td>
                      <td className="border-b px-2 py-1.5 text-right whitespace-nowrap">
                        {formatDays(habit.completedDays)}
                      </td>
                      <td className="border-b px-2 py-1.5 text-right whitespace-nowrap">
                        {formatRate(habit.completionRate)}
                      </td>
                      <td className="border-b px-2 py-1.5 text-right whitespace-nowrap">
                        {habit.currentStreak}
                      </td>
                      <td className="border-b px-2 py-1.5 text-right whitespace-nowrap">
                        {habit.longestStreak}
                      </td>
                      <td className="border-b px-2 py-1.5 text-right whitespace-nowrap">
                        {habit.checkins.length}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-6">
            <h2 className="text-lg font-semibold">{t("reports.history")}</h2>
            {report.habits.map((habit) => (
              <article
                key={habit.id}
                className="report-habit break-inside-avoid space-y-2"
              >
                <div>
                  <h3 className="font-semibold">{habit.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {reportTypeLabel(language, habit.type)} ·{" "}
                    {reportScheduleLabel(language, habit.schedule)}
                  </p>
                </div>

                <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      {t("reports.column.rate")}
                    </dt>
                    <dd className="font-medium">
                      {formatRate(habit.completionRate)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      {t("reports.column.currentStreak")}
                    </dt>
                    <dd className="font-medium">{habit.currentStreak}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      {t("reports.column.longestStreak")}
                    </dt>
                    <dd className="font-medium">{habit.longestStreak}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      {t("reports.column.checkins")}
                    </dt>
                    <dd className="font-medium">{habit.checkins.length}</dd>
                  </div>
                </dl>

                {habit.checkins.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("reports.noCheckins")}
                  </p>
                ) : (
                  <table className="report-table w-full max-w-md border-collapse text-xs">
                    <thead>
                      <tr>
                        <th className="border-b px-2 py-1 text-left font-medium">
                          {t("reports.column.date")}
                        </th>
                        <th className="border-b px-2 py-1 text-left font-medium">
                          {t("reports.column.value")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {habit.checkins.map((checkin) => (
                        <tr key={checkin.date}>
                          <td className="border-b px-2 py-1">
                            {formatDay(checkin.date)}
                          </td>
                          <td className="border-b px-2 py-1">
                            {formatReportValue(
                              language,
                              habit,
                              checkin.value
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </article>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
