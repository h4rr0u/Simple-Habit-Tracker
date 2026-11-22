# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-11-22

The second public release. The database schema only gained additive columns, so
existing data is preserved and the new migrations are applied automatically on
start.

### Added

- **Analytics page** — a dedicated `/analytics` view with export to CSV and a
  print-friendly report that saves to PDF through the browser dialog. The
  Russian CSV uses `;` so it opens correctly in Excel.
- **Habit correlations** — a 90-day conditional-probability analysis that
  compares `P(B|A)` with `P(B|~A)` and surfaces the strongest positive and
  negative habit pairs.
- **Time patterns** — completion broken down by ISO weekday and by time of day
  (morning, afternoon, evening, night), rendered as a bar chart and a donut.
- **Long-term trends** — a 12, 36 or 60-month completion chart (up to five
  years) backed by a single grouped SQL aggregation, so history stays fast.
- **Habit templates** — a gallery of ten ready-made habits (health, mindfulness,
  learning, productivity) that pre-fills the habit form; every field stays
  editable and nothing is saved until you submit.
- **Categories and tags** — an optional category and tags on each habit, shown
  as badges on cards and in the dashboard today list, with client-side category
  filtering on `/habits`.
- **Free-form grid canvas** — the habits page is now a 4×N drag-and-drop canvas
  built on `@dnd-kit/core`. Cards keep their exact cell, empty cells and empty
  rows persist, and dropping onto an occupied cell swaps the two habits instead
  of overlapping them. A 250 ms long-press starts a drag so a tap still toggles
  a check-in.
- **Framer Motion animations** — micro-interactions on cards, animated dialogs,
  an animated dashboard progress ring and chart transitions. Every animation
  respects `prefers-reduced-motion`.
- **Theming** — light, dark and system themes plus five accent palettes (blue,
  violet, emerald, orange, rose) via `next-themes`, with a compact density mode.

### Changed

- **Database schema** — added `category` and `tags` to habits, and replaced the
  linear `sortOrder` with `positionX` / `positionY` for the grid canvas. The
  migrations are additive and run automatically on start.
- **Server-side calculations** — heavy dashboard and analytics computations were
  moved to the server, reducing the client bundle and time to first render.
- **Dashboard progress ring** — the Recharts `RadialBarChart` was replaced with a
  lightweight inline SVG ring, removing a chart dependency from the dashboard's
  critical path.
- **Theme-driven charts** — series, heatmap and gradient colours now come from
  CSS tokens, so switching the accent recolours charts without a reload.
- **Print report** — resets colour tokens to the light theme, so a PDF saved from
  the dark theme stays readable even with "Background graphics" enabled.
- **Cleanup** — removed unused shadcn/ui primitives, the `react-day-picker` and
  extraneous `@dnd-kit/sortable` packages, dead helpers and types, and leftover
  Next.js starter assets.

### Fixed

- SQLite transaction race conditions during rapid check-in clicks.
- Midnight date rollover — the new `MidnightRefresh` component re-renders
  day-scoped views when the local date changes.
- Timer state lost on page reload — the running segment is now mirrored to
  `localStorage` and restored on mount.
- Transform conflict between drag-and-drop and Framer Motion — the lifted card
  renders in a `DragOverlay` clone while the source cell only dims.
- Dialog `pointerEvents` bug that made modal content unclickable.
- Touch scroll blocking on mobile during drag-and-drop.
- Memory leak in the `CompletionGlow` component.
- Localization bug where template names did not update on a language change.
- Unreadable tooltip rows on the dark theme — tooltips now use
  `--popover-foreground`.
- Accent picker flashing the default palette's checkmark after hydration; the
  pre-paint script now validates the stored value.

## [1.0.0] - 2026-11-14

- Initial release.

[1.1.0]: https://github.com/h4rr0u/Simple-Habit-Tracker/releases/tag/v1.1.0
[1.0.0]: https://github.com/h4rr0u/Simple-Habit-Tracker/releases/tag/v1.0.0
