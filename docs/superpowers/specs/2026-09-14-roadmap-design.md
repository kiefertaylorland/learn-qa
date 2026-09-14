# Remaining roadmap delivery design

Status: approved on 2026-09-14. The user selected all remaining phases with a mobile-installable web app and earned-currency cosmetics.

## Existing implementation

The application implements Phase 1 using React, Express, SQLite, and WebSocket leaderboard invalidations. A separate localStorage API powers GitHub Pages. Both contain progression and scoring logic. The PRD's unchecked Phase 1 entries do not reflect the implementation.

Mode definitions and totals currently assume two modes in `src/App.jsx`, `src/demoApi.js`, and `server/app.js`. Content lives in `server/content.js`. Tests include explicit twenty-challenge assertions. These assumptions must be replaced before adding modes. Existing challenge IDs and earned progress must survive the extension.

## Delivery choices

1. Recommended web scope: implement Phases 2–4 as web capabilities, with an installable mobile web app and cosmetics bought with earned credits. This extends the existing stack without requiring payment credentials or app-store distribution. These are explicit interpretations of the mobile and premium roadmap entries, not native apps or paid commerce.
2. Phase 2 first: deliver the two new modes, skill paths, friends, and achievement sharing as a separately validated release. This reduces the first release's size while keeping subsequent phases pending.
3. Literal native and paid scope: deliver the web phases plus native mobile clients and real-money cosmetics. This requires platform, distribution, billing-provider, pricing, and entitlement decisions before those subsystems can be implemented.

## Phase 2: learning and friends

- Add fifteen distinct Regression Roulette levels, with a change description, preserved requirements, observed results, and both regressions and intentional changes as answer choices.
- Add ten Documentation Detective levels covering ambiguous language, contradictory requirements, missing boundaries, error handling, accessibility, authorization, and acceptance criteria. Grade selected findings; any writing scratchpad remains explicitly ungraded.
- Centralize public mode metadata and prerequisite rules in a shared module. Keep answer keys out of the live browser bundle.
- Show a branching skill path with completion counts, prerequisite explanations, and links to the next available challenge. Start regression after foundational bug hunting and documentation after foundational test design. Validate prerequisites server-side, with the existing daily-quest exception explicitly retained.
- Add friend invitations by public profile code, acceptance, rejection, removal, and a friends-only leaderboard. A request alone does not establish friendship. Expose no emails or account identifiers.
- Share earned achievements through user-initiated copy/download actions. Public portfolio sharing is opt-in and revocable.

## Phase 3: performance and engagement

- Add ten Performance Patrol levels with accessible metric tables and accompanying charts. Cover latency distributions, throughput, saturation, memory retention, caching, and load-test interpretation. Include text equivalents for every chart.
- Add deterministic monthly UTC seasons with authored challenge pools and free reward tiers. Store season reward claims uniquely per user, season, and tier. Expired season progress remains readable; rollover does not erase lifetime progress.
- Add a tutorial library with short original captioned instructional clips, transcripts, and links to relevant modes. Video content must be playable before marking this entry complete.
- Add a cosmetics catalog, ownership, equip/reset actions, and preview. In the recommended scope, first clears and season milestones grant credits through a separate ledger; XP is never spent. Purchases atomically debit credits and grant ownership, with duplicate requests returning the existing purchase. Cosmetics never affect score or unlock eligibility.

## Phase 4: mobile and shared play

- Recommended mobile implementation: an installable web app with manifest, icons, responsive navigation, and an offline shell. Do not cache authenticated API responses or accept offline competitive submissions. Clearly show when network access is required. Native distribution remains a separate deliverable if selected.
- Add invite-based two-player matches with a lobby, ready state, synchronized server start, identical challenge sets, deadlines, results, and rematch. Bind attempts to match and participant. Results use server-validated accuracy followed by duration; exact ties remain ties. Prevent replayed submissions and answer disclosure while either player can still submit. Handle cancellation, disconnects, and expiry explicitly.
- Add corporate teams with owner/member roles, expiring join codes, member removal, and ownership transfer. Require membership for roster and tournament access. Tournament results include only eligible attempts within the configured UTC window. Use the existing accounts; enterprise SSO and invoicing are not implied.
- Add an opt-in portfolio page and downloadable achievement summary. Publish only display name, selected achievements, and aggregate learning progress. Revocation makes the public page unavailable. Never expose email, answer history, session data, or private team membership.

## Architecture and persistence

Keep Express and SQLite as the authority for shared play. Introduce focused modules for mode metadata, progression, seasons, friends, cosmetics, matches, teams, and portfolio presentation. Add relational tables with foreign keys, unique reward/purchase constraints, and transactional scoring changes. Startup migrations are additive and preserve existing users, completions, and sessions.

Retain same-origin mutation checks, secure session cookies, bounded request bodies, parameterized SQL, authentication throttles, and authorization on every new object route. WebSocket events invalidate authorized views; they do not carry answer keys or private global state. Reconnects retrieve current state from authenticated endpoints.

The Pages demo supports learning content, skill paths, seasons, tutorials, and local cosmetics. It must explicitly label unavailable cross-device friends, multiplayer, teams, and public profiles and explain that they require the API deployment. Do not simulate real opponents or claim local browser data is shared.

## Delivery order and acceptance

1. Replace hard-coded mode assumptions; validate existing progress and scoring unchanged.
2. Deliver Phase 2 content and paths, then friend workflows and sharing.
3. Deliver performance content, seasons, video assets, and cosmetics.
4. Deliver mobile installation, matches, teams/tournaments, and portfolio publishing.
5. Reconcile each roadmap checkbox against verified functionality and document any chosen scope substitutions.

For each subsystem, add meaningful tests for success, invalid input, unauthorized access, repeated actions, and relevant time boundaries. Specifically cover prerequisite bypass, friendship consent, season rollover, duplicate rewards/purchases, match answer leakage, cross-team access, and portfolio revocation. Run `npm run lint`, `npm test`, `npm run build`, and `npm run build:pages`. Check the UI in desktop and mobile sizes, keyboard navigation, API restart persistence, and the browser-only demo. Installation and multiplayer require actual browser verification before completion claims.

## Approved scope

The user selected all remaining phases with the recommended mobile-web and earned-credit interpretations. See the implementation plan and validation report for delivered behavior and tested boundaries.
