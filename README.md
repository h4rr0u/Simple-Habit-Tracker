[🇬🇧 English](README.md) | [🇷🇺 Русский](README.ru.md)

# Habit Tracker

A local-first habit tracker with flexible schedules, soft streaks and an optional
Telegram bot. Everything runs on your machine: SQLite storage, no accounts, no cloud.

[![Build passing](https://github.com/h4rr0u/habit-tracker/actions/workflows/ci.yml/badge.svg?label=build)](https://github.com/h4rr0u/habit-tracker/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
![Node](https://img.shields.io/badge/node-%E2%89%A522.9-blue)

## Features

- **Four habit types** — binary, quantitative, negative and timed.
- **Flexible schedules** — every day, N times per week, specific weekdays, or every N days.
- **Soft streaks with freezes** — a missed day can spend a "freeze" instead of resetting the streak.
- **Analytics** — completion line chart, weekday bars and a year heatmap.
- **Telegram bot** — quick check-ins from your phone plus scheduled reminders.
- **Appearance settings** — accent colors, compact/comfortable density, dark theme by default.
- **JSON backups** — one-click export/import of all data for backups and migration.
- **English and Russian UI** — switch the language in Settings at any time.

## Screenshots

Captured from the bundled demo dataset (`npm run db:seed:demo`).

| Dashboard                                          | Habits                                   |
| -------------------------------------------------- | ---------------------------------------- |
| ![Dashboard](docs/screenshots/dashboard.png)       | ![Habits](docs/screenshots/habits.png)   |

| Habit detail                                          | Analytics                                    |
| ----------------------------------------------------- | -------------------------------------------- |
| ![Habit detail](docs/screenshots/habit-detail.png)    | ![Analytics](docs/screenshots/analytics.png) |

## Tech stack

Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 + shadcn/ui · SQLite
(better-sqlite3, WAL) + Drizzle ORM · Recharts · grammY + node-cron.

## Installation for beginners

You do **not** need to be a programmer or use a terminal. The first launch takes
2–3 minutes because the app downloads and configures everything automatically.

### Step 1. Install Node.js

Node.js is the free runtime the tracker needs.

1. Open <https://nodejs.org/en>.
2. Click the big **LTS** button — this is the stable version (22 or newer). The
   **Current** version also works, but LTS is safer.
3. Run the downloaded installer and keep clicking **Next** until it finishes.
   You do not need to change any checkboxes.

### Step 2. Download the project

1. On the project page on GitHub, click the green **Code** button → **Download ZIP**.
2. Extract the archive into a convenient folder.
   Important: extract it first — do not run the tracker directly from the ZIP file.

### Step 3. (Optional) Connect the Telegram bot

The web app works without this step; you just won't get Telegram reminders.

1. In the project folder, find the file `.env.example`.
2. Rename it to `.env` — remove `.example` from the end of the name.
   If Windows hides file extensions, enable them in Explorer: **View** →
   **Show** → **File name extensions**.
3. Open Telegram, find [@BotFather](https://t.me/BotFather) and send `/newbot`.
4. Choose a bot name and a username ending in `bot`. BotFather will reply with a
   token — a long string like `123456789:ABC-DEF...`.
5. Open the new `.env` file (double-click it to open Notepad) and paste the token
   into the `TELEGRAM_BOT_TOKEN=` line:

   ```
   TELEGRAM_BOT_TOKEN=123456789:ABC-DEF...
   ```

6. Save the file (**Ctrl+S**) and close Notepad.

Later, send `/start` to your bot to link the chat.

### Step 4. Start the tracker

Double-click **`start.bat`** in the project folder.

- On the first launch you will see "Installing dependencies, this may take a
  couple of minutes..." — wait 2–3 minutes and do not close the window.
- The launcher then creates the database and starts the tracker.
- When you see `[web]` lines in the window, open **<http://localhost:3000>** in
  your browser.

The black console window is the tracker's engine. While it is open, the tracker
is running; closing the window (or pressing `Ctrl+C`) stops it. Next time just
double-click `start.bat` again — startup will be much faster.

If something goes wrong, the window stays open and shows the error text so you
can read or copy it before closing.

### What `start.bat` does

1. Checks that Node.js is installed and tells you where to download it if not.
2. Runs `npm install` if the `node_modules` folder is missing.
3. Runs `npm run db:migrate` if `data\habit-tracker.db` does not exist yet.
4. Runs `npm run start:all` — the web app, plus the bot and reminders when a
   Telegram token is configured.
5. Keeps the window open (`pause`) on failure so you can read the error.

### Troubleshooting

- **"Node.js not found"** — install Node.js (Step 1) and run `start.bat` again.
- **The window flashed and closed** — run `start.bat` again. On errors it now
  stays open and shows the message; copy it into a GitHub issue.
- **Port 3000 is busy** — close another tracker window or the program using that
  port, then start again.
- **No Telegram reminders** — make sure the file is named exactly `.env` (not
  `.env.txt`) and that `TELEGRAM_BOT_TOKEN` is filled in.

### Where the data lives

Everything is stored locally in `data\habit-tracker.db` — no accounts and no
cloud. To make a backup, open **Settings → Data** and export a JSON file.

## Telegram bot (optional)

1. Open [@BotFather](https://t.me/BotFather) in Telegram and send `/newbot`.
2. Choose a display name, then a username ending in `bot` (e.g. `my_habits_bot`).
3. Copy the token BotFather gives you.
4. Put it into `.env` (copy `.env.example` to `.env` first):

   ```
   TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
   ```

5. Start everything with the launcher — or run the processes separately:

   ```bash
   npm run start:all      # web + bot + reminders in one terminal
   # or, in separate terminals:
   npm run bot:dev        # long-polling bot
   npm run reminders:dev  # cron that sends due reminders every minute
   ```

6. Send `/start` to your bot — the chat binds automatically and an inline menu
   appears. Commands:
   - `/today` — today's habits with quick check-in buttons;
   - `/cancel` — cancel a value input;
   - `/language` — switch the bot language (English / Russian);
   - `/support` — support the author (only when `DONATION_URL` is set).

Telegram does not accept `http://localhost:3000` as an inline-button URL, so the
"Open web version" button first shows the address as a text link. Set
`WEB_APP_URL` to a publicly reachable address (for example an ngrok tunnel) to
turn it into a real link button.

Check-ins made in the bot are written to the same SQLite database, so they appear
in the web interface immediately.

Reminders only fire while the habit is still unchecked for the day, and the
`reminder_log` table guarantees each reminder is sent at most once per day, even
across process restarts.

## Backups

In **Settings → Data** you can export everything (habits, check-ins, reminders,
settings) to a single JSON file and import it back later. Import **replaces** the
current database contents, so keep the exported file safe. This is also the way
to move your data between machines.

## Settings

### Donation link (optional)

Set `DONATION_URL` in `.env` to show a support card at the bottom of Settings and
a **Support** button in the bot's `/support` reply. Leave it empty to hide both.

### Launch at Windows startup

In **Settings → System**, the "Launch at computer startup" switch makes the
tracker start automatically when you log into Windows.

- The switch adds one entry to **your user's** registry
  (`HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run`, name
  `Habit Tracker`) — no administrator rights and no system-wide changes.
- Turn it off in the same place or via **Task Manager → Startup apps**.
- At boot the tracker starts in the background without a console window (via the
  hidden `start-hidden.vbs` launcher) and is available at
  [http://localhost:3000](http://localhost:3000).

## For developers

Requirements: **Node.js ≥ 22.9** and npm.

```bash
git clone https://github.com/h4rr0u/habit-tracker.git
cd habit-tracker
npm install
npm run db:migrate   # create the SQLite database in ./data
npm run dev          # http://localhost:3000 (web only)
# or everything at once (web + bot + reminders in one terminal):
npm run start:all
```

The launcher reads `.env` and decides what to start:

- **Without Telegram** — leave `TELEGRAM_BOT_TOKEN` empty (or don't create a
  `.env` at all). The launcher prints a warning and runs only the web app.
- **With Telegram** — copy `.env.example` to `.env` and fill in
  `TELEGRAM_BOT_TOKEN=...`. The launcher then also starts the bot and the
  reminder cron.

Output is prefixed with colored tags so one terminal stays readable: `[web]`,
`[bot]`, `[cron]`. `Ctrl+C` (or closing the window) stops every process started
by the launcher.

Prefer separate terminals? Use `npm run dev`, `npm run bot:dev` and
`npm run reminders:dev`.

The web app never needs a Telegram token — the bot is fully optional.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the checks to run before a PR
(`npm run test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`).

## Habit types

| Type             | Meaning                                | Check-in                                      |
| ---------------- | -------------------------------------- | --------------------------------------------- |
| **Binary**       | Simple done / not done (e.g. meditate) | Toggle done                                   |
| **Quantitative** | Count towards a target (e.g. 8 glasses)| Enter a number; optional target value + unit  |
| **Negative**     | Something to avoid (e.g. no smoking)   | A check-in marks a slip                       |
| **Timed**        | Time spent towards a goal (e.g. 30 min)| Enter minutes; stored as seconds, optional target |

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

## Scripts

| Command                 | What it does                                                          |
| ----------------------- | --------------------------------------------------------------------- |
| `npm run dev`           | Web app (Next.js dev server)                                          |
| `npm run start:all`     | Everything at once: web + bot + reminders (Ctrl+C stops all)          |
| `npm run build`         | Production build                                                      |
| `npm run start`         | Serve the production build                                            |
| `npm run test`          | Run unit tests (Vitest)                                               |
| `npm run lint`          | ESLint                                                                |
| `npm run db:migrate`    | Apply Drizzle migrations to the SQLite database                       |
| `npm run db:seed:demo`  | Build a realistic demo database at `./data/demo.db`                   |
| `npm run db:studio`     | Open Drizzle Studio                                                   |
| `npm run bot:dev`       | Telegram bot (long polling)                                           |
| `npm run reminders:dev` | Reminder cron (checks due reminders every minute)                     |

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

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) — short
version: run `npm run test`, `npx tsc --noEmit`, `npm run lint` and
`npm run build` before opening a pull request.

## License

[MIT](LICENSE)
