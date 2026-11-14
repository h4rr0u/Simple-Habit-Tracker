/** Shared Recharts styling for the analytics page (dark, colourful). */

export const CHART_COLORS = {
  primary: "var(--chart-1)",
  grid: "var(--border)",
  muted: "var(--muted-foreground)",
} as const;

/**
 * Presentation palette for multi-series charts. These are fixed hex values
 * (rather than theme tokens) so screenshots stay vivid in the dark theme while
 * remaining readable in light mode.
 */
export const SERIES_COLORS = [
  "#38bdf8", // sky
  "#818cf8", // indigo
  "#a78bfa", // violet
  "#f472b6", // pink
  "#fb923c", // orange
  "#facc15", // yellow
  "#34d399", // emerald
] as const;

/** Multi-hue ramp for the year heatmap: level 1 (low) → 4 (full). */
export const HEAT_COLORS = ["#1d4ed8", "#0ea5e9", "#a855f7", "#f59e0b"] as const;

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
