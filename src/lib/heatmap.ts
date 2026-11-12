import { addDays, format, startOfDay } from "date-fns";

/**
 * 12-week heatmap computation for the habit detail page.
 * Intensity = completion rate per day (0 = missed, 1 = completed).
 */

export interface HeatCell {
  /** ISO date key (YYYY-MM-DD). */
  date: string;
  /** 0 when not done, 1 when done; -1 marks a day outside the window. */
  level: number;
}

export interface HeatmapWeek {
  /** Monday-based week start key. */
  weekStart: string;
  cells: HeatCell[];
}

/**
 * Builds a Monday-aligned grid of the last 12 weeks (84 days) ending today.
 * Days before the habit existed are reported with level -1.
 */
export function buildHeatmap(
  checkinDates: Set<string>,
  createdAt: Date,
  today = new Date(),
  weeks = 12
): HeatmapWeek[] {
  const t = startOfDay(today);
  // End of the grid: the current (in-progress) week's Monday.
  const dow = (t.getDay() + 6) % 7; // 0 = Monday
  const currentWeekStart = addDays(t, -dow);
  const gridStart = addDays(currentWeekStart, -7 * (weeks - 1));

  const created = startOfDay(createdAt);
  const out: HeatmapWeek[] = [];
  for (let w = 0; w < weeks; w++) {
    const weekStart = addDays(gridStart, w * 7);
    const cells: HeatCell[] = [];
    for (let d = 0; d < 7; d++) {
      const day = addDays(weekStart, d);
      const key = format(day, "yyyy-MM-dd");
      const done = checkinDates.has(key);
      cells.push({
        date: key,
        level: day < created ? -1 : done ? 1 : 0,
      });
    }
    out.push({ weekStart: format(weekStart, "yyyy-MM-dd"), cells });
  }
  return out;
}
