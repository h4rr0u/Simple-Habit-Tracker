import { asc, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import { checkins, habits, type Checkin } from "@/db/schema";
import { buildReport } from "@/lib/report";
import type { ReportData, ReportPeriod } from "@/types/reports";

/**
 * Loads raw habits and check-ins for the report. Archived habits are excluded
 * to match the analytics page; the report is a view of currently tracked
 * habits. No freeze writes happen here — this is a read-only path.
 */
export async function loadReportData(
  period: ReportPeriod,
  today: Date = new Date()
): Promise<ReportData> {
  const habitRows = await db
    .select()
    .from(habits)
    .where(isNull(habits.archivedAt))
    .orderBy(asc(habits.id));

  const rowsByHabit = new Map<number, Checkin[]>();
  if (habitRows.length > 0) {
    const rows = await db
      .select()
      .from(checkins)
      .where(
        inArray(
          checkins.habitId,
          habitRows.map((habit) => habit.id)
        )
      )
      .orderBy(asc(checkins.date));

    for (const row of rows) {
      const bucket = rowsByHabit.get(row.habitId);
      if (bucket) bucket.push(row);
      else rowsByHabit.set(row.habitId, [row]);
    }
  }

  return buildReport(habitRows, rowsByHabit, period, today);
}
