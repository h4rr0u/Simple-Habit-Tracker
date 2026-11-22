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
- Habit categories/tags are stored on the `habits` row (`category`, `tags`).
  Category filtering on `/habits` is **client-side** over the already-loaded
  cards: derive unique categories from the list, keep the selected value in
  local state, and memoize the filtered array. Do not add a SQL filter unless
  the habit list grows large enough to paginate.
- Animation uses **framer-motion**. Interactive surfaces are `motion.*`
  elements driven by the presets in `src/lib/motion.ts` (150–300 ms,
  `transform`/`opacity` only, spring `stiffness: 300, damping: 20`). Every
  animated component calls `useReducedMotion()` and skips or zeroes the
  animation when it is `true`. Cards may use `whileHover`/`whileTap` but must
  drop them while dnd-kit is dragging (`isDragging`). Completion feedback goes
  through `CompletionGlow`; dialogs animate with `AnimatePresence` in
  `src/components/ui/dialog.tsx`; route content fades in through
  `src/app/template.tsx`; Recharts animations are enabled only when motion is
  allowed. In `src/components/ui/dialog.tsx` the content/overlay must never set
  `pointerEvents` in their inline `style` while open — Radix locks
  `body { pointer-events: none }` for modal dialogs and spreads its own
  `pointerEvents: "auto"` *before* the element style, so an explicit key makes
  the whole dialog unclickable. Gate it on framer-motion's `useIsPresent()`
  instead (inside the panel/backdrop components, not `DialogContent`, which
  lives outside `AnimatePresence` and therefore always reads `true`).
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

- **Categories & tags** — `habits.category` (`text`, nullable) and
  `habits.tags` (`text` JSON `string[]`, default `[]`) were added in migration
  `drizzle/0006_keen_praxagora.sql`. `createHabitAction` / `updateHabitAction`
  accept `category` (trimmed, max 50) and `tags` as either a comma-separated
  string or a `string[]`; a Zod transform splits, trims, de-duplicates and caps
  each tag at 20 characters before the query layer stores the array. An empty
  category string is persisted as `NULL`. `HabitFormDialog` renders a category
  `Input` backed by a `<datalist>` of existing categories plus a
  comma-separated tags `Input`; `HabitCard` and the dashboard today list show
  them as `Badge`s colored by `getLabelBadgeClass()` (`src/lib/habit-ui.ts`,
  stable hash → fixed tone palette). `HabitsPageClient` owns the filter: unique
  categories derived from the cards, a shadcn `Select` ("all categories"
  sentinel `__all__`), a reset button, and a dedicated empty state when a
  category has no habits. Copy lives under `habits.filters.*` and
  `habits.form.category*` / `habits.form.tags*`. Tests:
  `src/actions/habits.test.ts`.

- **Habit templates** — `src/lib/templates.ts` exposes the static
  `HABIT_TEMPLATES` catalogue (10 ready-made habits across Health,
  Mindfulness, Learning and Productivity) plus the `HabitTemplate` interface
  (`id`, `icon`, `category`, `type`, optional `targetValue` / `unit`, `color`,
  `schedule`, `nameKey`, `descKey`). Templates are pure data and are **not**
  stored in SQLite; nothing is persisted until the user submits the habit
  form. The `/habits` page adds a "Choose from templates" button that opens
  `src/components/habit-template-gallery.tsx` — a Dialog with category tabs
  and a responsive card grid (icon, translated name/description, category
  badge). Selecting a card closes the gallery and opens the regular
  `HabitFormDialog` with a `template` prop; the dialog translates `nameKey`
  and pre-fills name, type, target, unit, icon, color and category while
  leaving every field editable. Categories keep canonical English labels and
  are localized through `TEMPLATE_CATEGORY_KEYS`; category tabs reuse the same
  keys. Template copy lives under `template.<id>.name` /
  `template.<id>.description`, UI copy under `habits.templates.*` in
  `ru.json` / `en.json`. Tests: `src/lib/templates.test.ts` (unique ids, valid
  values/icons/schedules, translations present in both dictionaries).

- **Motion & micro-interactions** — framer-motion (already a dependency) now
  drives the app's feedback layer. `src/lib/motion.ts` holds the shared presets
  (`CARD_SPRING`, `PAGE_TRANSITION`). Habit cards (`src/components/habit-card.tsx`)
  are wrapped in `motion.div` with `whileHover={{ y: -4, scale: 1.01 }}` and
  `whileTap={{ scale: 0.98 }}`; `DraggableHabitCard` passes `isDragging` so the
  hover/tap states are disabled while dnd-kit owns the transform (the drag
  lift is applied on the inner `Card` instead). `CompletionGlow`
  (`src/components/completion-glow.tsx`) plays a one-shot emerald ring when a
  habit flips to done, on both the grid card and the dashboard today list. The
  dashboard progress ring uses `motion.circle` for `stroke-dashoffset` plus
  `useSpring`/`useMotionValueEvent` to count the percentage up. The shadcn
  checkbox animates its check with a spring. `src/components/ui/dialog.tsx`
  mirrors the Radix open state in a context and renders overlay/content with
  `forceMount` inside `AnimatePresence`, so dialogs fade and slide instead of
  snapping; the template gallery staggers its cards by 0.05 s per index.
  `src/app/template.tsx` gives every route a fade-in-up. Recharts animations
  are enabled (`animationDuration` 450–500 ms) only when `useReducedMotion()`
  is false.

- **Grid Canvas (free drag & drop)** — The `/habits` grid is a free-form
  canvas instead of a reordering list. `habits.positionX` (`integer`, 0-3) and
  `habits.positionY` (`integer`, 0+) replace `sortOrder`; migration
  `drizzle/0008_pretty_silhouette.sql` adds both columns and maps the old
  linear order row-major (`sort_order % 4`, `sort_order / 4`), and
  `drizzle/0009_thick_young_avengers.sql` drops `sort_order`. `listHabits()`
  orders by `positionY` then `positionX`; `createHabit()` claims the first
  free cell via `nextFreeCell()` inside an IMMEDIATE transaction. The UI uses
  `@dnd-kit/core` only (no `@dnd-kit/sortable`): every card is a CSS grid item
  pinned with `gridColumn: positionX + 1` / `gridRow: positionY + 1`, so
  empty cells and empty rows persist. `DraggableHabitCard` keeps the 250 ms /
  5 px long-press `PointerSensor` so a tap still toggles check-ins, and
  ignores pointer-downs on buttons/links/inputs. While a card is lifted it is
  rendered by a `DragOverlay` clone (`pointer-events-none`, no hover motion) and
  the source cell only dims to `opacity-40`, so framer-motion never competes
  with dnd-kit for `transform`; `touchAction: "none"` on the canvas keeps a
  long press from turning into a page scroll on phones. On drop,
  `cellFromPoint()` in `src/lib/habit-grid.ts` converts the card centre into a
  cell using the computed column widths/row heights (extrapolating rows below
  the last one, capped at `lastRow + MAX_EXTRAPOLATED_ROWS`), and
  `resolveHabitMove()` returns the minimal update set — one habit for an
  empty cell, two for a swap on an occupied cell, so cards never overlap. The
  client applies the move optimistically and calls `moveHabitsAction([{ id,
  positionX, positionY }])`, which validates unique ids and unique cells,
  updates everything in one transaction and revalidates `/habits`. Tests:
  `src/lib/habit-grid.test.ts`, `src/db/queries.test.ts`,
  `src/actions/habits.test.ts`.

- **Canvas hardening & a11y** — `HabitsPageClient` keeps a `isMovingRef` /
  `isMoving` pair: a drop that arrives while `moveHabitsAction` is still in
  flight is ignored (the ref is checked synchronously, the state drives
  `aria-busy` on the canvas), and the flag is cleared in a `finally` so two
  overlapping moves can never persist stale or swapped coordinates.
  `HabitCard` and `DraggableHabitCard` are `memo`-wrapped, and the dialog and
  form callbacks are `useCallback`-stable, so hovering or dragging one tile no
  longer re-renders the rest of the grid. Keyboard drags are detected from
  `DragStartEvent.activatorEvent instanceof KeyboardEvent`: the lifted tile
  (source + `DragOverlay` clone) gets `isKeyboardMoving` → `ring-2 ring-primary
  ring-offset-2`, and the landing cell is announced through the `role="status"
  aria-live="polite"` region using `habits.dnd.movedTo` (row/column are
  1-based). All dialog panel springs use `DIALOG_SPRING` from
  `src/lib/motion.ts` (`stiffness: 340, damping: 30, mass: 0.8`) — never
  hardcode it in `src/components/ui/dialog.tsx`.

- **Theming & accent palettes** — Light / dark / system themes are handled by
  `next-themes`: `ThemeProvider` in `src/components/providers.tsx` uses
  `attribute="class"`, `defaultTheme="dark"` and `enableSystem`, so dark stays
  the default while users can follow the OS. The `/settings` Appearance card
  (`src/components/settings/appearance-card.tsx`) renders theme tabs plus
  accent swatches for **blue**, **violet**, **emerald**, **orange** and
  **rose**. Accent choices are stored in localStorage
  (`habit-tracker:accent`) and applied by `src/lib/appearance.ts` as a
  `data-accent` attribute on `<html>`; the pre-paint script in
  `src/app/layout.tsx` applies it before first paint, and
  `src/components/accent-provider.tsx` exposes `useAccent()` to the client.
  `src/app/globals.css` maps each accent to `--primary`, `--ring`, `--accent`,
  `--sidebar-*` and `--chart-1..5` overrides with separate light and `.dark`
  blocks, so every palette keeps contrast in both themes. Primary surfaces
  (buttons, checkboxes, sidebar, dashboard progress ring, analytics charts)
  consume those variables, and the swatch dots use plain CSS classes
  (`accent-swatch-*`) — never inline color styles. Copy lives under
  `settings.appearance.*` in `ru.json` / `en.json`.
