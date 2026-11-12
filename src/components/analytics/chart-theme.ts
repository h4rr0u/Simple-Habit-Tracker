/** Shared Recharts styling for the analytics page (dark, blue accent). */

export const CHART_COLORS = {
  primary: "var(--chart-1)",
  grid: "var(--border)",
  muted: "var(--muted-foreground)",
} as const;

export const AXIS_TICK = { fontSize: 11, fill: "var(--muted-foreground)" } as const;

export const TOOLTIP_STYLE = {
  backgroundColor: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
} as const;

/** Formats a 0..1 rate as a percentage string. */
export function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}
