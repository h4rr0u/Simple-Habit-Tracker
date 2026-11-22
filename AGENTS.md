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

## Цветовые токены: таблица контрастов (WCAG)

Основные пары «акцент × тема» проверены по WCAG 2.1. Числа сняты с
**собранного** CSS: Lightning CSS конвертирует каждый `oklch()` в sRGB-фолбэк,
и именно этот `#rrggbb` (после gamut mapping в гамат дисплея) видит браузер —
поэтому таблица не зависит от того, как конкретный движок клиппит цвет.
Порог: **≥ 4.5:1** для текста, **≥ 3:1** для нетекстового индикатора (ring).

Токены `src/app/globals.css`:

| Токен | Назначение | Light | Dark |
| --- | --- | --- | --- |
| `--primary` | брендовая поверхность | L 0.48–0.60 | L 0.62–0.75 |
| `--primary-foreground` | текст/иконка **на** `--primary` | `oklch(0.985 0 0)` | `oklch(0.18 0 0)` |
| `--primary-hover` | hover дефолтной кнопки | темнее primary (L −0.05) | светлее primary (L +0.045) |
| `--primary-text` | `--primary` **как текст** на card/background | L 0.43–0.45 | L 0.75–0.78 |
| `--ring` | focus ring (всегда без альфы) | = `--primary` | = `--primary` |

Правила, которые нельзя нарушать:

- В **каждом** accent-блоке задавать все пять значений явно. Blue — исключение:
  он живёт в `:root` / `.dark` и не имеет `[data-accent="blue"]`. Каждый
  `.dark[data-accent="…"]` обязан переопределять `--primary-foreground` и
  `--sidebar-primary-foreground` (тёмный текст) — наследование белого из
  `.dark` на светлый пастельный `--primary` даёт 2.4–3.8:1.
- `--primary-hover` всегда **увеличивает** контраст с `--primary-foreground`:
  в светлой теме hover темнее, в тёмной — светлее. Старый `hover:bg-primary/80`
  осветлял кнопку и ронял emerald до ~2.8:1.
- `--primary` как текст использовать нельзя — только `--primary-text`.
  Декоративные иконки в заголовках карточек тоже переведены на
  `--primary-text`, чтобы все акценты выглядели одинаково.
- focus ring — `focus-visible:ring-ring` (без `/50`): полупрозрачный ring давал
  1.8–2.7:1. Базовый `* { @apply … outline-ring }` тоже без альфы.
- `--chart-1` и `--sidebar-primary` / `--sidebar-ring` держатся равными
  `--primary` своего блока — так контраст гарантирован и для графика, и для
  логотипа в сайдбаре.

`primary-foreground` на `primary` (текст ≥ 4.5):

| Акцент | Light | Dark |
| --- | --- | --- |
| blue | 4.95:1 (`#fafafa` / `#2563eb`) | 5.05:1 (`#121212` / `#3080ff`) |
| violet | 5.65:1 (`#fafafa` / `#7f22fe`) | 5.05:1 (`#121212` / `#9567ff`) |
| emerald | 5.42:1 (`#fafafa` / `#007651`) | 7.51:1 (`#121212` / `#00bb7f`) |
| orange | 5.19:1 (`#fafafa` / `#c23900`) | 6.64:1 (`#121212` / `#fe6e00`) |
| rose | 6.69:1 (`#fafafa` / `#b5002f`) | 5.02:1 (`#121212` / `#ff2357`) |

Hover дефолтной кнопки (`primary-hover`, тот же `primary-foreground`):

| Акцент | Light | Dark |
| --- | --- | --- |
| blue | 6.20:1 (`#1652d9`) | 5.99:1 (`#4990ff`) |
| violet | 6.93:1 (`#7200ea`) | 6.18:1 (`#a07eff`) |
| emerald | 6.65:1 (`#006744`) | 8.76:1 (`#00ca8b`) |
| orange | 6.40:1 (`#ac2e00`) | 7.57:1 (`#ff822e`) |
| rose | 8.18:1 (`#9d0025`) | 5.90:1 (`#ff506b`) |

`primary-text` на `--card` / `--background` (card / bg):

| Акцент | Light | Dark |
| --- | --- | --- |
| blue | 7.83 / 7.50 (`#1448bc`) | 8.04 / 8.88 (`#84aff4`) |
| violet | 8.52 / 8.17 (`#6311ca`) | 7.79 / 8.61 (`#b19ef9`) |
| emerald | 7.24 / 6.93 (`#006442`) | 8.47 / 9.35 (`#66c499`) |
| orange | 8.36 / 8.01 (`#922700`) | 8.60 / 9.49 (`#fb9c6b`) |
| rose | 8.67 / 8.30 (`#9b0027`) | 7.62 / 8.42 (`#f58a91`) |

`--ring` против `--background` / `--card` (индикатор ≥ 3):

| Акцент | Light bg / card | Dark bg / card |
| --- | --- | --- |
| blue | 4.95 / 5.17 | 5.33 / 4.83 |
| violet | 5.65 / 5.89 | 5.34 / 4.83 |
| emerald | 5.42 / 5.66 | 7.93 / 7.18 |
| orange | 5.19 / 5.41 | 7.02 / 6.36 |
| rose | 6.69 / 6.99 | 5.31 / 4.81 |

Минимум по всем десяти комбинациям: текст на primary 4.95, hover 5.90,
`primary-text` 6.93, ring 4.81. Свачи в настройках повторяют light-`--primary`,
белая галочка на них: 5.17–6.99.

Что было до правок (аудит): `primary-foreground` = `oklch(0.985 0 0)` на
тёмных primary давал blue 3.63, violet 4.21, emerald 2.36, orange 2.88,
rose 3.60; в светлой теме emerald 3.51, rose 4.32. `ring-ring/50` —
2.01–2.72:1 во всех десяти комбинациях.

### Chart-токены: series / heat / градиенты

Все палитры графиков выводятся из акцента и объявлены в тех же accent-блоках
(blue — в `:root` / `.dark`). Компоненты больше не держат hex:
`src/components/analytics/chart-theme.ts` экспортирует `SERIES_VARS` и
`HEAT_VARS`, то есть только `var(--…)`. Смена `data-accent` перекрашивает SVG
без JS-чтения цвета и без ре-рендера.

- `--chart-series-1..7` — категориальная ramp: hue акцента −30°…+30° шагом
  10°, светлота монотонна 0.56 → 0.44 (light) и 0.66 → 0.78 (dark).
- `--chart-heat-1..4` — однотональная ramp: L 0.60 → 0.39 (light) /
  0.62 → 0.86 (dark). Уровень 4 всегда визуально «сильнее» уровня 1, chroma
  подобрана под gamut sRGB.
- `--chart-1..3` — стопы градиентов (`completion-line`, `average-radial`,
  dashboard-ring). `chart-1` по-прежнему равен `--primary`; `chart-2`/`chart-3`
  на 0.07/0.14 L темнее в light и на столько же светлее в dark, поэтому
  градиент монотонно темнеет (light) или светлеет (dark) к концу.
- `AXIS_TICK.fontSize` — `0.6875rem` вместо `11px`, поэтому при
  `data-density="compact"` (`html { font-size: 93.75% }`) подписи осей
  уменьшаются вместе с интерфейсом.

Контраст к `--card` (`#ffffff` / `#171717`), минимум…максимум по токенам
группы; числа сняты с **собранного** CSS (sRGB-фолбэки Lightning CSS):

| Акцент | Тема | series (7) | heat (4) | chart-1..3 |
| --- | --- | --- | --- | --- |
| blue | light | 4.53–8.43 | 3.97–10.14 | 5.17–9.47 |
| blue | dark | 5.94–8.69 | 4.91–11.76 | 4.83–7.82 |
| violet | light | 4.90–8.75 | 4.06–10.85 | 5.89–10.37 |
| violet | dark | 5.61–8.24 | 4.75–11.56 | 4.83–8.04 |
| emerald | light | 4.47–7.50 | 3.85–9.15 | 5.66–10.51 |
| emerald | dark | 6.02–9.49 | 5.07–12.37 | 7.18–10.71 |
| rose | light | 5.23–8.19 | 4.12–10.47 | 6.99–12.60 |
| rose | dark | 5.22–8.60 | 4.71–11.39 | 4.81–8.00 |
| orange | light | 5.07–7.94 | 4.07–10.15 | 5.41–9.63 |
| orange | dark | 5.31–8.80 | 4.77–11.45 | 6.36–10.16 |

Минимумы: series 4.47 (emerald light) / 5.22 (rose dark), heat 3.85 (emerald
light) / 4.71 (rose dark), chart 4.81 (rose dark) / 5.17 (blue light). Все
палитры — графика, не текст; порог 3:1 выполнен с запасом. Печатный отчёт
графиков не содержит, поэтому `@media print` токены series/heat не
переопределяет.

**Решения по ходу сессии**

- Белый текст в светлой теме оставлен, но `--primary` у emerald (0.596 → 0.50),
  rose (0.586 → 0.48) и orange (0.553 → 0.543) притемнён: это дешевле по
  бренду, чем тёмный текст на зелёной кнопке, и заодно поднимает `--ring`.
  В тёмной теме, наоборот, primary остались пастельными, поэтому текст на
  них — `oklch(0.18 0 0)`.
- В тёмной теме `--primary-text` **светлее** `--primary` (L 0.75–0.78), а не
  темнее, как предполагал бриф: тёмный текст на `--card` (`oklch(0.205 0 0)`)
  не набирает 4.5 ни при каком `--primary`. Брифовое «L ≤ 0.55 в dark» здесь
  дало бы 1.6–2.9:1.
- Введены два новых токена (`--primary-hover`, `--primary-text`) вместо
  переиспользования `--primary` с альфой: альфа-модификаторы не проходят
  контраст в принципе и не выводятся из темы.
- Тёмный violet `--primary` поднят с L 0.606 до 0.64 (белый текст был 4.21 на
  хвосте допустимого); `--chart-1`, `--sidebar-primary`, `--ring` в том же
  блоке идут за ним.
- Orange light проверялся с запасом: при L 0.553 белый текст давал 4.98 —
  слишком близко к порогу с учётом различий gamut mapping между движками,
  поэтому L 0.543 (5.19).

### Period-токены: времена суток (semantic, не accent-driven)

`--period-morning`, `--period-afternoon`, `--period-evening`, `--period-night`
и их `-bg`-варианты (`oklch(… / 15%)`) объявлены во всех десяти блоках
(blue — `:root` / `.dark`, остальные — `[data-accent=…]` /
`.dark[data-accent=…]`), но значения в них **одинаковые**: палитра
семантическая (утро / день / вечер / ночь), акцент её не меняет. Повтор
сохранён по тому же правилу, что и у primary: блок никогда не наследует
чужое значение.

- morning — тёплый янтарь: h 72, L 0.545 (light) / 0.86 (dark), C 0.116 / 0.16
- afternoon — холодный небесно-синий: h 240, L 0.54 / 0.80, C 0.123 / 0.118
- evening — закатный красно-оранжевый: h 38/55, L 0.545 / 0.80, C 0.178 / 0.13
- night — глубокий индиго: h 285, L 0.495 / 0.82, C 0.17 / 0.093
- chroma light-токенов ужата до gamut sRGB, чтобы фолбэк Lightning CSS
  совпадал с тем, что посчитано в таблице.
- Имена идут за union `TimeOfDayPeriod` (`afternoon`, а не `day`), чтобы CSS
  и TypeScript не разъезжались.

Применение: сегменты donut берут `fill` из `PERIOD_META[...].color`
(`var(--period-*)`), а чип легенды — `.period-badge[data-period=…]` из
`globals.css`, который задаёт `background-color: var(--period-*-bg)` и
`color: var(--period-*)`; иконка lucide красится через `currentColor`, поэтому
не нужен ни один inline-стиль. `grep 'style={{[^}]*color'` по
`src/components/analytics` пуст; единственное исключение во всём проекте, где
inline-цвет остаётся законно, — `habit.color` (цвет выбирает пользователь,
он приходит из БД и токеном быть не может; `src/app/analytics/print/page.tsx`).

Контраст снят с **собранного** CSS (sRGB-фолбэки Lightning CSS); фон чипа —
тот же цвет при alpha 0.15, скомпонованный с карточкой в sRGB:

| Период | Light: card / background | Light: иконка на чипе | Dark: card / background | Dark: иконка на чипе |
| --- | --- | --- | --- | --- |
| morning | 5.07 / 4.86 (`#996302`) | 4.17 | 11.74 / 12.26 (`#f7cd3a`) | 8.35 |
| afternoon | 4.99 / 4.78 (`#0276ae`) | 4.05 | 9.81 / 10.25 (`#69caff`) | 7.23 |
| evening | 5.36 / 5.14 (`#c13c01`) | 4.29 | 9.28 / 9.70 (`#fea668`) | 6.95 |
| night | 6.53 / 6.26 (`#5c4cbc`) | 5.23 | 10.07 / 10.53 (`#bdbcff`) | 7.33 |

Минимумы: 4.78:1 для цвета на `--background` (порог текста 4.5) и 4.05:1 для
иконки на тонированном чипе (порог графики 3:1). Было: `#facc15` на белой
карточке — 1.53:1, чип и иконка фактически невидимы. Печатный отчёт графиков
не содержит, поэтому `@media print` period-токены не переопределяет.

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

- **A11y: primary contrast** — All five accents × two themes were audited
  against WCAG 2.1 (OKLCH → sRGB → relative luminance; tables above). Two new
  tokens, `--primary-hover` and `--primary-text`, were added to `@theme inline`
  and to all ten accent blocks (blue lives in `:root` / `.dark`). Dark themes
  now set `--primary-foreground: oklch(0.18 0 0)` (and the matching
  `--sidebar-primary-foreground`) instead of inheriting white, because every
  dark `--primary` is a light pastel (2.36–3.63:1 before). Light emerald, rose
  and orange keep white text but their `--primary` was darkened to L 0.50 /
  0.48 / 0.543 (orange originally cleared the bar at 4.98, but the margin was
  too thin next to browser differences in gamut mapping). Every light accent
  block now also declares `--sidebar-primary-foreground`, so the sidebar logo
  does not depend on what `:root` happens to hold.
  `button.tsx` default hover is now `hover:bg-primary-hover` (was
  `bg-primary/80`, which lightened the button), `variant="link"` uses
  `text-primary-text`, and every `focus-visible:ring-ring/50` became
  `focus-visible:ring-ring` — button, checkbox, calendar day, input, select,
  switch, tabs, field, template gallery and the accent swatch buttons; the base
  `* { @apply outline-ring }` lost its `/50` too. Card-header accent icons
  (`appearance-card`, `settings-client` ×2, `system-card`, `data-card`,
  `language-card`, `export-report-card`, template gallery) moved from
  `text-primary` to `text-primary-text` so they meet 4.5:1 as well. No component
  API changed: `text-primary` is not a variant or prop, only a class string.

- **Print themes: tokens are reset in `@media print`** — The
  `/analytics/print` report renders inside the app shell, so
  `[data-slot="sidebar-inset"]` carries `bg-background`. In the default dark
  theme that is `oklch(0.145 0 0)` while `.report-page *` forces
  `color: #111 !important`, which made the saved PDF unreadable whenever
  "Background graphics" was enabled in the browser dialog (with it off Chrome
  skips the background and the bug stayed hidden). The `@media print` block in
  `src/app/globals.css` now redeclares the light tokens on
  `html, body, [data-slot="sidebar-inset"], .report-page` —
  `--background: #fff`, `--foreground: #111`, `--card`/`--card-foreground:
  #fff`/`#111`, `--popover`/`--popover-foreground: #fff`/`#111`,
  `--border: #d4d4d4`, `--muted: #f5f5f5`, `--muted-foreground: #555`,
  `--primary: #2563eb`, `--primary-foreground: #fff`, `--accent: #f1f5f9`,
  `--accent-foreground: #111`, `--chart-1/2/3: #2563eb/#3b82f6/#1d4ed8` — each
  marked `!important` because `.dark` and `.dark[data-accent="…"]` declare the
  same custom properties on `<html>` with higher specificity. A second rule
  forces `background: #fff` on `html, body, [data-slot="sidebar-inset"], main`,
  because a `bg-background` utility on the element itself wins over the
  inherited custom property. Text color is left to the existing
  `.report-page * { color: #111 !important }` rule. Borders keep
  `#d4d4d4` — the color `.report-table` cells already used — so section rules
  and table gridlines match in both themes. Print contrast (hex → relative
  luminance):

  | Pair | Ratio |
  | --- | --- |
  | `#111` on `#fff` | 18.88:1 |
  | `#111` on `#f5f5f5` | 17.32:1 |
  | `#555` on `#fff` | 7.46:1 |
  | `#555` on `#f5f5f5` | 6.84:1 |
  | `#fff` on `#2563eb` | 5.17:1 |
  | `#d4d4d4` grid line on `#fff` | 1.48:1 (decorative, unchanged) |

  Every text pair clears 4.5:1; the grid-line row is a document rule, not a UI
  control, and deliberately keeps the existing print color so light-theme
  output did not regress.

- **Chart-токены: series/heat, монотонность, accent-driven** — Recharts
  palettes are theme-driven instead of fixed hex. `src/app/globals.css` gained
  `--chart-series-1..7` (accent hue swept −30°…+30° with monotone lightness
  0.56 → 0.44 in light, 0.66 → 0.78 in dark) and `--chart-heat-1..4` (one-tone
  ramp 0.60 → 0.39 light, 0.62 → 0.86 dark) in all ten accent blocks, and
  `--chart-1/2/3` were re-stepped to 0.07 / 0.14 L darker in light and lighter
  in dark so the completion/average/dashboard gradients darken (light) or
  lighten (dark) monotonically. `chart-theme.ts` replaced `SERIES_COLORS` /
  `HEAT_COLORS` with `SERIES_VARS` / `HEAT_VARS` (pure `var(--…)` strings, no
  `any`), so `weekday-bar-chart.tsx` and `year-heatmap.tsx` recolor on accent
  switch with no re-render; `AXIS_TICK.fontSize` went from `11` (px) to
  `"0.6875rem"` so `data-density="compact"` scales axis labels. `TOOLTIP_STYLE`
  and `PERIOD_META` were deliberately left alone (Sessions 5 / 4). Minimum
  contrast on `--card`: series 4.47:1 (emerald light), heat 3.85:1 (emerald
  light), gradients 4.81:1 (rose dark) — all above 3:1.

- **Period-токены + запрет inline color в аналитике** — The time-of-day
  palette moved from hex constants to CSS tokens. `src/app/globals.css` declares
  `--period-morning/afternoon/evening/night` plus `-bg` (`oklch(… / 15%)`) in
  all ten accent blocks; the values are identical everywhere because the
  palette is semantic (parts of the day do not follow the accent) — they are
  still repeated per block so no block can inherit a mismatched colour.
  `PERIOD_META` in `src/components/analytics/time-pattern-charts.tsx` now stores
  `var(--period-*)` and feeds `Cell fill` directly, so the donut recolors on a
  theme switch with no re-render. The legend chip stopped using
  `style={{ backgroundColor: \`${row.color}26\`, color: row.color }}` (which
  AGENTS.md forbids) and became `.period-badge[data-period="…"]` in
  `globals.css` — `background-color: var(--period-*-bg)` plus
  `color: var(--period-*)`, with the lucide icon inheriting `currentColor`.
  The old `#facc15` morning icon measured 1.53:1 on the light card and was
  effectively invisible. Measured minimums (compiled CSS, sRGB): 4.78:1 for
  the colour on `--background` and 4.05:1 for the icon on its tinted chip.
  `grep 'style={{[^}]*color' src/components/analytics` is now empty;
  `year-heatmap.tsx` legend map was renamed to `heatVar` in passing.
  `SERIES`/`HEAT` and `TOOLTIP_STYLE` were left untouched (Sessions 3 / 5).
  Numbers and the full table live above in «Period-токены: времена суток».

- **Tooltip: itemStyle/labelStyle = popover-foreground** — The default Recharts
  tooltip of `completion-line-chart` and `weekday-bar-chart` painted every row
  with `entry.color` and fell back to `#000`
  (`recharts/lib/component/DefaultTooltipContent.js:112`). That colour is either
  a series colour — `var(--chart-series-*)` measures 4.47:1 at worst (emerald
  light, i.e. below the 4.5 text threshold) — or `url(#completionStroke)` for
  the gradient line, which is not a valid CSS colour, so the row silently
  rendered `#000`; on the dark popover (`#171717`) that is **1.17:1**. The
  custom tooltips in `time-pattern-charts` / `long-term-trends-chart` already
  used `text-popover-foreground` and are untouched.
  `chart-theme.ts` now exports `TOOLTIP_PROPS = { contentStyle, itemStyle,
  labelStyle }`; the two charts spread it onto `<Tooltip {...TOOLTIP_PROPS}>`.
  `TOOLTIP_STYLE` keeps exactly its old shape (content box only) because it is
  also used as a raw inline `style` object by both custom tooltips — adding
  `itemStyle`/`labelStyle` keys to it would leak non-CSS props into their DOM
  style attributes. Recharts merges `itemStyle` *after* `entry.color`
  (`{...defaults, color: entry.color || '#000', ...itemStyle}`), so an explicit
  `color` always wins, including for the gradient series — no custom
  `TooltipContent` wrapper is needed. Colours follow
  `--popover-foreground` on `--popover` (identical for all five accents, since
  accent blocks do not override `--popover*`):

  | Theme | `--popover` | `--popover-foreground` | Ratio |
  | --- | --- | --- | --- |
  | light | `#ffffff` | `#0a0a0a` | 19.79:1 |
  | dark | `#171717` | `#fafafa` | 17.16:1 |

  Before the fix the same rows measured 4.47:1 (series, emerald light), 1.17:1
  (`#000` fallback on the dark popover) and 5.22:1 (series, rose dark).
