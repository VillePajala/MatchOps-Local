# Supabase Implementation Pre-Flight Checklist

**Purpose**: Run these checks at each PR stage to ensure implementation stays aligned with the plan.
**Usage**: Check off items as you complete each PR. Use the verification script for automated checks.

---

## ⛔ CRITICAL: Branching Rules

### NEVER merge to master until ALL 8 PRs are complete!

```
⛔ DO NOT: Create PRs to master for Supabase work
⛔ DO NOT: Merge any supabase/* branch to master
⛔ DO NOT: Push Supabase code directly to master

✅ DO: Create PRs to feature/supabase-cloud-backend
✅ DO: Wait until all 8 PRs are merged to feature branch
✅ DO: Only then create final PR to master
```

**Why?** Master is production. Partial Supabase implementation = broken app. Local mode must stay perfect.

---

## Before Starting Any PR

```bash
# 1. Run the automated verification script
npx ts-node scripts/verify-supabase-plan.ts

# 2. Ensure tests pass
npm test

# 3. Ensure build passes
npm run build

# 4. Create branch from correct base (NOT master!)
git checkout feature/supabase-cloud-backend
git pull origin feature/supabase-cloud-backend
git checkout -b supabase/prX-name

# 5. When creating PR, target feature/supabase-cloud-backend (NOT master!)
```

---

## PR #1: Foundation & Configuration

### Pre-Implementation Checklist
- [ ] Read `docs/03-active-plans/supabase-implementation-guide.md` Section 4 (Configuration)
- [ ] Understand `getBackendMode()` priority: localStorage → env var → default

### Implementation Checklist
- [ ] Create `src/config/backendConfig.ts` with:
  - [ ] `getBackendMode()` function
  - [ ] `isCloudAvailable()` function
  - [ ] `enableCloudMode()` / `disableCloudMode()` functions
- [ ] Update `src/datastore/factory.ts`:
  - [ ] Import `getBackendMode`, `isCloudAvailable`
  - [ ] Add mode detection (still returns LocalDataStore for now)
- [ ] Update `.env.local.example` with Supabase variables
- [ ] Add `@supabase/supabase-js` to package.json (but don't import yet)

### Test Checklist
- [ ] Unit tests for `backendConfig.ts`:
  - [ ] `getBackendMode()` returns 'local' by default
  - [ ] `getBackendMode()` returns 'cloud' when env var set
  - [ ] `isCloudAvailable()` returns false without env vars
  - [ ] `enableCloudMode()` / `disableCloudMode()` work correctly
- [ ] Factory still returns LocalDataStore in cloud mode (logs warning)
- [ ] All existing tests pass (no regressions)

### Acceptance Criteria
- [ ] `npm run build` passes
- [ ] `npm test` passes
- [ ] Running with `NEXT_PUBLIC_BACKEND_MODE=cloud` logs warning message

---

## PR #2: Supabase Client & Types

### Pre-Implementation Checklist
- [ ] Read implementation guide Section 5.2 (Supabase Client Singleton)
- [ ] Understand lazy loading pattern to avoid bundling Supabase in local mode

### Implementation Checklist
- [ ] Create `src/datastore/supabase/client.ts`:
  - [ ] `getSupabaseClient()` singleton function
  - [ ] Error handling for missing env vars
  - [ ] Logging on client creation
- [ ] Create `src/types/supabase.ts` (placeholder for generated types)
- [ ] Create `src/datastore/supabase/index.ts` (barrel export)

### Test Checklist
- [ ] Client initializes correctly with valid env vars
- [ ] Client throws clear error with missing env vars
- [ ] Client is singleton (same instance returned)
- [ ] Bundle size unchanged when `BACKEND_MODE=local` (verify with `npm run build`)

### Acceptance Criteria
- [ ] Client connects to Supabase when configured
- [ ] Proper error messages for missing configuration
- [ ] No Supabase code in local mode bundle

---

## PR #3: SupabaseDataStore Core

### Pre-Implementation Checklist
- [ ] Read implementation guide Section 5 (SupabaseDataStore Implementation)
- [ ] Read verification matrix for: players, teams, seasons, tournaments, personnel, settings
- [ ] Understand optimistic update pattern

### Implementation Checklist
Create these files:
- [ ] `src/datastore/SupabaseDataStore.ts` (main class)
- [ ] `src/datastore/supabase/queries/players.ts`
- [ ] `src/datastore/supabase/queries/teams.ts`
- [ ] `src/datastore/supabase/queries/seasons.ts`
- [ ] `src/datastore/supabase/queries/tournaments.ts`
- [ ] `src/datastore/supabase/queries/personnel.ts`
- [ ] `src/datastore/supabase/queries/settings.ts`
- [ ] `src/datastore/supabase/queries/index.ts`
- [ ] `src/datastore/supabase/cache/QueryCache.ts`

Implement DataStore methods:
- [ ] `initialize()`, `close()`, `getBackendName()`, `isAvailable()`
- [ ] Player CRUD: `getPlayers()`, `createPlayer()`, `updatePlayer()`, `deletePlayer()`
- [ ] Team CRUD: `getTeams()`, `getTeamById()`, `createTeam()`, `updateTeam()`, `deleteTeam()`
- [ ] Team rosters: `getTeamRoster()`, `setTeamRoster()`, `getAllTeamRosters()`
- [ ] Season CRUD: `getSeasons()`, `createSeason()`, `updateSeason()`, `deleteSeason()`
- [ ] Tournament CRUD: `getTournaments()`, `createTournament()`, `updateTournament()`, `deleteTournament()`
- [ ] Personnel CRUD with **cascade delete** matching LocalDataStore behavior
- [ ] Settings CRUD: `getSettings()`, `saveSettings()`, `updateSettings()`

Update factory:
- [ ] Return `SupabaseDataStore` when cloud mode enabled

### Critical Behavior Parity Checks
- [ ] Team composite uniqueness: name + boundSeasonId + boundTournamentId + boundTournamentSeriesId + gameType
- [ ] Season composite uniqueness: name + clubSeason + gameType + gender + ageGroup + leagueId
- [ ] Tournament composite uniqueness: name + clubSeason + gameType + gender + ageGroup
- [ ] Personnel cascade delete: removes ID from all games' gamePersonnel arrays

### Test Checklist
- [ ] Unit tests with mocked Supabase client for each query module
- [ ] Parity tests: same operations produce same results as LocalDataStore
- [ ] Error handling tests: ValidationError, AlreadyExistsError, NotFoundError
- [ ] Factory returns correct store based on mode

### Acceptance Criteria
- [ ] All core CRUD operations work against Supabase
- [ ] Optimistic updates provide <50ms perceived latency
- [ ] Composite uniqueness matches LocalDataStore behavior

---

## PR #4: SupabaseDataStore Games

### Pre-Implementation Checklist
- [ ] Read implementation guide Section 5.6 (Game Transforms) carefully
- [ ] Read verification matrix Section 1 (AppState → games)
- [ ] Understand the 5-table game structure: games, game_players, game_events, player_assessments, game_tactical_data

### Implementation Checklist
- [ ] Create `src/datastore/supabase/queries/games.ts`
- [ ] Create `src/datastore/supabase/transforms/gameTransform.ts`:
  - [ ] `transformGameToTables()` - AppState → 5 tables
  - [ ] `transformTablesToGame()` - 5 tables → AppState
- [ ] Create `src/datastore/supabase/transforms/typeAdapters.ts`
- [ ] Create `supabase/migrations/001_rpc_functions.sql` for `save_game_with_relations()`

Implement DataStore methods:
- [ ] `getGames()`, `getGameById()`, `createGame()`, `saveGame()`, `saveAllGames()`, `deleteGame()`
- [ ] `addGameEvent()`, `updateGameEvent()`, `removeGameEvent()` - use order_index
- [ ] `getPlayerAdjustments()`, `addPlayerAdjustment()`, `updatePlayerAdjustment()`, `deletePlayerAdjustment()`
- [ ] `getWarmupPlan()`, `saveWarmupPlan()`, `deleteWarmupPlan()`
- [ ] `getTimerState()`, `saveTimerState()`, `clearTimerState()` - **local-only no-ops**

### Critical Transform Checks
Run these against test data:

**Empty String → NULL** (10 fields):
- [ ] `seasonId: ''` → `season_id: NULL`
- [ ] `tournamentId: ''` → `tournament_id: NULL`
- [ ] `tournamentSeriesId: ''` → `tournament_series_id: NULL`
- [ ] `tournamentLevel: ''` → `tournament_level: NULL`
- [ ] `teamId: ''` → `team_id: NULL`
- [ ] `gameTime: ''` → `game_time: NULL`
- [ ] `gameLocation: ''` → `game_location: NULL`
- [ ] `ageGroup: ''` → `age_group: NULL`
- [ ] `leagueId: ''` → `league_id: NULL`
- [ ] `customLeagueName: ''` → `custom_league_name: NULL`

**NULL → Empty String** (reverse):
- [ ] All 10 fields convert back correctly

**Legacy Defaults**:
- [ ] `homeOrAway: undefined` → `home_or_away: 'home'`
- [ ] `isPlayed: undefined` → `is_played: true`

**Player Array Normalization**:
- [ ] Players on field but not in selectedPlayerIds → `is_selected: true`
- [ ] availablePlayers → one row per player (no duplicates)
- [ ] playersOnField → `on_field: true` with relX/relY

**Event Ordering**:
- [ ] Array index → order_index on save
- [ ] Sort by order_index on load

**Assessment Flatten/Unflatten**:
- [ ] `sliders.intensity` → `intensity` column
- [ ] All 10 sliders mapped correctly

**Tactical JSONB Defaults**:
- [ ] `tacticalDiscs ?? []`
- [ ] `tacticalDrawings ?? []`
- [ ] `tacticalBallPosition ?? null`

### Test Checklist
- [ ] Round-trip test: transform game → tables → game = original
- [ ] Test with games missing homeOrAway (6 in test data)
- [ ] Test with games missing isPlayed (31 in test data)
- [ ] Test with players on field but not selected (4 in test data)
- [ ] Test with empty tactical fields (25 in test data)
- [ ] Test event ordering with same-time events
- [ ] RPC function works for atomic 5-table writes

### Acceptance Criteria
- [ ] Games save and load correctly with all nested data
- [ ] Transform is reversible (round-trip test passes)
- [ ] Empty seasonId games save correctly (NULL, not empty string)
- [ ] All DataStore methods now implemented

---

## PR #5: SupabaseAuthService + Auth UI

### Pre-Implementation Checklist
- [ ] Read implementation guide Section 6 (SupabaseAuthService)
- [ ] Understand auth flow: cloud mode + not authenticated → LoginScreen

### Implementation Checklist
- [ ] Create `src/auth/SupabaseAuthService.ts`:
  - [ ] `initialize()`, `getMode()`
  - [ ] `getCurrentUser()`, `isAuthenticated()`
  - [ ] `signUp()`, `signIn()`, `signOut()`, `resetPassword()`
  - [ ] `getSession()`, `refreshSession()`, `onAuthStateChange()`
- [ ] Create `src/contexts/AuthProvider.tsx` with `useAuth()` hook
- [ ] Create `src/components/LoginScreen.tsx` matching StartScreen style
- [ ] Update `src/app/layout.tsx` - wrap with AuthProvider
- [ ] Update `src/app/page.tsx` - add auth gate
- [ ] Update factory to return SupabaseAuthService in cloud mode
- [ ] Add translation keys to `public/locales/en/common.json` and `fi/common.json`

### Test Checklist
- [ ] Sign up flow works end-to-end
- [ ] Sign in flow works end-to-end
- [ ] Sign out flow works
- [ ] Password reset email sends
- [ ] Session persists across page reloads
- [ ] Auth state change listeners fire correctly
- [ ] Error mapping: Supabase errors → AuthError
- [ ] Local mode unchanged (no login screen)

### Acceptance Criteria
- [ ] LoginScreen appears in cloud mode when not authenticated
- [ ] After sign in, user sees StartScreen → HomePage flow
- [ ] Local mode unchanged - no login screen, always authenticated

---

## PR #6: Migration Service

### Pre-Implementation Checklist
- [ ] Read implementation guide Section 8 (Migration System)
- [ ] Understand: local data → export → upload → verify → cleanup

### Implementation Checklist
- [ ] Create `src/services/migrationService.ts`:
  - [ ] `migrateLocalToCloud()` function
  - [ ] Progress callback support
  - [ ] Verification step (compare counts)
  - [ ] Rollback on failure (local data untouched)
- [ ] Create UI components (optional):
  - [ ] `MigrationWizard.tsx`
  - [ ] `MigrationProgress.tsx`

### Test Checklist
- [ ] Migration completes for test data (60 games)
- [ ] All entity types migrate: players, teams, seasons, tournaments, personnel, games, settings
- [ ] Progress updates at each stage
- [ ] Verification confirms counts match
- [ ] Failure scenario: local data remains intact

### Acceptance Criteria
- [ ] Migration completes for user with 100+ games
- [ ] Progress feedback throughout process
- [ ] Verification confirms data integrity

---

## PR #7: Performance & QueryProvider

### Pre-Implementation Checklist
- [ ] Read implementation guide Section 7 (Performance Architecture)
- [ ] Understand React Query config differences for local vs cloud

### Implementation Checklist
- [ ] Update `src/app/QueryProvider.tsx`:
  - [ ] Cloud mode: 5-minute staleTime, 30-minute gcTime
  - [ ] Local mode: unchanged (current defaults)
  - [ ] Conditional config based on backend mode
- [ ] Verify hooks work with cloud mode:
  - [ ] `useGameDataQueries.ts`
  - [ ] `useRoster.ts` (optimistic patterns)

### Test Checklist
- [ ] Performance benchmarks:
  - [ ] Add player: <50ms perceived latency
  - [ ] Load game list: <100ms (cache hit)
  - [ ] Initial load: <1s (parallel prefetch)
- [ ] Verify React Query behavior in cloud mode

### Acceptance Criteria
- [ ] Cloud mode uses appropriate caching strategy
- [ ] Local mode unchanged
- [ ] Performance targets met

---

## PR #8: Integration & Final Polish

### Pre-Implementation Checklist
- [ ] All previous PRs merged to feature/supabase-cloud-backend
- [ ] Read implementation guide Section 10 (Deployment Checklist)

### Implementation Checklist
- [ ] Create `src/components/CloudSyncToggle.tsx`
- [ ] Add cloud settings section to settings page
- [ ] Create integration test suite: `tests/integration/cloud-flow.test.ts`
- [ ] Update documentation
- [ ] Final cleanup and code review

### Integration Test Scenarios
- [ ] Fresh install → local mode works
- [ ] Enable cloud → sign up → migrate → data syncs
- [ ] Disable cloud → returns to local
- [ ] Offline behavior graceful
- [ ] RLS tests: user can only access own data

### Final Checklist Before Master Merge
- [ ] All 8 sub-PRs merged to feature branch
- [ ] Full test suite passes: `npm test`
- [ ] Build passes: `npm run build`
- [ ] Lint passes: `npm run lint`
- [ ] Manual testing:
  - [ ] Local mode full workflow
  - [ ] Cloud mode full workflow
  - [ ] Mode switching works
  - [ ] Migration works
- [ ] Performance benchmarks met
- [ ] Documentation complete

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
