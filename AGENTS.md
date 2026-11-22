# AGENTS.md

Guidance for AI coding agents working on this repository. `CONTRIBUTING.md` is
the canonical contributor guide; this file summarizes the rules that matter
most for automated changes and records feature-level decisions.

## Project

Habit Tracker is a **local-first** Next.js 15 (App Router) app. It stores data
in SQLite (`better-sqlite3` + Drizzle) and ships an optional grammY Telegram
bot. Current version: **v1.0.0**. Avoid adding heavy server-side dependencies
(Puppeteer, headless browsers, cloud services) unless there is no lighter path.

## Commands

```bash
npm run dev          # Next.js dev server (Turbopack)
npm run build        # production build
npm run test         # Vitest unit tests
npx tsc --noEmit     # type checking
npm run lint         # ESLint
npm run db:migrate   # apply Drizzle migrations
```

All four checks (`test`, `tsc`, `lint`, `build`) must pass before finishing a
change.

## Architecture

```
src/
  app/        # Next.js pages and route handlers
  actions/    # Server Actions (Zod-validated mutations)
  components/ # UI components (shadcn/ui based)
  db/         # Drizzle schema + queries
  lib/        # Pure logic: streaks, freezes, schedules, analytics, reports
  types/      # Shared types
  bot/        # Telegram bot (grammY)
scripts/      # Standalone processes (reminders, launcher)
drizzle/      # SQL migrations
```

## Code conventions

- Mutations go through **Server Actions** with **Zod** validation and return
  `{ ok: true, data } | { ok: false, error }`.
- TypeScript: `camelCase` in code, `snake_case` in the database; avoid `any`.
- Dates use `date-fns`; day keys are ISO `YYYY-MM-DD` local to the user.
- Prefer Server Components. Add a client component only when interactivity
  requires it.
- Reuse existing pure logic (`src/lib/streaks.ts`, `src/lib/analytics.ts`,
  `src/lib/habit-target.ts`) instead of re-implementing streak, schedule or
  completion calculations.
- Do not change the database schema unless the task explicitly requires it.

## Internationalization

- All UI text lives in `src/locales/ru.json` and `src/locales/en.json`; never
  hardcode user-facing strings.
- The client language is stored in localStorage and exposed through
  `useLanguage()` (`src/components/language-provider.tsx`).
- Server-rendered exports cannot read localStorage: pass `?lang=ru|en` and use
  `src/lib/report-i18n.ts`.

## Feature history

- **Report Export** — Added a CSV report route
  (`src/app/api/reports/csv/route.ts`) and a print-friendly report page
  (`src/app/analytics/print/page.tsx`). The CSV is generated in
  `src/lib/report.ts` with a UTF-8 BOM and RFC 4180 quoting; the Russian file
  uses `;` plus Excel's `sep=;` directive (RU Excel expects the semicolon list
  separator) while English stays plain comma-separated. PDF export uses the
  browser's native `window.print()` dialog instead of a server-side PDF
  renderer. Report data is loaded read-only from SQLite in
  `src/lib/report-data.ts` (streaks and completion rates come from the existing
  `src/lib/streaks.ts` / `src/lib/analytics.ts` engines), and the `/analytics`
  page exposes period selection plus CSV/PDF buttons through
  `src/components/analytics/export-report-card.tsx`. Print layout rules live in
  the `@media print` block of `src/app/globals.css`.

- **Correlation Analysis** — Added a 90-day habit-pair analysis to
  `/analytics`. The pure engine in `src/lib/correlations.ts` compares
  `P(B|A)` with `P(B|~A)` for every habit pair, reports associations whose
  delta exceeds 15%, and returns the top three positive and negative results.
  The analytics Server Component reuses the check-ins already loaded for the
  charts (no extra queries) and passes the result to
  `src/components/analytics/correlations-block.tsx`, which renders translated
  trend rows or an insufficient-data empty state. Binary habits count when a
  check-in exists, quantitative/timed habits need `value > 0`, and negative
  habits are inverted (a check-in is a slip). Unit tests live in
  `src/lib/correlations.test.ts`; all copy is in `ru.json` / `en.json` under
  `analytics.correlations.*`.

- **Time-of-day & weekday patterns** — Added a "time patterns" block to
  `/analytics` built on `src/lib/time-stats.ts`: `getDayOfWeekStats()` groups
  successful check-ins into seven ISO weekdays (1 = Mon … 7 = Sun) and
  `getTimeOfDayStats()` maps each check-in's `createdAt` local hour into
  morning (05:00–11:59), afternoon (12:00–16:59), evening (17:00–21:59) or
  night (22:00–04:59), both returning `{ count, percentage }` rows. Only
  successful check-ins count (`value` null or `> 0`), and negative habits are
  excluded because their rows record slips. Like correlations, the block uses a
  fixed 90-day window across all active habits and ignores the period/habit
  filters, so it stays stable while the user browses. The page computes the
  stats from the check-ins it already loaded and passes them to
  `src/components/analytics/time-patterns-block.tsx`, which renders a
  Recharts bar chart plus a donut (`time-pattern-charts.tsx`, loaded with
  `ssr: false` like the other charts) and an empty state below
  `MIN_CHECKINS_FOR_PATTERNS` (5). Copy lives under `analytics.timePatterns.*`;
  weekday labels reuse the shared `weekday.*` keys. Tests:
  `src/lib/time-stats.test.ts`.

- **Long-term trends** — Added a "long-term trends" block to `/analytics`
  covering 12, 36 or 60 months. `getLongTermStats()` in `src/db/queries.ts`
  performs a **single** SQL query: check-ins are grouped by habit and
  `strftime('%Y-%m', date)` inside SQLite, so only one row per habit-month is
  returned regardless of how many years of check-ins exist. The scheduled side
  is derived in `src/lib/long-term-stats.ts` from the (small) habit list with
  the shared `isHabitDueOn()` engine, so schedule rules are not duplicated in
  SQL; months before the first habit creation are dropped and the rate is
  clamped to 0..1. The selected window lives in the URL (`?trend=12|36|60`),
  so the client never filters years of points. The card is
  `src/components/analytics/long-term-trends-block.tsx`; Recharts renders in
  `long-term-trends-chart.tsx` with `dot={false}`, a 0–100% Y axis,
  `type="monotone"` and localized month labels via date-fns locales. The empty
  state appears below `MIN_MONTHS_FOR_LONG_TERM` (2 populated months). Copy is
  under `analytics.longTerm.*`; tests live in
  `src/lib/long-term-stats.test.ts`.
