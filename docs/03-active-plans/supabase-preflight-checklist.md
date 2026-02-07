# Supabase Implementation Pre-Flight Checklist

**Purpose**: Run these checks at each PR stage to ensure implementation stays aligned with the plan.
**Usage**: Check off items as you complete each PR. Use the verification script for automated checks.

---

## Before Starting Any PR

```bash
# 1. Ensure on feature branch
git checkout feature/supabase-cloud-backend
git pull origin feature/supabase-cloud-backend

# 2. Create PR branch
git checkout -b supabase/prX-name

# 3. Run tests
npm test && npm run build
```

---

## PR #1: Foundation & Configuration ✅ MERGED

### Pre-Implementation Checklist
- [x] Read `docs/03-active-plans/supabase-implementation-guide.md` Section 4 (Configuration)
- [x] Understand `getBackendMode()` priority: localStorage → env var → default

### Implementation Checklist
- [x] Create `src/config/backendConfig.ts` with:
  - [x] `getBackendMode()` function
  - [x] `isCloudAvailable()` function
  - [x] `enableCloudMode()` / `disableCloudMode()` functions
- [x] Update `src/datastore/factory.ts`:
  - [x] Import `getBackendMode`, `isCloudAvailable`
  - [x] Add mode detection (still returns LocalDataStore for now)
- [x] Update `.env.local.example` with Supabase variables
- [x] Add `@supabase/supabase-js` to package.json (but don't import yet)

### Test Checklist
- [x] Unit tests for `backendConfig.ts`:
  - [x] `getBackendMode()` returns 'local' by default
  - [x] `getBackendMode()` returns 'cloud' when env var set
  - [x] `isCloudAvailable()` returns false without env vars
  - [x] `enableCloudMode()` / `disableCloudMode()` work correctly
- [x] Factory still returns LocalDataStore in cloud mode (logs warning)
- [x] All existing tests pass (no regressions)

### Acceptance Criteria
- [x] `npm run build` passes
- [x] `npm test` passes
- [x] Running with `NEXT_PUBLIC_BACKEND_MODE=cloud` logs warning message

---

## PR #2: Supabase Client & Types ✅ MERGED

### Pre-Implementation Checklist
- [x] Read implementation guide Section 5.2 (Supabase Client Singleton)
- [x] Understand lazy loading pattern to avoid bundling Supabase in local mode

### Implementation Checklist
- [x] Create `src/datastore/supabase/client.ts`:
  - [x] `getSupabaseClient()` singleton function
  - [x] Error handling for missing env vars
  - [x] Logging on client creation
- [x] Create `src/types/supabase.ts` (placeholder for generated types)
- [x] Create `src/datastore/supabase/index.ts` (barrel export)

### Test Checklist
- [x] Client initializes correctly with valid env vars
- [x] Client throws clear error with missing env vars
- [x] Client is singleton (same instance returned)
- [x] Bundle size unchanged when `BACKEND_MODE=local` (verify with `npm run build`)

### Acceptance Criteria
- [x] Client connects to Supabase when configured
- [x] Proper error messages for missing configuration
- [x] No Supabase code in local mode bundle

---

## PR #3: SupabaseDataStore Core ✅ MERGED

### Pre-Implementation Checklist
- [x] Read implementation guide Section 5 (SupabaseDataStore Implementation)
- [x] Read verification matrix for: players, teams, seasons, tournaments, personnel, settings
- [x] Understand optimistic update pattern

### Implementation Checklist

#### Architectural Decision: Single-File Implementation
**Decision**: Implemented all core CRUD in `src/datastore/SupabaseDataStore.ts` (~1,770 lines) instead of separate query modules.

**Justification**:
- Single-file approach is coherent and maintainable at this scale
- PR #4's game transforms are fundamentally different (5-table RPC, complex transforms) - won't follow same pattern
- No later PRs depend on importing from query modules
- Avoids unnecessary file complexity without clear benefit

**Skipped Files** (not needed):
- ~~`src/datastore/supabase/queries/*.ts`~~ - Consolidated into SupabaseDataStore.ts
- ~~`src/datastore/supabase/cache/QueryCache.ts`~~ - React Query handles caching at app level

**Created Files**:
- [x] `src/datastore/SupabaseDataStore.ts` (main class with all CRUD)
- [x] `src/datastore/__tests__/SupabaseDataStore.test.ts` (comprehensive tests)

**Modified Files**:
- [x] `src/datastore/factory.ts` - Returns SupabaseDataStore in cloud mode
- [x] `src/datastore/index.ts` - Exports SupabaseDataStore

Implement DataStore methods:
- [x] `initialize()`, `close()`, `getBackendName()`, `isAvailable()`
- [x] Player CRUD: `getPlayers()`, `createPlayer()`, `updatePlayer()`, `deletePlayer()`
- [x] Team CRUD: `getTeams()`, `getTeamById()`, `createTeam()`, `updateTeam()`, `deleteTeam()`
- [x] Team rosters: `getTeamRoster()`, `setTeamRoster()`, `getAllTeamRosters()`
- [x] Season CRUD: `getSeasons()`, `createSeason()`, `updateSeason()`, `deleteSeason()`
- [x] Tournament CRUD: `getTournaments()`, `createTournament()`, `updateTournament()`, `deleteTournament()`
- [x] Personnel CRUD (Note: cascade delete deferred to PR #4 when games exist)
- [x] Settings CRUD: `getSettings()`, `saveSettings()`, `updateSettings()`

Update factory:
- [x] Return `SupabaseDataStore` when cloud mode enabled

### Critical Behavior Parity Checks
- [x] Team composite uniqueness: name + boundSeasonId + boundTournamentId + boundTournamentSeriesId + gameType
- [x] Season composite uniqueness: name + clubSeason + gameType + gender + ageGroup + leagueId
- [x] Tournament composite uniqueness: name + clubSeason + gameType + gender + ageGroup
- [ ] Personnel cascade delete: **Deferred to PR #4** - Games not yet implemented, cascade has nothing to delete from

### Test Checklist
- [x] Unit tests with mocked Supabase client (62 tests)
- [x] Composite uniqueness tests for teams, seasons, tournaments
- [x] Error handling tests: ValidationError, AlreadyExistsError, NotFoundError, AuthError, NetworkError
- [x] Factory returns correct store based on mode
- [x] Auth failure tests
- [x] Update method tests for seasons and tournaments

### Acceptance Criteria
- [x] All core CRUD operations work against Supabase
- [x] Architecture ready for optimistic updates (React Query handles at app level)
- [x] Composite uniqueness matches LocalDataStore behavior

---

## PR #4: SupabaseDataStore Games ✅ MERGED

### Pre-Implementation Checklist
- [x] **Generate proper Supabase types** via MCP tool (types regenerated in PR #9)
- [x] Read implementation guide Section 5.6 (Game Transforms) carefully
- [x] Read verification matrix Section 1 (AppState → games)
- [x] Understand the 5-table game structure: games, game_players, game_events, player_assessments, game_tactical_data

### Implementation Checklist

**Architectural Decision**: All game transforms implemented directly in `SupabaseDataStore.ts` (~2,850 lines total) using `transformGameToTables()` and `transformTablesToGame()` methods.

- [x] `transformGameToTables()` - AppState → 5 tables (implemented in SupabaseDataStore.ts)
- [x] `transformTablesToGame()` - 5 tables → AppState (implemented in SupabaseDataStore.ts)
- [x] `supabase/migrations/001_rpc_functions.sql` for `save_game_with_relations()`, `delete_personnel_cascade()`, `set_team_roster()`

Implement DataStore methods:
- [x] `getGames()`, `getGameById()`, `createGame()`, `saveGame()`, `saveAllGames()`, `deleteGame()`
- [x] `addGameEvent()`, `updateGameEvent()`, `removeGameEvent()` - use order_index
- [x] `getPlayerAdjustments()`, `addPlayerAdjustment()`, `updatePlayerAdjustment()`, `deletePlayerAdjustment()`
- [x] `getWarmupPlan()`, `saveWarmupPlan()`, `deleteWarmupPlan()`
- [x] `getTimerState()`, `saveTimerState()`, `clearTimerState()` - **local-only no-ops**
- [x] `removePersonnelMember()` cascade delete via RPC

### Critical Transform Checks
All transforms implemented per CLAUDE.md Rules 1-19:
- [x] Empty String ↔ NULL (10 fields)
- [x] Legacy Defaults (homeOrAway, isPlayed)
- [x] Player Array Normalization
- [x] Event Ordering via order_index
- [x] Assessment Slider Flattening
- [x] Tactical JSONB Defaults

### Acceptance Criteria
- [x] Games save and load correctly with all nested data
- [x] All DataStore methods implemented

---

## PR #5: SupabaseAuthService + Auth UI ✅ MERGED

### Pre-Implementation Checklist
- [x] Read implementation guide Section 6 (SupabaseAuthService)
- [x] Understand auth flow: cloud mode + not authenticated → LoginScreen

### Implementation Checklist
- [x] Create `src/auth/SupabaseAuthService.ts` (499 lines):
  - [x] `initialize()`, `getMode()`
  - [x] `getCurrentUser()`, `isAuthenticated()`
  - [x] `signUp()`, `signIn()`, `signOut()`, `resetPassword()`
  - [x] `getSession()`, `refreshSession()`, `onAuthStateChange()`
- [x] Create `src/contexts/AuthProvider.tsx` with `useAuth()` hook (240 lines)
- [x] Create `src/components/LoginScreen.tsx` matching StartScreen style (270 lines)
- [x] Update `src/app/layout.tsx` - wrap with AuthProvider
- [x] Update `src/app/page.tsx` - add auth gate
- [x] Update factory to return SupabaseAuthService in cloud mode
- [x] Add translation keys to `public/locales/en/common.json` and `fi/common.json`
- [x] Clear SupabaseDataStore caches on user change

### Acceptance Criteria
- [x] LoginScreen appears in cloud mode when not authenticated
- [x] After sign in, user sees StartScreen → HomePage flow
- [x] Local mode unchanged - no login screen, always authenticated

---

## PR #6: Migration Service ✅ MERGED

### Pre-Implementation Checklist
- [x] Read implementation guide Section 8 (Migration System)
- [x] Understand: local data → export → upload → verify → cleanup

### Implementation Checklist
- [x] Create `src/services/migrationService.ts` (936 lines):
  - [x] `migrateLocalToCloud()` function
  - [x] `getLocalDataSummary()` for preview counts
  - [x] `hasLocalDataToMigrate()` check
  - [x] Progress callback support
  - [x] Verification step (compare counts)
  - [x] Rollback on failure (local data untouched)
- [x] Create UI components:
  - [x] `MigrationWizard.tsx` (566 lines) - Full wizard with preview, confirm, progress, complete steps
  - [x] `clearLocalData.ts` - Safe IndexedDB clearing after migration
- [x] Create tests:
  - [x] `MigrationWizard.test.tsx` (329 lines)
  - [x] `clearLocalData.test.ts` (84 lines)

### Acceptance Criteria
- [x] Migration wizard shows data preview before migrating
- [x] Progress feedback throughout process
- [x] Option to clear local data after successful migration
- [x] Skip option for users who don't want to migrate yet

---

## PR #7: Performance & QueryProvider ✅ MERGED

### Pre-Implementation Checklist
- [x] Read implementation guide Section 7 (Performance Architecture)
- [x] Understand React Query config differences for local vs cloud

### Implementation Checklist
- [x] Update `src/app/QueryProvider.tsx` (104 lines):
  - [x] Cloud mode: 5-minute staleTime, 30-minute gcTime
  - [x] Local mode: unchanged (retry: 3 for IndexedDB)
  - [x] Conditional config based on backend mode
  - [x] Exponential backoff for cloud retries
  - [x] refetchOnWindowFocus: true, refetchOnMount: false for cloud
- [x] Verify hooks work with cloud mode

**Database Index Optimizations**:
- [x] GIN index on `tournaments.series` for JSONB queries (migration 004)
- [ ] Covering indexes deferred until profiling shows need

### Acceptance Criteria
- [x] Cloud mode uses appropriate caching strategy
- [x] Local mode unchanged
- [x] Mode-specific QueryClient configuration

---

## PR #8: Integration & Final Polish ✅ MERGED

### Pre-Implementation Checklist
- [x] All previous PRs merged to feature/supabase-cloud-backend
- [x] Read implementation guide Section 10 (Deployment Checklist)

### Implementation Checklist
- [x] Cloud Sync settings section in SettingsModal
- [x] Mode switching with auto-reload after change
- [x] Supabase types generated via MCP tool
- [x] Documentation updated (CLAUDE.md rules, preflight checklist)

### Completed Items
- [x] Generate proper Supabase types (via MCP `generate_typescript_types`)
- [x] Mode switching cleanup - auto-reload ensures clean state
- [x] RLS policies applied (migration 002_rls_policies.sql)

### Security Verification
- [x] RLS policies enforce user_id at database level (all tables)
- [x] SELECT, INSERT, UPDATE, DELETE policies on all tables
- [x] RPC functions use `auth.uid()` for user_id injection

### Final Checklist Before Master Merge
- [x] All sub-PRs merged to feature branch
- [x] Full test suite passes: `npm test` (3,495 tests)
- [x] Build passes: `npm run build`
- [x] Lint passes: `npm run lint`
- [ ] Manual testing (pending):
  - [ ] Local mode full workflow
  - [ ] Cloud mode full workflow
  - [ ] Mode switching works
  - [ ] Migration works
- [ ] Performance benchmarks
- [x] Documentation complete

---

## PR #9: Infrastructure & Migration UI ✅ MERGED

### Implementation Checklist
- [x] Create `supabase/migrations/000_schema.sql` - Full PostgreSQL schema
- [x] Create `supabase/migrations/001_rpc_functions.sql` - RPC functions for atomic operations
- [x] Create `supabase/migrations/002_rls_policies.sql` - Row-Level Security policies
- [x] Create `supabase/migrations/003_fix_composite_uniqueness.sql` - Fix overly restrictive constraints
- [x] Create `supabase/migrations/004_add_series_gin_index.sql` - GIN index for JSONB queries
- [x] Create `supabase/migrations/README.md` - Migration documentation
- [x] Apply all migrations to Supabase project via MCP tools
- [x] Regenerate TypeScript types from live schema
- [x] Add migration completion tracking to `backendConfig.ts`
- [x] Integrate MigrationWizard into `page.tsx` with proper effect guards
- [x] Add all i18n keys for migration UI (EN + FI)
- [x] Update i18n-types.ts with new keys

### Files Created
- `supabase/migrations/000_schema.sql` (486 lines)
- `supabase/migrations/001_rpc_functions.sql` (inherited from PR #4)
- `supabase/migrations/002_rls_policies.sql` (103 lines)
- `supabase/migrations/003_fix_composite_uniqueness.sql` (29 lines)
- `supabase/migrations/004_add_series_gin_index.sql` (13 lines)
- `supabase/migrations/README.md` (102 lines)
- `src/components/MigrationWizard.tsx` (566 lines)
- `src/components/__tests__/MigrationWizard.test.tsx` (329 lines)
- `src/utils/clearLocalData.ts` (71 lines)
- `src/utils/__tests__/clearLocalData.test.ts` (84 lines)

### Acceptance Criteria
- [x] Database schema matches application types
- [x] RLS policies protect all user data
- [x] Migration wizard appears for cloud users with local data
- [x] Skip option doesn't permanently dismiss wizard

---

## PR #10: Cloud Data Management ✅ MERGED

### Implementation Checklist
- [x] Add migration mode selection (Replace/Merge) to MigrationWizard
- [x] Add `clearAllCloudData()` to migrationService
- [x] Add "Clear Cloud Data" option to SettingsModal CloudSyncSection
- [x] Confirmation modal for destructive operations
- [x] Add translation keys for new UI elements

### Acceptance Criteria
- [x] Users can choose migration strategy
- [x] Cloud data can be cleared from settings
- [x] Destructive actions require confirmation

---

## PR #11: Reverse Migration & Cloud Account ✅ MERGED

### Implementation Checklist
- [x] Add `migrateCloudToLocal()` to migrationService
- [x] Add reverse migration option to CloudSyncSection
- [x] Update WelcomeScreen for cloud mode sign-in flow
- [x] Add `getCloudDataSummary()` for data counts
- [x] Add translation keys for reverse migration UI

### Acceptance Criteria
- [x] Users can migrate cloud data back to local
- [x] WelcomeScreen handles cloud mode properly
- [x] Data counts shown before migration

---

## PR #12: Migration Wizard Redesign 🚧 IN PROGRESS

### Problem Statement
Original wizard only handled one scenario (local has data, cloud is empty). Need to handle all four scenarios in the matrix.

### Scenario Matrix
| Local | Cloud | Wizard Behavior |
|-------|-------|-----------------|
| Empty | Empty | No wizard - proceed to app |
| Has data | Empty | Migrate / Start Fresh / Cancel |
| Empty | Has data | No wizard - use cloud data |
| Has data | Has data | Merge / Replace Cloud / Keep Cloud / Cancel |

### Implementation Checklist
- [ ] Add `getCloudCounts()` to migrationService
- [ ] Update MigrationWizard to detect scenario
- [ ] Implement "Local only" scenario UI
- [ ] Implement "Both have data" scenario UI
- [ ] Remove "Skip" option
- [ ] "Cancel" returns to local mode
- [ ] EN/FI translations for new wizard text
- [ ] Unit tests for scenario detection and merge logic

### Acceptance Criteria
- [ ] Wizard handles all four data scenarios
- [ ] No orphaned data after wizard completion
- [ ] Clear user feedback for each option

---

## Quick Reference: Critical Files to Verify

| File | Must Match |
|------|------------|
| `src/types/game.ts:74` (AppState) | 42 fields in transforms |
| `src/types/index.ts:231` (PlayerStatAdjustment) | 19 fields in schema |
| `src/types/playerAssessment.ts:1` | 15 fields (nested sliders) |
| `src/datastore/LocalDataStore.ts:1324-1361` | createGame defaults |
| `src/datastore/LocalDataStore.ts:1223-1291` | removePersonnelMember cascade |

---

## Verification Commands

```bash
# Run automated verification script
npx ts-node scripts/verify-supabase-plan.ts

# Run all tests
npm test

# Run specific test file
npm test -- src/datastore/SupabaseDataStore.test.ts

# Build check
npm run build

# Lint check
npm run lint

# Check bundle size (after PR #2)
npm run build && ls -la .next/static/chunks/*.js
```
