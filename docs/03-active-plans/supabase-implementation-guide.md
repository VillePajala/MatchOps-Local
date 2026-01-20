# MatchOps Cloud Implementation Guide

**Version**: 1.11.0
**Status**: Implementation Ready (Verified + Eight Adversarial Reviews)
**Last Updated**: January 19, 2026 (v1.11.0: migration uses SupabaseDataStore upsert methods for DRY, ID-preserving uploads)

---

## ⚠️ BEFORE YOU START: Verification Resources

This plan has been **verified against actual source code**. Use these companion documents:

| Document | Purpose | When to Use |
|----------|---------|-------------|
| **[supabase-preflight-checklist.md](./supabase-preflight-checklist.md)** | PR-by-PR checklists | ✅ **Before & during each PR** |
| **[supabase-live-verification-report.md](./supabase-live-verification-report.md)** | Proof that plan matches code | When you need confidence |
| **[supabase-verification-matrix.md](./supabase-verification-matrix.md)** | Field-by-field type mappings | During transform coding |
| **[scripts/verify-supabase-plan.ts](../../../scripts/verify-supabase-plan.ts)** | Automated verification | Run before each PR |

### Before Starting ANY PR

```bash
# 1. Run automated verification (catches plan/code drift)
npx ts-node scripts/verify-supabase-plan.ts

# 2. Open the preflight checklist for your PR
cat docs/03-active-plans/supabase-preflight-checklist.md

# 3. Ensure tests pass before starting
npm test
```

---

> **Legend**: Throughout this document:
> - **[EXISTS]** - Already implemented in the codebase
> - **[TO BUILD]** - Needs to be created during Supabase implementation

## Table of Contents

0. [Before You Start: Verification Resources](#-before-you-start-verification-resources)
1. [Executive Summary](#executive-summary)
2. [Git Workflow & PR Strategy](#git-workflow--pr-strategy)
3. [Architecture Overview](#architecture-overview)
4. [Configuration System](#configuration-system)
5. [SupabaseDataStore Implementation](#supabasedatastore-implementation)
6. [SupabaseAuthService Implementation](#supabaseauthservice-implementation)
7. [Performance Architecture](#performance-architecture)
8. [Migration System](#migration-system)
9. [Testing Strategy](#testing-strategy)
10. [Final Phase: Infrastructure & Master Merge](#10-final-phase-infrastructure--master-merge)
    - 10.1 [What's Missing After PR #8](#101-overview-whats-still-missing-after-pr-8)
    - 10.2 [PR #9: Infrastructure & Migration UI](#102-pr-9-infrastructure--migration-ui-15-hours)
    - 10.2.8 [PR #10: Cloud Data Management](#1028-pr-10-cloud-data-management-3-hours)
    - 10.3 [Supabase Project Setup](#103-supabase-project-setup)
    - 10.4 [Environment Configuration](#104-environment-configuration)
    - 10.5 [E2E Testing with Real Supabase](#105-end-to-end-testing-with-real-supabase)
    - 10.6 [Final Merge to Master](#106-final-merge-to-master)
    - 10.7 [Rollback Plan](#107-rollback-plan)

---

## 1. Executive Summary

### Current State (Production Ready)

**What Already Exists [EXISTS]**:
- **DataStore interface**: `src/interfaces/DataStore.ts` (60+ methods)
- **LocalDataStore**: `src/datastore/LocalDataStore.ts` (2,010 lines, IndexedDB)
- **AuthService interface**: `src/interfaces/AuthService.ts`
- **LocalAuthService**: `src/auth/LocalAuthService.ts` (no-op for local mode)
- **Factory**: `src/datastore/factory.ts` (singleton pattern, local-only)
- **Error classes**: `src/interfaces/DataStoreErrors.ts`
- **Auth types**: `src/interfaces/AuthTypes.ts`
- **React Query**: Already configured in `src/app/QueryProvider.tsx`
- **Query keys**: `src/config/queryKeys.ts`
- **Optimistic patterns**: Used in `src/hooks/useRoster.ts`
- **Supabase schema**: `docs/02-technical/database/supabase-schema.md` (15 tables, revised 2026-01-11)
- **3,200+ tests** passing

**What Needs to Be Built [TO BUILD]**:
- **backendConfig.ts**: `src/config/backendConfig.ts` (mode switching)
- **SupabaseDataStore**: `src/datastore/SupabaseDataStore.ts` (~1,800 lines)
- **SupabaseAuthService**: `src/auth/SupabaseAuthService.ts`
- **AuthProvider**: `src/contexts/AuthProvider.tsx` (auth context + `useAuth()` hook)
- **LoginScreen**: `src/components/LoginScreen.tsx` (sign in/up/reset UI)
- **Supabase client**: `src/datastore/supabase/client.ts`
- **Query helpers**: `src/datastore/supabase/queries/*.ts`
- **Transform utilities**: `src/datastore/supabase/transforms/*.ts`
- **Migration service**: `src/services/migrationService.ts`
- **Factory update**: Modify `factory.ts` to support cloud mode
- **QueryProvider update**: Mode-specific React Query config
- **Layout/Page updates**: Auth gate in `page.tsx`, `AuthProvider` wrapper in `layout.tsx`

### Implementation Goal
Build a **dual-backend system** where:
- **Default**: Local mode (IndexedDB + no auth) - current behavior, unchanged
- **Premium**: Cloud mode (Supabase + auth) - opt-in via single config switch
- **Parallel development**: Cloud code exists but is dormant until enabled

### The Single Switch
```typescript
// .env.local
NEXT_PUBLIC_BACKEND_MODE=local     # Current default
NEXT_PUBLIC_BACKEND_MODE=cloud     # Enable Supabase
```

Or runtime detection:
```typescript
// User selects "Enable Cloud Sync" → localStorage flag → app restarts in cloud mode
```

---

## 2. Git Workflow & PR Strategy

### 2.1 Branching Strategy

#### ⛔ CRITICAL: NOTHING GOES TO MASTER UNTIL ALL 8 PRs ARE COMPLETE

```
master (production) ← PROTECTED: NO SUPABASE CODE UNTIL 100% COMPLETE
│
│   ⛔ DO NOT CREATE PRs TO MASTER FOR SUPABASE WORK
│   ⛔ DO NOT MERGE ANY SUPABASE BRANCH TO MASTER
│   ⛔ DO NOT PUSH SUPABASE CODE DIRECTLY TO MASTER
│
└── feature/supabase-cloud-backend (MASTER FEATURE BRANCH)
    │
    │   ✅ ALL Supabase PRs target THIS branch
    │   ✅ This branch accumulates all 8 PRs
    │   ✅ Only merged to master when EVERYTHING works
    │
    ├── supabase/pr1-foundation        → PR to feature/supabase-cloud-backend
    ├── supabase/pr2-supabase-client   → PR to feature/supabase-cloud-backend
    ├── supabase/pr3-datastore-core    → PR to feature/supabase-cloud-backend
    ├── supabase/pr4-datastore-games   → PR to feature/supabase-cloud-backend
    ├── supabase/pr5-auth-service      → PR to feature/supabase-cloud-backend
    ├── supabase/pr6-migration         → PR to feature/supabase-cloud-backend
    ├── supabase/pr7-performance       → PR to feature/supabase-cloud-backend
    └── supabase/pr8-integration       → PR to feature/supabase-cloud-backend
                                       │
                                       └── FINAL: PR to master (ONLY when ALL 8 complete + tested)
```

#### Why This Strategy?

| Reason | Explanation |
|--------|-------------|
| **master is production** | Real users are running code from master |
| **Partial Supabase = broken app** | Cloud mode requires ALL pieces to work |
| **Local mode must stay perfect** | Any regression breaks existing users |
| **Feature branch isolates risk** | We can test everything together before release |

#### Final Merge Criteria

Before creating the final PR `feature/supabase-cloud-backend` → `master`:

- [ ] All 8 sub-PRs merged to feature branch
- [ ] `npm test` passes (3,200+ tests)
- [ ] `npm run build` passes
- [ ] `npm run lint` passes
- [ ] Manual test: Local mode full workflow works
- [ ] Manual test: Cloud mode full workflow works
- [ ] Manual test: Migration local → cloud works
- [ ] Manual test: Mode switching works
- [ ] User has approved final review

### 2.2 Branch Rules

1. **Create master feature branch first**:
   ```bash
   git checkout master
   git pull origin master
   git checkout -b feature/supabase-cloud-backend
   git push -u origin feature/supabase-cloud-backend
   ```

2. **For each PR chunk**:
   ```bash
   git checkout feature/supabase-cloud-backend
   git pull origin feature/supabase-cloud-backend
   git checkout -b supabase/pr1-foundation
   # ... do work ...
   git push -u origin supabase/pr1-foundation
   # Create PR targeting feature/supabase-cloud-backend (NOT master)
   ```

3. **After PR merge, update feature branch and continue**:
   ```bash
   git checkout feature/supabase-cloud-backend
   git pull origin feature/supabase-cloud-backend
   git checkout -b supabase/pr2-supabase-client
   ```

4. **Final merge to master** (only when all PRs complete):
   ```bash
   # Create PR: feature/supabase-cloud-backend → master
   # Squash or merge commit as preferred
   ```

### 2.3 Review Process (MANDATORY)

**⚠️ USER MUST REVIEW AND APPROVE EVERY PR - NO EXCEPTIONS**

For **each** of the 8 PRs, the process is:

1. **Implementation complete** → Claude reports "Ready for review"
2. **User says "review changes"** → Claude performs senior engineer code review
3. **Claude presents review** → User reviews and requests changes if needed
4. **User approves review** → Claude creates PR on GitHub
5. **User reviews PR on GitHub** → May request additional changes
6. **User approves/merges PR** → Only then proceed to next PR

**NEVER:**
- Auto-create PRs without explicit user approval
- Auto-merge PRs without explicit user approval
- Skip review steps to "save time"
- Proceed to next PR before current one is merged

### 2.4 PR Breakdown

---

#### **PR #1: Foundation & Configuration** (~8 hours)

**Branch**: `supabase/pr1-foundation`
**Depends on**: Nothing (first PR)
**📋 Pre-flight**: See [supabase-preflight-checklist.md](./supabase-preflight-checklist.md#pr-1-foundation--configuration)

**Files to Create**:
```
src/config/backendConfig.ts          # Mode switching logic
.env.local.example                   # Update with Supabase vars
```

**Files to Modify**:
```
src/datastore/factory.ts             # Add mode detection (no Supabase yet)
src/datastore/index.ts               # Export new config utilities
package.json                         # Add @supabase/supabase-js dependency
```

**Deliverables**:
- [ ] `getBackendMode()` function returns 'local' or 'cloud'
- [ ] `isCloudAvailable()` checks env vars exist
- [ ] `enableCloudMode()` / `disableCloudMode()` for runtime switching
- [ ] Factory checks mode but still only returns LocalDataStore
- [ ] All existing tests pass
- [ ] New unit tests for backendConfig.ts

**Acceptance Criteria**:
- `npm run build` passes
- `npm test` passes (no regressions)
- Running with `NEXT_PUBLIC_BACKEND_MODE=cloud` logs "cloud mode requested but not available"

---

#### **PR #2: Supabase Client & Types** (~10 hours)

**Branch**: `supabase/pr2-supabase-client`
**Depends on**: PR #1 merged
**📋 Pre-flight**: See [supabase-preflight-checklist.md](./supabase-preflight-checklist.md#pr-2-supabase-client--types)

**Files to Create**:
```
src/datastore/supabase/client.ts     # Supabase client singleton
src/types/supabase.ts                # Generated database types (placeholder)
src/datastore/supabase/index.ts      # Barrel export
```

**Deliverables**:
- [ ] `getSupabaseClient()` returns configured Supabase client
- [ ] Client only initializes when cloud mode enabled
- [ ] Lazy loading - Supabase bundle not included in local mode
- [ ] Type definitions for database schema (can be placeholder initially)
- [ ] Unit tests for client initialization

**Acceptance Criteria**:
- Bundle size unchanged when `BACKEND_MODE=local`
- Client connects to Supabase when configured
- Proper error if env vars missing in cloud mode

---

#### **PR #3: SupabaseDataStore Core** (~25 hours)

**Branch**: `supabase/pr3-datastore-core`
**Depends on**: PR #2 merged
**📋 Pre-flight**: See [supabase-preflight-checklist.md](./supabase-preflight-checklist.md#pr-3-supabasedatastore-core)

> ⚠️ **Critical**: This PR implements composite uniqueness rules. Before coding, read the "Critical Behavior Parity Checks" section in the preflight checklist.

> ✅ **IMPLEMENTED** - See architectural decision note below.

**Architectural Decision (Documented Jan 2026)**:
Implemented as single-file `SupabaseDataStore.ts` (~1,770 lines) instead of separate query modules.
- **Rationale**: Single-file is coherent at this scale; PR #4's game transforms are fundamentally different (5-table RPC); no later PRs import from query modules; avoids unnecessary file complexity.
- **QueryCache skipped**: React Query handles caching at app level - local DataStore cache would be redundant.
- **Personnel cascade delete**: Deferred to PR #4 when games exist.

**Files Created**:
```
src/datastore/SupabaseDataStore.ts                    # Main class with all CRUD (~1,770 lines)
src/datastore/__tests__/SupabaseDataStore.test.ts    # Comprehensive tests (62 tests)
```

**Files Modified**:
```
src/datastore/factory.ts             # Return SupabaseDataStore when cloud mode
src/datastore/index.ts               # Export SupabaseDataStore
```

**Implements DataStore Methods**:
- [x] `initialize()`, `close()`, `getBackendName()`, `isAvailable()`
- [x] `getPlayers()`, `createPlayer()`, `updatePlayer()`, `deletePlayer()`
- [x] `getTeams()`, `getTeamById()`, `createTeam()`, `updateTeam()`, `deleteTeam()`
- [x] `getTeamRoster()`, `setTeamRoster()`, `getAllTeamRosters()`
- [x] `getSeasons()`, `createSeason()`, `updateSeason()`, `deleteSeason()`
- [x] `getTournaments()`, `createTournament()`, `updateTournament()`, `deleteTournament()`
- [x] `getAllPersonnel()`, `getPersonnelById()`, `addPersonnelMember()`, `updatePersonnelMember()`, `removePersonnelMember()` **Note: CASCADE DELETE deferred to PR #4**
- [x] `getSettings()`, `saveSettings()`, `updateSettings()`

**Deliverables**:
- [x] SupabaseDataStore implements all non-game DataStore methods
- [x] Architecture ready for optimistic updates (React Query handles at app level)
- [x] Unit tests with mocked Supabase client (62 tests)
- [x] Factory returns correct store based on mode

**Acceptance Criteria**:
- [x] All core CRUD operations work against Supabase
- [x] Composite uniqueness matches LocalDataStore behavior
- [x] Tests pass with mocked Supabase

---

#### **PR #4: SupabaseDataStore Games** (~25 hours)

**Branch**: `supabase/pr4-datastore-games`
**Depends on**: PR #3 merged
**📋 Pre-flight**: See [supabase-preflight-checklist.md](./supabase-preflight-checklist.md#pr-4-supabasedatastore-games)

> ⚠️ **MOST CRITICAL PR**: This implements the game transforms (5 tables). The preflight checklist has **detailed transform verification checklists** for:
> - Empty string → NULL (10 fields)
> - NULL → empty string (reverse)
> - Legacy defaults (homeOrAway, isPlayed)
> - Player array normalization
> - Event ordering via order_index
> - Assessment slider flattening
>
> **Reference**: Use [supabase-verification-matrix.md](./supabase-verification-matrix.md) for field-by-field mappings.

**Pre-requisite: Generate Supabase Types**
```bash
npx supabase gen types typescript --project-id <project-id> > src/types/supabase.ts
```
This replaces the placeholder `any` types in SupabaseDataStore.ts (`DbInsertData`, `DbRow`, etc.) with proper generated types for compile-time type safety.

**Files to Create**:
```
src/datastore/supabase/queries/games.ts            # Game CRUD (complex)
src/datastore/supabase/transforms/gameTransform.ts # AppState ↔ 5 tables
src/datastore/supabase/transforms/typeAdapters.ts  # TS ↔ PostgreSQL
src/datastore/supabase/transforms/index.ts         # Barrel export
supabase/migrations/001_rpc_functions.sql          # RPC functions for transactions
```

**Files to Modify**:
```
src/datastore/SupabaseDataStore.ts   # Add game methods
```

**Implements DataStore Methods**:
- [ ] `getGames()`, `getGameById()`, `createGame()`, `saveGame()`, `saveAllGames()`, `deleteGame()`
- [ ] `addGameEvent()`, `updateGameEvent()`, `removeGameEvent()`
- [ ] `getPlayerAdjustments()`, `addPlayerAdjustment()`, `updatePlayerAdjustment()`, `deletePlayerAdjustment()`
- [ ] `getWarmupPlan()`, `saveWarmupPlan()`, `deleteWarmupPlan()`
- [ ] `getTimerState()`, `saveTimerState()`, `clearTimerState()` (local-only, no-op for cloud)

**Deferred from PR #3** (games now exist):
- [ ] `removePersonnelMember()` cascade delete - must remove personnel ID from all games' `gamePersonnel` arrays when personnel is deleted (see `LocalDataStore.ts:1223-1291` for reference implementation)

**Critical Transformations**:
- [ ] `seasonId: ''` → `season_id: NULL`
- [ ] `gameEvents[]` array index → `order_index` column
- [ ] Text IDs preserved (no UUID conversion)
- [ ] RPC function `save_game_with_relations()` for atomic 5-table writes

**Deliverables**:
- [ ] Game transforms: 1 AppState JSON ↔ 5 PostgreSQL tables
- [ ] RPC functions deployed to Supabase
- [ ] Batch operations for saveAllGames
- [ ] Timer state remains local (high-frequency writes)
- [ ] All DataStore methods now implemented
- [ ] Integration tests with test Supabase project

**Acceptance Criteria**:
- Games save and load correctly with all nested data
- Event CRUD maintains correct ordering via `order_index`
- Transform is reversible (round-trip test)
- Empty seasonId games save correctly (NULL, not empty string)

---

#### **PR #5: SupabaseAuthService + Auth UI** (~25 hours)

**Branch**: `supabase/pr5-auth-service`
**Depends on**: PR #2 merged (can parallel with PR #3-4)
**📋 Pre-flight**: See [supabase-preflight-checklist.md](./supabase-preflight-checklist.md#pr-5-supabaseauthservice--auth-ui)

**Files to Create**:
```
src/auth/SupabaseAuthService.ts          # Full auth implementation
src/auth/SupabaseAuthService.test.ts     # Unit tests
src/contexts/AuthProvider.tsx            # Auth context & hooks (see Section 6.3)
src/components/LoginScreen.tsx           # Sign in/up/reset UI (see Section 6.4)
```

**Files to Modify**:
```
src/datastore/factory.ts                 # getAuthService returns Supabase in cloud mode
src/auth/index.ts                        # Export SupabaseAuthService
src/app/layout.tsx                       # Wrap with AuthProvider (see Section 6.5)
src/app/page.tsx                         # Add auth gate (see Section 6.6)
src/public/locales/en/common.json        # Add auth translation keys
src/public/locales/fi/common.json        # Add auth translation keys (Finnish)
```

**Implements AuthService Methods**:
- [ ] `initialize()`, `getMode()`
- [ ] `getCurrentUser()`, `isAuthenticated()`
- [ ] `signUp()`, `signIn()`, `signOut()`, `resetPassword()`
- [ ] `getSession()`, `refreshSession()`, `onAuthStateChange()`

**Implements Auth UI** (see Section 6 for full implementation):
- [ ] `AuthProvider` - React context wrapping app
- [ ] `LoginScreen` - Sign in, sign up, password reset forms
- [ ] Auth gate in `page.tsx` - Shows LoginScreen when cloud mode + not authenticated
- [ ] Translation keys for all auth UI strings (EN/FI)

**Deliverables**:
- [ ] Full Supabase Auth integration
- [ ] Session persistence and auto-refresh
- [ ] Auth state change listeners
- [ ] Error mapping (Supabase errors → AuthError)
- [ ] **AuthProvider context** with `useAuth()` hook
- [ ] **LoginScreen component** matching StartScreen visual style
- [ ] **Auth flow integration** in page.tsx
- [ ] Unit tests with mocked auth

**Acceptance Criteria**:
- Sign up / sign in / sign out flow works end-to-end
- Session persists across page reloads
- Password reset email sends correctly
- **LoginScreen appears in cloud mode when not authenticated**
- **After sign in, user sees StartScreen → HomePage flow**
- **Local mode unchanged** - no login screen, always authenticated

---

#### **PR #6: Migration Service** (~20 hours)

**Branch**: `supabase/pr6-migration`
**Depends on**: PR #4 and PR #5 merged
**📋 Pre-flight**: See [supabase-preflight-checklist.md](./supabase-preflight-checklist.md#pr-6-migration-service)

**Files to Create**:
```
src/services/migrationService.ts           # Core migration logic
src/services/migrationService.test.ts      # Unit tests
src/components/MigrationWizard.tsx         # UI for migration (optional)
src/components/MigrationProgress.tsx       # Progress indicator (optional)
```

**Deliverables**:
- [ ] `migrateLocalToCloud()` - exports local data, uploads to Supabase
- [ ] Progress callback for UI feedback
- [ ] Verification step (compare counts)
- [ ] Rollback capability (on failure, local data untouched)
- [ ] Error handling and reporting

**Acceptance Criteria**:
- Migration completes for user with 100 games
- All data types migrate correctly
- Progress updates at each stage
- Verification confirms data integrity

---

#### **PR #7: Performance & QueryProvider** (~10 hours)

**Branch**: `supabase/pr7-performance`
**Depends on**: PR #4 merged
**📋 Pre-flight**: See [supabase-preflight-checklist.md](./supabase-preflight-checklist.md#pr-7-performance--queryprovider)

**Files to Modify**:
```
src/app/QueryProvider.tsx            # Mode-specific React Query config
src/hooks/useGameDataQueries.ts      # Verify cloud compatibility
src/hooks/useRoster.ts               # Verify optimistic patterns work
```

**Files to Create**:
```
src/utils/optimistic.ts              # Shared optimistic update helpers (optional)
```

**Deliverables**:
- [ ] Cloud mode: 5-minute staleTime, 30-minute gcTime
- [ ] Local mode: unchanged (current defaults)
- [ ] Prefetch on app initialization for cloud mode
- [ ] Performance benchmarks documented

**Acceptance Criteria**:
- Add player: <50ms perceived latency
- Load game list: <100ms (cache hit)
- Initial load: <1s (parallel prefetch)

---

#### **PR #8: Integration & Final Polish** (~12 hours)

**Branch**: `supabase/pr8-integration`
**Depends on**: All previous PRs merged
**📋 Pre-flight**: See [supabase-preflight-checklist.md](./supabase-preflight-checklist.md#pr-8-integration--final-polish)

> ⚠️ **Final Gate**: Before merging to master, run the **complete verification suite** in the preflight checklist "Final Checklist Before Master Merge" section.

**Files to Create/Modify**:
```
src/components/CloudSyncToggle.tsx   # UI to enable/disable cloud mode
src/app/settings/page.tsx            # Add cloud settings section
tests/integration/cloud-flow.test.ts # End-to-end integration tests
```

**Deliverables**:
- [ ] UI toggle for enabling cloud mode
- [ ] Settings page shows cloud status
- [ ] Full integration test suite
- [ ] Documentation updates
- [ ] Final cleanup and code review
- [ ] **Deferred from PR #4**: Generate proper Supabase types to replace `unknown` JSONB columns in `src/types/supabase.ts` (tactical_discs, tactical_ball_position, etc.) - removes `as unknown` type assertions

**Acceptance Criteria**:
- User can enable cloud mode from settings
- Migration wizard guides first-time cloud users
- All tests pass (unit + integration)
- No regressions in local mode

---

### 2.5 PR Summary Table

| PR | Branch | Status | Tests | Dependencies | Key Deliverables |
|----|--------|--------|-------|--------------|------------------|
| 1 | `supabase/pr1-foundation` | ✅ MERGED | 15 | None | backendConfig.ts, factory mode detection |
| 2 | `supabase/pr2-supabase-client` | ✅ MERGED | 15 | PR #1 | Supabase client, lazy loading |
| 3 | `supabase/pr3-datastore-core` | ✅ MERGED | 80+ | PR #2 | Core CRUD + TDD + parity tests |
| 4 | `supabase/pr4-datastore-games` | ✅ MERGED | 70+ | PR #3 | Game transforms (TDD), RPC, all DataStore |
| 5 | `supabase/pr5-auth-service` | ✅ MERGED | 45 | PR #2 | Auth service + Auth UI + TDD |
| 6 | `supabase/pr6-migration` | ✅ MERGED | 30 | PR #4, #5 | Migration service + TDD + verification |
| 7 | `supabase/pr7-performance` | ✅ MERGED | 15 | PR #4 | QueryProvider optimization |
| 8 | `supabase/pr8-integration` | ✅ MERGED | 40 | All #1-7 | UI integration, polish |
| **Final** | **`feature/...` → `master`** | **PENDING** | **—** | **All + Supabase setup** | **E2E testing, production merge** |

**Total**: ~183 hours (~390 new tests)

> **Note**: Hours include TDD test-writing time. See Section 9 for detailed testing strategy. See **Section 10** for complete infrastructure and final merge details.

### 2.6 Parallel Work Opportunities

```
PR #1 ─────────┐
               ├──► PR #2 ─────┬──► PR #3 ──► PR #4 ──┬──► PR #6 ──► PR #8 ──► PR #9
               │               │                      │                          │
               │               └──► PR #5 ────────────┘                          │
               │                         │                                       │
               │                         └──► PR #7 ─────────────────────────────┤
               │                                                                 │
               │                                        ┌────────────────────────┘
               │                                        ▼
               │                              ┌─────────────────────┐
               │                              │  Supabase Setup     │
               │                              │  (create project,   │
               │                              │   run migrations)   │
               │                              └──────────┬──────────┘
               │                                         │
               │                                         ▼
               │                              ┌─────────────────────┐
               │                              │  E2E Testing        │
               │                              │  (real Supabase)    │
               │                              └──────────┬──────────┘
               │                                         │
               │                                         ▼
               │                              ┌─────────────────────┐
               │                              │  FINAL MERGE        │
               │                              │  feature → master   │
               │                              └─────────────────────┘
```

- **PR #3 and PR #5** can be developed in parallel after PR #2
- **PR #7** can start after PR #4, parallel with PR #6
- **PR #8** requires PRs #1-7 complete
- **PR #9** requires PR #8 (adds SQL files and MigrationWizard)
- **Final Merge** requires PR #9 + Supabase project setup + E2E testing

### 2.7 Definition of Done (Per PR)

Before merging any PR to `feature/supabase-cloud-backend`:

- [ ] All new code has unit tests
- [ ] `npm run build` passes
- [ ] `npm test` passes (no regressions)
- [ ] `npm run lint` passes
- [ ] Code reviewed and approved
- [ ] PR description documents what was implemented
- [ ] No `console.log` statements (use logger)
- [ ] TypeScript strict mode passes

### 2.8 Final Merge to Master

Before creating PR from `feature/supabase-cloud-backend` → `master`:

- [ ] All 8 sub-PRs merged to feature branch
- [ ] Full integration test suite passes
- [ ] Manual testing completed:
  - [ ] Fresh install → local mode works
  - [ ] Enable cloud → sign up → migrate → data syncs
  - [ ] Disable cloud → returns to local
  - [ ] Offline behavior graceful
- [ ] Performance benchmarks met
- [ ] Documentation complete
- [ ] Team sign-off

---

## 3. Architecture Overview

> **Note**: This architecture is the TARGET STATE. Currently only the left side (Local) exists.
> The right side (Cloud/Supabase) needs to be built.

### Layer Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           APPLICATION LAYER                          │
│  React Components, Hooks, Pages                                      │
│  - No direct storage access                                          │
│  - Uses React Query for data fetching                                │
│  - All mutations through managers                                    │
└────────────────────────────────────┬────────────────────────────────┘
                                     │
┌────────────────────────────────────┴────────────────────────────────┐
│                           MANAGER LAYER                              │
│  src/utils/masterRosterManager.ts, savedGames.ts, etc.              │
│  - Business logic (validation, cascade operations)                   │
│  - Delegates storage to DataStore                                    │
│  - Orchestrates complex operations                                   │
└────────────────────────────────────┬────────────────────────────────┘
                                     │
┌────────────────────────────────────┴────────────────────────────────┐
│                           DATASTORE INTERFACE                        │
│  src/interfaces/DataStore.ts (60+ methods)                          │
│  - Backend-agnostic contract                                         │
│  - Implemented by both LocalDataStore and SupabaseDataStore         │
└──────────────────────────┬───────────────────┬──────────────────────┘
                           │                   │
           ┌───────────────┴───────┐ ┌─────────┴───────────────┐
           │   LocalDataStore      │ │   SupabaseDataStore     │
           │   (DEFAULT) [EXISTS]  │ │   (CLOUD) [TO BUILD]    │
           │                       │ │                         │
           │   - IndexedDB         │ │   - Supabase Client     │
           │   - Synchronous feel  │ │   - Optimistic updates  │
           │   - No auth required  │ │   - Background sync     │
           │   - Works offline     │ │   - Real-time optional  │
           └───────────────────────┘ └─────────────────────────┘
```

### Auth Layer Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                         AUTHSERVICE INTERFACE                       │
│  src/interfaces/AuthService.ts                                      │
└──────────────────────────┬───────────────────┬─────────────────────┘
                           │                   │
           ┌───────────────┴───────┐ ┌─────────┴───────────────┐
           │   LocalAuthService    │ │   SupabaseAuthService   │
           │   (DEFAULT) [EXISTS]  │ │   (CLOUD) [TO BUILD]    │
           │                       │ │                         │
           │   - No-op methods     │ │   - Supabase Auth       │
           │   - Always "logged in"│ │   - Email/Password      │
           │   - LOCAL_USER const  │ │   - OAuth optional      │
           │   - Instant returns   │ │   - Session management  │
           └───────────────────────┘ └─────────────────────────┘
```

---

## 4. Configuration System

### 4.1 Environment Configuration [TO BUILD]

**File**: `src/config/backendConfig.ts` (does not exist yet - create this file)

```typescript
/**
 * Backend configuration - controls which implementation is used
 *
 * IMPORTANT: This is the ONLY place backend mode is determined.
 * All other code uses getBackendMode() from this file.
 */

export type BackendMode = 'local' | 'cloud';

/**
 * Determine backend mode from environment or runtime config
 *
 * Priority order:
 * 1. Runtime override (localStorage for user who enabled cloud)
 * 2. Environment variable (for development/testing)
 * 3. Default: 'local' (current production behavior)
 */
export function getBackendMode(): BackendMode {
  // Check runtime override first (user enabled cloud sync)
  if (typeof window !== 'undefined') {
    const runtimeMode = localStorage.getItem('matchops_backend_mode');
    if (runtimeMode === 'cloud') {
      return 'cloud';
    }
  }

  // Check environment variable
  const envMode = process.env.NEXT_PUBLIC_BACKEND_MODE;
  if (envMode === 'cloud') {
    return 'cloud';
  }

  // Default: local mode (current behavior, unchanged)
  return 'local';
}

/**
 * Check if cloud features are available (env vars configured)
 */
export function isCloudAvailable(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/**
 * Enable cloud mode (called when user activates cloud sync)
 * Returns true if successful, false if cloud not available
 */
export function enableCloudMode(): boolean {
  if (!isCloudAvailable()) {
    return false;
  }
  localStorage.setItem('matchops_backend_mode', 'cloud');
  return true;
}

/**
 * Disable cloud mode (return to local)
 */
export function disableCloudMode(): void {
  localStorage.removeItem('matchops_backend_mode');
}
```

**IMPORTANT: Mode Switch Requires App Restart**

Switching between local and cloud mode requires a full app restart (page reload) because:
1. **QueryClient state**: React Query caches are mode-specific and cannot be hot-swapped
2. **DataStore singleton**: The factory creates a single instance on first access
3. **Auth state**: Cloud mode requires authentication before DataStore access

```typescript
// Correct pattern for mode switching in UI:
async function switchToCloudMode() {
  if (enableCloudMode()) {
    // Must reload to reinitialize factory with new mode
    window.location.reload();
  }
}

async function switchToLocalMode() {
  disableCloudMode();
  // Must reload to reinitialize factory with new mode
  window.location.reload();
}
```

The `resetFactory()` function exists for testing but is NOT recommended for production mode switching - always use page reload.

### 4.2 Factory Updates [TO BUILD]

**File**: `src/datastore/factory.ts`

> **Current State**: The factory currently only supports local mode. Update it to support cloud mode as shown below.

```typescript
// Updated factory.ts - adds cloud mode support
import { DataStore } from '@/interfaces/DataStore';
import { AuthService } from '@/interfaces/AuthService';
import { LocalDataStore } from './LocalDataStore';
import { LocalAuthService } from '@/auth/LocalAuthService';
import { getBackendMode, isCloudAvailable } from '@/config/backendConfig';
import logger from '@/utils/logger';

// Lazy imports to avoid loading Supabase in local mode
let SupabaseDataStore: typeof import('./SupabaseDataStore').SupabaseDataStore | null = null;
let SupabaseAuthService: typeof import('@/auth/SupabaseAuthService').SupabaseAuthService | null = null;

// Singleton instances
let dataStoreInstance: DataStore | null = null;
let authServiceInstance: AuthService | null = null;
let dataStoreInitPromise: Promise<DataStore> | null = null;
let authServiceInitPromise: Promise<AuthService> | null = null;

/**
 * Get the DataStore singleton
 *
 * - In local mode: Returns LocalDataStore (IndexedDB)
 * - In cloud mode: Returns SupabaseDataStore (PostgreSQL)
 *
 * The switch is transparent to all consuming code.
 */
export async function getDataStore(): Promise<DataStore> {
  // Return existing instance
  if (dataStoreInstance) {
    return dataStoreInstance;
  }

  // Handle concurrent initialization
  if (dataStoreInitPromise) {
    return dataStoreInitPromise;
  }

  dataStoreInitPromise = initializeDataStore();

  try {
    dataStoreInstance = await dataStoreInitPromise;
    return dataStoreInstance;
  } finally {
    dataStoreInitPromise = null;
  }
}

async function initializeDataStore(): Promise<DataStore> {
  const mode = getBackendMode();
  logger.info(`[Factory] Initializing DataStore in ${mode} mode`);

  if (mode === 'cloud' && isCloudAvailable()) {
    // Lazy load Supabase module (not bundled in local mode)
    if (!SupabaseDataStore) {
      const module = await import('./SupabaseDataStore');
      SupabaseDataStore = module.SupabaseDataStore;
    }

    const supabaseStore = new SupabaseDataStore();
    await supabaseStore.initialize();
    return supabaseStore;
  }

  // Default: LocalDataStore
  const localStore = new LocalDataStore();
  await localStore.initialize();
  return localStore;
}

/**
 * Get the AuthService singleton
 *
 * - In local mode: Returns LocalAuthService (no-op, always authenticated)
 * - In cloud mode: Returns SupabaseAuthService (Supabase Auth)
 */
export async function getAuthService(): Promise<AuthService> {
  if (authServiceInstance) {
    return authServiceInstance;
  }

  if (authServiceInitPromise) {
    return authServiceInitPromise;
  }

  authServiceInitPromise = initializeAuthService();

  try {
    authServiceInstance = await authServiceInitPromise;
    return authServiceInstance;
  } finally {
    authServiceInitPromise = null;
  }
}

async function initializeAuthService(): Promise<AuthService> {
  const mode = getBackendMode();
  logger.info(`[Factory] Initializing AuthService in ${mode} mode`);

  if (mode === 'cloud' && isCloudAvailable()) {
    if (!SupabaseAuthService) {
      const module = await import('@/auth/SupabaseAuthService');
      SupabaseAuthService = module.SupabaseAuthService;
    }

    const supabaseAuth = new SupabaseAuthService();
    await supabaseAuth.initialize();
    return supabaseAuth;
  }

  // Default: LocalAuthService
  const localAuth = new LocalAuthService();
  await localAuth.initialize();
  return localAuth;
}

/**
 * Reset factory (for testing or mode switching)
 *
 * IMPORTANT: After calling this, app must reinitialize.
 * Used when user switches between local and cloud mode.
 */
export async function resetFactory(): Promise<void> {
  if (dataStoreInstance) {
    await dataStoreInstance.close();
    dataStoreInstance = null;
  }

  authServiceInstance = null;
  dataStoreInitPromise = null;
  authServiceInitPromise = null;

  logger.info('[Factory] Reset complete');
}

/**
 * Check if DataStore is initialized
 */
export function isDataStoreInitialized(): boolean {
  return dataStoreInstance !== null;
}

/**
 * Get current backend name (for debugging/UI)
 */
export function getCurrentBackendName(): string {
  return dataStoreInstance?.getBackendName() ?? 'not initialized';
}
```

### 4.3 Environment Variables

**File**: `.env.local.example`

```bash
# Backend Mode Configuration
# ========================
# Set to 'cloud' to enable Supabase backend
# Default: 'local' (IndexedDB, no auth)
NEXT_PUBLIC_BACKEND_MODE=local

# Supabase Configuration (required for cloud mode)
# ================================================
# Get these from your Supabase project settings
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Development / Testing
# =====================
# Force cloud mode even without user opt-in
# NEXT_PUBLIC_BACKEND_MODE=cloud
```

---

## 5. SupabaseDataStore Implementation [TO BUILD]

> **Database Schema Reference**: See `docs/02-technical/database/supabase-schema.md` for complete PostgreSQL table definitions (15 tables with RLS policies).
>
> **Critical Schema Decisions (Revised 2026-01-10)**:
> - **IDs are `text` NOT `uuid`**: Preserves app's `{prefix}_{timestamp}_{random}` format for chronological sorting via `extractTimestampFromId()`
> - **season_id is nullable**: Games can exist without a season (app uses `seasonId: ''` which maps to `NULL`)
> - **game_events has `order_index`**: Preserves insertion order for index-based DataStore operations
> - **Timer state is LOCAL ONLY**: Not synced to cloud due to high-frequency writes
> - **Transactions use RPC functions**: Multi-table game operations require `save_game_with_relations()` RPC

---

### 5.0 Critical Implementation Details (MUST READ)

This section addresses edge cases and behaviors that **must be implemented exactly as specified** to maintain parity with LocalDataStore.

#### 5.0.1 createGame() Required Defaults

When `createGame()` is called, SupabaseDataStore **MUST** apply these defaults to match LocalDataStore behavior (see `LocalDataStore.ts` lines 1324-1361):

```typescript
// SupabaseDataStore.createGame() must provide ALL these defaults:
const defaults = {
  playersOnField: [],
  opponents: [],
  drawings: [],
  availablePlayers: [],
  showPlayerNames: true,           // NOT NULL in schema, no DB default
  teamName: 'My Team',
  gameEvents: [],
  opponentName: 'Opponent',
  gameDate: new Date().toISOString().split('T')[0],
  homeScore: 0,
  awayScore: 0,
  gameNotes: '',
  homeOrAway: 'home',
  numberOfPeriods: 2,
  periodDurationMinutes: 10,       // ⚠️ NOT NULL in schema, NO DB DEFAULT!
  currentPeriod: 1,
  gameStatus: 'notStarted',
  isPlayed: true,                  // Note: schema default is false, app default is true
  selectedPlayerIds: [],
  assessments: {},
  seasonId: '',
  tournamentId: '',
  tournamentLevel: '',
  ageGroup: '',
  gameLocation: '',
  gameTime: '',
  tacticalDiscs: [],
  tacticalDrawings: [],
  tacticalBallPosition: { relX: 0.5, relY: 0.5 },  // Center of field
  subIntervalMinutes: 5,
  completedIntervalDurations: [],
  lastSubConfirmationTimeSeconds: 0,
  gamePersonnel: [],
};
```

**CRITICAL**: `periodDurationMinutes` has NO schema default but is NOT NULL. Failing to provide this will cause INSERT to fail.

#### 5.0.2 Event CRUD order_index Strategy

LocalDataStore uses array semantics where indices auto-adjust on delete. For Supabase:

**Strategy: Full Array Save on Any Event Change**

```typescript
// addGameEvent, updateGameEvent, removeGameEvent all follow this pattern:
async addGameEvent(gameId: string, event: GameEvent): Promise<AppState | null> {
  // 1. Load current game
  const game = await this.getGameById(gameId);
  if (!game) return null;

  // 2. Modify array in memory
  game.gameEvents.push(event);

  // 3. Save entire game (transform assigns new order_index values)
  // This ensures contiguous indices: [0, 1, 2, ...]
  return this.saveGame(gameId, game);
}

async removeGameEvent(gameId: string, eventIndex: number): Promise<AppState | null> {
  const game = await this.getGameById(gameId);
  if (!game) return null;

  // Array splice auto-reindexes in memory
  game.gameEvents.splice(eventIndex, 1);

  // Save entire game - transform reassigns order_index 0, 1, 2, ...
  return this.saveGame(gameId, game);
}
```

**Why not incremental updates?** Reindexing via UPDATE would require transactions and is error-prone. Full-save is simpler and the RPC function handles atomicity.

#### 5.0.3 selectedPlayerIds Ordering

**Decision: Accept "on-field first" ordering**

The transform sorts selected players with on-field players first for UI consistency:

```typescript
const selectedPlayerIds = players
  .filter((p) => p.is_selected)
  .sort((a, b) => {
    if (a.on_field && !b.on_field) return -1;
    if (!a.on_field && b.on_field) return 1;
    return 0;  // Preserve DB order within groups
  })
  .map((p) => p.player_id);
```

**Rationale**: The UI shows on-field players prominently. Original insertion order within each group (on-field vs bench) is preserved via DB fetch order.

#### 5.0.4 Personnel certifications Field

**MUST include certifications in all Personnel transforms**:

```typescript
// Forward transform (App → DB)
const personnelRow = {
  id: personnel.id,
  name: personnel.name,
  role: personnel.role,
  email: personnel.email ?? null,
  phone: personnel.phone ?? null,
  certifications: personnel.certifications ?? [],  // text[] array
  notes: personnel.notes ?? null,
  // ...timestamps
};

// Reverse transform (DB → App)
const personnel: Personnel = {
  id: row.id,
  name: row.name,
  role: row.role as PersonnelRole,
  email: row.email ?? undefined,
  phone: row.phone ?? undefined,
  certifications: row.certifications ?? [],
  notes: row.notes ?? undefined,
  // ...timestamps
};
```

#### 5.0.5 Offline Mode Policy

**Decision: Cloud mode is ONLINE-ONLY (no offline queue)**

```typescript
// SupabaseDataStore behavior when offline:
async createPlayer(player: Omit<Player, 'id'>): Promise<Player> {
  // Check network before operation
  if (!navigator.onLine) {
    throw new NetworkError('Cannot create player while offline. Please check your connection.');
  }
  // ... proceed with Supabase call
}
```

**Rationale**:
- Offline queue adds significant complexity (conflict resolution, sync state UI)
- Users can switch to local mode for offline use
- Cloud mode is for users who want sync, implying connectivity
- Future enhancement: Add offline queue in v2 if user demand exists

**User-facing behavior**:
- Operations fail with clear "offline" error message
- UI should show connection status indicator in cloud mode
- Recommend switching to local mode for offline work

#### 5.0.6 Session Expiry Handling

**SupabaseDataStore must handle 401 errors gracefully**:

```typescript
private async executeWithAuth<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (this.isAuthError(error)) {
      // Attempt token refresh
      const { error: refreshError } = await this.client.auth.refreshSession();

      if (refreshError) {
        // Refresh failed - user must re-authenticate
        throw new AuthError('Session expired. Please sign in again.', 'SESSION_EXPIRED');
      }

      // Retry operation with fresh token
      return await operation();
    }
    throw error;
  }
}

private isAuthError(error: unknown): boolean {
  return error instanceof Error &&
    (error.message.includes('401') ||
     error.message.includes('JWT expired') ||
     error.message.includes('Invalid JWT'));
}
```

**AuthProvider should listen for SESSION_EXPIRED** and show re-auth UI.

#### 5.0.7 Composite Uniqueness Race Condition

**Acknowledged Risk: Multi-device races can create duplicates**

Schema uses `UNIQUE(user_id, name)` but app requires composite uniqueness:
- Teams: name + boundSeasonId + boundTournamentId + boundTournamentSeriesId + gameType
- Seasons: name + clubSeason + gameType + gender + ageGroup + leagueId
- Tournaments: name + clubSeason + gameType + gender + ageGroup

**Mitigation Strategy**:
1. App-level validation runs BEFORE insert (covers 99% of cases)
2. If race creates duplicate, user sees both and can delete one
3. Future: Add DB-level composite unique constraints if races become common

**Why not fix now?** Composite constraints in PostgreSQL are complex with nullable fields. App-level validation is sufficient for single-user-per-device usage pattern.

#### 5.0.8 Test Data Coverage Gap

**tournamentSeriesId and tournamentLevel are not in test data**

Add explicit test fixtures for round-trip verification:

```typescript
// In SupabaseDataStore.test.ts
describe('tournamentSeriesId mapping', () => {
  it('preserves tournamentSeriesId through round-trip', async () => {
    const game = createTestGame({
      tournamentSeriesId: 'series_123',
      tournamentLevel: 'Gold',
    });

    const saved = await datastore.saveGame('test_game', game);
    const loaded = await datastore.getGameById('test_game');

    expect(loaded?.tournamentSeriesId).toBe('series_123');
    expect(loaded?.tournamentLevel).toBe('Gold');
  });
});
```

#### 5.0.9 Tournament Level Migration (migrateTournamentLevel)

**MUST preserve runtime migration behavior from LocalDataStore**:

LocalDataStore applies a runtime migration when loading tournaments that converts legacy `level` (single string) to `series[]` (array). SupabaseDataStore must:

1. **On read (getTournaments)**: Apply same migration logic
2. **On write**: Store both `level` (for backward compat) and `series[]`

```typescript
// Same logic as LocalDataStore.ts lines 296-310
const migrateTournamentLevel = (tournament: Tournament): Tournament => {
  // Skip if already has series
  if (tournament.series && tournament.series.length > 0) {
    return tournament;
  }

  // Convert legacy level to series
  if (tournament.level) {
    const newSeries: TournamentSeries = {
      id: `series_${tournament.id}_${tournament.level.toLowerCase().replace(/\s+/g, '-')}`,
      level: tournament.level,
    };
    return { ...tournament, series: [newSeries] };
  }

  return tournament;
};

// Apply in getTournaments reverse transform
async getTournaments(includeArchived = false): Promise<Tournament[]> {
  const tournaments = await this.loadFromSupabase();
  return tournaments
    .filter((t) => includeArchived || !t.archived)
    .map(migrateTournamentLevel);  // Apply migration on read
}
```

**Database Storage**: Both `level` (legacy) and `series` (jsonb array) are stored. Migration happens at read time, not at storage time.

#### 5.0.10 Game Validation Parity (validateGame)

**MUST use same validation logic as LocalDataStore**:

LocalDataStore has a `validateGame()` helper (lines 324-350) that validates before save. SupabaseDataStore should:

1. **Import and reuse** the same validation function
2. **Run BEFORE transform** - catch errors early with clear messages

```typescript
// Extract validateGame to shared location: src/datastore/validation.ts
import { validateGame } from './validation';

// In SupabaseDataStore.saveGame()
async saveGame(id: string, game: AppState): Promise<AppState> {
  // Validate BEFORE any network call
  validateGame(game);

  const tables = transformGameToTables(id, game, this.userId!);
  // ... rest of save logic
}

// In SupabaseDataStore.saveAllGames()
async saveAllGames(games: Record<string, AppState>): Promise<Record<string, AppState>> {
  // Validate ALL games before any writes
  for (const [gameId, game] of Object.entries(games)) {
    validateGame(game, gameId);  // Include gameId in error context
  }
  // ... rest of batch save logic
}
```

**Validation Rules** (from LocalDataStore):
- Required fields: `teamName`, `opponentName`, `gameDate`
- `gameNotes` max length
- `ageGroup` format validation
- Throws `ValidationError` on failure

#### 5.0.11 RPC game_id Injection

**RPC must override game_id in all child rows** to prevent client manipulation:

```sql
-- In save_game_with_relations RPC body, after extracting game_id:
v_game_id := p_game->>'id';

-- Override game_id in player rows (client could send wrong game_id)
INSERT INTO game_players
SELECT * FROM jsonb_populate_recordset(null::game_players,
  (SELECT jsonb_agg(
    jsonb_set(
      jsonb_set(elem, '{user_id}', to_jsonb(v_user_id::text)),
      '{game_id}', to_jsonb(v_game_id)  -- Force correct game_id
    )
  )
  FROM unnest(p_players) elem));

-- Same pattern for events, assessments
```

**Why this matters**: Client could send `game_id: 'other_users_game'` in child rows. RPC must ignore client-provided game_id and use the actual game being saved.

**Transform layer must still include game_id** (for schema completeness), but RPC overrides it.

#### 5.0.12 clubSeason Computation on Read

**SupabaseDataStore must compute clubSeason if missing** (matches LocalDataStore behavior):

```typescript
// LocalDataStore computes clubSeason on-the-fly for backward compatibility
// SupabaseDataStore must do the same

async getSeasons(includeArchived = false): Promise<Season[]> {
  const seasons = await this.fetchFromSupabase();
  const { start, end } = await this.getSeasonDates();

  return seasons
    .filter((s) => includeArchived || !s.archived)
    .map((season) => ({
      ...season,
      // Compute clubSeason if not stored (legacy data)
      clubSeason: season.clubSeason ?? getClubSeasonForDate(season.startDate, start, end),
    }));
}

async getTournaments(includeArchived = false): Promise<Tournament[]> {
  const tournaments = await this.fetchFromSupabase();
  const { start, end } = await this.getSeasonDates();

  return tournaments
    .filter((t) => includeArchived || !t.archived)
    .map((tournament) => migrateTournamentLevel({
      ...tournament,
      // Compute clubSeason if not stored (legacy data)
      clubSeason: tournament.clubSeason ?? getClubSeasonForDate(tournament.startDate, start, end),
    }));
}
```

**Import**: `import { getClubSeasonForDate } from '@/utils/clubSeason';`

#### 5.0.13 Supabase Concurrency Strategy

**LocalDataStore uses key-based locks** (`src/utils/storageKeyLock.ts`):
- `withKeyLock(PERSONNEL_KEY, async () => {...})`
- Lock ordering: `PERSONNEL_KEY` → `SAVED_GAMES_KEY` (to prevent deadlocks)

**Supabase handles concurrency differently**:

| LocalDataStore | SupabaseDataStore | Rationale |
|----------------|-------------------|-----------|
| In-memory locks per key | PostgreSQL row-level locks | DB handles concurrency |
| Sequential within tab | Parallel requests OK | Supabase is stateless |
| Lock ordering required | Not needed | RPC uses transactions |

**SupabaseDataStore concurrency rules**:

1. **Single-entity operations**: No locks needed - PostgreSQL handles row conflicts
2. **Multi-entity operations**: Use RPC for atomicity (like `save_game_with_relations`)
3. **Cascade operations**: Use RPC (like `delete_personnel_cascade`)
4. **Optimistic updates**: Cache updates immediately, rollback on server failure

```typescript
// No locks needed - Supabase handles concurrency
async createPlayer(player: Omit<Player, 'id'>): Promise<Player> {
  const newPlayer = { ...player, id: generateId('player') };

  // Optimistic: update cache immediately
  this.cache.players?.push(newPlayer);

  // Persist to server (may fail on conflict)
  try {
    await this.client.from('players').insert(transformPlayer(newPlayer));
    return newPlayer;
  } catch (error) {
    // Rollback cache on failure
    this.cache.players = this.cache.players?.filter(p => p.id !== newPlayer.id);
    throw error;
  }
}
```

**Conflict resolution**: Last-write-wins (implicit in Supabase). If two devices edit same entity, last `UPDATE` wins. This matches typical cloud app behavior.

#### 5.0.14 Migration Using DataStore Getters + Upsert Methods

**⚠️ CRITICAL: Migration must NOT use create* methods** - they generate new IDs!

```typescript
// ❌ WRONG: createPlayer generates a NEW ID, breaking all cross-references
await supabaseDataStore.createPlayer(player);  // player.id is ignored!

// ❌ WRONG: Reading raw storage keys skips migrations
const tournaments = JSON.parse(localStorage.getItem(TOURNAMENTS_LIST_KEY));

// ✅ CORRECT: Use upsert methods that preserve original IDs
await supabaseDataStore.upsertPlayer(player);  // Uses player.id as-is
```

**Migration Design Principles**:
1. **Read via DataStore getters** - applies legacy migrations (Rule 18)
2. **Write via upsert methods** - preserves existing IDs using `onConflict: 'id'`
3. **Await all writes** - no optimistic fire-and-forget
4. **Verify completion** - only after all awaits resolve

**Implementation Pattern (DRY - reuses SupabaseDataStore transforms)**:

SupabaseDataStore provides upsert methods that:
- Accept entities with existing IDs
- Use Supabase `.upsert()` with `onConflict: 'id'`
- Reuse the same transforms as create/update methods

```typescript
// SupabaseDataStore upsert methods (added in PR #6):
async upsertPlayer(player: Player): Promise<Player>
async upsertTeam(team: Team): Promise<Team>
async upsertSeason(season: Season): Promise<Season>
async upsertTournament(tournament: Tournament): Promise<Tournament>
async upsertPersonnel(personnel: Personnel): Promise<Personnel>
```

**Migration service upload flow**:

```typescript
// src/services/migrationService.ts
async function uploadToCloud(
  localData: LocalDataSnapshot,
  cloudStore: DataStore,
  onProgress?: ProgressCallback
): Promise<void> {
  // Upload in FK-safe order (parents before children)

  // 1. Players (no FK dependencies)
  for (const player of localData.players) {
    await cloudStore.upsertPlayer(player);  // Preserves player.id
  }

  // 2. Seasons (no FK dependencies)
  for (const season of localData.seasons) {
    await cloudStore.upsertSeason(season);  // Preserves season.id
  }

  // 3. Tournaments (no FK dependencies)
  for (const tournament of localData.tournaments) {
    await cloudStore.upsertTournament(tournament);  // Preserves tournament.id
  }

  // 4. Teams (FK to seasons, tournaments - must come AFTER them)
  for (const team of localData.teams) {
    await cloudStore.upsertTeam(team);  // Preserves team.id
  }

  // 5. Team rosters (uses existing saveTeamRoster)
  for (const [teamId, roster] of Object.entries(localData.teamRosters)) {
    await cloudStore.saveTeamRoster(teamId, roster);
  }

  // 6. Personnel (no FK dependencies)
  for (const person of localData.personnel) {
    await cloudStore.upsertPersonnel(person);  // Preserves personnel.id
  }

  // 7. Games (uses saveGame with RPC for atomic 5-table write)
  for (const [gameId, game] of Object.entries(localData.games)) {
    await cloudStore.saveGame(gameId, game);  // Preserves gameId
  }

  // 8. Player adjustments (FK to players, seasons, teams - must come AFTER all)
  for (const adjustment of localData.adjustments) {
    await cloudStore.addPlayerAdjustment(adjustment);
  }

  // 9. Warmup plan (optional)
  if (localData.warmupPlan) {
    await cloudStore.saveWarmupPlan(localData.warmupPlan);
  }

  // 10. Settings
  if (localData.settings) {
    await cloudStore.saveSettings(localData.settings);
  }
}
```

**Why upsert methods in SupabaseDataStore (not direct Supabase calls)**:
- **DRY**: Transform logic stays in one place (SupabaseDataStore)
- **Consistency**: Same validation and transforms as normal operations
- **Maintainability**: If transforms change, migration automatically uses updated logic
- **Testing**: Can mock upsert methods in tests

**Why this matters**:
- `createPlayer(player)` ignores `player.id` and generates new ID
- Games reference players by ID - if IDs change, all references break
- Assessments, roster assignments, event scorer IDs all depend on stable IDs

**Legacy migrations applied by getters** (Rule 18):
- `migrateTournamentLevel()` - converts `level` → `series[]`
- `getClubSeasonForDate()` - computes missing `clubSeason`
- Field normalization (undefined → default values)

#### 5.0.15 Data Scale and Paging Strategy

**Current assumption**: 50-100 games per user (documented in CLAUDE.md)

**For users with 500+ games**, implement paging:

```typescript
// Prefetch strategy based on game count
async initialize(): Promise<void> {
  const gameCount = await this.getGameCount();

  if (gameCount <= 200) {
    // Small dataset: prefetch all
    await this.prefetchAll();
  } else {
    // Large dataset: prefetch recent only
    await this.prefetchRecent(100);  // Last 100 games
    // Load older games on demand
  }
}

async prefetchRecent(limit: number): Promise<void> {
  const { data } = await this.client
    .from('games')
    .select('*')
    .order('game_date', { ascending: false })
    .limit(limit);

  this.cache.games = data;
}

// On-demand loading for game lists with pagination
async getGamesPaginated(offset: number, limit: number): Promise<AppState[]> {
  const { data } = await this.client
    .from('games')
    .select('*')
    .order('game_date', { ascending: false })
    .range(offset, offset + limit - 1);

  return data.map(transformTablesToGame);
}
```

**UI considerations**:
- Game list should use virtualization for 500+ items
- "Load more" button or infinite scroll
- Search/filter queries go directly to Supabase (not local cache)

**Current implementation**: Start with full prefetch (simpler). Add paging in future iteration if users report slow loading with large datasets.

#### 5.0.16 Numeric/Bigint Type Adapters

**Issue**: Supabase returns PostgreSQL `bigint` columns as strings (JavaScript numbers can't safely represent 64-bit integers).

**Affected columns**:
- `player_assessments.created_at` - `bigint NOT NULL` (Unix timestamp milliseconds) - **MUST convert string → number**
- `game_events.order_index` - `integer NOT NULL` (NOT bigint, no conversion needed)

**Transform layer must handle `created_at`**:

```typescript
// In src/datastore/supabase/transforms/typeAdapters.ts

/**
 * Safely convert Supabase bigint (returned as string) to number.
 * Falls back to 0 if conversion fails.
 * Used for: player_assessments.created_at (bigint)
 */
export function bigintToNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? 0 : parsed;
}
```

**Usage in player_assessments reverse transform**:

```typescript
// When reading from Supabase - created_at is bigint (returned as string)
assessmentsRecord[a.player_id] = {
  overall: a.overall_rating,
  sliders: { /* ... */ },
  notes: a.notes,
  minutesPlayed: a.minutes_played,
  createdBy: a.created_by,
  createdAt: bigintToNumber(a.created_at),  // ⚠️ bigint string → number
};

// When writing to Supabase - numbers work fine for bigint columns
// PostgreSQL accepts numeric strings or numbers for bigint
```

**Why this matters**: Without conversion, TypeScript sees `created_at` as `string` but our types expect `number`. This would cause timestamp comparison issues if JavaScript treated it as a string.

---

### 5.1 File Structure

> **Note**: None of these files exist yet. Create the entire `src/datastore/supabase/` directory structure.

```
src/datastore/
├── LocalDataStore.ts        # Existing (2,010 lines)
├── SupabaseDataStore.ts     # NEW (~1,800 lines)
├── supabase/
│   ├── client.ts            # Supabase client singleton
│   ├── queries/
│   │   ├── players.ts       # Player CRUD operations
│   │   ├── teams.ts         # Team + roster operations
│   │   ├── seasons.ts       # Season operations
│   │   ├── tournaments.ts   # Tournament operations
│   │   ├── games.ts         # Game operations (complex)
│   │   ├── personnel.ts     # Personnel operations
│   │   ├── settings.ts      # User settings
│   │   └── index.ts         # Re-exports
│   ├── transforms/
│   │   ├── gameTransform.ts # AppState ↔ Database tables
│   │   ├── typeAdapters.ts  # TypeScript ↔ PostgreSQL types
│   │   └── index.ts
│   └── cache/
│       ├── QueryCache.ts    # In-memory cache layer
│       └── optimistic.ts    # Optimistic update helpers
├── factory.ts               # Factory pattern
└── index.ts                 # Exports
```

### 5.2 Supabase Client Singleton

**File**: `src/datastore/supabase/client.ts`

```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase'; // Generated types
import logger from '@/utils/logger';

let supabaseClient: SupabaseClient<Database> | null = null;

/**
 * Get the Supabase client singleton
 *
 * Creates a single client instance that's reused across the app.
 * Includes automatic retry configuration and logging.
 */
export function getSupabaseClient(): SupabaseClient<Database> {
  if (supabaseClient) {
    return supabaseClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Missing Supabase configuration. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    );
  }

  supabaseClient = createClient<Database>(url, anonKey, {
    auth: {
      // Persist session in localStorage
      persistSession: true,
      // Auto-refresh tokens before expiry
      autoRefreshToken: true,
      // Detect session from URL (for OAuth callbacks)
      detectSessionInUrl: true,
    },
    global: {
      // Add request headers for debugging
      headers: {
        'x-client-info': 'matchops-web',
      },
    },
    // Realtime disabled by default (enable for live sync later)
    realtime: {
      params: {
        eventsPerSecond: 2,
      },
    },
  });

  logger.info('[Supabase] Client initialized');
  return supabaseClient;
}

/**
 * Reset client (for testing)
 */
export function resetSupabaseClient(): void {
  supabaseClient = null;
}
```

### 5.3 Design Principles

The `SupabaseDataStore` class follows these critical design principles for professional-grade performance:

1. **NEVER block UI on network** - All operations are optimistic
2. **Cache aggressively** - Minimize network calls
3. **Batch where possible** - Reduce round-trips
4. **Graceful degradation** - Return stale data on network failure

### 5.4 Optimistic Update Pattern

Every mutation in `SupabaseDataStore` follows this pattern:

```typescript
async createPlayer(player: Omit<Player, 'id'>): Promise<Player> {
  this.ensureInitialized();

  // 1. Generate ID client-side using app's existing format (works offline)
  // IMPORTANT: Uses text IDs (player_timestamp_random), NOT uuids
  // This preserves chronological sorting via extractTimestampFromId()
  const newPlayer: Player = {
    ...player,
    id: generateId('player'),  // Uses src/utils/idGenerator.ts
  };

  // 2. Update cache immediately (UI shows instantly)
  if (this.cache.players) {
    this.cache.players = [...this.cache.players, newPlayer];
  }

  // 3. Persist to server (background, non-blocking)
  this.persistPlayerCreate(newPlayer).catch((error) => {
    // Rollback cache on failure
    if (this.cache.players) {
      this.cache.players = this.cache.players.filter(p => p.id !== newPlayer.id);
    }
    logger.error('[SupabaseDataStore] Failed to persist player', { error });
  });

  // 4. Return immediately (optimistic)
  return newPlayer;
}
```

### 5.5 Prefetch Strategy

All data is loaded in parallel on initialization:

```typescript
private async prefetchAllData(): Promise<void> {
  const startTime = Date.now();

  try {
    // Parallel fetch ALL data types (complete prefetch for instant reads)
    const [
      players,
      teams,
      teamRosters,
      seasons,
      tournaments,
      games,
      personnel,
      settings,
      warmupPlan,
      playerAdjustments,  // Added: prefetch all adjustments
    ] = await Promise.all([
        this.fetchPlayersFromServer(),
        this.fetchTeamsFromServer(),
        this.fetchAllTeamRostersFromServer(),
        this.fetchSeasonsFromServer(),
        this.fetchTournamentsFromServer(),
        this.fetchGamesFromServer(),
        this.fetchPersonnelFromServer(),
        this.fetchSettingsFromServer(),
        this.fetchWarmupPlanFromServer(),      // Added
        this.fetchAllPlayerAdjustmentsFromServer(),  // Added
      ]);

    // Populate cache
    this.cache.players = players;
    this.cache.teams = teams;
    this.cache.teamRosters = teamRosters;  // Map<teamId, TeamPlayer[]>
    this.cache.seasons = seasons;
    this.cache.tournaments = tournaments;
    this.cache.games = games;
    this.cache.personnel = personnel;
    this.cache.settings = settings;
    this.cache.warmupPlan = warmupPlan;
    this.cache.playerAdjustments = playerAdjustments;  // Record<playerId, Adjustment[]>

    const duration = Date.now() - startTime;
    logger.info('[SupabaseDataStore] Prefetch complete', { duration: `${duration}ms` });
  } catch (error) {
    logger.error('[SupabaseDataStore] Prefetch failed', { error });
    throw new NetworkError('Failed to load data from server');
  }
}
```

**Result**: Single loading spinner on startup (~300-500ms), then all reads are instant from cache.

### 5.6 Critical Transformations

**File**: `src/datastore/supabase/transforms/gameTransform.ts`

The transform layer handles these critical conversions:

```typescript
// AppState → Database tables (5 tables per game)
export function transformGameToTables(
  gameId: string,
  game: AppState,
  userId: string
): GameTableSet {
  return {
    game: {
      id: gameId,
      user_id: userId,

      // === CRITICAL: Empty string → NULL for ALL nullable string fields ===
      // App uses '' for "not set", DB uses NULL
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

      // === Required fields (direct mapping) ===
      team_name: game.teamName,
      opponent_name: game.opponentName,
      game_date: game.gameDate,
      // DEFENSIVE: Use || to catch both undefined AND empty string (CHECK constraint requires 'home'|'away')
      home_or_away: game.homeOrAway || 'home',
      number_of_periods: game.numberOfPeriods,
      period_duration_minutes: game.periodDurationMinutes,
      current_period: game.currentPeriod,
      game_status: game.gameStatus,
      is_played: game.isPlayed ?? true,  // CRITICAL: Local semantics treat undefined as true (legacy migration)
      home_score: game.homeScore,
      away_score: game.awayScore,
      game_notes: game.gameNotes,
      show_player_names: game.showPlayerNames,

      // === Optional fields ===
      sub_interval_minutes: game.subIntervalMinutes,
      // DEFENSIVE: Guard against NaN/Infinity which PostgreSQL numeric rejects
      demand_factor: (game.demandFactor != null && isFinite(game.demandFactor)) ? game.demandFactor : null,
      game_type: game.gameType,
      gender: game.gender,

      // === Array/object fields ===
      game_personnel: game.gamePersonnel ?? [],           // text[] array of personnel IDs
      formation_snap_points: game.formationSnapPoints,    // jsonb

      // === Timer restoration ===
      // DEFENSIVE: Guard against NaN/Infinity
      time_elapsed_in_seconds: (game.timeElapsedInSeconds != null && isFinite(game.timeElapsedInSeconds))
        ? game.timeElapsedInSeconds : null,
    },
    // CRITICAL: Merge availablePlayers, selectedPlayerIds, and playersOnField
    // Relationship: playersOnField ⊆ selectedPlayerIds ⊆ availablePlayers (nested subsets)
    // IMPORTANT: playersOnField and availablePlayers OVERLAP (same players appear in both)
    // We must NOT create duplicate rows - use availablePlayers as base and update flags
    players: (() => {
      // DEFENSIVE: Legacy games may have undefined arrays - guard with ?? []
      const selectedIds = new Set(game.selectedPlayerIds ?? []);
      const onFieldMap = new Map((game.playersOnField ?? []).map((p) => [p.id, p]));

      // Use availablePlayers as base - one row per player
      return (game.availablePlayers ?? []).map((player) => {
        const onFieldPlayer = onFieldMap.get(player.id);
        const isOnField = !!onFieldPlayer;
        const isSelected = selectedIds.has(player.id);

        return {
          id: `${gameId}_${player.id}`,
          game_id: gameId,
          player_id: player.id,
          user_id: userId,

          // Snapshot fields - use onField version if available (more current state)
          player_name: onFieldPlayer?.name ?? player.name,
          nickname: onFieldPlayer?.nickname ?? player.nickname ?? '',
          jersey_number: onFieldPlayer?.jerseyNumber ?? player.jerseyNumber ?? '',
          is_goalie: onFieldPlayer?.isGoalie ?? player.isGoalie ?? false,
          color: onFieldPlayer?.color ?? player.color,
          notes: onFieldPlayer?.notes ?? player.notes ?? '',
          received_fair_play_card: onFieldPlayer?.receivedFairPlayCard ?? player.receivedFairPlayCard ?? false,

          // Status flags
          // CRITICAL: Normalize is_selected - if on field, must be selected
          // Real data may have players on field but not in selectedPlayerIds
          is_selected: isSelected || isOnField,
          on_field: isOnField,

          // Field position (only for on-field players)
          rel_x: isOnField ? onFieldPlayer!.relX : null,
          rel_y: isOnField ? onFieldPlayer!.relY : null,
        };
      });
    })(),
    // DEFENSIVE: Legacy games may have undefined gameEvents - guard with ?? []
    events: (game.gameEvents ?? []).map((e, index) => ({
      id: e.id,
      game_id: gameId,
      event_type: e.type,
      time_seconds: e.time,
      // CRITICAL: Array index becomes order_index for ordering
      order_index: index,
      scorer_id: e.scorerId,
      assister_id: e.assisterId,
      entity_id: e.entityId,
      user_id: userId,
    })),
    assessments: Object.entries(game.assessments ?? {}).map(([playerId, a]) => ({
      id: `assessment_${gameId}_${playerId}`,
      game_id: gameId,
      player_id: playerId,
      overall_rating: a.overall,
      // CRITICAL: Flatten nested sliders object to individual columns
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
      notes: a.notes,
      minutes_played: a.minutesPlayed,
      created_by: a.createdBy ?? 'coach',  // DEFENSIVE: legacy data may lack this
      created_at: a.createdAt ?? Date.now(),  // CRITICAL: legacy data may lack this, schema has NOT NULL
      user_id: userId,
    })),
    tacticalData: {
      id: gameId,
      game_id: gameId,
      // CRITICAL: Default undefined tactical fields for legacy games
      // Legacy games may not have these fields, but AppState requires them
      opponents: game.opponents ?? [],
      drawings: game.drawings ?? [],
      tactical_discs: game.tacticalDiscs ?? [],
      tactical_drawings: game.tacticalDrawings ?? [],
      tactical_ball_position: game.tacticalBallPosition ?? null,  // null is valid
      completed_interval_durations: game.completedIntervalDurations ?? [],
      last_sub_confirmation_time_seconds: game.lastSubConfirmationTimeSeconds,
      user_id: userId,
    },
  };
}

// Database tables → AppState (reverse transform for loading)
export function transformTablesToGame(
  tables: GameTableSet
): AppState {
  const { game, players, events, assessments, tacticalData } = tables;

  // CRITICAL: Reconstruct the three player arrays correctly
  // Relationship: playersOnField ⊆ selectedPlayerIds ⊆ availablePlayers (nested subsets)

  // 1. availablePlayers = ALL game_players (the full roster snapshot)
  //    NO relX/relY - these are stored separately in playersOnField version
  const availablePlayers = players.map((p) => ({
    id: p.player_id,
    name: p.player_name,
    nickname: p.nickname ?? '',
    jerseyNumber: p.jersey_number ?? '',
    isGoalie: p.is_goalie ?? false,
    color: p.color ?? undefined,  // null → undefined for optional field
    notes: p.notes ?? '',
    receivedFairPlayCard: p.received_fair_play_card ?? false,
    // NO relX/relY for availablePlayers
  }));

  // 2. playersOnField = game_players WHERE on_field = true (WITH relX/relY)
  const playersOnField = players
    .filter((p) => p.on_field)
    .map((p) => ({
      id: p.player_id,
      name: p.player_name,
      nickname: p.nickname ?? '',
      jerseyNumber: p.jersey_number ?? '',
      isGoalie: p.is_goalie ?? false,
      color: p.color ?? undefined,  // null → undefined for optional field
      notes: p.notes ?? '',
      receivedFairPlayCard: p.received_fair_play_card ?? false,
      relX: p.rel_x!,  // Non-null when on_field=true
      relY: p.rel_y!,
    }));

  // 3. selectedPlayerIds = game_players WHERE is_selected = true
  //    Order preservation: selected players that were on field first, then bench
  const selectedPlayerIds = players
    .filter((p) => p.is_selected)
    .sort((a, b) => {
      // On-field players first for UI ordering
      if (a.on_field && !b.on_field) return -1;
      if (!a.on_field && b.on_field) return 1;
      return 0;
    })
    .map((p) => p.player_id);

  // Reconstruct events (sorted by order_index)
  const gameEvents = events
    .sort((a, b) => a.order_index - b.order_index)
    .map((e) => ({
      id: e.id,
      type: e.event_type,
      time: e.time_seconds,
      scorerId: e.scorer_id,
      assisterId: e.assister_id,
      entityId: e.entity_id,
    }));

  // Reconstruct assessments as Record<playerId, Assessment>
  const assessmentsRecord: Record<string, PlayerAssessment> = {};
  for (const a of assessments) {
    assessmentsRecord[a.player_id] = {
      overall: a.overall_rating,
      sliders: {
        intensity: a.intensity,
        courage: a.courage,
        duels: a.duels,
        technique: a.technique,
        creativity: a.creativity,
        decisions: a.decisions,
        awareness: a.awareness,
        teamwork: a.teamwork,
        fair_play: a.fair_play,
        impact: a.impact,
      },
      notes: a.notes,
      minutesPlayed: a.minutes_played,
      createdBy: a.created_by,
      createdAt: bigintToNumber(a.created_at),  // CRITICAL: bigint → number
    };
  }

  return {
    // === NULL → empty string for ALL nullable string fields ===
    seasonId: game.season_id ?? '',
    tournamentId: game.tournament_id ?? '',
    tournamentSeriesId: game.tournament_series_id ?? '',
    tournamentLevel: game.tournament_level ?? '',
    teamId: game.team_id ?? '',
    gameTime: game.game_time ?? '',
    gameLocation: game.game_location ?? '',
    ageGroup: game.age_group ?? '',
    leagueId: game.league_id ?? '',
    customLeagueName: game.custom_league_name ?? '',

    // === Required fields (direct mapping) ===
    teamName: game.team_name,
    opponentName: game.opponent_name,
    gameDate: game.game_date,
    homeOrAway: game.home_or_away,
    numberOfPeriods: game.number_of_periods,
    periodDurationMinutes: game.period_duration_minutes,
    currentPeriod: game.current_period,
    gameStatus: game.game_status,
    isPlayed: game.is_played,
    homeScore: game.home_score,
    awayScore: game.away_score,
    gameNotes: game.game_notes,
    showPlayerNames: game.show_player_names,

    // === Optional fields (null → undefined for TypeScript semantics) ===
    subIntervalMinutes: game.sub_interval_minutes ?? undefined,
    demandFactor: game.demand_factor ?? undefined,
    gameType: game.game_type ?? undefined,
    gender: game.gender ?? undefined,

    // === Array/object fields ===
    gamePersonnel: game.game_personnel ?? [],           // text[] array
    formationSnapPoints: game.formation_snap_points ?? undefined,  // jsonb → Point[] | undefined

    // === Timer restoration ===
    timeElapsedInSeconds: game.time_elapsed_in_seconds,

    // === Player arrays ===
    playersOnField,
    availablePlayers,
    selectedPlayerIds,  // DERIVED from game_players WHERE is_selected = true

    // === Events and assessments ===
    gameEvents,
    assessments: assessmentsRecord,

    // === Tactical data from jsonb columns ===
    // CRITICAL: Coalesce NULL to defaults for round-trip fidelity
    // Schema has DEFAULT '[]' but existing data may have NULL values
    opponents: tacticalData.opponents ?? [],
    drawings: tacticalData.drawings ?? [],
    tacticalDiscs: tacticalData.tactical_discs ?? [],
    tacticalDrawings: tacticalData.tactical_drawings ?? [],
    tacticalBallPosition: tacticalData.tactical_ball_position ?? null,  // null is valid
    completedIntervalDurations: tacticalData.completed_interval_durations ?? [],
    lastSubConfirmationTimeSeconds: tacticalData.last_sub_confirmation_time_seconds ?? undefined,
  };
}
```

### 5.7 RPC Functions for Transactions

Multi-table game operations require atomic transactions via Supabase RPC:

```typescript
// SupabaseDataStore.ts
async saveGame(gameId: string, game: AppState): Promise<AppState> {
  const tables = transformGameToTables(gameId, game, this.userId!);

  // Use RPC function for atomic 5-table write
  const { error } = await this.client!.rpc('save_game_with_relations', {
    p_game: tables.game,
    p_players: tables.players,
    p_events: tables.events,
    p_assessments: tables.assessments,
    p_tactical_data: tables.tacticalData,
  });

  if (error) {
    throw new StorageError(`Failed to save game: ${error.message}`);
  }

  return game;
}
```

The RPC function (`save_game_with_relations`) is defined in the schema and ensures all 5 tables are updated atomically within a single PostgreSQL transaction.

#### Empty Array Behavior in RPC

**Important**: When passing empty arrays (e.g., a game with no events), PostgreSQL handles this correctly:

```sql
-- When p_events = [] (empty array):
-- 1. unnest([]) returns 0 rows
-- 2. jsonb_agg() over 0 rows returns NULL (not [])
-- 3. jsonb_populate_recordset(null::game_events, NULL) inserts 0 rows

-- This is correct behavior - empty array means "delete all existing, insert nothing"
DELETE FROM game_events WHERE game_id = v_game_id;  -- Removes any existing
INSERT INTO game_events SELECT * FROM jsonb_populate_recordset(..., NULL);  -- Inserts 0 rows
```

This behavior is intentional and correct:
- Game with no players → `game_players` table has 0 rows for that game
- Game with no events → `game_events` table has 0 rows for that game
- Game with no assessments → `player_assessments` table has 0 rows for that game

The transform layer uses `?? []` guards to ensure undefined arrays become empty arrays.

#### RPC Security Hardening

**All RPC functions must include search_path hardening** to prevent privilege escalation:

```sql
-- In supabase/migrations/001_rpc_functions.sql
CREATE OR REPLACE FUNCTION save_game_with_relations(
  p_game jsonb,
  p_players jsonb[],
  p_events jsonb[],
  p_assessments jsonb[],
  p_tactical_data jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp  -- ⚠️ REQUIRED: Prevents search_path injection
AS $$
BEGIN
  -- Function body...
END;
$$;

-- Restrict execute to authenticated users only
REVOKE ALL ON FUNCTION save_game_with_relations FROM PUBLIC;
GRANT EXECUTE ON FUNCTION save_game_with_relations TO authenticated;
```

**Why this matters**:
- `SECURITY DEFINER` runs with function owner's privileges
- Without `SET search_path`, attacker could inject malicious schema
- `REVOKE/GRANT` ensures only authenticated users can call

### 5.8 Required Interface Updates

**IMPORTANT**: These changes must be made BEFORE implementing SupabaseDataStore to ensure both backends stay in sync.

#### Query Keys

**File**: `src/config/queryKeys.ts` - Add missing keys:

```typescript
export const queryKeys = {
  // ... existing keys ...

  // Player adjustments (add these - currently missing)
  playerAdjustments: ['playerAdjustments'] as const,
  playerAdjustmentsByPlayer: (playerId: string) => ['playerAdjustments', playerId] as const,

  // Note: warmupPlan key already exists in queryKeys.ts
};
```

#### DataStore Interface

**File**: `src/interfaces/DataStore.ts` - Add method for bulk adjustment fetch:

```typescript
// Add to DataStore interface (in PLAYER ADJUSTMENTS section)

/**
 * Get all player adjustments for all players.
 * Used for prefetching on app startup.
 * @returns Record mapping player ID to array of adjustments
 */
getAllPlayerAdjustments(): Promise<Record<string, PlayerStatAdjustment[]>>;
```

#### LocalDataStore Implementation

**File**: `src/datastore/LocalDataStore.ts` - Add implementation:

```typescript
async getAllPlayerAdjustments(): Promise<Record<string, PlayerStatAdjustment[]>> {
  this.ensureInitialized();
  return await this.loadPlayerAdjustments();  // Already loads as Record
}
```

#### Tests

Add tests for the new method in `LocalDataStore.test.ts`:

```typescript
describe('getAllPlayerAdjustments', () => {
  it('should return empty record when no adjustments exist', async () => {
    const result = await dataStore.getAllPlayerAdjustments();
    expect(result).toEqual({});
  });

  it('should return all adjustments grouped by player ID', async () => {
    await dataStore.addPlayerAdjustment({ playerId: 'p1', gamesPlayedDelta: 1, goalsDelta: 0, assistsDelta: 0 });
    await dataStore.addPlayerAdjustment({ playerId: 'p2', gamesPlayedDelta: 2, goalsDelta: 1, assistsDelta: 0 });

    const result = await dataStore.getAllPlayerAdjustments();
    expect(Object.keys(result)).toHaveLength(2);
    expect(result['p1']).toHaveLength(1);
    expect(result['p2']).toHaveLength(1);
  });
});
```

This enables prefetching all player adjustments on startup and proper cache invalidation.

#### Documentation Fix: settings.ts

**File**: `src/types/settings.ts` - Fix incorrect JSDoc comments:

```typescript
// Current (WRONG):
/** Club season start date (ISO format YYYY-MM-DD, default: "2000-10-01" = October 1st) */
clubSeasonStartDate?: string;
/** Club season end date (ISO format YYYY-MM-DD, default: "2000-05-01" = May 1st) */
clubSeasonEndDate?: string;

// Should be:
/** Club season start date (ISO format YYYY-MM-DD, default: "2000-11-15" = November 15th) */
clubSeasonStartDate?: string;
/** Club season end date (ISO format YYYY-MM-DD, default: "2000-10-20" = October 20th) */
clubSeasonEndDate?: string;
```

The actual defaults are in `src/config/clubSeasonDefaults.ts`. This is a documentation-only fix.

---

## 6. SupabaseAuthService Implementation [TO BUILD]

### 6.1 Backend Service

**File**: `src/auth/SupabaseAuthService.ts` (does not exist yet - create this file)

> **Reference**: The AuthService interface is already defined at `src/interfaces/AuthService.ts`.
> The LocalAuthService at `src/auth/LocalAuthService.ts` shows the method signatures to implement.

Key features:
- Sign up/sign in with email/password
- Password reset flow
- Session management with auto-refresh
- Auth state change listeners

**Password Requirements** (App-enforced, per AuthService interface):
- Minimum 12 characters (Supabase default of 6 is too weak)
- Complexity: at least 3 of 4 character types (uppercase, lowercase, digit, special)
- Validation: check against common password lists (e.g., Have I Been Pwned API)
- Strength meter: provide real-time feedback to users

**Implementation Note**: Supabase accepts passwords at 6+ chars by default. The stricter
requirements (12+, complexity, breach checks) must be enforced **client-side** in
`SupabaseAuthService.signUp()` BEFORE calling the Supabase Auth API. Optionally,
configure Supabase Dashboard → Authentication → Policies for server-side enforcement.

**Email Confirmation**:
- By default, Supabase requires email confirmation before login
- Can be disabled in Dashboard for development
- `signUp()` returns `confirmationRequired: true` when email needs verification

### 6.2 Auth UI Architecture

The authentication UI integrates with the existing app flow with **minimal changes**:

**Current Flow (Local Mode)**:
```
layout.tsx
  → I18nInitializer
    → QueryProvider
      → ClientWrapper (Toast, Premium)
        → page.tsx
          → checkAppState() (IndexedDB check)
          → StartScreen OR HomePage
```

**New Flow (Dual Mode)**:
```
layout.tsx
  → I18nInitializer
    → AuthProvider [NEW]              ← Wraps everything with auth context
      → QueryProvider
        → ClientWrapper (Toast, Premium)
          → page.tsx
            → IF cloud mode AND not authenticated:
                → LoginScreen [NEW]
            → ELSE:
                → checkAppState() (now from Supabase in cloud mode)
                → StartScreen OR HomePage
```

**Key Insight**: The existing `isFirstTimeUser` detection (checks for players/games) **stays the same** - it just moves to **after** authentication in cloud mode. The DataStore abstraction handles the backend switch automatically via the factory.

### 6.3 AuthProvider Context [TO BUILD]

**File**: `src/contexts/AuthProvider.tsx`

```typescript
/**
 * AuthProvider - Provides authentication context to the app.
 *
 * @remarks
 * - In local mode: No-op, always "authenticated"
 * - In cloud mode: Manages Supabase auth state
 * - Wraps QueryProvider (auth needed before data fetch)
 */

'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getAuthService } from '@/datastore/factory';
import { getBackendMode } from '@/config/backendConfig';
import type { User, Session, AuthState } from '@/interfaces/AuthTypes';
import type { AuthService } from '@/interfaces/AuthService';
import logger from '@/utils/logger';

interface AuthContextValue {
  // State
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  mode: 'local' | 'cloud';

  // Actions
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string) => Promise<{ error?: string; confirmationRequired?: boolean }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error?: string }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authService, setAuthService] = useState<AuthService | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mode, setMode] = useState<'local' | 'cloud'>('local');

  // Initialize auth service
  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | null = null;

    async function initAuth() {
      try {
        const currentMode = getBackendMode();
        const service = await getAuthService();

        if (!mounted) return;

        setMode(currentMode);
        setAuthService(service);

        // Get initial state
        const currentUser = await service.getCurrentUser();
        const currentSession = await service.getSession();

        if (!mounted) return;

        setUser(currentUser);
        setSession(currentSession);

        // Subscribe to auth changes (cloud mode only fires events)
        unsubscribe = service.onAuthStateChange((state: AuthState, newSession: Session | null) => {
          logger.log('[AuthProvider] Auth state changed:', state);
          setSession(newSession);
          setUser(newSession?.user ?? null);
        });
      } catch (error) {
        logger.error('[AuthProvider] Init failed:', error);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    initAuth();

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!authService) return { error: 'Auth not initialized' };

    try {
      const result = await authService.signIn(email, password);
      setUser(result.user);
      setSession(result.session);
      return {};
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Sign in failed' };
    }
  }, [authService]);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!authService) return { error: 'Auth not initialized' };

    try {
      const result = await authService.signUp(email, password);
      if (!result.confirmationRequired) {
        setUser(result.user);
        setSession(result.session);
      }
      return { confirmationRequired: result.confirmationRequired };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Sign up failed' };
    }
  }, [authService]);

  const signOut = useCallback(async () => {
    if (!authService) return;

    await authService.signOut();
    setUser(null);
    setSession(null);
  }, [authService]);

  const resetPassword = useCallback(async (email: string) => {
    if (!authService) return { error: 'Auth not initialized' };

    try {
      await authService.resetPassword(email);
      return {};
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Reset failed' };
    }
  }, [authService]);

  const value: AuthContextValue = {
    user,
    session,
    isAuthenticated: mode === 'local' ? true : !!session,
    isLoading,
    mode,
    signIn,
    signUp,
    signOut,
    resetPassword,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
```

### 6.4 LoginScreen Component [TO BUILD]

**File**: `src/components/LoginScreen.tsx`

```typescript
/**
 * LoginScreen - Authentication screen for cloud mode.
 *
 * @remarks
 * - Only shown in cloud mode when not authenticated
 * - Supports sign in, sign up, and password reset
 * - Matches StartScreen visual style for consistency
 */

'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthProvider';

type AuthMode = 'signIn' | 'signUp' | 'resetPassword';

export default function LoginScreen() {
  const { t } = useTranslation();
  const { signIn, signUp, resetPassword } = useAuth();

  const [mode, setMode] = useState<AuthMode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsLoading(true);

    try {
      if (mode === 'signUp') {
        if (password !== confirmPassword) {
          setError(t('auth.passwordMismatch', 'Passwords do not match'));
          return;
        }
        if (password.length < 12) {
          setError(t('auth.passwordTooShort', 'Password must be at least 12 characters'));
          return;
        }
        const result = await signUp(email, password);
        if (result.error) {
          setError(result.error);
        } else if (result.confirmationRequired) {
          setSuccess(t('auth.checkEmail', 'Check your email to confirm your account'));
          setMode('signIn');
        }
      } else if (mode === 'signIn') {
        const result = await signIn(email, password);
        if (result.error) {
          setError(result.error);
        }
        // Success: AuthProvider will update state, page.tsx will re-render
      } else if (mode === 'resetPassword') {
        const result = await resetPassword(email);
        if (result.error) {
          setError(result.error);
        } else {
          setSuccess(t('auth.resetEmailSent', 'Check your email for reset instructions'));
          setMode('signIn');
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Button styles matching StartScreen
  const primaryButtonStyle = 'w-full h-12 px-4 py-2 rounded-md text-base font-bold transition-all ' +
    'bg-gradient-to-b from-indigo-500 to-indigo-600 text-white hover:from-indigo-600 hover:to-indigo-700 ' +
    'disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-indigo-400';

  const secondaryButtonStyle = 'text-indigo-400 hover:text-indigo-300 text-sm font-medium transition-colors';

  const inputStyle = 'w-full h-12 px-4 rounded-md bg-slate-700 border border-slate-600 text-white ' +
    'placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen min-h-[100dvh] bg-slate-800 bg-noise-texture text-slate-100 overflow-hidden">
      {/* Background effects matching StartScreen */}
      <div className="absolute inset-0 bg-grid-squares opacity-[0.35]" />
      <div className="absolute inset-0 bg-indigo-600/10 mix-blend-soft-light" />
      <div className="absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent" />

      <div className="relative z-10 w-full max-w-sm px-6 py-8">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Image
            src="/logos/app-logo-yellow.png"
            alt="MatchOps Local"
            width={280}
            height={93}
            priority
            className="h-auto w-auto max-w-[200px]"
          />
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-center mb-2">
          {mode === 'signIn' && t('auth.signIn', 'Sign In')}
          {mode === 'signUp' && t('auth.createAccount', 'Create Account')}
          {mode === 'resetPassword' && t('auth.resetPassword', 'Reset Password')}
        </h1>

        <p className="text-slate-400 text-center mb-6 text-sm">
          {mode === 'signIn' && t('auth.signInSubtitle', 'Sign in to sync your data across devices')}
          {mode === 'signUp' && t('auth.signUpSubtitle', 'Create an account to enable cloud sync')}
          {mode === 'resetPassword' && t('auth.resetSubtitle', 'Enter your email to receive reset instructions')}
        </p>

        {/* Error/Success Messages */}
        {error && (
          <div className="mb-4 p-3 rounded-md bg-red-900/50 border border-red-500/50 text-red-200 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 rounded-md bg-green-900/50 border border-green-500/50 text-green-200 text-sm">
            {success}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder={t('auth.email', 'Email')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputStyle}
            required
            autoComplete="email"
          />

          {mode !== 'resetPassword' && (
            <input
              type="password"
              placeholder={t('auth.password', 'Password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputStyle}
              required
              autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
            />
          )}

          {mode === 'signUp' && (
            <input
              type="password"
              placeholder={t('auth.confirmPassword', 'Confirm Password')}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputStyle}
              required
              autoComplete="new-password"
            />
          )}

          <button
            type="submit"
            disabled={isLoading}
            className={primaryButtonStyle}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t('auth.loading', 'Loading...')}
              </span>
            ) : (
              <>
                {mode === 'signIn' && t('auth.signInButton', 'Sign In')}
                {mode === 'signUp' && t('auth.createAccountButton', 'Create Account')}
                {mode === 'resetPassword' && t('auth.sendResetEmail', 'Send Reset Email')}
              </>
            )}
          </button>
        </form>

        {/* Mode Switchers */}
        <div className="mt-6 flex flex-col items-center gap-3">
          {mode === 'signIn' && (
            <>
              <button onClick={() => setMode('resetPassword')} className={secondaryButtonStyle}>
                {t('auth.forgotPassword', 'Forgot password?')}
              </button>
              <button onClick={() => setMode('signUp')} className={secondaryButtonStyle}>
                {t('auth.noAccount', "Don't have an account? Sign up")}
              </button>
            </>
          )}
          {mode === 'signUp' && (
            <button onClick={() => setMode('signIn')} className={secondaryButtonStyle}>
              {t('auth.haveAccount', 'Already have an account? Sign in')}
            </button>
          )}
          {mode === 'resetPassword' && (
            <button onClick={() => setMode('signIn')} className={secondaryButtonStyle}>
              {t('auth.backToSignIn', 'Back to sign in')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

### 6.5 Layout Integration [TO BUILD]

**File**: `src/app/layout.tsx` - Add AuthProvider wrapper

```diff
 import I18nInitializer from "@/components/I18nInitializer";
+import { AuthProvider } from "@/contexts/AuthProvider";

 export default function RootLayout({ children }) {
   return (
     <html lang="fi">
       <body className={rajdhani.variable}>
         <I18nInitializer>
           <ServiceWorkerRegistration />
           <InstallPrompt />
-          <QueryProvider>
-            <ClientWrapper>{children}</ClientWrapper>
-          </QueryProvider>
+          <AuthProvider>
+            <QueryProvider>
+              <ClientWrapper>{children}</ClientWrapper>
+            </QueryProvider>
+          </AuthProvider>
         </I18nInitializer>
       </body>
     </html>
   );
 }
```

### 6.6 Page.tsx Auth Gate [TO BUILD]

**File**: `src/app/page.tsx` - Add authentication gate

```diff
 'use client';

+import { useAuth } from '@/contexts/AuthProvider';
+import LoginScreen from '@/components/LoginScreen';
 // ... existing imports ...

 export default function Home() {
+  const { isAuthenticated, isLoading: isAuthLoading, mode } = useAuth();
   const [screen, setScreen] = useState<'start' | 'home'>('start');
   // ... existing state ...

+  // Show loading while checking auth (cloud mode only)
+  if (isAuthLoading) {
+    return (
+      <div className="flex flex-col items-center justify-center h-screen bg-slate-900">
+        <div className="w-16 h-16 border-4 border-slate-700 border-t-indigo-500 rounded-full animate-spin" />
+        <p className="text-slate-400 text-sm mt-4">Loading...</p>
+      </div>
+    );
+  }
+
+  // Show login screen if cloud mode and not authenticated
+  if (mode === 'cloud' && !isAuthenticated) {
+    return <LoginScreen />;
+  }

   // ... rest of existing code (checkAppState, StartScreen, HomePage) ...
   // NOTE: checkAppState() works unchanged - DataStore abstraction handles backend switch
 }
```

### 6.7 Translation Keys [TO BUILD]

**Files**: `src/public/locales/{en,fi}/common.json`

```json
{
  "auth": {
    "signIn": "Sign In",
    "signUp": "Sign Up",
    "createAccount": "Create Account",
    "resetPassword": "Reset Password",
    "email": "Email",
    "password": "Password",
    "confirmPassword": "Confirm Password",
    "signInButton": "Sign In",
    "createAccountButton": "Create Account",
    "sendResetEmail": "Send Reset Email",
    "forgotPassword": "Forgot password?",
    "noAccount": "Don't have an account? Sign up",
    "haveAccount": "Already have an account? Sign in",
    "backToSignIn": "Back to sign in",
    "loading": "Loading...",
    "checkEmail": "Check your email to confirm your account",
    "resetEmailSent": "Check your email for reset instructions",
    "passwordMismatch": "Passwords do not match",
    "passwordTooShort": "Password must be at least 12 characters",
    "signInSubtitle": "Sign in to sync your data across devices",
    "signUpSubtitle": "Create an account to enable cloud sync",
    "resetSubtitle": "Enter your email to receive reset instructions"
  }
}
```

### 6.8 Auth Flow Summary

**Local Mode (unchanged)**:
```
App loads → AuthProvider (isAuthenticated=true always) → page.tsx → checkAppState() → StartScreen/HomePage
```

**Cloud Mode (new user)**:
```
App loads → AuthProvider (isAuthenticated=false) → page.tsx → LoginScreen
  → User signs up → confirmationRequired → "Check email"
  → User confirms email → Signs in
  → AuthProvider (isAuthenticated=true) → page.tsx → checkAppState()
  → No data in Supabase → isFirstTimeUser=true → StartScreen (simplified) → HomePage
```

**Cloud Mode (returning user)**:
```
App loads → AuthProvider (session exists from storage) → page.tsx → checkAppState()
  → Data found in Supabase → StartScreen (full featured) → HomePage
```

### 6.9 PR #5 File Summary

| File | Action | Est. Lines |
|------|--------|------------|
| `src/auth/SupabaseAuthService.ts` | CREATE | ~200 |
| `src/contexts/AuthProvider.tsx` | CREATE | ~130 |
| `src/components/LoginScreen.tsx` | CREATE | ~180 |
| `src/app/layout.tsx` | MODIFY | +3 |
| `src/app/page.tsx` | MODIFY | +15 |
| `src/public/locales/en/common.json` | MODIFY | +20 |
| `src/public/locales/fi/common.json` | MODIFY | +20 |
| `src/auth/SupabaseAuthService.test.ts` | CREATE | ~150 |

---

## 7. Performance Architecture

### 7.1 React Query Configuration (Cloud-Optimized) [TO BUILD]

**File**: `src/app/QueryProvider.tsx`

> **Current State**: The existing QueryProvider uses React Query defaults with `retry: 3`.
> Update it to have mode-specific configuration as shown below.

```typescript
// Updated QueryProvider.tsx - adds cloud-optimized settings
function createQueryClient(): QueryClient {
  const mode = getBackendMode();

  if (mode === 'cloud') {
    return new QueryClient({
      defaultOptions: {
        queries: {
          // Keep data fresh for 5 minutes
          staleTime: 5 * 60 * 1000,

          // Keep unused data for 30 minutes
          gcTime: 30 * 60 * 1000,

          // Retry 3 times with exponential backoff
          retry: 3,
          retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),

          // Show cached data while refetching
          refetchOnWindowFocus: true,
          refetchOnMount: false,
          refetchOnReconnect: true,
        },
      },
    });
  }

  // Local mode: current defaults (unchanged behavior)
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 3, // Important for IndexedDB transient failures on mobile
      },
    },
  });
}
```

### 7.2 Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| First Contentful Paint | <1.5s | Lighthouse |
| Time to Interactive | <2.5s | Lighthouse |
| Add Player Response | <50ms | User-perceived |
| Save Game Response | <50ms | User-perceived |
| Load Game List | <100ms | Cache hit |
| Initial Data Load (cloud) | <1s | Network waterfall |

### 7.3 Why Cloud Can Feel as Fast as Local

| Action | Local | Cloud (with strategies) |
|--------|-------|------------------------|
| Open app | <50ms | 500-1000ms (one-time load) |
| Add player | <10ms | **<16ms** (optimistic) |
| Save game | <20ms | **<16ms** (optimistic) |
| Load game list | <10ms | **<16ms** (cached) |

After initial load:
- All reads come from in-memory cache
- All writes are optimistic (cache → UI → network background)
- Network never blocks the UI

---

## 8. Migration System [TO BUILD]

### 8.1 Migration Service

**File**: `src/services/migrationService.ts` (does not exist yet - create this file)

**Data Types Migrated** (complete list):

| Storage Key | Target Table(s) | Notes |
|-------------|-----------------|-------|
| `MASTER_ROSTER_KEY` | `players` | Array → rows |
| `TEAMS_INDEX_KEY` | `teams` | Record → rows |
| `TEAM_ROSTERS_KEY` | `team_players` | Record → rows; **id = `{team_id}_{player_id}`** |
| `SEASONS_LIST_KEY` | `seasons` | Array → rows |
| `TOURNAMENTS_LIST_KEY` | `tournaments` | Array → rows |
| `PERSONNEL_KEY` | `personnel` | Record → rows |
| `SAVED_GAMES_KEY` | `games` + 4 related tables | Object → 5 tables per game |
| `PLAYER_ADJUSTMENTS_KEY` | `player_adjustments` | Record<playerId, []> → flattened rows |
| `WARMUP_PLAN_KEY` | `warmup_plans` | Object → single row |
| `APP_SETTINGS_KEY` | `user_settings` | Object → single row |

**NOT Migrated** (local-only):
- `TIMER_STATE_KEY` - Ephemeral session data, restored from `games.time_elapsed_in_seconds`

```typescript
export interface MigrationProgress {
  stage: 'exporting' | 'validating' | 'uploading' | 'verifying' | 'complete' | 'error';
  progress: number; // 0-100
  currentEntity?: string;
  error?: string;
}

export interface MigrationResult {
  success: boolean;
  migrated: {
    players: number;
    teams: number;
    teamRosters: number;    // Count of team_players rows
    seasons: number;
    tournaments: number;
    games: number;
    personnel: number;
    playerAdjustments: number;
    warmupPlan: boolean;    // true if migrated
    settings: boolean;      // true if migrated
  };
  errors: string[];
}

export async function migrateLocalToCloud(
  onProgress: (progress: MigrationProgress) => void
): Promise<MigrationResult> {
  // 1. Export local data (all 10 storage keys)
  // 2. Validate (check for stale references, uniqueness conflicts)
  // 3. Upload to Supabase (in dependency order: players/teams first, then games)
  // 4. Verify counts match
  // 5. Report success/errors
}
```

### 8.2 Migration Flow

```
Local Mode (has data)
  → Sign up for cloud account
    → Click "Migrate to Cloud"
      → Export local data
        → Transform to relational format
          → Upload to Supabase
            → Verify migration
              → Switch to Cloud Mode
                → (Optional) Clear local data
```

### 8.3 Failure Handling & Rollback Policy

**CRITICAL: Local data is NEVER modified until migration is fully verified**

#### Failure Scenarios and Handling

| Scenario | Behavior | User Action |
|----------|----------|-------------|
| **Export fails** | Error shown, nothing changed | Fix issue, retry |
| **Validation fails** | Error shown with details (e.g., "3 orphan team references") | Clean up data, retry |
| **Upload partial failure** | Cloud has partial data, local unchanged | Retry (see below) |
| **Verification fails** | Counts don't match, local unchanged | Retry or contact support |
| **Network drops mid-upload** | Partial cloud data, local unchanged | Retry |

#### Partial Upload Recovery

```typescript
async function migrateLocalToCloud(onProgress): Promise<MigrationResult> {
  // Step 1: Export (local read-only)
  const localData = await exportAllLocalData();

  // Step 2: Validate (no writes)
  const validationErrors = validateLocalData(localData);
  if (validationErrors.length > 0) {
    return { success: false, errors: validationErrors };
  }

  // Step 3: Upload with idempotent upserts
  // Uses ON CONFLICT DO UPDATE - safe to retry
  try {
    await uploadToCloud(localData, onProgress);
  } catch (uploadError) {
    // Cloud may have partial data - that's OK
    // User retries, upserts handle duplicates
    return {
      success: false,
      errors: [`Upload failed: ${uploadError.message}. Your local data is unchanged. Please retry.`]
    };
  }

  // Step 4: Verify counts match
  const cloudCounts = await getCloudCounts();
  const localCounts = countLocalData(localData);

  if (!countsMatch(cloudCounts, localCounts)) {
    return {
      success: false,
      errors: ['Verification failed: counts do not match. Please retry migration.']
    };
  }

  // Step 5: SUCCESS - only now is it safe to switch modes
  return { success: true, migrated: cloudCounts };
}
```

#### Key Principles

1. **Local data is read-only during migration** - never modified, never deleted
2. **Cloud writes use upserts** - safe to retry, handles duplicates
3. **Verification required** - migration not "complete" until counts verified
4. **No auto-cleanup** - user explicitly chooses to clear local data after success
5. **Orphan cloud data is acceptable** - if user cancels mid-migration, partial data in cloud doesn't hurt (RLS protects it, user can delete or re-migrate)

#### User-Facing Messages

```typescript
const MIGRATION_MESSAGES = {
  PARTIAL_FAILURE: 'Migration was interrupted. Your local data is safe. Please try again.',
  VERIFICATION_FAILED: 'Migration completed but verification failed. Please retry.',
  NETWORK_ERROR: 'Network error during migration. Your local data is unchanged.',
  SUCCESS: 'Migration complete! Your data is now synced to the cloud.',
  CLEAR_LOCAL_PROMPT: 'Would you like to clear local data? (Your cloud data is safe)',
};
```

---

## 9. Testing Strategy

> **Philosophy**: Testing is NOT optional. The transform logic (PR #4) and migration (PR #6) handle user data - bugs here cause data loss. We use **TDD for core logic** and comprehensive tests throughout.

### 9.1 Testing Approach by PR

| PR | Approach | Rationale |
|----|----------|-----------|
| 1-2 | Test-after | Config/boilerplate, low complexity |
| 3 | **TDD** | DataStore methods have clear contracts |
| 4 | **TDD (Critical)** | Transform functions are pure, highest bug risk |
| 5 | **TDD** | Auth state machine benefits from test-first |
| 6 | **TDD** | Migration must not lose data |
| 7 | Test-after | Performance tuning, benchmarks |
| 8 | Test-after | Integration tests verify everything |

### 9.2 Test Categories & Counts

#### Unit Tests (~250 tests)

| Area | Est. Tests | TDD? | Coverage Target |
|------|------------|------|-----------------|
| `backendConfig.ts` | 10-15 | No | 90% |
| `client.ts` (Supabase) | 10-15 | No | 80% |
| Transform functions | **50-70** | **Yes** | **95%** |
| `SupabaseDataStore` methods | **80-100** | **Yes** | 85% |
| `SupabaseAuthService` | 25-35 | Yes | 80% |
| `migrationService.ts` | 20-30 | Yes | 85% |
| QueryProvider/cache | 10-15 | No | 70% |

#### Cross-Backend Parity Tests (~60 tests)

**Critical**: Run the SAME test suite against both LocalDataStore and SupabaseDataStore.

```typescript
// tests/datastore/parity.test.ts
describe.each([
  ['LocalDataStore', () => new LocalDataStore()],
  ['SupabaseDataStore', () => new SupabaseDataStore(mockClient)],
])('%s', (name, createStore) => {
  let dataStore: DataStore;

  beforeEach(async () => {
    dataStore = createStore();
    await dataStore.initialize();
  });

  // All CRUD operations
  describe('Players', () => {
    it('creates player with generated ID', async () => { /* ... */ });
    it('throws ValidationError for empty name', async () => { /* ... */ });
    it('updates existing player', async () => { /* ... */ });
    it('returns null for non-existent player update', async () => { /* ... */ });
    it('deletes player and returns true', async () => { /* ... */ });
    it('returns false when deleting non-existent player', async () => { /* ... */ });
  });

  // Repeat for: Teams, Seasons, Tournaments, Personnel, Games, Settings, etc.
});
```

**Parity tests ensure behavioral equivalence** - if Local returns `null`, Cloud must too.

#### Integration Tests (~40 tests)

Test with **real Supabase** (test project, separate from production):

| Area | Tests | What's Verified |
|------|-------|-----------------|
| Game lifecycle | 10 | Create → Save → Load → Update → Delete |
| Auth flows | 8 | Sign up, confirm, sign in, refresh, sign out |
| Migration | 8 | Full migration, partial failure, rollback |
| RLS policies | 10 | User isolation, unauthorized access blocked |
| Performance | 4 | Prefetch timing, query count |

#### UI Component Tests (~25 tests)

| Component | Tests | Focus |
|-----------|-------|-------|
| `LoginScreen` | 10 | State transitions, error display, loading |
| `MigrationWizard` | 8 | Progress, cancel, error recovery |
| `CloudSyncToggle` | 4 | Enable/disable flow |
| `AuthProvider` | 3 | Context initialization, re-renders |

### 9.3 TDD: Transform Functions (Critical Path)

**This is the highest-risk code.** Write tests BEFORE implementation.

#### File: `tests/datastore/supabase/transforms/gameTransform.test.ts`

```typescript
import { transformGameToTables, transformTablesToGame } from '@/datastore/supabase/transforms/gameTransform';
import { TestFixtures } from '@tests/fixtures';

describe('transformGameToTables', () => {
  describe('Empty String → NULL Normalization', () => {
    it('converts empty seasonId to NULL', () => {
      const game = TestFixtures.games.create({ seasonId: '' });
      const tables = transformGameToTables(game, 'user-123');
      expect(tables.game.season_id).toBeNull();
    });

    it('converts empty tournamentId to NULL', () => {
      const game = TestFixtures.games.create({ tournamentId: '' });
      const tables = transformGameToTables(game, 'user-123');
      expect(tables.game.tournament_id).toBeNull();
    });

    it('converts empty gameLocation to NULL', () => {
      const game = TestFixtures.games.create({ gameLocation: '' });
      const tables = transformGameToTables(game, 'user-123');
      expect(tables.game.game_location).toBeNull();
    });

    // Test all 11 empty string fields from schema
    it.each([
      ['seasonId', 'season_id'],
      ['tournamentId', 'tournament_id'],
      ['tournamentLevel', 'tournament_level'],
      ['tournamentSeriesId', 'tournament_series_id'],
      ['ageGroup', 'age_group'],
      ['gameLocation', 'game_location'],
      ['gameTime', 'game_time'],
      ['teamId', 'team_id'],
      ['leagueId', 'league_id'],
      ['customLeagueName', 'custom_league_name'],
      ['gameType', 'game_type'],
    ])('converts empty %s to NULL %s', (tsField, dbField) => {
      const game = TestFixtures.games.create({ [tsField]: '' });
      const tables = transformGameToTables(game, 'user-123');
      expect(tables.game[dbField]).toBeNull();
    });
  });

  describe('Player State Normalization', () => {
    it('sets is_selected=true for players on field (even if not in selectedPlayerIds)', () => {
      const game = TestFixtures.games.create({
        playersOnField: [{ id: 'p1', name: 'On Field', relX: 0.5, relY: 0.5 }],
        availablePlayers: [{ id: 'p1', name: 'On Field' }],
        selectedPlayerIds: [], // NOT selected, but on field
      });
      const tables = transformGameToTables(game, 'user-123');
      const player = tables.players.find(p => p.player_id === 'p1');

      expect(player?.on_field).toBe(true);
      expect(player?.is_selected).toBe(true); // NORMALIZED: on_field implies selected
    });

    it('preserves relX/relY for players on field', () => {
      const game = TestFixtures.games.create({
        playersOnField: [{ id: 'p1', name: 'Test', relX: 0.25, relY: 0.75 }],
        availablePlayers: [{ id: 'p1', name: 'Test' }],
      });
      const tables = transformGameToTables(game, 'user-123');
      const player = tables.players.find(p => p.player_id === 'p1');

      expect(player?.rel_x).toBe(0.25);
      expect(player?.rel_y).toBe(0.75);
    });

    it('sets relX/relY to NULL for available players not on field', () => {
      const game = TestFixtures.games.create({
        playersOnField: [],
        availablePlayers: [{ id: 'p1', name: 'Bench' }],
        selectedPlayerIds: ['p1'],
      });
      const tables = transformGameToTables(game, 'user-123');
      const player = tables.players.find(p => p.player_id === 'p1');

      expect(player?.on_field).toBe(false);
      expect(player?.rel_x).toBeNull();
      expect(player?.rel_y).toBeNull();
    });
  });

  describe('Event Order Preservation', () => {
    it('assigns order_index based on array position', () => {
      const game = TestFixtures.games.create({
        gameEvents: [
          { id: 'e1', type: 'goal', time: 100 },
          { id: 'e2', type: 'goal', time: 100 }, // Same time
          { id: 'e3', type: 'substitution', time: 50 }, // Earlier time but later in array
        ],
      });
      const tables = transformGameToTables(game, 'user-123');

      expect(tables.events).toHaveLength(3);
      expect(tables.events[0].order_index).toBe(0);
      expect(tables.events[1].order_index).toBe(1);
      expect(tables.events[2].order_index).toBe(2);
    });

    it('handles empty events array', () => {
      const game = TestFixtures.games.create({ gameEvents: [] });
      const tables = transformGameToTables(game, 'user-123');
      expect(tables.events).toEqual([]);
    });
  });

  describe('Assessment Flattening', () => {
    it('flattens assessment sliders to columns', () => {
      const game = TestFixtures.games.create({
        assessments: {
          'p1': {
            overall: 8.5,
            sliders: {
              intensity: 7.0,
              courage: 8.0,
              duels: 6.5,
              technique: 9.0,
              creativity: 8.5,
              decisions: 7.5,
              awareness: 8.0,
              teamwork: 9.0,
              fair_play: 10.0,
              impact: 7.0,
            },
            notes: 'Great game',
            minutesPlayed: 45,
            createdAt: 1704067200000,
          },
        },
      });
      const tables = transformGameToTables(game, 'user-123');
      const assessment = tables.assessments[0];

      expect(assessment.player_id).toBe('p1');
      expect(assessment.overall_rating).toBe(8.5);
      expect(assessment.intensity).toBe(7.0);
      expect(assessment.courage).toBe(8.0);
      expect(assessment.fair_play).toBe(10.0);
      expect(assessment.notes).toBe('Great game');
      expect(assessment.created_at).toBe(1704067200000);
    });
  });
});

describe('transformTablesToGame', () => {
  describe('NULL → Empty String Normalization', () => {
    it('converts NULL season_id to empty seasonId', () => {
      const tables = TestFixtures.tables.game({ season_id: null });
      const game = transformTablesToGame(tables);
      expect(game.seasonId).toBe('');
    });
  });

  describe('Player State Reconstruction', () => {
    it('reconstructs playersOnField from on_field=true rows', () => {
      const tables = TestFixtures.tables.gameWithPlayers([
        { player_id: 'p1', name: 'On Field', on_field: true, is_selected: true, rel_x: 0.5, rel_y: 0.5 },
        { player_id: 'p2', name: 'Bench', on_field: false, is_selected: true, rel_x: null, rel_y: null },
      ]);
      const game = transformTablesToGame(tables);

      expect(game.playersOnField).toHaveLength(1);
      expect(game.playersOnField[0].id).toBe('p1');
      expect(game.playersOnField[0].relX).toBe(0.5);
    });

    it('reconstructs selectedPlayerIds from is_selected=true rows', () => {
      const tables = TestFixtures.tables.gameWithPlayers([
        { player_id: 'p1', on_field: true, is_selected: true },
        { player_id: 'p2', on_field: false, is_selected: true },
        { player_id: 'p3', on_field: false, is_selected: false },
      ]);
      const game = transformTablesToGame(tables);

      expect(game.selectedPlayerIds).toEqual(['p1', 'p2']);
    });

    it('reconstructs availablePlayers from all rows (without relX/relY)', () => {
      const tables = TestFixtures.tables.gameWithPlayers([
        { player_id: 'p1', name: 'Player 1', rel_x: 0.5, rel_y: 0.5 },
        { player_id: 'p2', name: 'Player 2', rel_x: null, rel_y: null },
      ]);
      const game = transformTablesToGame(tables);

      expect(game.availablePlayers).toHaveLength(2);
      // availablePlayers should NOT have relX/relY
      expect(game.availablePlayers[0]).not.toHaveProperty('relX');
      expect(game.availablePlayers[1]).not.toHaveProperty('relX');
    });
  });

  describe('Event Order Reconstruction', () => {
    it('sorts events by order_index', () => {
      const tables = TestFixtures.tables.gameWithEvents([
        { id: 'e3', order_index: 2, event_type: 'goal' },
        { id: 'e1', order_index: 0, event_type: 'goal' },
        { id: 'e2', order_index: 1, event_type: 'substitution' },
      ]);
      const game = transformTablesToGame(tables);

      expect(game.gameEvents.map(e => e.id)).toEqual(['e1', 'e2', 'e3']);
    });
  });

  describe('Assessment Nesting', () => {
    it('nests flattened assessment into sliders object', () => {
      const tables = TestFixtures.tables.gameWithAssessments([
        {
          player_id: 'p1',
          overall_rating: 8.5,
          intensity: 7.0,
          courage: 8.0,
          duels: 6.5,
          technique: 9.0,
          creativity: 8.5,
          decisions: 7.5,
          awareness: 8.0,
          teamwork: 9.0,
          fair_play: 10.0,
          impact: 7.0,
        },
      ]);
      const game = transformTablesToGame(tables);

      expect(game.assessments?.['p1'].overall).toBe(8.5);
      expect(game.assessments?.['p1'].sliders.intensity).toBe(7.0);
      expect(game.assessments?.['p1'].sliders.fair_play).toBe(10.0);
    });
  });

  describe('Round-Trip Integrity', () => {
    it('game survives full round-trip: AppState → Tables → AppState', () => {
      const original = TestFixtures.games.complete(); // Full game with all fields
      const tables = transformGameToTables(original, 'user-123');
      const restored = transformTablesToGame(tables);

      // Core fields
      expect(restored.teamName).toBe(original.teamName);
      expect(restored.opponentName).toBe(original.opponentName);
      expect(restored.homeScore).toBe(original.homeScore);
      expect(restored.awayScore).toBe(original.awayScore);

      // Player arrays (check IDs, order may differ)
      expect(restored.playersOnField.map(p => p.id).sort())
        .toEqual(original.playersOnField.map(p => p.id).sort());
      expect(restored.selectedPlayerIds.sort())
        .toEqual(original.selectedPlayerIds.sort());

      // Events (order must match)
      expect(restored.gameEvents.map(e => e.id))
        .toEqual(original.gameEvents.map(e => e.id));
    });
  });
});
```

### 9.4 TDD: DataStore Methods

Write tests for each DataStore method BEFORE implementing in SupabaseDataStore.

#### Example: `tests/datastore/SupabaseDataStore.test.ts`

```typescript
import { SupabaseDataStore } from '@/datastore/SupabaseDataStore';
import { ValidationError, AlreadyExistsError, NotFoundError } from '@/interfaces/DataStoreErrors';
import { createMockSupabaseClient } from '@tests/mocks/supabase';

describe('SupabaseDataStore', () => {
  let dataStore: SupabaseDataStore;
  let mockClient: ReturnType<typeof createMockSupabaseClient>;

  beforeEach(() => {
    mockClient = createMockSupabaseClient();
    dataStore = new SupabaseDataStore(mockClient);
  });

  describe('initialize', () => {
    it('prefetches all data on init', async () => {
      await dataStore.initialize();

      expect(mockClient.from).toHaveBeenCalledWith('players');
      expect(mockClient.from).toHaveBeenCalledWith('teams');
      expect(mockClient.from).toHaveBeenCalledWith('seasons');
      // ... etc
    });

    it('caches prefetched data', async () => {
      mockClient.mockSelectReturn('players', [{ id: 'p1', name: 'Test' }]);
      await dataStore.initialize();

      const players = await dataStore.getPlayers();
      expect(players).toHaveLength(1);
      expect(mockClient.from).toHaveBeenCalledTimes(/* once per table */);
    });
  });

  describe('createPlayer', () => {
    beforeEach(async () => {
      await dataStore.initialize();
    });

    it('returns player with generated ID', async () => {
      mockClient.mockInsertReturn('players', { id: 'player_123', name: 'New' });

      const player = await dataStore.createPlayer({ name: 'New' });

      expect(player.id).toMatch(/^player_/);
      expect(player.name).toBe('New');
    });

    it('throws ValidationError for empty name', async () => {
      await expect(dataStore.createPlayer({ name: '' }))
        .rejects.toThrow(ValidationError);
    });

    it('throws ValidationError for whitespace-only name', async () => {
      await expect(dataStore.createPlayer({ name: '   ' }))
        .rejects.toThrow(ValidationError);
    });

    it('optimistically updates cache before API call', async () => {
      let cacheBeforeApi: Player[] | null = null;
      mockClient.mockInsertCallback('players', () => {
        cacheBeforeApi = dataStore.getCachedPlayers();
      });

      await dataStore.createPlayer({ name: 'New' });

      expect(cacheBeforeApi).toContainEqual(expect.objectContaining({ name: 'New' }));
    });

    it('rolls back cache on API failure', async () => {
      mockClient.mockInsertError('players', new Error('Network error'));

      await expect(dataStore.createPlayer({ name: 'New' })).rejects.toThrow();

      const players = await dataStore.getPlayers();
      expect(players.find(p => p.name === 'New')).toBeUndefined();
    });
  });

  // ... similar tests for all 52+ DataStore methods
});
```

### 9.5 TDD: Auth Service

```typescript
// tests/auth/SupabaseAuthService.test.ts

describe('SupabaseAuthService', () => {
  describe('signUp', () => {
    it('rejects password shorter than 12 characters', async () => {
      const result = await authService.signUp('test@test.com', 'short123');
      expect(result).toEqual({
        error: expect.stringContaining('12 characters'),
      });
    });

    it('rejects password without complexity', async () => {
      const result = await authService.signUp('test@test.com', 'alllowercase123');
      expect(result).toEqual({
        error: expect.stringContaining('uppercase'),
      });
    });

    it('returns confirmationRequired when email unverified', async () => {
      mockSupabase.auth.signUp.mockResolvedValue({
        data: { user: { email_confirmed_at: null }, session: null },
        error: null,
      });

      const result = await authService.signUp('test@test.com', 'ValidPassword123!');
      expect(result.confirmationRequired).toBe(true);
      expect(result.session).toBeNull();
    });

    it('returns session when auto-confirmed', async () => {
      mockSupabase.auth.signUp.mockResolvedValue({
        data: {
          user: { email_confirmed_at: new Date().toISOString() },
          session: { access_token: 'token' },
        },
        error: null,
      });

      const result = await authService.signUp('test@test.com', 'ValidPassword123!');
      expect(result.confirmationRequired).toBeFalsy();
      expect(result.session).toBeDefined();
    });
  });

  describe('signIn', () => {
    it('returns user and session on success', async () => {
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: { id: 'u1' }, session: { access_token: 'token' } },
        error: null,
      });

      const result = await authService.signIn('test@test.com', 'password');
      expect(result.user).toBeDefined();
      expect(result.session).toBeDefined();
    });

    it('throws AuthError on invalid credentials', async () => {
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' },
      });

      await expect(authService.signIn('test@test.com', 'wrong'))
        .rejects.toThrow(AuthError);
    });
  });

  describe('onAuthStateChange', () => {
    it('returns unsubscribe function', () => {
      const unsubscribe = authService.onAuthStateChange(() => {});
      expect(typeof unsubscribe).toBe('function');
    });

    it('unsubscribe prevents memory leak', () => {
      const callback = jest.fn();
      const unsubscribe = authService.onAuthStateChange(callback);

      unsubscribe();

      // Simulate auth change
      mockSupabase.auth.emitAuthChange('SIGNED_IN', {});
      expect(callback).not.toHaveBeenCalled();
    });
  });
});
```

### 9.6 TDD: Migration Service

```typescript
// tests/services/migrationService.test.ts

describe('MigrationService', () => {
  describe('migrateLocalToCloud', () => {
    it('migrates all data types', async () => {
      // Setup local data
      await localDataStore.createPlayer({ name: 'Player 1' });
      await localDataStore.createSeason('Season 1');
      await localDataStore.createGame({ teamName: 'Team', opponentName: 'Opp', gameDate: '2024-01-01' });

      const result = await migrationService.migrateLocalToCloud({
        onProgress: jest.fn(),
      });

      expect(result.success).toBe(true);
      expect(result.counts.players).toBe(1);
      expect(result.counts.seasons).toBe(1);
      expect(result.counts.games).toBe(1);
    });

    it('calls progress callback at each stage', async () => {
      const onProgress = jest.fn();

      await migrationService.migrateLocalToCloud({ onProgress });

      expect(onProgress).toHaveBeenCalledWith({ stage: 'players', current: 0, total: expect.any(Number) });
      expect(onProgress).toHaveBeenCalledWith({ stage: 'complete', current: expect.any(Number), total: expect.any(Number) });
    });

    it('rolls back on partial failure', async () => {
      // Player succeeds, season fails
      mockCloudDataStore.createSeason.mockRejectedValue(new Error('DB error'));

      const result = await migrationService.migrateLocalToCloud({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('season');

      // Verify cloud data was cleaned up
      const cloudPlayers = await cloudDataStore.getPlayers();
      expect(cloudPlayers).toHaveLength(0);
    });

    it('does not modify local data on failure', async () => {
      const localPlayersBefore = await localDataStore.getPlayers();
      mockCloudDataStore.createPlayer.mockRejectedValue(new Error('DB error'));

      await migrationService.migrateLocalToCloud({});

      const localPlayersAfter = await localDataStore.getPlayers();
      expect(localPlayersAfter).toEqual(localPlayersBefore);
    });

    it('verifies migration with count comparison', async () => {
      await localDataStore.createPlayer({ name: 'P1' });
      await localDataStore.createPlayer({ name: 'P2' });

      const result = await migrationService.migrateLocalToCloud({ verify: true });

      expect(result.verification?.players.local).toBe(2);
      expect(result.verification?.players.cloud).toBe(2);
      expect(result.verification?.players.match).toBe(true);
    });
  });
});
```

### 9.7 Integration Tests (Real Supabase)

**File**: `tests/integration/supabase-cloud.test.ts`

```typescript
/**
 * Integration tests against real Supabase test project.
 *
 * Prerequisites:
 * - SUPABASE_TEST_URL and SUPABASE_TEST_ANON_KEY env vars set
 * - Test database reset before each run
 */

describe('Supabase Integration', () => {
  let dataStore: SupabaseDataStore;
  let testUserId: string;

  beforeAll(async () => {
    // Sign in as test user
    const auth = new SupabaseAuthService(testClient);
    const result = await auth.signIn(TEST_EMAIL, TEST_PASSWORD);
    testUserId = result.user!.id;

    dataStore = new SupabaseDataStore(testClient);
    await dataStore.initialize();
  });

  afterAll(async () => {
    // Clean up test data
    await cleanupTestUser(testUserId);
  });

  describe('Game Lifecycle', () => {
    it('creates, saves, loads, and deletes game', async () => {
      // Create
      const { gameId, gameData } = await dataStore.createGame({
        teamName: 'Test Team',
        opponentName: 'Test Opponent',
        gameDate: '2024-01-15',
      });
      expect(gameId).toBeDefined();

      // Add players
      const updatedGame = await dataStore.saveGame(gameId, {
        ...gameData,
        availablePlayers: [{ id: 'p1', name: 'Player 1' }],
        selectedPlayerIds: ['p1'],
      });

      // Load
      const loaded = await dataStore.getGameById(gameId);
      expect(loaded?.teamName).toBe('Test Team');
      expect(loaded?.availablePlayers).toHaveLength(1);
      expect(loaded?.selectedPlayerIds).toEqual(['p1']);

      // Delete
      const deleted = await dataStore.deleteGame(gameId);
      expect(deleted).toBe(true);

      // Verify deleted
      const notFound = await dataStore.getGameById(gameId);
      expect(notFound).toBeNull();
    });
  });

  describe('RLS Policy Verification', () => {
    it('user cannot read other users data', async () => {
      // Create data as test user
      await dataStore.createPlayer({ name: 'My Player' });

      // Try to read as different user
      const otherUserClient = createSupabaseClient(OTHER_USER_TOKEN);
      const otherDataStore = new SupabaseDataStore(otherUserClient);
      await otherDataStore.initialize();

      const otherPlayers = await otherDataStore.getPlayers();
      expect(otherPlayers.find(p => p.name === 'My Player')).toBeUndefined();
    });

    it('user cannot modify other users data', async () => {
      // This should throw or return false
      await expect(
        otherDataStore.deletePlayer(myPlayerId)
      ).rejects.toThrow(); // or .resolves.toBe(false)
    });
  });
});
```

### 9.8 UI Component Tests

```typescript
// tests/components/LoginScreen.test.tsx

describe('LoginScreen', () => {
  it('shows sign in form by default', () => {
    render(<LoginScreen />);
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('switches to sign up form', async () => {
    render(<LoginScreen />);
    await userEvent.click(screen.getByText(/create account/i));
    expect(screen.getByRole('button', { name: /sign up/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
  });

  it('shows loading state during sign in', async () => {
    const mockSignIn = jest.fn(() => new Promise(() => {})); // Never resolves
    render(<LoginScreen />, { authContext: { signIn: mockSignIn } });

    await userEvent.type(screen.getByLabelText(/email/i), 'test@test.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
  });

  it('displays error message on failure', async () => {
    const mockSignIn = jest.fn().mockResolvedValue({ error: 'Invalid credentials' });
    render(<LoginScreen />, { authContext: { signIn: mockSignIn } });

    await userEvent.type(screen.getByLabelText(/email/i), 'test@test.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/invalid credentials/i)).toBeInTheDocument();
  });

  it('validates password requirements on sign up', async () => {
    render(<LoginScreen />);
    await userEvent.click(screen.getByText(/create account/i));

    await userEvent.type(screen.getByLabelText(/^password/i), 'short');
    await userEvent.click(screen.getByRole('button', { name: /sign up/i }));

    expect(await screen.findByText(/12 characters/i)).toBeInTheDocument();
  });
});
```

### 9.9 Test Fixtures

**File**: `tests/fixtures/supabase.ts`

```typescript
/**
 * Test fixtures for Supabase-related tests.
 * Extends existing TestFixtures with table-format data.
 */

export const SupabaseFixtures = {
  tables: {
    game: (overrides = {}) => ({
      id: 'game_123',
      user_id: 'user_123',
      team_name: 'Test Team',
      opponent_name: 'Test Opponent',
      game_date: '2024-01-15',
      home_or_away: 'home',
      number_of_periods: 2,
      period_duration_minutes: 10,
      current_period: 1,
      game_status: 'notStarted',
      is_played: false,
      home_score: 0,
      away_score: 0,
      game_notes: '',
      show_player_names: true,
      season_id: null,
      tournament_id: null,
      ...overrides,
    }),

    gameWithPlayers: (players: Partial<GamePlayerRow>[]) => ({
      game: SupabaseFixtures.tables.game(),
      players: players.map((p, i) => ({
        game_id: 'game_123',
        player_id: p.player_id ?? `player_${i}`,
        name: p.name ?? `Player ${i}`,
        on_field: p.on_field ?? false,
        is_selected: p.is_selected ?? false,
        rel_x: p.rel_x ?? null,
        rel_y: p.rel_y ?? null,
        ...p,
      })),
      events: [],
      assessments: [],
      tacticalData: null,
    }),

    gameWithEvents: (events: Partial<GameEventRow>[]) => ({
      game: SupabaseFixtures.tables.game(),
      players: [],
      events: events.map((e, i) => ({
        id: e.id ?? `event_${i}`,
        game_id: 'game_123',
        event_type: e.event_type ?? 'goal',
        time_seconds: e.time_seconds ?? 0,
        order_index: e.order_index ?? i,
        ...e,
      })),
      assessments: [],
      tacticalData: null,
    }),
  },

  mockClient: {
    /**
     * Creates a mock Supabase client for unit tests.
     */
    create: () => {
      const mock = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn(),
        rpc: jest.fn(),
        auth: {
          signUp: jest.fn(),
          signInWithPassword: jest.fn(),
          signOut: jest.fn(),
          getSession: jest.fn(),
          onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
        },
      };

      return {
        ...mock,
        mockSelectReturn: (table: string, data: unknown[]) => {
          mock.from.mockImplementation((t) => {
            if (t === table) {
              return { ...mock, select: () => ({ data, error: null }) };
            }
            return mock;
          });
        },
        mockInsertReturn: (table: string, data: unknown) => {
          mock.from.mockImplementation((t) => {
            if (t === table) {
              return { ...mock, insert: () => ({ select: () => ({ single: () => ({ data, error: null }) }) }) };
            }
            return mock;
          });
        },
        mockInsertError: (table: string, error: Error) => {
          mock.from.mockImplementation((t) => {
            if (t === table) {
              return { ...mock, insert: () => ({ select: () => ({ single: () => ({ data: null, error }) }) }) };
            }
            return mock;
          });
        },
      };
    },
  },
};
```

### 9.10 Coverage Requirements

| PR | Minimum Line Coverage | Critical Areas |
|----|----------------------|----------------|
| 1 | 80% | Mode detection logic |
| 2 | 75% | Client initialization, lazy loading |
| 3 | **85%** | All DataStore CRUD methods |
| 4 | **90%** | Transform functions (highest risk) |
| 5 | 80% | Auth methods, error handling |
| 6 | **85%** | Migration logic, rollback |
| 7 | 70% | Cache configuration |
| 8 | 70% | UI integration |

**Enforcement**: Add to `jest.config.js`:

```javascript
coverageThreshold: {
  'src/datastore/supabase/transforms/**': {
    lines: 90,
    branches: 85,
  },
  'src/datastore/SupabaseDataStore.ts': {
    lines: 85,
    branches: 80,
  },
  'src/services/migrationService.ts': {
    lines: 85,
    branches: 80,
  },
},
```

### 9.11 Test Execution Per PR

| PR | Before Merge | Command |
|----|--------------|---------|
| 1 | Unit tests pass | `npm test -- --testPathPattern="backendConfig"` |
| 2 | Unit tests pass | `npm test -- --testPathPattern="supabase/client"` |
| 3 | Unit + parity tests pass | `npm test -- --testPathPattern="(SupabaseDataStore|parity)"` |
| 4 | Unit + transform + parity tests pass | `npm test -- --testPathPattern="(transforms|parity)"` |
| 5 | Unit + auth tests pass | `npm test -- --testPathPattern="(SupabaseAuth|LoginScreen)"` |
| 6 | Unit + migration tests pass | `npm test -- --testPathPattern="migration"` |
| 7 | All unit tests pass | `npm test` |
| 8 | Full suite + integration | `npm test && npm run test:integration` |

---

## 10. Final Phase: Infrastructure & Master Merge

> **IMPORTANT**: This section covers everything needed AFTER PR #8 is merged to `feature/supabase-cloud-backend` but BEFORE the final merge to `master`. This is when the cloud backend becomes actually functional.

### 10.1 Overview: What's Still Missing After PR #8

After all 8 PRs are merged to the feature branch, you have:
- ✅ All application code (DataStore, AuthService, UI components)
- ✅ All unit tests passing
- ✅ RPC functions SQL file (`supabase/migrations/001_rpc_functions.sql`)

But you still need:
- ❌ **SQL migration files** for tables, indexes, RLS policies
- ❌ **MigrationWizard UI** to trigger local→cloud migration
- ❌ **Supabase project** created and configured
- ❌ **End-to-end testing** with real Supabase (not mocks)
- ❌ **Production environment** configured

### 10.2 PR #9: Infrastructure & Migration UI (~15 hours)

**Branch**: `supabase/pr9-infrastructure`
**Depends on**: PR #8 merged to `feature/supabase-cloud-backend`

This PR creates the missing pieces needed for a functional cloud backend.

#### 10.2.1 Create SQL Migration Files

Extract SQL from `docs/02-technical/database/supabase-schema.md` into runnable files:

**Files to Create**:
```
supabase/migrations/
├── 000_schema.sql           # All 15 tables + indexes + constraints
├── 001_rpc_functions.sql    # KEEP existing file (no rename)
├── 002_rls_policies.sql     # All RLS policies (runs after tables + RPC)
└── README.md                # Deployment instructions
```

> **Note**: Keep `001_rpc_functions.sql` as-is. Adding `000_schema.sql` before it and `002_rls_policies.sql` after maintains correct execution order without breaking existing references in code comments and checklists.

**`000_schema.sql`** (~400 lines) - Tables in dependency order:
```sql
-- 1. Independent tables (no foreign keys to other app tables)
CREATE TABLE players (...);
CREATE TABLE seasons (...);
CREATE TABLE tournaments (...);
CREATE TABLE personnel (...);
CREATE TABLE warmup_plans (...);
CREATE TABLE user_settings (...);

-- 2. Tables with foreign keys
CREATE TABLE teams (...);           -- refs seasons, tournaments
CREATE TABLE team_players (...);    -- refs teams
CREATE TABLE games (...);           -- refs teams, seasons, tournaments
CREATE TABLE game_players (...);    -- refs games
CREATE TABLE game_events (...);     -- refs games
CREATE TABLE player_assessments (...); -- refs games
CREATE TABLE game_tactical_data (...); -- refs games
CREATE TABLE player_adjustments (...); -- refs players

-- 3. All indexes
CREATE INDEX idx_players_user_id ON players(user_id);
-- ... (all indexes from schema.md)
```

**`001_rls_policies.sql`** (~150 lines):
```sql
-- Enable RLS on all tables
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
-- ... (all 15 tables)

-- Create policies for each table
CREATE POLICY "Users can only access their own players"
  ON players FOR ALL
  USING (auth.uid() = user_id);
-- ... (all policies from schema.md)
```

**`supabase/migrations/README.md`**:
```markdown
# Supabase Migration Files

Run these in order via Supabase Dashboard > SQL Editor:

1. `000_schema.sql` - Creates all tables and indexes
2. `001_rpc_functions.sql` - Creates atomic transaction functions (existing file)
3. `002_rls_policies.sql` - Enables Row Level Security

## Quick Deploy
```bash
# Using Supabase CLI (if configured)
supabase db push

# Or manually in SQL Editor - copy/paste each file in order
```
```

#### 10.2.2 Create MigrationWizard Component

The migration service exists but has **no UI**. Create the wizard.

> **⚠️ CRITICAL: Migration Requires Authentication**
>
> `migrateLocalToCloud()` instantiates `SupabaseDataStore` which requires an authenticated session.
> The wizard **MUST** run AFTER the user has signed in, not before.

**File**: `src/components/MigrationWizard.tsx` (~250 lines)

**When Shown** (post-authentication only):
```
User enables cloud → App reloads → LoginScreen → User signs in
    → Check: hasLocalData AND NOT hasMigrated?
        → YES: Show MigrationWizard
        → NO: Proceed to app
```

**Wizard Steps**:
1. **Preview** - Show counts of data to migrate (all fields from `MigrationCounts`)
2. **Confirm** - User confirms migration
3. **Progress** - Show upload progress with entity names
4. **Complete** - Success message with option to clear local data

**Preview Must Show ALL Migrated Data** (matches `MigrationCounts` interface):
- Players (`players`)
- Teams (`teams`)
- Team Rosters (`teamRosters`)
- Seasons (`seasons`)
- Tournaments (`tournaments`)
- Games (`games`)
- Personnel (`personnel`)
- Player Adjustments (`playerAdjustments`)
- Warmup Plan (`warmupPlan` - boolean)
- Settings (`settings` - boolean)

#### 10.2.3 Migration Completed Flag

**Problem**: Without a persistent flag, MigrationWizard would appear on every login.

**Solution**: Store completion flag in localStorage (per-user):

**File**: `src/config/backendConfig.ts` (add functions)

```typescript
const MIGRATION_COMPLETED_PREFIX = 'matchops_cloud_migration_completed_';

/**
 * Check if migration has been completed for the current user.
 * @param userId - Supabase auth user ID
 */
export function hasMigrationCompleted(userId: string): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(`${MIGRATION_COMPLETED_PREFIX}${userId}`) === 'true';
}

/**
 * Mark migration as completed for the current user.
 * @param userId - Supabase auth user ID
 */
export function setMigrationCompleted(userId: string): void {
  localStorage.setItem(`${MIGRATION_COMPLETED_PREFIX}${userId}`, 'true');
}

/**
 * Clear migration completed flag (for testing or re-migration).
 * @param userId - Supabase auth user ID
 */
export function clearMigrationCompleted(userId: string): void {
  localStorage.removeItem(`${MIGRATION_COMPLETED_PREFIX}${userId}`);
}
```

**Why localStorage (not AppSettings)**:
- Checked BEFORE DataStore is initialized
- Per-device (migration is device-specific)
- Per-user (keyed by userId)
- Survives mode switches

#### 10.2.4 Clear Local Data (Safe Implementation)

**Problem**: Existing `resetAppSettings()` clears ALL localStorage including `matchops_backend_mode`, which would flip users back to local mode.

**Solution**: Create dedicated function that only clears IndexedDB data stores.

**File**: `src/utils/clearLocalData.ts` (new file)

```typescript
/**
 * Clear local IndexedDB data stores only.
 *
 * DOES NOT clear:
 * - localStorage settings (backend mode, migration flags, etc.)
 * - Session storage
 * - Service worker cache
 *
 * Safe to call in cloud mode after successful migration.
 */
export async function clearLocalIndexedDBData(): Promise<void> {
  const localStore = new LocalDataStore();
  await localStore.initialize();

  // Clear each data type
  await localStore.clearAllPlayers();
  await localStore.clearAllTeams();
  await localStore.clearAllSeasons();
  await localStore.clearAllTournaments();
  await localStore.clearAllPersonnel();
  await localStore.clearAllGames();
  await localStore.clearWarmupPlan();
  await localStore.clearSettings();
  // ... etc
}
```

> **Note**: LocalDataStore may need new `clear*()` methods added. Alternatively, use IndexedDB API directly to delete the database.

#### 10.2.5 Integration Point (page.tsx - Post-Auth Only)

```typescript
// In page.tsx - AFTER authentication check
const { isAuthenticated, user, mode } = useAuth();

// Only show wizard when:
// 1. Cloud mode AND
// 2. Authenticated (required for SupabaseDataStore) AND
// 3. Migration not already completed for this user
const shouldShowMigrationWizard =
  mode === 'cloud' &&
  isAuthenticated &&
  user?.id &&
  !hasMigrationCompleted(user.id);

if (shouldShowMigrationWizard) {
  // Check if there's actually local data to migrate
  const [hasLocalData, setHasLocalData] = useState<boolean | null>(null);

  useEffect(() => {
    hasLocalDataToMigrate().then(setHasLocalData);
  }, []);

  if (hasLocalData === null) {
    return <LoadingSpinner />; // Checking...
  }

  if (hasLocalData) {
    return (
      <MigrationWizard
        onComplete={() => {
          setMigrationCompleted(user.id);
          // Refresh app state
        }}
        onSkip={() => {
          setMigrationCompleted(user.id); // Don't ask again
        }}
      />
    );
  }

  // No local data, mark as "completed" so we don't check again
  setMigrationCompleted(user.id);
}

// Continue to normal app...
```

**CloudSyncSection Integration**: When enabling cloud mode, just enable and reload. The migration prompt will appear after login (when auth is available).

#### 10.2.6 Translation Keys

**Existing Keys** (already in `common.json` - USE THESE):
```json
"migration": {
  "title": "Migrate to Cloud",
  "description": "Transfer your local data to your cloud account...",
  "preparing": "Preparing migration...",
  "exporting": "Exporting local data...",
  "validating": "Validating data integrity...",
  "uploading": "Uploading to cloud...",
  "verifying": "Verifying migration...",
  "success": "Migration complete! Your data is now synced to the cloud.",
  "partialFailure": "Migration was interrupted...",
  "verificationFailed": "Migration completed but verification failed...",
  "networkError": "Network error during migration...",
  "clearLocalPrompt": "Would you like to clear local data?...",
  "startButton": "Start Migration",
  "retryButton": "Retry Migration",
  "cancelButton": "Cancel",
  "summary": {
    "title": "Data Summary",
    "players": "Players",
    "teams": "Teams",
    "seasons": "Seasons",
    "tournaments": "Tournaments",
    "games": "Games",
    "personnel": "Personnel"
  },
  "progress": {
    "entity": "Migrating {{entity}}...",
    "complete": "{{count}} items migrated"
  }
}
```

**Keys to ADD** (extend `migration.summary` for missing counts):
```json
"migration": {
  "summary": {
    // ... existing keys ...
    "teamRosters": "Team Rosters",
    "playerAdjustments": "Player Adjustments",
    "warmupPlan": "Warmup Plan",
    "settings": "Settings"
  },
  "skipButton": "Skip for now",
  "keepLocalButton": "Keep local data as backup",
  "clearLocalButton": "Clear local data"
}
```

> **Note**: After adding keys, regenerate types: `npm run generate:i18n-types`

#### 10.2.7 PR #9 Deliverables Checklist

**SQL Migration Files**:
- [ ] `supabase/migrations/000_schema.sql` - All 15 tables and indexes
- [ ] `supabase/migrations/002_rls_policies.sql` - All RLS policies
- [ ] `supabase/migrations/README.md` - Deployment instructions
- [ ] Keep `001_rpc_functions.sql` unchanged (already exists)

**Migration Completed Flag**:
- [ ] Add `hasMigrationCompleted(userId)` to `backendConfig.ts`
- [ ] Add `setMigrationCompleted(userId)` to `backendConfig.ts`
- [ ] Add `clearMigrationCompleted(userId)` to `backendConfig.ts`

**Clear Local Data**:
- [ ] Create `src/utils/clearLocalIndexedDBData.ts` (or add clear methods to LocalDataStore)
- [ ] Ensure it does NOT clear localStorage (backend mode, migration flags)

**MigrationWizard UI**:
- [ ] `src/components/MigrationWizard.tsx` - Migration UI (shows AFTER auth)
- [ ] `src/components/__tests__/MigrationWizard.test.tsx` - Tests
- [ ] Preview shows ALL counts (players, teams, teamRosters, seasons, tournaments, games, personnel, playerAdjustments, warmupPlan, settings)

**Integration**:
- [ ] Update `page.tsx` - Show wizard post-auth when `hasLocalData && !hasMigrationCompleted`
- [ ] `CloudSyncSection.tsx` - Just enables mode (wizard appears after login)

**Translations**:
- [ ] Add missing keys to `common.json` (EN): `migration.summary.teamRosters`, etc.
- [ ] Add missing keys to `common.json` (FI)
- [ ] Run `npm run generate:i18n-types`

**Tests**:
- [ ] All existing tests pass
- [ ] New tests for migration flag functions
- [ ] New tests for MigrationWizard component

---

### 10.2.8 PR #10: Cloud Data Management (~3 hours)

**Branch**: `feature/supabase-cloud-backend` (direct commit)
**Depends on**: PR #9 merged

This PR adds critical cloud data management features: migration mode selection and clear cloud data functionality.

#### 10.2.8.1 Migration Mode Selection

**Problem**: Original migration only supports merge mode. Users need ability to completely replace cloud data with local data (e.g., after testing or to reset).

**Solution**: Add `replace` mode that clears all cloud data before uploading.

**File Changes**: `src/components/MigrationWizard.tsx`

```typescript
// Add migration mode state
const [migrationMode, setMigrationMode] = useState<'merge' | 'replace'>('merge');
const [replaceConfirmText, setReplaceConfirmText] = useState('');

// Mode selection UI with radio buttons
// Replace mode requires typed "REPLACE" confirmation
// Shows rollback warning: data cannot be recovered if migration fails after clearing
```

**File Changes**: `src/services/migrationService.ts`

```typescript
// Extend migrateLocalToCloud to accept mode parameter
export async function migrateLocalToCloud(
  options?: { mode?: 'merge' | 'replace' }
): Promise<MigrationResult> {
  const mode = options?.mode ?? 'merge';

  if (mode === 'replace') {
    try {
      await cloudStore.clearAllUserData();
      warnings.push('CLOUD_CLEARED');
    } catch (clearError) {
      // Abort migration if clear fails - don't leave partial state
      return { ...emptyResult, errors: [`Failed to clear: ${message}. Migration aborted.`] };
    }
  }
  // Continue with upload...
}
```

#### 10.2.8.2 Clear All Cloud Data

**Problem**: Users need ability to delete all their cloud data (account cleanup, privacy, testing).

**Solution**: Add clear functionality with safety checks.

**File Changes**: `src/datastore/SupabaseDataStore.ts`

```typescript
async clearAllUserData(): Promise<void> {
  const userId = await this.getUserId();

  // FK Constraints (verified in supabase-schema.md):
  // - game_events, game_players, game_tactical_data, player_assessments:
  //     game_id REFERENCES games(id) ON DELETE CASCADE
  // - games: season_id, tournament_id, team_id ON DELETE SET NULL
  // - team_players: team_id REFERENCES teams(id) ON DELETE CASCADE
  //
  // Deletion order: child tables first, parent tables last
  const tablesToClear = [
    'game_events', 'game_players', 'game_tactical_data', 'player_assessments',
    'games', 'player_adjustments', 'team_players', 'teams', 'tournaments',
    'seasons', 'personnel', 'players', 'warmup_plans', 'user_settings'
  ] as const;

  for (const table of tablesToClear) {
    // Explicit user_id filter (defense in depth - don't rely solely on RLS)
    const { error } = await client.from(table).delete().eq('user_id', userId);
    if (error) throw new NetworkError(`Failed to clear ${table}: ${error.message}`);
  }
}
```

**File Changes**: `src/components/CloudSyncSection.tsx`

```typescript
// Add "Clear All Cloud Data" button with safety checks
const handleClearCloudData = async () => {
  // Safety check 1: UI-level cloud availability
  if (!cloudAvailable) {
    showToast(t('cloudSync.cloudUnavailable'), 'error');
    return;
  }

  // Safety check 2: Runtime backend verification
  const dataStore = await getDataStore();
  if (dataStore.getBackendName() !== 'supabase') {
    showToast(t('cloudSync.wrongBackend'), 'error');
    return;
  }

  // Require typed "DELETE" confirmation
  if (deleteConfirmText !== 'DELETE') return;

  await dataStore.clearAllUserData();
  showToast(t('cloudSync.cloudCleared'), 'success');
};
```

#### 10.2.8.3 Interface Updates

**File Changes**: `src/interfaces/DataStore.ts`

```typescript
// Add upsertPlayerAdjustment for both local and cloud parity
upsertPlayerAdjustment(
  adjustment: Omit<PlayerStatAdjustment, 'id' | 'appliedAt'> & { id?: string; appliedAt?: string }
): Promise<PlayerStatAdjustment>;
```

**File Changes**: `src/datastore/LocalDataStore.ts`

```typescript
// Implement upsertPlayerAdjustment with DRY helpers
private buildPlayerAdjustment(adjustment: ...): PlayerStatAdjustment { /* ... */ }
private validateAdjustmentNote(note: string | undefined): void { /* ... */ }

async upsertPlayerAdjustment(adjustment: ...): Promise<PlayerStatAdjustment> {
  // Insert or update based on existing id
}
```

#### 10.2.8.4 Translation Keys Added

**EN (`public/locales/en/common.json`)**:
```json
{
  "cloudSync": {
    "cloudUnavailable": "Cloud is not available. Cannot clear cloud data.",
    "wrongBackend": "Cannot clear: not connected to cloud storage."
  },
  "migration": {
    "replaceWarningTitle": "Replace mode will DELETE all existing cloud data!",
    "replaceWarningDesc": "This will clear all your cloud data before uploading local data.",
    "replaceConfirmLabel": "Type REPLACE to confirm:",
    "startReplaceButton": "Start Replace Migration",
    "replaceNoRollback": "Warning: If migration fails after clearing, your cloud data cannot be recovered."
  }
}
```

#### 10.2.8.5 PR #10 Deliverables Checklist

**Migration Mode Selection**:
- [x] Add `migrationMode` state to MigrationWizard
- [x] Add mode selection radio buttons UI
- [x] Add typed "REPLACE" confirmation for replace mode
- [x] Add rollback warning message
- [x] Update migrationService to accept mode parameter
- [x] Clear cloud data before upload in replace mode
- [x] Handle clear failure gracefully (abort migration)

**Clear Cloud Data**:
- [x] Implement `clearAllUserData()` in SupabaseDataStore
- [x] Verify FK constraint deletion order
- [x] Add explicit userId filter (defense in depth)
- [x] Add "Clear All Cloud Data" button in CloudSyncSection
- [x] Add cloudAvailable UI gating
- [x] Add runtime backend verification
- [x] Add typed "DELETE" confirmation

**Interface Parity**:
- [x] Add `upsertPlayerAdjustment()` to DataStore interface
- [x] Implement in LocalDataStore with DRY helpers
- [x] Update mockDataStore for tests

**Translations**:
- [x] Add EN translations for new keys
- [x] Add FI translations for new keys
- [x] Regenerate i18n types

**Tests**:
- [x] All existing tests pass
- [x] i18n validation tests updated

---

### 10.3 Supabase Project Setup

After PR #9 is merged, set up the actual Supabase infrastructure.

#### 10.3.1 Create Supabase Project

1. Go to [supabase.com](https://supabase.com) → New Project
2. Choose region closest to users (e.g., `eu-central-1` for Finland)
3. Set a strong database password (save it securely)
4. Wait for project to provision (~2 minutes)

#### 10.3.2 Run Database Migrations

In Supabase Dashboard → SQL Editor:

```bash
# Option A: Supabase CLI (recommended)
cd /path/to/project
supabase link --project-ref <your-project-ref>
supabase db push

# Option B: Manual (copy/paste in SQL Editor)
# 1. Open 000_schema.sql → Run
# 2. Open 001_rls_policies.sql → Run
# 3. Open 002_rpc_functions.sql → Run
```

#### 10.3.3 Verify Schema

After running migrations, verify in Supabase Dashboard → Table Editor:

- [ ] 15 tables visible (players, teams, seasons, tournaments, personnel, games, game_players, game_events, player_assessments, game_tactical_data, player_adjustments, team_players, warmup_plans, user_settings)
- [ ] Each table has RLS enabled (lock icon)
- [ ] Indexes visible in Database → Indexes

#### 10.3.4 Configure Authentication

In Supabase Dashboard → Authentication → Settings:

1. **Email Auth**:
   - Enable "Email" provider
   - Disable "Confirm email" for testing (enable for production)
   - Set site URL: `https://your-domain.com`
   - Add redirect URLs: `https://your-domain.com/*`, `http://localhost:3000/*`

2. **Email Templates** (Authentication → Email Templates):
   - Customize confirmation email
   - Customize password reset email
   - Add your app name and branding

3. **Rate Limits** (optional):
   - Default limits are usually fine for single-user app

#### 10.3.5 Get API Credentials

In Supabase Dashboard → Settings → API:

- **Project URL**: `https://<project-ref>.supabase.co`
- **anon/public key**: Safe for client-side (RLS protects data)
- **service_role key**: ⚠️ NEVER expose client-side (admin access)

---

### 10.4 Environment Configuration

#### 10.4.1 Local Development

**File**: `.env.local`
```bash
# Backend mode (local = IndexedDB, cloud = Supabase)
NEXT_PUBLIC_BACKEND_MODE=local

# Supabase credentials (required for cloud mode)
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Optional: Force cloud mode for testing
# NEXT_PUBLIC_BACKEND_MODE=cloud
```

#### 10.4.2 Production (Vercel)

In Vercel Dashboard → Project → Settings → Environment Variables:

| Variable | Value | Environment |
|----------|-------|-------------|
| `NEXT_PUBLIC_BACKEND_MODE` | `local` | Production |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project>.supabase.co` | Production |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` | Production |

> **Note**: Keep `NEXT_PUBLIC_BACKEND_MODE=local` as default. Users opt-in to cloud via Settings.

---

### 10.5 End-to-End Testing with Real Supabase

Before merging to master, test against the real Supabase project (not mocks).

#### 10.5.1 Create Test Supabase Project

Create a **separate** Supabase project for testing:
- Name: `matchops-test` or `matchops-staging`
- Run same migrations as production
- Use for E2E tests and manual testing

#### 10.5.2 E2E Test Checklist

**Authentication Flow**:
- [ ] Sign up with email → receives confirmation email
- [ ] Confirm email → can sign in
- [ ] Sign in → redirected to app
- [ ] Sign out → redirected to login
- [ ] Password reset → receives email → can reset

**Data Operations** (as authenticated user):
- [ ] Create player → appears in Supabase `players` table
- [ ] Create team → appears with correct `user_id`
- [ ] Create game → all 5 tables populated (games, game_players, game_events, player_assessments, game_tactical_data)
- [ ] Update game → changes persisted
- [ ] Delete game → cascade deletes child rows

**RLS Verification** (critical security test):
- [ ] User A's data not visible to User B
- [ ] Direct API call with forged `user_id` rejected
- [ ] Unauthenticated requests rejected

**Migration Flow**:
- [ ] Local mode → has data → enable cloud → MigrationWizard appears
- [ ] Migration preview shows correct counts
- [ ] Migration uploads all data
- [ ] Verification passes
- [ ] Data accessible in cloud mode

**Mode Switching**:
- [ ] Local → Cloud → restart → Login shown
- [ ] Cloud → Local → restart → immediate access
- [ ] Data preserved in both modes

#### 10.5.3 Load Testing

With 100+ games in local storage:
- [ ] Migration completes without timeout
- [ ] Cloud mode loads game list in <3s
- [ ] Game save completes in <2s
- [ ] No memory issues during migration

---

### 10.6 Final Merge to Master

#### 10.6.1 Pre-Merge Checklist

**Code Quality**:
- [ ] All PRs (#1-#9) merged to `feature/supabase-cloud-backend`
- [ ] `npm test` passes (3,200+ tests)
- [ ] `npm run build` passes
- [ ] `npm run lint` passes
- [ ] No TypeScript errors

**Infrastructure**:
- [ ] Production Supabase project created
- [ ] All migrations run successfully
- [ ] RLS policies verified
- [ ] Environment variables set in Vercel

**Manual Testing** (on staging/preview):
- [ ] Fresh install → local mode works perfectly
- [ ] Enable cloud → sign up → migrate → data syncs
- [ ] Disable cloud → returns to local mode
- [ ] Offline behavior: cloud mode shows clear error
- [ ] Mode switch requires restart (expected)

**Documentation**:
- [ ] CLAUDE.md updated with cloud mode info
- [ ] Changelog updated
- [ ] User-facing docs (if any) updated

#### 10.6.2 Merge Process

```bash
# 1. Ensure feature branch is up to date with master
git checkout feature/supabase-cloud-backend
git pull origin feature/supabase-cloud-backend
git merge master  # Resolve any conflicts

# 2. Final verification
npm test
npm run build
npm run lint

# 3. Create PR to master
gh pr create \
  --base master \
  --head feature/supabase-cloud-backend \
  --title "feat: Add Supabase cloud backend" \
  --body "## Summary
- Dual-backend architecture (local + cloud)
- Cloud mode with Supabase auth and storage
- Migration service for local → cloud data transfer
- All 9 PRs included

## Test Plan
- [ ] Local mode regression tested
- [ ] Cloud mode E2E tested
- [ ] Migration tested with 100+ games
- [ ] RLS security verified

🤖 Generated with Claude Code"

# 4. After approval and merge
git checkout master
git pull origin master
```

#### 10.6.3 Post-Merge Verification

After merging to master and deploying:

1. **Verify local mode unchanged**:
   - New users get local mode by default
   - All existing functionality works

2. **Verify cloud mode available**:
   - Settings → Cloud Sync section visible
   - "Enable Cloud Sync" button works
   - Sign up/in flow works

3. **Monitor for errors**:
   - Check Sentry for new errors
   - Check Supabase logs for failed queries
   - Monitor user feedback

---

### 10.7 Rollback Plan

If issues occur after master merge:

**Immediate (no code change)**:
1. Set Vercel env: `NEXT_PUBLIC_BACKEND_MODE=local`
2. Redeploy
3. Cloud features hidden, local mode only

**User-level**:
1. User disables cloud in Settings
2. App restarts in local mode
3. Local data always preserved

**Code rollback** (if critical):
```bash
git revert <merge-commit-sha>
git push origin master
```

---

### 10.8 PR Summary Table (Updated)

| PR | Branch | Est. Hours | Description |
|----|--------|------------|-------------|
| 1 | `supabase/pr1-foundation` | 8h | backendConfig.ts, mode detection |
| 2 | `supabase/pr2-supabase-client` | 10h | Supabase client, lazy loading |
| 3 | `supabase/pr3-datastore-core` | 30h | Core CRUD + TDD |
| 4 | `supabase/pr4-datastore-games` | 35h | Game transforms, RPC |
| 5 | `supabase/pr5-auth-service` | 25h | Auth service + UI |
| 6 | `supabase/pr6-migration` | 25h | Migration service |
| 7 | `supabase/pr7-performance` | 10h | QueryProvider optimization |
| 8 | `supabase/pr8-integration` | 15h | UI integration, tests |
| **9** | **`supabase/pr9-infrastructure`** | **15h** | **SQL files, MigrationWizard, setup** |
| **Final** | **`feature/supabase-cloud-backend` → `master`** | **5h** | **E2E testing, merge** |

**Total**: ~180 hours

---

### 10.9 Environment Variables Reference

```bash
# === REQUIRED FOR CLOUD MODE ===
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# === MODE CONTROL ===
# Default: local (IndexedDB, no auth)
# Cloud: Supabase + auth
NEXT_PUBLIC_BACKEND_MODE=local

# === EXISTING (unchanged) ===
NEXT_PUBLIC_SENTRY_DSN=...
SENTRY_AUTH_TOKEN=...
```

---

### 10.10 Rollback Plan

If issues occur:
1. Set `NEXT_PUBLIC_BACKEND_MODE=local` (immediate)
2. Users can disable cloud in settings → revert to local
3. Local data is always preserved (cloud is optional layer)

---

## Future Enhancements (Post-MVP)

The following items are deferred and can be implemented if/when needed:

- [ ] **DB-level composite unique constraints**: Add PostgreSQL unique indexes for teams/seasons/tournaments to prevent race conditions during concurrent writes (see Section 5.0.7). Currently mitigated by app-level validation which covers 99% of cases; if race condition creates duplicate, user can delete one manually.

- [ ] **Offline queue for cloud mode**: Currently cloud mode requires online connectivity. Could add offline queue with sync-on-reconnect if user demand exists.

- [ ] **Real-time subscriptions**: Supabase supports real-time via websockets. Could enable for multi-device sync if user has multiple devices.

- [ ] **Remove legacy personnel array normalization**: `normalizePersonnelArray()` in `migrationService.ts` handles legacy `Record<string, Personnel>` format that may no longer exist in production. Monitor logs for 3 months after launch (it logs a warning when triggered). If never triggered, remove the backward compatibility code. Added: January 2026.

---

## Summary

This implementation guide ensures:

1. **Single Switch**: `NEXT_PUBLIC_BACKEND_MODE=cloud` or user opt-in
2. **Local Default**: Current behavior unchanged until enabled
3. **Professional Performance**: Optimistic updates, aggressive caching
4. **Parallel Development**: Cloud code exists but dormant
5. **Complete Infrastructure**: SQL migrations, setup guide, E2E testing plan

### Complete PR Flow

```
PRs #1-#8: Application Code
    │
    └──► All merge to feature/supabase-cloud-backend
              │
PR #9: Infrastructure & Migration UI
    │
    └──► Merges to feature/supabase-cloud-backend
              │
              ▼
    ┌─────────────────────────────────┐
    │  Supabase Project Setup         │
    │  - Create project               │
    │  - Run SQL migrations           │
    │  - Configure auth               │
    │  - Set environment variables    │
    └─────────────────────────────────┘
              │
              ▼
    ┌─────────────────────────────────┐
    │  E2E Testing (Real Supabase)    │
    │  - Auth flow                    │
    │  - Data operations              │
    │  - Migration flow               │
    │  - RLS security                 │
    └─────────────────────────────────┘
              │
              ▼
FINAL: PR feature/supabase-cloud-backend → master
    │
    └──► Production deployment
```

### Effort Breakdown

| Phase | Hours | Description |
|-------|-------|-------------|
| PRs #1-#8 | 158h | Application code, tests |
| PR #9 | 15h | SQL files, MigrationWizard |
| Supabase Setup | 3h | Project creation, migrations |
| E2E Testing | 5h | Real Supabase testing |
| Final Merge | 2h | PR review, merge, verify |
| **Total** | **~183h** | |

### Test Coverage Summary

- ~250 unit tests (TDD for critical code)
- ~60 cross-backend parity tests
- ~40 integration tests (real Supabase)
- ~25 UI component tests
- Manual E2E testing checklist
- 90% coverage target for transform functions
