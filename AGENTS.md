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
