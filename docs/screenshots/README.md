# Screenshots

Images in this folder are captured from the bundled demo dataset, so they can be
reproduced at any time.

## Regenerating the demo data

```bash
npm run db:seed:demo          # writes ./data/demo.db (never touches the real DB)
DATABASE_URL=./data/demo.db npm run dev
```

The seeder in `scripts/seed-demo.ts` is deterministic: 12 habits with ~8 months
of history, streaks, slumps, partial quantitative days and reminders. Running it
again resets `data/demo.db` and reproduces the same rows and ids.

It also writes the freeze bookkeeping (`freezeState` in the `settings` table) and
the matching `habits.freeze_bank` balances, so the ❄️ counters show realistic
spent/available freezes instead of zeroes on first page load.

## Capturing the screenshots

Run the app against the demo database, then capture these views with the English
UI (dark theme, 1920 px wide, device scale factor 2 → 3840 px PNG files):

| File               | URL                    | Height |
| ------------------ | ---------------------- | ------ |
| `dashboard.png`    | `/`                    | 1192   |
| `habits.png`       | `/habits`              | 680    |
| `habit-detail.png` | `/habits/1`            | 466    |
| `analytics.png`    | `/analytics?period=90` | 1171   |
| `settings.png`     | `/settings`            | 2215   |

Heights are fitted to the rendered content: measure the page, then use the
largest visible element bottom (plus a small margin) so a short page is not
padded with empty space.

Let the page settle (fonts + chart animations) before capturing, otherwise the
Recharts panels render empty. Headless Edge/Chrome works well:

```bash
msedge --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=2 --window-size=1920,1171 \
  --virtual-time-budget=11000 \
  --screenshot=docs/screenshots/analytics.png \
  "http://localhost:3000/analytics?period=90"
```
