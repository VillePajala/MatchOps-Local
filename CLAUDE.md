# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## ✅ Project Status: Healthy

**Last Updated**: January 27, 2026

### Quick Stats
- ✅ **3,500+ tests** passing
- ✅ **0 security vulnerabilities**
- ✅ **Next.js 16.0.10 + React 19.2 + Supabase**
- ✅ **Dual-mode**: Local (IndexedDB) + Cloud (Supabase)
- ✅ **Auth**: Email/password via Supabase Auth
- ✅ **Edge Functions**: verify-subscription, delete-account

### What's Complete
- All P0/P1/P2 refactoring
- NPM security updates (xlsx, Sentry, React Query, Jest 30, i18next 16)
- **Next.js 16.0.10 + React 19.2 upgrade**
- Layer 3 performance polish
- Test coverage improvement (+694 tests)
- **Backend Abstraction Phase 1-3** - DataStore interface, LocalDataStore, LocalAuthService, factory
- **Supabase Cloud Backend PRs 1-11** ✅ - See PR Summary below
- **Local-First Cloud Sync** ✅ - SyncQueue, SyncEngine, SyncedDataStore (PR #324)

### What's Next
- **Supabase PR #12: Migration Wizard Redesign** - IN PROGRESS
- **Play Store Release**: See master-execution-guide.md (blocked by business entity setup)

### ⚠️ Quality Bar: Production-Ready (Not MVP)

**This project is past MVP stage.** We are preparing for Play Store release with paid subscriptions.

**What this means for development:**
- **Billing/Auth/Security**: Production-grade quality required. No shortcuts, no "good enough for MVP".
- **Error Messages**: Must be sanitized - never leak implementation details (mock modes, config state, stack traces).
- **Edge Functions**: Must have tests and proper error handling.
- **Feature Code**: Can be "launch-ready" (not perfect, but solid for initial user scale).

**Do NOT defer issues with these justifications:**
- ❌ "Acceptable for MVP"
- ❌ "Can fix later before launch"
- ❌ "Good enough for now"

**Instead, use these criteria:**
- ✅ "Safe for production with paying users"
- ✅ "Handles edge cases gracefully"
- ✅ "Follows security best practices"

### Essential Reading
- **[supabase-implementation-guide.md](./docs/03-active-plans/supabase-implementation-guide.md)** ⭐ **Active implementation plan**
- **[UNIFIED-ROADMAP.md](./docs/03-active-plans/UNIFIED-ROADMAP.md)** — Single source of truth
- **[master-execution-guide.md](./docs/03-active-plans/master-execution-guide.md)** — Play Store release plan

---

## 🚧 Active Work: Supabase Cloud Backend

### ⚠️ MANDATORY: Read Before ANY Supabase Work

**If you are working on Supabase implementation, you MUST follow the documented plan exactly.**

#### Required Reading (in order)
1. **[supabase-implementation-guide.md](./docs/03-active-plans/supabase-implementation-guide.md)** — Master plan with code examples
2. **[supabase-preflight-checklist.md](./docs/03-active-plans/supabase-preflight-checklist.md)** — PR-by-PR checklists
3. **[supabase-verification-matrix.md](./docs/03-active-plans/supabase-verification-matrix.md)** — Field-by-field type mappings
4. **[supabase-schema.md](./docs/02-technical/database/supabase-schema.md)** — PostgreSQL schema

#### Before Starting ANY PR
```bash
# 1. Run automated verification (catches plan/code drift)
npx ts-node scripts/verify-supabase-plan.ts

# 2. Ensure tests pass
npm test

# 3. Read the preflight checklist for your specific PR
```

---

### Critical Implementation Rules (MEMORIZE THESE)

#### Rule 1: Game Transform — Empty String ↔ NULL (10 Fields)

**Forward (App → DB)**: Empty string becomes NULL
```typescript
season_id: game.seasonId === '' ? null : game.seasonId,
tournament_id: game.tournamentId === '' ? null : game.tournamentId,
tournament_series_id: game.tournamentSeriesId === '' ? null : game.tournamentSeriesId,
tournament_level: game.tournamentLevel === '' ? null : game.tournamentLevel,
team_id: game.teamId === '' ? null : game.teamId,
game_time: game.gameTime === '' ? null : game.gameTime,
game_location: game.gameLocation === '' ? null : game.gameLocation,
age_group: game.ageGroup === '' ? null : game.ageGroup,
league_id: game.leagueId === '' ? null : game.leagueId,
custom_league_name: game.customLeagueName === '' ? null : game.customLeagueName,
```

**Reverse (DB → App)**: NULL becomes empty string
```typescript
seasonId: game.season_id ?? '',
tournamentId: game.tournament_id ?? '',
// ... same pattern for all 10 fields
```

#### Rule 2: Legacy Defaults (CRITICAL for test data compatibility)

```typescript
// These defaults MUST match LocalDataStore.ts lines 1337 and 1342
home_or_away: game.homeOrAway ?? 'home',  // NOT || 'home'
is_played: game.isPlayed ?? true,          // undefined → true (legacy games)
```

#### Rule 3: Player Array Normalization

**The three arrays have this relationship**: `playersOnField ⊆ selectedPlayerIds ⊆ availablePlayers`

```typescript
// Forward transform: Normalize is_selected when on_field
is_selected: isSelected || isOnField,  // If on field, MUST be selected

// Reverse transform: Reconstruct from game_players table
availablePlayers = ALL game_players (no relX/relY)
playersOnField = game_players WHERE on_field = true (WITH relX/relY)
selectedPlayerIds = game_players WHERE is_selected = true
```

#### Rule 4: Event Ordering via order_index

```typescript
// Forward: Array index becomes order_index
events: game.gameEvents.map((e, index) => ({
  ...e,
  order_index: index,  // CRITICAL: preserves insertion order
})),

// Reverse: Sort by order_index, then map back to array
const gameEvents = events
  .sort((a, b) => a.order_index - b.order_index)
  .map(e => ({ id: e.id, type: e.event_type, time: e.time_seconds, ... }));
```

#### Rule 5: Assessment Slider Flattening

```typescript
// Forward: Flatten nested sliders object
intensity: a.sliders.intensity,
courage: a.sliders.courage,
duels: a.sliders.duels,
technique: a.sliders.technique,
creativity: a.sliders.creativity,
decisions: a.sliders.decisions,
awareness: a.sliders.awareness,
teamwork: a.sliders.teamwork,
fair_play: a.sliders.fair_play,
impact: a.sliders.impact,

// Reverse: Reconstruct nested object
sliders: {
  intensity: a.intensity,
  courage: a.courage,
  // ... all 10 fields
},
```

#### Rule 6: Composite Uniqueness (App-Level Validation)

Schema uses simple `UNIQUE(user_id, name)`. **SupabaseDataStore MUST implement these composite checks to match LocalDataStore**:

- **Teams**: name + boundSeasonId + boundTournamentId + boundTournamentSeriesId + gameType
- **Seasons**: name + clubSeason + gameType + gender + ageGroup + leagueId
- **Tournaments**: name + clubSeason + gameType + gender + ageGroup

#### Rule 7: Cascade Delete for Personnel

When `removePersonnelMember(id)` is called, MUST also remove that ID from all games' `gamePersonnel` arrays. See LocalDataStore.ts lines 1223-1291.

#### Rule 8: Tactical JSONB Defaults

```typescript
// Forward: Use ?? to preserve null but default undefined
tactical_discs: game.tacticalDiscs ?? [],
tactical_drawings: game.tacticalDrawings ?? [],
tactical_ball_position: game.tacticalBallPosition ?? null,  // null is valid!
completed_interval_durations: game.completedIntervalDurations ?? [],

// Reverse: Same pattern
tacticalDiscs: tacticalData.tactical_discs ?? [],
tacticalBallPosition: tacticalData.tactical_ball_position ?? null,
```

#### Rule 9: Personnel certifications Field

```typescript
// MUST include in all Personnel transforms - don't drop this field!
certifications: personnel.certifications ?? [],  // text[] array
```

#### Rule 10: createGame() Defaults

**SupabaseDataStore.createGame() MUST provide these defaults** to ensure consistent behavior with LocalDataStore:

```typescript
periodDurationMinutes: 10,       // Schema has DEFAULT 10, but app should set explicitly
subIntervalMinutes: 5,
showPlayerNames: true,
tacticalBallPosition: { relX: 0.5, relY: 0.5 },
lastSubConfirmationTimeSeconds: 0,
// See implementation guide Section 5.0.1 for full list
```

Note: The schema provides `DEFAULT 10` for `period_duration_minutes` as a safety net, but the app layer should always provide the value explicitly for clarity and consistency.

#### Rule 11: Event CRUD Uses Full-Save

**addGameEvent/updateGameEvent/removeGameEvent all save the ENTIRE game** (not incremental updates):

```typescript
// This ensures order_index stays contiguous [0, 1, 2, ...]
async removeGameEvent(gameId, eventIndex) {
  const game = await this.getGameById(gameId);
  game.gameEvents.splice(eventIndex, 1);  // Reindex in memory
  return this.saveGame(gameId, game);      // Full save
}
```

#### Rule 12: Cloud Mode is Online-Only

**No offline queue** - operations fail with clear error if offline:

```typescript
if (!navigator.onLine) {
  throw new NetworkError('Cannot save while offline. Please check your connection.');
}
```

Users should switch to local mode for offline work.

#### Rule 13: Tournament Level Migration (getTournaments)

**Apply same runtime migration as LocalDataStore** when loading tournaments:

```typescript
// Converts legacy 'level' to 'series[]'
const migrateTournamentLevel = (tournament: Tournament): Tournament => {
  if (tournament.series?.length > 0) return tournament;  // Skip if has series
  if (tournament.level) {
    return {
      ...tournament,
      series: [{
        id: `series_${tournament.id}_${tournament.level.toLowerCase().replace(/\s+/g, '-')}`,
        level: tournament.level,
      }]
    };
  }
  return tournament;
};

// Apply on read
return tournaments.map(migrateTournamentLevel);
```

#### Rule 14: Game Validation Parity (saveGame)

**Reuse LocalDataStore's validateGame** - extract to shared module:

```typescript
// src/datastore/validation.ts (extract from LocalDataStore)
import { validateGame } from './validation';

// In SupabaseDataStore.saveGame()
async saveGame(id: string, game: AppState): Promise<AppState> {
  validateGame(game);  // Same validation as LocalDataStore
  // ... rest of save logic
}
```

#### Rule 15: RPC game_id Injection

**RPC must override game_id in child rows** (not just user_id):

```sql
-- In save_game_with_relations, for each child table:
jsonb_set(
  jsonb_set(elem, '{user_id}', to_jsonb(v_user_id::text)),
  '{game_id}', to_jsonb(v_game_id)  -- Force correct game_id
)
```

Prevents client from injecting wrong game_id in child rows.

#### Rule 16: clubSeason Computation on Read

**Compute clubSeason if missing** (matches LocalDataStore):

```typescript
// In getSeasons() and getTournaments()
clubSeason: entity.clubSeason ?? calculateClubSeason(entity.startDate, start, end)
```

#### Rule 17: Supabase Concurrency (No Locks Needed)

**PostgreSQL handles concurrency** - no app-level locks:
- Single operations: PostgreSQL row-level locks
- Multi-table operations: RPC with transactions
- Conflict resolution: Last-write-wins

#### Rule 18: Migration Uses DataStore Getters

**Use DataStore getters** (not raw storage keys) to apply legacy migrations:

```typescript
const tournaments = await localDataStore.getTournaments(true);  // Applies migrateTournamentLevel
const seasons = await localDataStore.getSeasons(true);          // Computes clubSeason
```

#### Rule 19: Data Scale Strategy

**For 500+ games**, use paging:
- Prefetch recent 100 games on initialize
- Load older games on demand
- UI virtualization for large lists

---

### Branching Strategy

All Supabase work happens on `feature/supabase-cloud-backend`. Sub-PRs (e.g., `supabase/pr12-*`) target the feature branch, not master.

**Final Merge Criteria** (before `feature/supabase-cloud-backend` → `master`):
- [ ] All sub-PRs merged to feature branch
- [ ] `npm test` passes
- [ ] `npm run build` passes
- [ ] Manual test: Local mode, cloud mode, migration, mode switching

### Review Process (IMPORTANT)

**⚠️ USER REVIEWS AND APPROVES EVERY PR - TWICE:**

1. **Before CREATING the PR**: User says "review changes"
   - Perform a senior software engineer code review of all changes
   - Check code quality, patterns, and consistency
   - Verify all acceptance criteria from the plan are met
   - Ensure tests are adequate
   - Look for security issues, edge cases, and potential bugs
   - Confirm no regressions to local mode
   - **Verify transforms match the 19 rules above**
   - Provide detailed review summary with any concerns
   - **DO NOT create the PR until user explicitly approves**

2. **Before MERGING the PR**: User reviews on GitHub and approves
   - User will review the PR on GitHub
   - User may request additional changes
   - **DO NOT merge until user explicitly says to merge**

**NEVER auto-create or auto-merge PRs. Always wait for explicit user approval at each step.**

### PR Summary

| PR | Status | Description |
|----|--------|-------------|
| 1 | ✅ | Foundation - backendConfig.ts, mode detection |
| 2 | ✅ | Supabase client singleton, lazy loading |
| 3 | ✅ | SupabaseDataStore core CRUD (players, teams, seasons, etc.) |
| 4 | ✅ | SupabaseDataStore games - transforms, all DataStore methods |
| 5 | ✅ | SupabaseAuthService + Auth UI |
| 6 | ✅ | Migration service (local → cloud) |
| 7 | ✅ | QueryProvider optimization |
| 8 | ✅ | Integration & final polish |
| 9 | ✅ | Infrastructure & Migration UI (SQL migrations, MigrationWizard) |
| 10 | ✅ | Cloud Data Management (clear cloud data, migration modes) |
| 11 | ✅ | Reverse Migration & Cloud Account (cloud → local, WelcomeScreen) |
| **12** | 🚧 | **Migration Wizard Redesign** (scenario matrix, merge logic) |

---

## Development Commands

### Core Commands
- `npm run dev` - Start development server (Next.js)
- `npm run build` - Build for production (includes manifest generation)
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm test` - Run all Jest tests (executes `jest`)
- `npm run test:unit` - Alias for `npm test`
- `npm run generate:i18n-types` - Generate TypeScript types for translations

### Build Process
The build process includes a custom manifest generation step that runs before Next.js build:
- `node scripts/generate-manifest.mjs` - Generates PWA manifest based on branch
- Manifest configuration varies by branch (master vs development) for different app names and themes

## Architecture Overview

### Tech Stack
- **Next.js 16.0.10** with App Router
- **React 19.2** with TypeScript
- **Tailwind CSS 4** for styling
- **PWA** with custom service worker
- **Dual-mode data persistence**:
  - **Local**: Browser IndexedDB (offline-first, no account required)
  - **Cloud**: Supabase PostgreSQL (cross-device sync, requires auth)
- **Supabase** for cloud backend:
  - Auth (email/password)
  - PostgreSQL database with RLS
  - Edge Functions (subscription verification, account deletion)
- **React Query** for state management
- **i18next** for internationalization (English/Finnish)
- **xlsx** for Excel export (CDN tarball: SheetJS removed npm registry access, CDN is official distribution)

### Core Architecture

**Data Flow**: The app's data layer relies on **React Query** to fetch, cache, and manage server-side state (persisted in IndexedDB). Asynchronous storage operations in `src/utils/storage.ts` provide IndexedDB access through a unified adapter layer.

**⚠️ React Query Configuration (Issue #262 - Needs Reinvestigation)**: Currently using React Query defaults. Attempted optimization (reduced retries, longer staleTime) caused mobile data loading failures - IndexedDB on mobile has transient failures that require multiple retry attempts. Any future tuning must preserve `retry: 3` or test extensively on mobile devices. See `src/app/QueryProvider.tsx`.

**PWA Structure**: Full PWA with custom service worker (`public/sw.js`), dynamic manifest generation, install prompts and update notifications.

**State Management**:
- **`src/app/page.tsx`**: Central orchestrator for all state management strategies
- **`useReducer` (`useGameSessionReducer.ts`)**: Core game session state (score, timer, periods, metadata)
- **`useGameState` hook**: Interactive soccer field state (player positions, drawings)
- **React Query**: Asynchronous data operations (roster, seasons, tournaments, saved games)
- **`useState`**: Local UI state within components (modal visibility, etc.)

**Key Components**:
- `SoccerField` - Interactive drag-and-drop field
- `PlayerBar` - Player roster management
- `ControlBar` - Main app controls
- Various modals for game settings, stats, and management

**Data Persistence**: Dual-mode architecture via DataStore abstraction:
- **DataStore Interface**: `src/interfaces/DataStore.ts` (backend-agnostic contract)
- **LocalDataStore**: `src/datastore/LocalDataStore.ts` (IndexedDB implementation)
- **SupabaseDataStore**: `src/datastore/SupabaseDataStore.ts` (Supabase/PostgreSQL implementation)
- **Factory**: `src/datastore/factory.ts` (singleton access via `getDataStore()`, mode-aware)
- **AuthService Interface**: `src/interfaces/AuthService.ts` (auth abstraction)
- **LocalAuthService**: `src/auth/LocalAuthService.ts` (no-op for local mode)
- **SupabaseAuthService**: `src/auth/SupabaseAuthService.ts` (Supabase Auth)
- Player roster, games, seasons, tournaments, personnel, settings
- Migration service for local ↔ cloud data transfer

**Game Types**: Supports both soccer and futsal games via `gameType: 'soccer' | 'futsal'` field on games, seasons, and tournaments. Legacy games without `gameType` default to soccer. See `docs/04-features/game-type-support.md`.

**IndexedDB Migration**: `src/utils/migration.ts` handles localStorage → IndexedDB migration with essential features (data transfer, error handling, progress tracking, rollback). Production-ready for small-scale deployments.

**Storage Requirements**:
- IndexedDB required (typically 50MB+ quota)
- No localStorage fallback (insufficient for 100+ games)
- Private/incognito mode not supported (IndexedDB disabled/restricted)
- Automatic migration on first load after upgrade

**Known Limitation - Multi-Tab Usage**: Storage locks (`src/utils/lockManager.ts`, `src/utils/storageKeyLock.ts`) are in-memory only (single tab). Multi-tab scenarios (multiple browser tabs or PWA + web version simultaneously) may experience race conditions. This is acceptable for the typical single-user, single-tab usage pattern. Future enhancement: Consider `BroadcastChannel` or `SharedWorker` for cross-tab coordination if needed.

**Logging**: Centralized system in `src/utils/logger.ts` - Type-safe, environment-aware, replaces direct `console.*` usage.

**Error Monitoring**: Sentry integration for production:
- Config: `src/instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `src/app/global-error.tsx`
- Production-only by default (or `NEXT_PUBLIC_SENTRY_FORCE_ENABLE=true`)
- Filters browser noise (ResizeObserver, NetworkError)
- 10% trace sampling, error-only session replays with privacy protection

**Testing**: Jest with React Testing Library, configured for Next.js with custom setup in `jest.config.js`

## For Code Reviewers (AI or Human)

### ⚠️ Critical: This is a Local-First PWA with Optional Cloud Sync

This is a **local-first Progressive Web App** for single-user soccer coaching with **optional** cloud backend for cross-device sync.

### Architecture Context

**Dual-Mode Operation**
- **Local mode**: Zero setup, all data in IndexedDB, works offline, no account needed
- **Cloud mode**: Supabase backend for cross-device sync, requires authentication
- User chooses mode at first launch; can migrate data between modes anytime
- Single-user per account (no team collaboration features)

**Data Scale & Privacy**
- 1 user, 50-100 players, 50-100 games/season, <50MB storage
- Soccer scores/stats only - NOT sensitive PII/financial/healthcare data
- **Local mode**: Data never leaves device
- **Cloud mode**: Data stored in Supabase (EU region), protected by RLS policies

**PWA Private Mode Behavior**
- PWA installation IMPOSSIBLE in private/incognito (by design across all browsers)
- IndexedDB restricted/disabled in private mode
- Current error handling is comprehensive (`storageFactory.ts`, `storage.ts`)
- ❌ DO NOT flag "missing private mode detection" - PWAs require persistent storage

### Code Review Guidelines

#### ❌ DO NOT Suggest These Patterns

**Enterprise/SaaS** (Not Applicable)
- ❌ Audit logging, multi-tenant isolation, RBAC, API auth, rate limiting, GDPR logging, centralized analytics

**Network Security** (Minimal Network Communication)
- ❌ Complex API auth (OAuth/JWT), CORS config, request signing
- ✅ Basic Play Store integration for license validation only

**Data Encryption** (Browser Sandboxing Sufficient)
- ❌ Client-side encryption, key management, encryption at rest

**Over-Engineering**
- ❌ Heavy schema validation (Zod/Yup) for self-generated data
- ❌ Complex caching, query optimization for 100 records
- ❌ CDN, edge caching, horizontal scaling

#### ✅ DO Focus On These Areas

**Browser Compatibility**
- ✅ IndexedDB edge cases (quota, corruption, private mode)
- ✅ Service Worker lifecycle, cross-browser PWA behavior

**Data Integrity**
- ✅ Corruption recovery, backup/restore, migration patterns
- ✅ Graceful handling of malformed data

**Performance & Memory**
- ✅ Memory leaks, efficient IndexedDB transactions
- ✅ UI responsiveness, bundle size

**User Experience**
- ✅ Offline-first patterns, helpful error messages
- ✅ Loading states, accessibility (a11y)

**PWA Best Practices**
- ✅ Service Worker updates, app manifest
- ✅ Install prompts, offline capability

### Quick Reference

1. **Remember**: One user per account, local-first with optional cloud sync
2. **Data scale**: Hundreds of records, not millions
3. **Security**: Local mode = browser sandbox; Cloud mode = Supabase RLS + auth
4. **Performance**: Optimize for small datasets and single-user UX

See `docs/PROJECT_OVERVIEW.md` and `docs/LOCAL_FIRST_PHILOSOPHY.md` for details.

## Key Files to Understand

**Core App:**
- `src/app/page.tsx` - Main component orchestrating entire app (hooks, reducers, data fetching)
- `src/hooks/useGameSessionReducer.ts` - Core game logic reducer (timer, score, status)
- `src/hooks/useGameState.ts` - Interactive soccer field state management
- `src/utils/masterRosterManager.ts` - Player CRUD operations
- `src/config/queryKeys.ts` - React Query cache keys
- `src/types/index.ts` - Core TypeScript interfaces

**Data Layer (Dual-Mode):**
- `src/interfaces/DataStore.ts` - Backend-agnostic data access interface
- `src/datastore/LocalDataStore.ts` - IndexedDB implementation
- `src/datastore/SupabaseDataStore.ts` - Supabase/PostgreSQL implementation
- `src/datastore/factory.ts` - Mode-aware singleton factory
- `src/config/backendConfig.ts` - Backend mode detection and configuration

**Authentication:**
- `src/interfaces/AuthService.ts` - Auth abstraction interface
- `src/auth/LocalAuthService.ts` - No-op auth for local mode
- `src/auth/SupabaseAuthService.ts` - Supabase Auth implementation
- `src/datastore/supabase/client.ts` - Supabase client singleton

**Cloud Infrastructure:**
- `supabase/functions/verify-subscription/` - Edge Function for Play Store billing
- `supabase/functions/delete-account/` - Edge Function for GDPR account deletion
- `supabase/migrations/` - PostgreSQL schema migrations

## Opportunistic Refactoring Policy

**Large files are acceptable when they represent complex features.** Don't refactor for line count alone.

### When to Extract Components

Extract when you're **already touching the file** for a feature:
- Adding a new tab to GameSettingsModal → extract existing tabs first
- Adding new entity to LocalDataStore → consider splitting by entity
- Adding new interaction mode to SoccerField → consider splitting rendering/events

### When NOT to Refactor

- Don't refactor in isolation (no standalone "cleanup" PRs)
- Don't "fix" eslint-disables that have explanatory comments
- Don't split working code that has no bugs

### Files with Justified eslint-disables (DO NOT "FIX")

| File | Disables | Reason |
|------|----------|--------|
| `useGameOrchestration.ts` | 12 | Hook call order + state/setter split pattern (5 hooks already extracted) |
| `GameSettingsModal.tsx` | 2 | Ref-guarded effects preventing infinite loops |

These patterns are intentional and documented. "Fixing" them would introduce bugs.

### When Adding New eslint-disables

1. First try to fix the underlying issue
2. If disable is truly necessary, add a detailed comment explaining WHY
3. Follow patterns already established in the codebase

## Testing Rules and Principles

### Test-First Verification for Deletion/Refactoring Tasks

When **deleting or refactoring code** (not creating new features), use **Test-First Verification**:

1. **Before ANY deletion**: Run full test suite, record baseline (e.g., "2,025 tests passing")
2. **After EACH deletion block**: Run tests immediately
3. **If tests fail**: The deleted code was still needed - restore and investigate
4. **If tests pass**: Safe to continue

This is NOT traditional TDD (which writes tests first for new code). Instead:
- Existing tests ARE the safety net
- "Green tests after deletion" = deletion was safe
- Run `npm test -- --no-coverage` frequently during refactoring

### Critical Testing Guidelines

**NEVER SKIP TESTS** unless explicitly requested. Tests catch regressions and ensure quality.

**Test fixes must make the project more robust, not mask issues:**
- Fix underlying problems, don't just make tests pass
- Ensure mocks accurately represent real behavior
- Don't weaken assertions or remove coverage
- Document why changes were necessary

**When fixing failing tests:**
1. Understand why it's failing (legitimate issue vs test problem?)
2. Fix the root cause, not the symptom
3. Improve robustness, not permissiveness
4. Maintain coverage
5. Document changes

**Acceptable modifications:**
- Updating expectations to match corrected behavior
- Improving reliability and reducing flakiness
- Adding better error handling/edge cases
- Fixing incorrect mocks

**Unacceptable modifications:**
- Skipping tests to avoid failures
- Weakening assertions
- Removing tests without replacement
- Using overly permissive mocks

### Test Documentation Standards

**Use JSDoc comments with tags:**
- `@critical` - Core user workflows (never skip/weaken)
- `@integration` - Component interactions
- `@edge-case` - Boundary conditions and error scenarios
- `@performance` - Performance requirements

**Example:**
```typescript
/**
 * Tests critical workflow: game creation → player selection → start
 * @critical
 */
it('should create new game → select players → start game', async () => {
  // Test implementation
});
```

### Anti-Patterns That Must Never Appear

**1. Fixed Timeouts (FORBIDDEN)**
```typescript
// ❌ FORBIDDEN - Flaky and unreliable
await new Promise(resolve => setTimeout(resolve, 100));

// ✅ REQUIRED - Wait for actual conditions
await waitFor(() => {
  expect(screen.getByText('Success')).toBeInTheDocument();
});
```

**2. Missing act() Wrappers (FORBIDDEN)**
```typescript
// ❌ FORBIDDEN - State updates not wrapped
fireEvent.click(button);
expect(result).toBe(true);

// ✅ REQUIRED - Proper React state handling
await act(async () => {
  fireEvent.click(button);
});
await waitFor(() => expect(result).toBe(true));
```

**3. Issue-Masking Mechanisms**
```typescript
// ❌ FORBIDDEN - These hide real issues
forceExit: true           // Masks resource leaks - never use

// ✅ CURRENT CONFIGURATION (with rationale)
detectOpenHandles: true   // Always enabled - catches resource leaks
detectLeaks: false        // Disabled: high false-positive rate (31/80 suites flagged)
                          // Real memory issues caught by detectOpenHandles + manual testing
forceExit: false          // Never force exit - fix issues properly

// ℹ️ CI uses --bail=1 for faster feedback on failures
// This is acceptable tradeoff: fail fast, re-run to see all failures if needed
```

**4. Console Noise Tolerance (FORBIDDEN)**
Tests automatically fail on unexpected console warnings/errors. See `src/setupTests.mjs`.

### Required Testing Infrastructure

**jest.config.js (actual configuration):**
```javascript
{
  detectOpenHandles: true,  // ✅ Catches resources preventing Node exit
  detectLeaks: false,       // Disabled due to false positives (see rationale above)
  forceExit: false,         // ✅ Never force exit
  testTimeout: 30000,       // 30 second default timeout
  maxWorkers: process.env.CI ? 2 : '50%',
  slowTestThreshold: 5,     // Warn about tests > 5s
}
```

**Test Isolation Pattern:**
```typescript
beforeEach(async () => {
  jest.clearAllMocks();
  jest.clearAllTimers();
  clearMockStore();
  localStorage.clear();
});

afterEach(async () => {
  cleanup();
  await act(async () => {
    // Allow pending updates to complete
  });
});
```

### Async Testing Pattern

```typescript
test('user interaction', async () => {
  render(<Component />);

  // Wait for initial render
  await waitFor(() => {
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  });

  // Wrap interactions in act()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
  });

  // Wait for state updates
  await waitFor(() => {
    expect(screen.getByText('Success')).toBeInTheDocument();
  });
});
```

### Flaky Test Management

**Flaky Test Tracking:**
- Flaky tests are tracked via `tests/utils/flaky-test-tracker.js`
- Reports generated in `test-results/flaky-tests-report.json`
- No automatic retries configured - fix flaky tests at the source

**Common Patterns and Fixes:**
- **Timing**: Use `waitFor()` instead of `setTimeout()`
- **Async**: Wrap all interactions in `act()`, await state changes
- **DOM**: Wait for DOM updates with `waitFor()`
- **Memory**: Implement proper cleanup in `afterEach()`

**When a Test Becomes Flaky:**
1. Mark with `@flaky` tag and create issue
2. Check flaky test report for patterns
3. Apply pattern-specific solutions
4. Run multiple times locally to verify fix
5. Remove `@flaky` tag only after confirmed stable

### Test Data Management

**Use Centralized Test Fixtures:**
```typescript
// ✅ Use centralized fixtures
import { TestFixtures } from '../fixtures';

const player = TestFixtures.players.goalkeeper({ name: 'Custom Keeper' });
const game = TestFixtures.games.inProgress({ homeScore: 2 });
```

**Fixture Directory:** `tests/fixtures/` contains domain-specific factories (players, games, seasons, tournaments, settings, errors).

**Principles:**
- Deterministic generation (no random data)
- Memory efficient (on-demand creation)
- Realistic but controlled
- Full TypeScript support

**Anti-Patterns to Avoid:**
```typescript
// ❌ Scattered inline data
const player = { id: '123', name: 'Test', jerseyNumber: '10' };

// ❌ Random data that breaks tests
const score = Math.floor(Math.random() * 10);

// ❌ No cleanup
const largeDataset = Array.from({ length: 10000 }, () => createPlayer());
```

### Quality Metrics

- ✅ **Pass rate**: 100% (no failing tests in main/master)
- ✅ **Flakiness**: 0% (consistent passes)
- ✅ **Resource leaks**: 0 (detectOpenHandles catches all)
- ✅ **Console warnings**: 0 (auto-fail on unexpected output)
- ✅ **Coverage thresholds**: 60% lines, 55% functions, 45% branches (enforced in jest.config.js)

### Anti-Pattern Detection Checklist

**Before committing test code:**
- [ ] No `setTimeout` or fixed delays
- [ ] All `fireEvent`/`userEvent` wrapped in `act()` or followed by `waitFor()`
- [ ] All async operations awaited
- [ ] No `--forceExit` in CI (`--bail=1` is acceptable for fast-fail)
- [ ] `detectOpenHandles: true` in config
- [ ] Proper cleanup in `beforeEach`/`afterEach`
- [ ] No suppressed console warnings
- [ ] Tests pass locally without retries

**When you find anti-patterns:**
1. Fix immediately - don't defer
2. Add test to prevent regression
3. Update this document if pattern is common

## Git, Tests, and CI Rules

### Critical: User Controls All Operations

**NEVER run these operations automatically:**
- `git add`, `git commit`, `git push`
- `npm test`, `npm run build`, `npm run lint`
- Creating branches or pull requests
- Any CI/verification commands

**Always wait for explicit user command.** Do not assume, do not infer, do not "help" by running these proactively.

**Correct workflow:**
1. Make code changes
2. Stop and report: "Changes complete. Ready for your command."
3. Wait for user to say "commit", "push", "run tests", etc.
4. Only then execute the specific command requested

**Examples:**
- User says "fix the bug" → Fix code, then STOP. Do not commit.
- User says "fix and commit" → Fix code, then commit. Do not push.
- User says "there is no PR" → Ask "Should I push and create the PR?" Do not assume.
- User gives code review feedback → Make changes, then STOP. Do not commit or push.

**When uncertain, ASK.** Never assume the user wants you to commit, push, or run tests.

## Vercel Build & ESLint Rules

### Critical Build Guidelines

**ALWAYS ensure code passes Vercel build** by following these patterns:

### Common ESLint/TypeScript Issues

**1. @typescript-eslint/no-require-imports**
```typescript
// ❌ Forbidden
const fs = require('fs');

// ✅ Correct
import fs from 'fs';
// or
const fs = await import('fs');
```

**2. @typescript-eslint/no-explicit-any**
```typescript
// ❌ Forbidden
delete (window as any).location;

// ✅ Correct
delete (window as unknown as { location: unknown }).location;
```

**Important:** Test files can use limited `any` for mocks (doesn't fail build). Production code: ZERO `any` usage.

**3. @typescript-eslint/no-unused-vars**
```typescript
// ❌ Will fail build
function beforeSend(event, hint) { return event; }

// ✅ Correct
function beforeSend(event, _hint) { return event; }
```

### Prevention Checklist

**Before committing:**
1. `npm run build` must pass without errors
2. `npm run lint` must pass without errors
3. No `any` types (use `unknown` + type assertions)
4. No `require()` imports (use ES6 imports)
5. No unused variables/parameters
6. Proper type annotations for complex objects

**Common fixes:**
- Replace `require()` with `import` or `await import()`
- Replace `any` with `unknown` + type assertions
- Add underscore prefix to unused parameters (`_param`)
- Use proper interface definitions

**Build Environment Differences:**
Code that works in dev may fail in Vercel due to stricter ESLint, different TypeScript settings, tree-shaking, and aggressive static analysis. **Always test production build** before pushing.

## Environment Variables

### Cloud Backend (enables cloud mode)
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon/public key

### Error Reporting
- `NEXT_PUBLIC_SENTRY_DSN` - Sentry DSN for error reporting (client-side)
- `SENTRY_AUTH_TOKEN` - Sentry auth for source map uploads (server-side)

### Optional
- `NEXT_PUBLIC_SENTRY_FORCE_ENABLE` - Force Sentry in dev (default: false)
- `SENTRY_ORG` - Sentry organization name
- `SENTRY_PROJECT` - Sentry project name
- `ANALYZE` - Enable bundle analysis during build

### Security
- Client-side vars (`NEXT_PUBLIC_*`) validated for secret exposure
- Server-side secrets never use `NEXT_PUBLIC_` prefix
- Environment validation runs automatically during build/startup
- CSP violations reported to `/api/csp-report`

## Code Quality Principles

- Always investigate thoroughly before implementing
- Review all changes professionally for optimal solutions
- Avoid quick/dirty implementations unless explicitly requested
- Be professional and factual
- Defend quality and best practices even if it means disagreeing
- Ensure `npm run lint` passes before commits and pushes
- Do not run tests, build or anything if I dont specifically ask for it