# QA Quest

Learn QA engineering by hunting bugs and designing test coverage. This repository implements the **Phase 1 MVP** from [PRD.md](./PRD.md), with a React interface, an Express API, and a persistent SQLite database.

## Live demo

GitHub Pages publishes a browser-only demo at **https://kiefertaylorland.github.io/learn-qa/**.

The Pages build uses local browser storage instead of the Express API, so progress, accounts, and leaderboard activity stay on the device running the demo.

## Run locally

Requires **Node.js 22.13+** and npm. SQLite uses Node’s built-in `node:sqlite` module; an experimental warning is expected on Node 22.

```sh
npm ci
```

Start the API and frontend in two terminals:

```sh
npm run server
```

```sh
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` and `/live` to the API on port 3001. Use the displayed Vite port if 5173 is already occupied. The API must be running for accounts and gameplay to work.

## Play

- **Start your first quest** creates a guest profile without asking for an email.
- Complete the short interactive tutorial, then find all issues or select all required test cases before time runs out.
- **Bug Hunting:** 10 code-based levels covering boundaries, validation, arithmetic, mutation, security concepts, and asynchronous behavior.
- **Test Case Arena:** 10 guided coverage challenges. An optional scratchpad helps you draft preconditions, steps, and expected results; the selected coverage options, not the scratchpad, are graded.
- Each mode unlocks sequentially. Replays provide practice without farming first-clear XP.
- The **daily quest** is the same for everyone on a given UTC date, can introduce any level, and awards a once-per-day bonus.
- Earn XP, levels, daily streaks, and achievements. Compare real player results by weekly XP, accuracy, or speed.
- Use **Create account** from your guest profile to keep progress across devices. Sign in with that account on another device to continue.

Challenge examples are original teaching scenarios, not claims of reproduced open-source incidents. Answer explanations and an always-available glossary connect gameplay with practical QA concepts.

## Persistence and architecture

- `src/`: responsive React UI, interactive onboarding, learning hub, challenge player, account forms, achievements, and live leaderboard.
- `server/content.js`: 20 authored challenges and achievement definitions. Correct answers stay server-side until an attempt is submitted.
- `server/app.js`: authentication, progression, deterministic UTC scheduling, server-timed scoring, SQLite persistence, and WebSocket leaderboard notifications.
- `server/index.js`: HTTP server entry point and shutdown handling.
- `server/tests/`: Node test-runner unit/integration coverage.

The database defaults to `data/quest.sqlite`. Keep the data directory on a persistent volume and back it up; deleting it deletes accounts and progress. Runtime data and `.env` files are ignored by Git. The backend is authoritative; localStorage caches only progress and tutorial preferences, never credentials or session tokens. Offline cached progress is not an offline scoring mode. Sessions expire after 30 days; a guest without an upgraded account cannot recover progress after losing their session.

XP and leaderboard results are computed from persisted attempts and reward events, not client-supplied scores. First-clear rewards incorporate difficulty, speed, and consistency. Level is `floor(total XP / 500) + 1`. Streaks and weekly rankings use UTC; weeks begin Monday. Stored attempt data supports aggregate completion and accuracy statistics without a third-party analytics service.

## Validation

```sh
npm run lint
npm test
npm run build
```

The tests use isolated temporary SQLite databases and ephemeral HTTP ports. They do not modify real player data.

## Production

```sh
npm ci
npm run build
APP_ORIGIN=https://qa.example.com DATA_DIR=/var/lib/qa-quest npm start
```

The API serves `dist/` in production. Terminate **HTTPS** at a trusted reverse proxy and forward WebSocket upgrades for `/live`. Production session cookies use `Secure`, `HttpOnly`, `SameSite=Strict`, and the `__Host-` prefix; do not serve a production deployment over plain HTTP.

Configuration is read from the process environment (there is no automatic `.env` loader):

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | API/production HTTP port |
| `HOST` | `0.0.0.0` | Listening address |
| `DATA_DIR` | `./data` | Persistent SQLite directory |
| `APP_ORIGIN` | Request origin derived from host | Exact allowed browser origin; set explicitly behind a reverse proxy |
| `NODE_ENV` | Development | `production` enables secure cookies and built frontend serving |

Use a single application instance with local SQLite storage. Before operating a public service at scale, add operational monitoring, backup/restore procedures, verified email/password recovery, distributed rate limiting, and a deployment-specific accessibility and security audit. This MVP does not provide email verification or password reset.

## Scope and roadmap

Delivered: both Phase 1 modes (10 levels each), basic achievements, daily challenge, weekly leaderboard with live updates, accounts/guest onboarding, server-synced progress, a glossary, learning feedback, and keyboard-friendly responsive layouts.

Later PRD phases remain future work: Regression Roulette, Documentation Detective, Performance Patrol, skill trees, friend/social features, seasons, video tutorials, optional premium cosmetics, mobile apps, multiplayer, and corporate accounts. The finite MVP content does not yet supply the full advanced/expert curriculum. No payments, push notifications, fabricated competitors, or external telemetry are included.
