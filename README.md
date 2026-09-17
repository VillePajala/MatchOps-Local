<div align="center">
  <img src="public/logos/app-logo-yellow.png" alt="MatchOps-Local Logo" width="200"/>
</div>

# MatchOps-Local

**Local-first soccer & futsal coaching PWA with optional cloud sync — your data, your choice.**

[![License](https://img.shields.io/badge/license-All_Rights_Reserved-red.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue.svg)](https://reactjs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Cloud_Backend-3ECF8E.svg)](https://supabase.com/)
[![Tests](https://img.shields.io/badge/tests-6615+-green.svg)](#testing)
[![PWA](https://img.shields.io/badge/PWA-Enabled-5a0fc8.svg)](https://web.dev/progressive-web-apps/)
[![Privacy](https://img.shields.io/badge/Privacy-No_Tracking-green.svg)](#)

MatchOps-Local is built for coaches who need privacy, offline reliability, and soccer-specific workflows. Start locally with zero setup, or enable cloud sync to access your data across devices.

- **Local mode**: All data on-device (IndexedDB) — works offline, no account needed
- **Cloud mode**: Optional Supabase backend for cross-device sync with local-first caching
  - **Note**: the Google Play build is distributed **cloud-only** (Play Store users sign in; cloud mode required). Local mode is available in the web/PWA version.
- **Auth**: Email/password authentication via Supabase Auth
- **Performance**: Sub-second operations with IndexedDB + React Query caching
- **PWA**: Installable, full offline support, auto-update detection
- **Purpose-built**: Match prep, live tracking, post-game analysis for soccer and futsal

---

## Features

Grouped the way a coach meets them: before the match, during it, and after.

### Before the match
- Master player pool shared across teams, with multiple team rosters
- Seasons, tournaments and tournament series, with 34 Finnish league presets
- **Playing-Time Planner** — plan rotations and minutes across a run of games, with balance and lineup views
- **Guided setup** — a one-minute first-run wizard (team, game format, age group) plus an in-app tour
- **Rules & formats directory** — official playing formats by age group, with a nudge at game creation when the chosen formation disagrees with the age group's official format
- Personnel (coaches, physios, managers) assigned per game
- Formation presets (4-4-2, 4-3-3, 3-5-2 and more) and a warm-up plan
- Bilingual throughout: English and Finnish

### During the match
- Interactive soccer/futsal field with player drag-and-drop
- Match clock with configurable periods and sub-intervals, plus substitution alerts
- Event logging: goals, assists, opponent events, notes
- **Overtime and penalty shootouts**
- **Per-game captain** — captaincy rotates in youth football, so it belongs to the match, not the team
- Tactics board with drawings, discs and ball placement
- Full undo/redo, and a wake-lock so the screen stays on
- **Voice notes** (experimental) — dictate observations mid-match and write them up afterwards

### After the match
- **Finish-game checklist** — what is still missing from the record, with a route to each part
- **Positions played** per player, cloud-synced and sport-aware
- Per-player appearance, goal, assist and playtime stats, filterable by season, tournament, team or date range
- **Player summary (Pelaajakooste)** and a shareable game recap
- **Taso match report** — the squad, result and every goal laid out in the order Palloliitto's electronic match report asks for them, so filing it is copying rather than recall
- Excel export via SheetJS
- Structured player assessments — **off by default** since 2026-09-09: rating children after every match proved to be the wrong form, and the feature stays available for anyone who wants it rather than being pushed at everyone

### Sync & accounts
- Optional Supabase cloud backend for cross-device access
- Local-first sync: work offline, changes sync when the connection returns
- SyncQueue persisted in IndexedDB, with retry and backoff
- Bidirectional migration: local-to-cloud and cloud-to-local
- Email/password sign-up and sign-in
- Account deletion with full data removal, on device and in the cloud (GDPR)
- Re-consent flow for updated terms and privacy policy

### Data management
- Full backup and restore (JSON export/import), plus automatic restore points
- Individual game import/export
- **Opponent name normalisation** — one opponent spelled three ways still counts as one, with a sweep tool for the rest
- Automatic IndexedDB migration from legacy localStorage
- Orphan detection and repair during cloud sync

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.3, App Router |
| UI | React 19.2, TypeScript 5, Tailwind CSS 4 |
| State | React Query 5, useReducer, useState |
| Local Storage | IndexedDB via custom adapter (`src/utils/storage.ts`) |
| Cloud Backend | Supabase (PostgreSQL + Auth + Edge Functions) |
| Sync | SyncQueue + SyncEngine (IndexedDB-persisted operation queue) |
| i18n | i18next 25 (English/Finnish) |
| Testing | Jest 30, React Testing Library |
| Error Monitoring | Sentry 10 (production only) |
| PWA | Custom service worker, dynamic manifest generation |
| Deployment | Vercel |

---

## Architecture

```
src/
├── app/                    # Next.js App Router (page.tsx is main orchestrator)
├── auth/                   # Auth implementations
│   ├── LocalAuthService    #   No-op for local mode
│   └── SupabaseAuthService #   Supabase Auth wrapper
├── components/             # 100+ React components
├── config/                 # App configuration (backend, query keys, limits)
├── contexts/               # React contexts (Auth, Modal, Toast, Premium)
├── datastore/              # Data layer implementations
│   ├── LocalDataStore      #   IndexedDB (offline, no account)
│   ├── SupabaseDataStore   #   Supabase PostgreSQL (cloud)
│   ├── SyncedDataStore     #   Local-first wrapper (local + cloud sync)
│   └── factory             #   Mode-aware singleton factory
├── hooks/                  # 50 custom hooks
├── interfaces/             # DataStore, AuthService contracts
├── sync/                   # Background sync engine
│   ├── SyncQueue           #   Persistent operation queue (IndexedDB)
│   ├── SyncEngine          #   Background processor with retry
│   └── createSyncExecutor  #   Entity-specific sync operations
├── styles/                 # Shared style constants
├── types/                  # TypeScript type definitions
└── utils/                  # Utilities (storage, retry, logger, etc.)

supabase/
├── functions/              # Edge Functions
│   ├── verify-subscription #   Play Store billing verification
│   ├── delete-account      #   GDPR account + data deletion
│   └── _shared/            #   Shared utilities (CORS)
└── migrations/             # 47 PostgreSQL migrations with RLS
```

### Data Flow

The app uses a **dual-mode architecture** selected at first launch:

- **Local mode**: `LocalDataStore` reads/writes IndexedDB directly. Zero network, zero auth.
- **Cloud mode**: `SyncedDataStore` wraps both `LocalDataStore` and `SupabaseDataStore`. Writes go to local first (instant), then queue for cloud sync via `SyncEngine`. Reads come from local cache, refreshed from cloud periodically.

All data access goes through the `DataStore` interface (`src/interfaces/DataStore.ts`), accessed via `getDataStore()` factory. Components never interact with storage directly.

### Database

PostgreSQL on Supabase with Row-Level Security on all tables. Key tables: `players`, `teams`, `seasons`, `tournaments`, `games` (with `game_players`, `game_events`, `game_personnel` child tables), `personnel`, `player_adjustments`, `team_rosters`, `user_settings`, `warmup_plans`, `user_consents`, `subscriptions`.

Game saves use an RPC (`save_game_with_relations`) for atomic multi-table writes with optimistic locking.

---

## Quick Start

**Prerequisites:** Node 22.x, npm

```bash
git clone https://github.com/VillePajala/MatchOps-Local.git
cd MatchOps-Local
npm install
cp .env.example .env.local   # configure as needed (see below)
npm run dev                   # http://localhost:3000
```

Production build:

```bash
npm run build    # generates manifest, service worker, changelog
npm run start
```

## Environment Variables

Copy `.env.example` to `.env.local`:

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | For cloud mode | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | For cloud mode | Supabase anon/public key |
| `NEXT_PUBLIC_SENTRY_DSN` | No | Sentry DSN for error reporting |
| `SENTRY_AUTH_TOKEN` | No | Sentry auth for source map uploads |
| `ANALYZE` | No | `true` to enable bundle analyzer |
| `NEXT_PUBLIC_MOCK_BILLING` | Dev only | Mock Play Store billing (never in production) |

Local mode requires no environment variables at all.

---

## Development

### Key Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build (manifest + service worker + changelog) |
| `npm run lint` | ESLint |
| `npm run type-check` | TypeScript type checking |
| `npm test` | Run all Jest tests |
| `npm run test:unit` | Unit tests only (`src/`) |
| `npm run test:integration` | Integration tests (`tests/integration/`) |
| `npm run test:critical` | Core workflow tests (CI gate) |
| `npm run test:smoke` | Component smoke tests (CI gate) |
| `npm run test:a11y` | Accessibility tests |
| `npm run test:performance` | Performance benchmarks |
| `npm run test:ci` | Full CI suite with bail-on-first-failure |
| `npm run build:analyze` | Bundle analysis (outputs to `.next/analyze/`) |
| `npm run e2e` | Playwright end-to-end tests |
| `npm run generate:i18n-types` | Regenerate i18n TypeScript types |

### Testing

6,600+ tests across 346 suites. Configuration in `jest.config.js`:

- `detectOpenHandles: true` — catches resource leaks
- `testTimeout: 30000` — 30s default
- Coverage thresholds: 60% lines, 55% functions, 45% branches

Test fixtures in `tests/fixtures/` provide deterministic mock data for players, games, seasons, tournaments, and settings.

### CI/CD

GitHub Actions workflows (`.github/workflows/`):

- **test-guards.yml** — runs on PRs: type-check, lint, critical, smoke, a11y, performance, build
- **ci.yml** — full CI pipeline
- **full-test-suite.yml** — complete test suite
- **claude-code-review.yml** — automated review on every PR
- **release-notes-guard.yml** — **blocks any PR to master that does not add a new top entry to `release-notes.json`**. Every merge ships a build, so every PR needs a user-facing note in EN and FI. No exceptions, no skip label
- **check-rule-links.yml** — verifies the external rule links still resolve
- **update-test-badge.yml** — recounts tests on master and updates the badge above

Deployment via Vercel (auto-deploy on push to master).

---

## Project Structure (Key Files)

| File | Purpose |
|------|---------|
| `src/app/page.tsx` | Main orchestrator — hooks, reducers, data fetching |
| `src/hooks/useGameSessionReducer.ts` | Core game logic (timer, score, periods) |
| `src/hooks/useGameState.ts` | Interactive field state (positions, drawings) |
| `src/interfaces/DataStore.ts` | Backend-agnostic data access contract |
| `src/datastore/factory.ts` | Mode-aware singleton factory |
| `src/sync/SyncEngine.ts` | Background sync processor |
| `src/auth/SupabaseAuthService.ts` | Authentication wrapper |
| `src/config/backendConfig.ts` | Backend mode detection |
| `src/types/index.ts` | Core TypeScript interfaces |
| `src/utils/storage.ts` | IndexedDB adapter |

---

## Troubleshooting

- **Node version**: Use Node 22.x (matches development environment).
- **Sentry**: Optional — remove `NEXT_PUBLIC_SENTRY_DSN` from `.env.local` to disable.
- **Bundle analysis**: Run `npm run build:analyze` with `ANALYZE=true`.
- **IndexedDB in private mode**: PWAs require persistent storage — private/incognito mode is not supported.
- **Service worker updates**: The SW uses a timestamped cache name; a new Vercel build triggers update detection in installed PWAs.

---

## License

All rights reserved &copy; 2025 Ville Pajala. See [LICENSE](LICENSE) for details.

---

**MatchOps-Local: Empowering coaches while protecting young athletes' privacy through local-first technology.**
