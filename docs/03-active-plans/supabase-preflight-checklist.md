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

## PR #4: SupabaseDataStore Games

### Pre-Implementation Checklist
- [ ] **Generate proper Supabase types** to replace placeholder `any` types in SupabaseDataStore.ts:
  ```bash
  npx supabase gen types typescript --project-id <project-id> > src/types/supabase.ts
  ```
  Then remove `DbInsertData`, `DbRow`, and related `any` type aliases from SupabaseDataStore.ts
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

**Deferred from PR #3** (now games exist):
- [ ] `removePersonnelMember()` cascade delete - remove personnel ID from all games' `gamePersonnel` arrays (see LocalDataStore.ts:1223-1291)

**RPC Functions** (batch with save_game_with_relations):
- [ ] Create `set_team_roster(p_team_id, p_user_id, p_roster)` RPC for atomic delete+insert of team roster (prevents data loss if network fails between operations)

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

**Deferred from PR #3** (cache management):
- [ ] Clear SupabaseDataStore caches on user change (seasonDatesCache, cachedUserId) - ensures User B doesn't see User A's cached data after logout/login

### Test Checklist
- [ ] Sign up flow works end-to-end
- [ ] Sign in flow works end-to-end
- [ ] Sign out flow works
- [ ] Password reset email sends
- [ ] Session persists across page reloads
- [ ] Auth state change listeners fire correctly
- [ ] Error mapping: Supabase errors → AuthError
- [ ] Local mode unchanged (no login screen)
- [ ] User switch scenario: User A logout → User B login → caches cleared

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

**Optional Performance Optimizations** (if dataset size warrants):
- [ ] Optimize composite uniqueness checks to use targeted queries instead of fetching all entities:
  ```typescript
  // Instead of: const existingTeams = await this.getTeams(true);
  // Use: SELECT id FROM teams WHERE name = ? AND bound_season_id = ? ... LIMIT 1
  ```
  Applies to: Teams, Seasons, Tournaments, Personnel (createX/updateX methods)
- [ ] Parallelize `saveAllGames()` with controlled concurrency:
  ```typescript
  // Current: Sequential saves to avoid overwhelming DB
  // Potential: Use Promise.all with batches of 5-10 concurrent saves
  // Only needed if migration of large game collections is slow
  ```

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

### Deferred from PR #4
- [ ] Generate proper Supabase types: `npx supabase gen types typescript --project-id <id> > src/types/supabase.ts`
- [ ] Verify JSONB columns have proper types (not `unknown`): tactical_discs, tactical_ball_position, tactical_drawings, etc.
- [ ] Remove `as unknown` type assertions in SupabaseDataStore.ts where proper types now exist

### Integration Test Scenarios
- [ ] Fresh install → local mode works
- [ ] Enable cloud → sign up → migrate → data syncs
- [ ] Disable cloud → returns to local
- [ ] Offline behavior graceful
- [ ] RLS tests: user can only access own data
- [ ] Concurrent access patterns (two tabs creating same entity)
- [ ] Large dataset handling (100+ teams/seasons/tournaments)
- [ ] Unicode and special characters in names
- [ ] Settings invalidateSettingsCache() called correctly in all paths

### Security Verification (CRITICAL)
- [ ] **RLS policies enforce user_id at database level** - Verify all tables have policies like:
  ```sql
  CREATE POLICY "Users can only insert their own data"
    ON players FOR INSERT
    WITH CHECK (user_id = auth.uid());
  ```
  This prevents malicious clients from injecting different user_id values.
- [ ] Verify RLS policies for SELECT, INSERT, UPDATE, DELETE on all tables
- [ ] Test: Direct Supabase API call with forged user_id is rejected

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
- [ ] Security: RLS policies verified (see Security Verification section above)

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
