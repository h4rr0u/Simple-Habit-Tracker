# Habit Tracker

A local-first habit tracker with flexible schedules, soft streaks and an optional
Telegram bot. Everything runs on your machine: SQLite storage, no accounts, no cloud.

![License](https://img.shields.io/badge/license-MIT-green)
![Node](https://img.shields.io/badge/node-%E2%89%A522.9-blue)

## Features

- **Four habit types** — binary, quantitative, negative and timed (see below).
- **Flexible schedules** — every day, N times per week, specific weekdays, or every N days.
- **Soft streaks with freezes** — a missed day can spend a "freeze" instead of resetting the streak.
- **Analytics** — completion line chart, weekday bars, year heatmap.
- **Telegram bot** — quick check-ins from your phone plus scheduled reminders.
- **Appearance settings** — accent colors, compact/comfortable density, dark theme by default.
- **JSON backups** — one-click export/import of all data for backups and migration.

## Screenshots

> TODO: add real screenshots. Drop PNGs into `docs/screenshots/` with these names.

| Dashboard                                                        | Habit detail                                                        | Analytics                                                        |
| ---------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------- |
| ![Dashboard](docs/screenshots/dashboard.png)                     | ![Habit detail](docs/screenshots/habit-detail.png)                  | ![Analytics](docs/screenshots/analytics.png)                     |

## Tech stack

Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 + shadcn/ui · SQLite
(better-sqlite3, WAL) + Drizzle ORM · Recharts · grammY + node-cron.

## Getting started

Requirements: **Node.js ≥ 22.9** and npm.

### Quick start — one command for everything

```bash
git clone <repository-url>
cd habit-tracker
npm install
npm run db:migrate   # create the SQLite database in ./data
npm run start:all    # web (+ optional bot & reminders) in one terminal
```

`npm run start:all` launches the whole stack in a single terminal (on Windows
you can also just double-click `start.bat`). The launcher reads `.env` and
decides what to start:

- **Without Telegram** — leave `TELEGRAM_BOT_TOKEN` empty (or don't create a
  `.env` at all). The launcher prints a yellow warning and runs only the web
  app at http://localhost:3000. The tracker works, just without reminders.
- **With Telegram** — copy `.env.example` to `.env` and fill in
  `TELEGRAM_BOT_TOKEN=...`. The launcher then also starts the bot and the
  reminder cron.

Output is prefixed with colored tags so one terminal stays readable:
`[web]`, `[bot]`, `[cron]`. `Ctrl+C` (or closing the window) stops every
process the launcher started.

Prefer separate terminals? The individual scripts still work as before:
`npm run dev`, `npm run bot:dev`, `npm run reminders:dev`.

The database is created on first migrate; no other configuration is required.
The web app itself never needs a Telegram token — the bot is fully optional.

## Habit types

| Type             | Meaning                                      | Check-in                                                        |
| ---------------- | -------------------------------------------- | --------------------------------------------------------------- |
| **Binary**       | Simple done / not done (e.g. meditate)        | Toggle done                                                     |
| **Quantitative** | Count towards a target (e.g. 8 glasses)       | Enter a number; optional target value + unit                    |
| **Negative**     | Something to avoid (e.g. no smoking)          | A check-in marks a slip                                         |
| **Timed**        | Time spent towards a goal (e.g. 30 min)       | Enter minutes; stored as seconds, optional target               |

Each habit gets its own schedule (days of the week and/or times), color and a
freeze bank.

## Streaks & freezes

Streaks are **soft**:

- A streak counts consecutive **scheduled** days with a completion (for
  quantitative/timed habits the recorded value must meet the target).
- A missed scheduled day normally resets the streak — unless the habit has a
  **freeze** available. A freeze covers the gap: the streak is preserved but
  does not grow.
- Every habit accrues **1 freeze per month** (on the 1st, starting the month
  after creation), with a hard cap of **2** in the bank, so freezes never pile
  up. The current balance is shown on the dashboard and habit pages.

## Telegram bot (optional)

1. Open [@BotFather](https://t.me/BotFather) in Telegram and send `/newbot`.
2. Choose a display name, then a username ending in `bot` (e.g. `my_habits_bot`).
3. Copy the token BotFather gives you.
4. Put it into `.env` (copy `.env.example` to `.env` first):
   ```
   TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
   ```
5. Start everything with the launcher — or run the two processes separately:
   ```bash
   npm run start:all      # web + bot + reminders in one terminal
   # or, in separate terminals:
   npm run bot:dev        # long polling bot
   npm run reminders:dev  # cron that sends due reminders every minute
   ```
6. Send `/start` to your bot — the chat binds automatically. Bot commands:
   - `/today` — today's habits with quick check-in buttons;
   - `/cancel` — abort a value input.

Check-ins made in the bot are written to the same SQLite database, so they
appear in the web interface immediately.

Reminders only fire while the habit is still unchecked for the day, and the
`reminder_log` table guarantees each reminder is sent at most once per day,
even across process restarts.

## Backups

In **Settings → Data** you can export everything (habits, check-ins, reminders,
settings) to a single JSON file and import it back later. Import **replaces**
the current database contents, so keep the exported file safe. This is also
the way to move your data between machines.

## Scripts

| Command                | What it does                                    |
| ---------------------- | ----------------------------------------------- |
| `npm run dev`          | Web app (Next.js dev server)                     |
| `npm run start:all`    | Everything at once: web + bot + reminders (single terminal, Ctrl+C stops all) |
| `npm run build`        | Production build                                 |
| `npm run start`        | Serve the production build                       |
| `npm run test`         | Run unit tests (Vitest)                          |
| `npm run lint`         | ESLint                                           |
| `npm run db:migrate`   | Apply Drizzle migrations to the SQLite database  |
| `npm run db:studio`    | Open Drizzle Studio                              |
| `npm run bot:dev`      | Telegram bot (long polling)                      |
| `npm run reminders:dev`| Reminder cron (checks due reminders every minute) |

## Project structure

```
src/
  app/        # Next.js pages (dashboard, habits, analytics, settings)
  actions/    # Server Actions (Zod-validated mutations)
  components/ # UI components (shadcn/ui based)
  db/         # Drizzle schema + queries
  lib/        # Pure logic: streaks, freezes, schedules, analytics
  types/      # Shared types
  bot/        # Telegram bot (grammY)
scripts/      # Standalone processes (reminder cron, dev launcher start.mjs)
drizzle/      # SQL migrations
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) — short version: run `npm run test`,
`npx tsc --noEmit` and `npm run lint` before opening a pull request.

## License

[MIT](LICENSE)
