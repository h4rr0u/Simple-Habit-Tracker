# Screenshots

Images in this folder are captured from the bundled demo dataset, so they can be
reproduced byte-for-byte at any time.

## Regenerating the demo data

```bash
npm run db:seed:demo          # writes ./data/demo.db (never touches the real DB)
DATABASE_URL=./data/demo.db npm run dev
```

The seeder in `scripts/seed-demo.ts` is deterministic: 12 habits with ~8 months
of history, streaks, slumps, partial quantitative days and reminders. Running it
again resets `data/demo.db` and reproduces the same rows and ids.

## Capturing the screenshots

Run the app against the demo database, then capture these views (dark theme,
1440 px wide, device scale 1):

| File              | URL                      | Viewport  |
| ----------------- | ------------------------ | --------- |
| `dashboard.png`   | `/`                      | 1440×1250 |
| `habits.png`      | `/habits`                | 1440×1300 |
| `habit-detail.png`| `/habits/7`              | 1440×760  |
| `analytics.png`   | `/analytics?period=90`   | 1440×1450 |

Headless Edge/Chrome works well:

```bash
msedge --headless=new --disable-gpu --hide-scrollbars \
  --window-size=1440,1450 --virtual-time-budget=11000 \
  --screenshot=docs/screenshots/analytics.png \
  "http://localhost:3000/analytics?period=90"
```
