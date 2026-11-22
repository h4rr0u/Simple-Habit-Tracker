/** Shared Recharts styling for the analytics page (dark, colourful). */

export const CHART_COLORS = {
  primary: "var(--chart-1)",
  grid: "var(--border)",
  muted: "var(--muted-foreground)",
} as const;

/**
 * Categorical palette for multi-series charts. These are CSS variables, not
 * hex values, so every accent recalculates the ramp in the browser without a
 * re-render (SVG `fill` / `stroke` accept `var()`).
 */
export const SERIES_VARS = [
  "var(--chart-series-1)",
  "var(--chart-series-2)",
  "var(--chart-series-3)",
  "var(--chart-series-4)",
  "var(--chart-series-5)",
  "var(--chart-series-6)",
  "var(--chart-series-7)",
] as const;

/** One-tone ramp for the year heatmap: level 1 (low) → 4 (full). */
export const HEAT_VARS = [
  "var(--chart-heat-1)",
  "var(--chart-heat-2)",
  "var(--chart-heat-3)",
  "var(--chart-heat-4)",
] as const;

/**
 * Axis tick text. The size is in rem so `data-density="compact"`
 * (html font-size 93.75%) shrinks the labels together with the rest of the UI.
 */
export const AXIS_TICK = { fontSize: "0.6875rem", fill: "var(--muted-foreground)" } as const;

/**
 * Tooltip card. Used two ways: as Recharts' `contentStyle` prop and as a plain
 * inline `style` object by the custom tooltips (`time-pattern-charts`,
 * `long-term-trends-chart`), so it must only ever hold CSS properties —
 * `color`/`itemStyle`/`labelStyle` live in `TOOLTIP_PROPS` instead.
 */
export const TOOLTIP_STYLE = {
  backgroundColor: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
} as const;

/** Text colour of tooltip rows and label: popover foreground in every theme. */
const TOOLTIP_TEXT_STYLE = { color: "var(--popover-foreground)" } as const;

/**
 * Props for the default Recharts `<Tooltip>`.
 *
 * Recharts' `DefaultTooltipContent` paints each `<li>` with `entry.color` and
 * falls back to `#000`. `entry.color` is a series colour (which can miss 4.5:1
 * on the popover) or, for gradient series, `url(#…)` — invalid as a CSS colour,
 * so the row silently turned black. An explicit `itemStyle`/`labelStyle` is
 * merged *after* that value in Recharts, so it wins in both cases.
 */
export const TOOLTIP_PROPS = {
  contentStyle: TOOLTIP_STYLE,
  itemStyle: TOOLTIP_TEXT_STYLE,
  labelStyle: TOOLTIP_TEXT_STYLE,
} as const;

/** Formats a 0..1 rate as a percentage string. */
export function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}
