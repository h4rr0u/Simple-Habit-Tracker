# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] — 2026-11-22

The second public release. Everything from v1.0.0 is unchanged in storage:
the database schema only gained additive columns, and `start.bat` applies the
new migrations automatically.

### Added

- **Habit templates** — a gallery of ten ready-made habits (health, mindfulness,
  learning, productivity) that pre-fills the habit form; every field stays
  editable and nothing is saved until you submit.
- **Categories and tags** — habits carry an optional category and up to several
  tags, shown as badges on cards and in the dashboard today list, with a
  client-side category filter on `/habits`.
- **Free-form habit grid** — the habits page is now a drag-and-drop canvas.
  Cards keep their exact cell, empty cells and empty rows are preserved, and a
  drop onto an occupied cell swaps the two habits instead of overlapping them.
  Long-press (250 ms) starts a drag so a tap still toggles a check-in.
- **Correlation analysis** — `/analytics` compares habit pairs over 90 days and
  lists the strongest positive and negative associations.
- **Time-of-day and weekday patterns** — a bar chart of check-ins per weekday
  plus a donut of morning / afternoon / evening / night activity.
- **Long-term trends** — 12, 36 or 60-month completion trend computed in a single
  grouped SQL query.
- **Report export** — CSV download and a print-friendly report page that saves to
  PDF through the browser dialog. The Russian CSV uses `;` for Excel.
- **Theming** — light, dark and system themes plus five accent palettes (blue,
  violet, emerald, orange, rose), a compact density mode, and motion throughout
  (card hover, completion glow, animated dialogs, animated charts). Every
  animation respects `prefers-reduced-motion`.
- **Accessibility pass** — all accent × theme combinations were audited against
  WCAG 2.1; new `--primary-hover`, `--primary-text`, `--success` and period
  tokens keep text at ≥ 4.5:1 and focus rings at ≥ 3:1.

### Changed

- Analytics charts are fully theme-driven: series, heatmap and gradient colours
  come from CSS tokens, so switching the accent recolours them without a reload.
- Tooltips use `--popover-foreground`, which fixes unreadable rows on the dark
  tooltip.
- The print report resets the colour tokens to the light theme, so a PDF saved
  from the dark theme is readable even with "Background graphics" enabled.

### Fixed

- An accent switch no longer flashes the default palette's checkmark after
  hydration, and the pre-paint script validates the stored value.
- `dark:` utilities now also match an element that itself carries `.dark`.
- Dead sidebar tokens and an invalid `--destructive-foreground` reference were
  removed.

### Removed

- Unused shadcn/ui primitives (`calendar`, `popover`), the `react-day-picker`
  dependency they required, and the leftover Next.js starter SVGs in `public/`.
- Dead helpers and types with no callers: `getRemindersForHabit()`, `Setting`,
  `UserPreferences`, `ReminderLog`, `NewReminderLog` and `HabitIconName`.
- The extraneous `@dnd-kit/sortable` package (never declared in `package.json`;
  the grid uses `@dnd-kit/core` only).

## [1.0.0]

The first public release: local-first habit tracking with four habit types,
flexible schedules, soft streaks with freezes, analytics, JSON backups, a
Russian / English UI and an optional Telegram bot.

[1.1.0]: https://github.com/h4rr0u/habit-tracker/releases/tag/v1.1.0
[1.0.0]: https://github.com/h4rr0u/habit-tracker/releases/tag/v1.0.0
