# QA Quest

Learn QA engineering by hunting bugs and designing test coverage. This repository implements the roadmap from [PRD.md](./PRD.md), using an installable mobile web app and earned-credit cosmetics, with a React interface, an Express API, and a persistent SQLite database.

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
- **Regression Roulette:** 15 release and compatibility challenges.
- **Documentation Detective:** 10 challenges about ambiguous and incomplete requirements.
- **Performance Patrol:** 10 metric-based challenges with accessible tables and charts.
- **Skill paths:** complete Bug Hunting level 3 to open Regression, Test Case Arena level 3 to open Documentation, and Regression level 3 to open Performance. Each path then advances sequentially. Daily quests remain a prerequisite exception.
- Earn XP, levels, daily streaks, and achievements. Compare real player results by weekly XP, accuracy, or speed.
- Use **Create account** from your guest profile to keep progress across devices. Sign in with that account on another device to continue.

Challenge examples are original teaching scenarios, not claims of reproduced open-source incidents. Answer explanations and an always-available glossary connect gameplay with practical QA concepts.

## Persistence and architecture

- `src/`: responsive React UI, interactive onboarding, learning hub, challenge player, account forms, achievements, and live leaderboard.
- `server/content.js` and `server/extendedContent.js`: 55 authored curriculum challenges and achievement definitions. Correct answers stay server-side until an attempt is submitted.
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

## Seasons, credits, and tutorials

**Season & cosmetics** offers three exclusive missions each UTC month. Three authored themes rotate every three months; this is a finite content rotation, not an unlimited content generator. Seasonal missions do not award lifetime XP. Complete one, two, and three missions to claim 75, 100, and 150 credits respectively. Claims are unique per month and tier; season rollover preserves prior claims and lifetime progress.

Every permanent curriculum first clear grants 50 credits, including existing completions from before this update. Replays do not grant credits. Buy accent themes with credits and equip an owned theme. Purchases never spend XP or affect competitive results. There are no payments or premium subscriptions.

The Learning hub includes five original silent 30-second videos with English captions and transcripts. Videos are checked into `public/tutorials/` and require no external media service. To regenerate them, install ffmpeg and Python Pillow, then run `node scripts/generate-tutorials.mjs`. Set `QA_TUTORIAL_FONT` to a local TrueType font outside macOS.

## Community and portfolios

- **Friends:** exchange public friend codes, accept/reject requests, remove friends, and compare weekly XP. A sent request does not grant friendship. Emails and internal account IDs are not shared.
- **Head-to-head:** create a match and send its invitation code yourself. Two players mark ready, then receive the same three generated questions after a synchronized countdown. Each has two minutes to submit. Accuracy wins, with server-measured duration breaking ties; exact ties stay ties. Answer explanations appear only after both submissions or the deadline. Unsubmitted players score zero. Matches award no curriculum XP. A disconnected player can reopen a recent match; unsent selections are local to the open panel. Unstarted lobbies expire after fifteen minutes and can be cancelled; finished matches offer a new rematch invitation.
- **Teams:** owners create private teams, rotate seven-day invitation codes, remove members, and transfer ownership. Members can leave after transferring ownership if necessary. Corporate teams use ordinary accounts; there is no enterprise SSO or invoicing.
- **Tournaments:** owners start a one-hour to seven-day tournament. Each distinct challenge cleared during its window earns 100 points. Attempts must begin after the tournament starts and after joining the team. Replays cannot farm points, and removed members lose access and disappear from the active team standings.
- **Portfolio:** select earned achievements and explicitly publish a public page. Paste its link into a portfolio site, or download a JSON summary from the public page. Only display name, level, completion count, and selected achievements are exposed. Revocation immediately removes public access. Downloaded copies cannot be revoked. Achievement summaries can also be copied or downloaded without publication.

The **GitHub Pages demo** supports all learning paths, seasons, cosmetics, videos, and local achievement export. Friends, public portfolio hosting, matches, teams, and tournaments require an API deployment; the demo explains this limitation instead of fabricating shared activity.

## Install on mobile

Use **Install QA Quest** or your browser's install menu. On iOS Safari use Share → Add to Home Screen. The manifest and icons support both the root deployment and the GitHub Pages subpath. This delivers the approved mobile-installable web scope, not native app-store packages.

The service worker caches only an anonymous offline page with a practice prompt. Reconnect to sync progress and submit timed challenges. API responses and account data are never written to Cache Storage. Installation requires HTTPS outside localhost and depends on browser support.

## Persistence and validation of the extension

New tables are created additively on startup; existing profiles, sessions, attempts, and completions remain intact. Reward metadata lives in one transactionally updated per-player record; credits are derived from completions, unique claims, and purchases. New server modules separate rewards, community, teams, and matches. Public mode and season rules are shared with the demo in `shared/`.

The original `quest-complete` achievement still recognizes the original twenty challenges. New achievements recognize each added mode and all 55 curriculum challenges. The content is an authored practice curriculum, not a professional certification or exhaustive advanced/expert training.

Run `npm run lint`, `npm test`, `npm run build`, and `npm run build:pages`. API tests cover friend consent, portfolio revocation, cross-team access, ownership changes, invite expiration, seasonal rollover, replay protection, full-path completion, and match timing/disclosure. Shared community views poll every three seconds while open; the global leaderboard retains its WebSocket invalidations.

All roadmap entries are implemented under the approved mobile-web and earned-currency interpretations. Deployment remains a separate operational step.
