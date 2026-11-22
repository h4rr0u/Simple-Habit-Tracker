# Contributing

Thanks for your interest in contributing! This is a small local-first project,
so the bar is low: pick an issue or propose an improvement, keep the change
focused, and make sure the checks below pass.

## Setup

Requirements: **Node.js ≥ 22.9** and npm.

```bash
npm install
npm run db:migrate   # create ./data/habit-tracker.db
npm run dev          # http://localhost:3000
```

Optional Telegram bot: copy `.env.example` to `.env`, add your
`TELEGRAM_BOT_TOKEN` from [@BotFather](https://t.me/BotFather), then run
`npm run bot:dev` and `npm run reminders:dev` in separate terminals — or start
everything with `npm run start:all`. The web app works without a token.

## Checks before you open a PR

```bash
npm run test        # unit tests (Vitest)
npx tsc --noEmit    # type checking
npm run lint        # ESLint
npm run build       # production build must succeed
```

All four must pass without errors.

## Testing

- Pure logic lives in `src/lib` and `src/types` and is covered by colocated
  `*.test.ts` files (Vitest). If you change streak, freeze, schedule or
  analytics behavior, add or update tests next to the module.
- UI changes: verify manually in the browser (dark theme is the default).

## How to propose changes

1. Fork the repository and create a branch from the main branch
   (e.g. `fix/heatmap-tz` or `feat/accent-themes`).
2. Keep PRs small and focused — one feature or fix per PR.
3. Describe what changed and why; include screenshots for UI changes.
4. Make sure CI checks (test, tsc, lint, build) pass.

## Code conventions

- Mutations go through **Server Actions** with **Zod** validation, returning
  `{ ok: true, data } | { ok: false, error }`.
- TypeScript: `camelCase` in code, `snake_case` in the database; no `any`.
- Dates: `date-fns`; day keys are ISO `YYYY-MM-DD` local to the user.
- Avoid adding client-side components unless they genuinely need
  interactivity — server components are the default.
