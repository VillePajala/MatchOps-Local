# Backend Abstraction: Realistic PR-Chunked Implementation Plan

**Created**: December 6, 2025
**Updated**: December 19, 2025
**Status**: ✅ **Phase 1-3 COMPLETE** - PR #137 ready to merge to master
**Purpose**: Practical, PR-by-PR guide for backend abstraction based on actual codebase analysis
**Related**: [STORAGE-AUDIT.md](./STORAGE-AUDIT.md) (detailed audit), [dual-backend-architecture.md](../../02-technical/architecture/dual-backend-architecture.md)

---

## Executive Summary

This document provides a **realistic, code-reviewed implementation plan** for adding backend switching capability (IndexedDB → Supabase). Updated December 17, 2025 with fresh codebase audit.

### Key Findings from Code Analysis (Updated Dec 17)

| Issue | Original (Dec 6) | Current (Dec 17) | Addressed In |
|-------|------------------|------------------|--------------|
| Storage calls in codebase | 195 calls / 26 files | **156 calls / 20 files** | PR #2-3 |
| Hooks bypassing domain managers | 4 files | **6 files** (15 calls) | PR #2-3 |
| Timer state calls scattered | Not tracked | **10 calls in 4 hooks** | PR #2 |
| Install prompt / i18n calls | Not tracked | **5 calls in 2 files** | PR #3 |

**See**: [STORAGE-AUDIT.md](./STORAGE-AUDIT.md) for complete file-by-file breakdown.

### Realistic Effort Estimate (Revised)

| Phase | Hours | Risk | PRs |
|-------|-------|------|-----|
| Phase 1: Foundation | **8-10h** | LOW | PR #1-3 |
| Phase 2: DataStore Interface | 8-12h | LOW | PR #4-5 |
| Phase 3: LocalDataStore | 10-14h | MEDIUM | PR #6-8 |
| Phase 4: Supabase (future) | 20-30h | MEDIUM | PR #9-12 |
| **Total** | **46-66h** | | **12 PRs** |

**Note**: Phases 1-3 provide backend switching capability. Phase 4 (Supabase) is optional and can be done later.

### Branch Strategy

```
master
  └── feature/backend-abstraction (long-lived)
        ├── PR #1: Storage audit (merged to feature branch)
        ├── PR #2: Timer state manager (merged to feature branch)
        ├── PR #3: AppSettings extension (merged to feature branch)
        └── ... (each PR merged to feature branch, then feature → master when complete)
```

---

## Phase 1: Foundation (Clean Up Coupling Issues)

**Goal**: Centralize storage calls before introducing abstraction
**Risk**: LOW (pure refactoring, no behavior change)
**Effort**: 8-10 hours
**Tests**: Run after each PR, maintain 100% pass rate

### PR #1: Storage Audit Documentation ✅ COMPLETE

**Status**: Done (December 17, 2025)

**Deliverable**: [STORAGE-AUDIT.md](./STORAGE-AUDIT.md)

**Findings**:
- 156 storage calls across 20 files (down from 195/26)
- 6 files need refactoring (15 direct storage calls)
- Need to create `timerStateManager.ts` (10 calls to centralize)
- Need to extend `appSettings.ts` (5 calls to route)

---

### PR #2: Create Timer State Manager ✅ COMPLETE

**Status**: Done (December 18, 2025)

**Purpose**: Centralize all timer state persistence into one manager

**Problem**: Timer state calls scattered across 4 hooks (10 total calls)

| File | Direct Calls | Lines |
|------|--------------|-------|
| `useGameTimer.ts` | 5 | 60, 114, 130, 182, 192 |
| `useGameOrchestration.ts` | 3 | 816, 829, 836 |
| `useGamePersistence.ts` | 1 | 468 |
| `useSavedGameManager.ts` | 1 | 219 |

**Tasks**:
1. Create `src/utils/timerStateManager.ts`
2. Move TIMER_STATE_KEY constant to new file
3. Implement: `saveTimerState`, `loadTimerState`, `clearTimerState`, `hasTimerState`
4. Add tests for timerStateManager
5. Update all 4 hooks to use the new manager
6. Remove direct storage imports from hooks

**New File**: `src/utils/timerStateManager.ts` (~80 lines)

**CRITICAL**: Must use existing key and schema to avoid data loss!

```typescript
import { getStorageJSON, setStorageJSON, removeStorageItem } from './storage';
import { TIMER_STATE_KEY } from '@/config/storageKeys'; // = 'soccerTimerState'

// MUST match existing schema exactly (from useGameTimer.ts lines 100-104, 174-179)
export interface TimerState {
  gameId: string;
  timeElapsedInSeconds: number;
  timestamp: number;        // Date.now() when saved - for restore calculations
  wasRunning?: boolean;     // Only set when saving on tab hidden
}

export async function saveTimerState(state: TimerState): Promise<void> {
  await setStorageJSON(TIMER_STATE_KEY, state);
}

export async function loadTimerState(): Promise<TimerState | null> {
  return getStorageJSON<TimerState>(TIMER_STATE_KEY);
}

export async function clearTimerState(): Promise<void> {
  await removeStorageItem(TIMER_STATE_KEY);
}

export async function hasTimerState(): Promise<boolean> {
  const state = await loadTimerState();
  return state !== null;
}
```

**Why this matters**:
- Key is `soccerTimerState` (not `timerState`) - changing would lose existing timer state
- `timestamp` field is used by visibility restore logic to calculate elapsed time while hidden
- `wasRunning` is only set when user leaves tab, determines if timer auto-resumes

**Files Changed**:
- `src/utils/timerStateManager.ts` (NEW)
- `src/utils/timerStateManager.test.ts` (NEW)
- `src/hooks/useGameTimer.ts` (update imports, use manager)
- `src/components/HomePage/hooks/useGameOrchestration.ts` (update imports)
- `src/components/HomePage/hooks/useGamePersistence.ts` (update imports)
- `src/components/HomePage/hooks/useSavedGameManager.ts` (update imports)

**Acceptance Criteria**:
- [x] `timerStateManager.ts` created with full test coverage
- [x] Zero direct storage imports in the 4 hook files for timer operations
- [x] All 2,678 tests pass
- [x] No behavior change (timer persistence works exactly as before)

---

### PR #3: Extend AppSettings & Route Remaining Calls ✅ COMPLETE

**Status**: Done (December 18, 2025)

**Purpose**: Route install prompt and i18n calls through appSettings

**Problem**: 5 direct storage calls in 2 files

| File | Direct Calls | Purpose |
|------|--------------|---------|
| `InstallPrompt.tsx` | 3 | Install prompt dismissal tracking |
| `i18n.ts` | 1 | Language preference loading |
| `useGameOrchestration.ts` | 1 | First game guide check |

**Tasks**:
1. Add methods to `appSettings.ts`:
   - `getInstallPromptDismissedTime(): Promise<number | null>`
   - `setInstallPromptDismissed(): Promise<void>`
   - `hasSeenFirstGameGuide(): Promise<boolean>`
   - `setFirstGameGuideSeen(): Promise<void>`
2. Update `InstallPrompt.tsx` to use appSettings
3. Update `i18n.ts` to use `getAppSettings()`
4. Update `useGameOrchestration.ts` for first game guide check
5. Add tests for new appSettings methods

**Files Changed**:
- `src/utils/appSettings.ts` (extend)
- `src/utils/appSettings.test.ts` (extend)
- `src/components/InstallPrompt.tsx` (update imports)
- `src/i18n.ts` (update imports)
- `src/components/HomePage/hooks/useGameOrchestration.ts` (1 more call)

**Acceptance Criteria**:
- [x] Zero direct storage imports in InstallPrompt.tsx
- [x] Zero direct storage imports in i18n.ts
- [x] All new appSettings methods tested (16 test cases)
- [x] All 2,678 tests pass
- [x] No behavior change

---

### PR #1-3 Summary: Phase 1 Complete ✅

**Status**: Phase 1 COMPLETE (December 18, 2025)

After PRs #1-3, the codebase now has:
- **Zero direct storage calls in hooks or components**
- **All storage access through domain managers in `src/utils/`**
- **Clean separation ready for DataStore interface**

| Before (Dec 17) | After Phase 1 |
|-----------------|---------------|
| 6 files with direct storage calls | 0 files |
| 15 calls bypassing managers | 0 calls |
| No timerStateManager | timerStateManager.ts |
| Limited appSettings | Extended appSettings |

---

## 📋 DATA CONTRACT (Authoritative Reference for Phase 2-4)

**Status**: Complete (December 18, 2025)
**Purpose**: Single source of truth for all persisted data, atomicity guarantees, and architectural decisions

This section must be referenced before ANY Phase 2-4 implementation work.

---

### 1. Complete Storage Key Inventory

#### Domain Data Keys (via `@/utils/storage`)

| Key Constant | Actual Key | Manager | Shape |
|--------------|------------|---------|-------|
| `SAVED_GAMES_KEY` | `savedSoccerGames` | `savedGames.ts` | `SavedGamesCollection` (object map) |
| `MASTER_ROSTER_KEY` | `soccerMasterRoster` | `masterRosterManager.ts` | `Player[]` |
| `SEASONS_LIST_KEY` | `soccerSeasons` | `seasons.ts` | `Season[]` |
| `TOURNAMENTS_LIST_KEY` | `soccerTournaments` | `tournaments.ts` | `Tournament[]` |
| `TEAMS_INDEX_KEY` | `soccerTeamsIndex` | `teams.ts` | `TeamsIndex` (object map) |
| `TEAM_ROSTERS_KEY` | `soccerTeamRosters` | `teams.ts` | `TeamRostersIndex` (object map) |
| `PERSONNEL_KEY` | `soccerPersonnel` | `personnelManager.ts` | `PersonnelCollection` (object map) |
| `PLAYER_ADJUSTMENTS_KEY` | `soccerPlayerAdjustments` | `playerAdjustments.ts` | `PlayerAdjustmentsIndex` (object map) |
| `PREMIUM_LICENSE_KEY` | `soccerPremiumLicense` | `premiumManager.ts` | `PremiumLicense` |
| `WARMUP_PLAN_KEY` | `soccerWarmupPlan` | `warmupPlan.ts` | `WarmupPlan` |
| `APP_SETTINGS_KEY` | `soccerAppSettings` | `appSettings.ts` | `AppSettings` |
| `TIMER_STATE_KEY` | `soccerTimerState` | `timerStateManager.ts` (NEW) | `TimerState` |

#### Infrastructure / Non-Domain Keys (not part of DataStore scope)

| Key | Storage | Location | Purpose |
|-----|---------|----------|---------|
| `__storage_factory_config` | IndexedDB bootstrap store | `storageConfigManager.ts:75` | Storage mode, migration state |
| `quarantine:*` | IndexedDB | `storageRecovery.ts:640` | Corrupted data quarantine |
| `quarantine:metadata` | IndexedDB | `storageRecovery.ts:656` | Quarantine operation metadata |
| `appDataVersion` | **localStorage (authoritative)** | `migration.ts:44,71` | Migration version tracking (may also exist in IndexedDB as a migrated artifact) |
| Cache Storage (Service Worker) | CacheStorage | `public/sw.js` | Asset/offline caching (NOT user data; not included in backups/migrations) |

#### UI / Compatibility Keys (via `@/utils/storage`, but not “domain data”)

These keys exist today and should be explicitly accounted for, even if they remain excluded from DataStore/backups.

| Key | Storage | Location | Purpose | Plan |
|-----|---------|----------|---------|------|
| `installPromptDismissed` | IndexedDB | `InstallPrompt.tsx:43` | PWA prompt dismissed timestamp | Route through `appSettings.ts` in Phase 1 (PR #3) |
| `hasSeenFirstGameGuide` | IndexedDB | `useGameOrchestration.ts:878` (cleared in `appSettings.ts:309`) | Onboarding “first game guide” seen flag | Route through `appSettings.ts` in Phase 1 (PR #3); optionally migrate into `APP_SETTINGS_KEY` later |
| `lastHomeTeamName` (`LAST_HOME_TEAM_NAME_KEY`) | IndexedDB | `appSettings.ts:206-225` | Legacy compatibility key for home team name | Keep for backwards compatibility; primary source is `APP_SETTINGS_KEY.lastHomeTeamName` |
| `storage-mode`, `storage-version` | IndexedDB (legacy) | `appSettings.ts:310-311` | Legacy keys from old storage implementations | Keep clearing on reset; do not rely on them going forward |

#### Legacy Migration Keys (one-time, then removed)

| Key | Purpose | Location |
|-----|---------|----------|
| `availablePlayers` | Old roster key → `MASTER_ROSTER_KEY` | `useGameOrchestration.ts:762` |
| `soccerSeasonsList` | Old seasons key → `SEASONS_LIST_KEY` | `useGameOrchestration.ts:769` |

---

### 2. Authoritative Data Shapes

#### SavedGamesCollection (Games are ONE giant JSON document)

```typescript
// src/types/game.ts:162, src/utils/savedGames.ts:33
type SavedGamesCollection = {
  [gameId: string]: AppState;  // NOT an array - object map by gameId
};
```

**Critical implications**:
- Every game save rewrites the ENTIRE `savedSoccerGames` key
- There is NO per-game granularity at storage level
- Supabase approach must handle this (either keep as JSON blob or normalize to rows)

#### Game Events (Index-Based, NOT ID-Based)

```typescript
// Current implementation - savedGames.ts:456, 495
updateGameEvent(gameId: string, eventIndex: number, eventData: GameEvent)
removeGameEvent(gameId: string, eventIndex: number)

// Events stored INSIDE game document, not separately
interface AppState {
  gameEvents: GameEvent[];  // Array, accessed by index
  // ... other fields
}
```

**Supabase decision required**:
- Option A: Keep index-based in LocalDataStore, transform in SupabaseDataStore
- Option B: Add stable `eventId` to all events now (requires migration), use ID-based everywhere

**Current recommendation**: Option A (defer event ID migration to Phase 4)

#### Empty String Convention for "No Association"

```typescript
// savedGames.ts:227-228 - New games use empty string, NOT null
const newGameAppState: AppState = {
  seasonId: gameData.seasonId || '',      // Empty string = no season
  tournamentId: gameData.tournamentId || '', // Empty string = no tournament
  // ...
};
```

**Supabase decision required**:
- Option A: Normalize to `null` in SupabaseDataStore (standard SQL)
- Option B: Keep empty string (requires `DEFAULT ''` in schema)

**Current recommendation**: Option A (normalize in SupabaseDataStore, transparent to app)

---

### 3. Atomicity & Concurrency Guarantees

#### Single-Key Atomic Operations

Most operations are single-key atomic via `withKeyLock()`:

```typescript
// teams.ts - roster operations
withRosterLock(async () => { /* modify TEAM_ROSTERS_KEY */ })

// savedGames.ts - game operations
withKeyLock(SAVED_GAMES_KEY, async () => { /* modify games */ })
```

**Critical caveat (current code reality)**:
- `withKeyLock()` and `withRosterLock()` are implemented via an in-memory `LockManager` (`lockManager.ts`).
- This provides serialization **within a single tab/process only**.
- There is **no cross-tab locking** (no `BroadcastChannel`, no `navigator.locks`, no storage-event coordination).

**Implication for the plan**:
- The plan can claim “atomic” only under a **single-tab assumption**.
- If multi-tab use is a target requirement later, it needs an explicit follow-up decision/PR to add cross-tab coordination, otherwise lost updates remain possible regardless of DataStore/Supabase work.

#### Multi-Key Atomic Operations (CASCADE DELETE)

**Personnel deletion** is the ONLY multi-key atomic operation today:

```typescript
// personnelManager.ts:190-260
export const removePersonnelMember = async (personnelId: string): Promise<boolean> => {
  // TWO-PHASE LOCKING: Lock BOTH keys for atomic CASCADE DELETE
  return withKeyLock(PERSONNEL_KEY, async () => {
    return withKeyLock(SAVED_GAMES_KEY, async () => {
      // 1. Backup both collections
      const backup = {
        personnel: await getPersonnelCollection(),
        games: await getSavedGames(),
      };

      try {
        // 2. Remove personnel from all games
        // 3. Delete personnel record
        // 4. Save both
      } catch (error) {
        // 5. ROLLBACK both on failure
        await setStorageItem(PERSONNEL_KEY, JSON.stringify(backup.personnel));
        await setStorageItem(SAVED_GAMES_KEY, JSON.stringify(backup.games));
        throw error;
      }
    });
  });
};
```

**DataStore implications**:
- LocalDataStore MUST preserve this two-phase locking pattern
- SupabaseDataStore should use database transactions for atomicity
- DataStore interface should NOT expose this complexity (keep it internal)

---

### 4. Error Handling Contract

#### Graceful Degradation (getSavedGames pattern)

```typescript
// savedGames.ts:57-76 - Returns empty on corruption
export const getSavedGames = async (): Promise<SavedGamesCollection> => {
  try {
    const gamesJson = await getStorageItem(SAVED_GAMES_KEY);
    if (!gamesJson) return {};

    try {
      parsed = JSON.parse(gamesJson);
    } catch (parseError) {
      logger.error('[getSavedGames] JSON parse failed - returning empty collection');
      return {};  // Graceful degradation, not throw
    }
    // ...
  }
};
```

#### Throw on Failure (other managers)

Most other managers throw on errors rather than degrading gracefully.

**DataStore error contract** (to define in Phase 2):
```typescript
interface DataStoreErrorContract {
  // Read operations: return null/empty on not-found, throw on corruption?
  // Write operations: throw on failure
  // Multi-record operations: partial success or all-or-nothing?
}
```

**Also define “what is corruption?” explicitly**:
- Some persisted keys are intentionally **plain strings**, not JSON (e.g., `installPromptDismissed`, `LAST_HOME_TEAM_NAME_KEY`).
- The storage recovery/validation logic currently tends to treat “string but not JSON” as corruption (`storageRecovery.ts` attempts `JSON.parse` for strings).
- DataStore should not assume “everything is JSON”; it should validate per-domain (or per-key) shape.

---

### 5. Full Backup Completeness Gap

**Current backup includes** (`fullBackup.ts:60-70`):
- `SAVED_GAMES_KEY` ✅
- `APP_SETTINGS_KEY` ✅
- `SEASONS_LIST_KEY` ✅
- `TOURNAMENTS_LIST_KEY` ✅
- `MASTER_ROSTER_KEY` ✅
- `PLAYER_ADJUSTMENTS_KEY` ✅
- `TEAMS_INDEX_KEY` ✅
- `TEAM_ROSTERS_KEY` ✅
- `PERSONNEL_KEY` ✅

**Current backup EXCLUDES**:
- `PREMIUM_LICENSE_KEY` ❌ (intentional - license tied to device/account)
- `WARMUP_PLAN_KEY` ❌ (should be added)
- `TIMER_STATE_KEY` ❌ (ephemeral - intentionally excluded)
- `__storage_factory_config` ❌ (infrastructure - intentionally excluded)
- `appDataVersion` ❌ (infrastructure - intentionally excluded)
- `installPromptDismissed` ❌ (UI state - intentionally excluded)
- `quarantine:*` ❌ (recovery data - intentionally excluded)

**Action**: Add `WARMUP_PLAN_KEY` to backup (separate fix, not part of Phase 1-3).

**Follow-up after PR #137 merge**: Quick 10-minute fix to add warmup plan to `fullBackup.ts` export/import.

---

### 6. Architecture Decision: DataStore vs Managers

**DECISION**: Option B - Managers become thin wrappers around DataStore

```
CURRENT ARCHITECTURE:
  App → Managers → storage.ts → IndexedDB

TARGET ARCHITECTURE (Phase 3+):
  App → Managers (business logic, validation, cascade operations)
          ↓
       DataStore interface
          ↓
    ┌─────┴─────┐
    ↓           ↓
LocalDataStore  SupabaseDataStore
    ↓           ↓
IndexedDB     Supabase
```

**Key implications**:
1. LocalDataStore does NOT delegate to managers (would create circular deps)
2. Data access logic moves FROM managers INTO LocalDataStore
3. Business logic (validation, cascade delete) stays in managers
4. Both backends implement identical DataStore interface

#### Responsibility Boundary: DataStore vs Managers

| Concern | DataStore | Managers |
|---------|-----------|----------|
| **Data Access** | ✅ CRUD operations, storage I/O | ❌ |
| **Storage Safety** | ✅ Handle corruption, parse errors | ❌ |
| **Structural Invariants** | ✅ ID immutability, timestamps | ❌ |
| **Business Validation** | ❌ | ✅ Name uniqueness, format rules |
| **Normalization** | ❌ | ✅ Trim whitespace, default values |
| **Referential Integrity** | ⚠️ Cascade deletes (internal) | ✅ Orchestration, locks |
| **Derived Queries** | ❌ | ✅ countGamesForTeam, getFiltered |
| **Archive Filtering** | ✅ `includeArchived` param | ✅ Policy decisions |

**DataStore responsibilities** (pure data access):
- Read/write operations to storage backend
- JSON parsing, storage error handling
- Generate IDs, set timestamps on create/update
- Return all records by default (matches current utilities)
- Support `includeArchived` filter parameter where applicable

**Manager responsibilities** (business logic):
- Validation: name uniqueness, required fields, format rules
- Normalization: trim whitespace, apply defaults
- Derived operations: `countGamesForTeam()`, `getFilteredGames()`
- Complex orchestration: export/import, duplicate operations
- Policy decisions: what gets archived, when to filter archived items

**Archive Filtering Policy**:
- DataStore methods like `getSeasons()`, `getTournaments()`, `getTeams()` accept `includeArchived?: boolean`
- Default: return ALL records (matches current utility behavior)
- Managers decide when to filter: UI lists may exclude archived, exports include all

**Migration path**:
- Phase 3: LocalDataStore directly accesses `@/utils/storage`
- Managers refactored to call DataStore instead of storage
- No circular dependencies: `Managers → DataStore → storage`

---

### 7. Migration Story Clarification

**StorageConfigManager default** (`storageConfigManager.ts:60`):
```typescript
export const DEFAULT_STORAGE_CONFIG: StorageConfig = {
  mode: 'localStorage', // Triggers migration check on first load
  // ...
};
```

**This is intentional**: The `mode: 'localStorage'` default is a FLAG, not actual behavior.
- New installs: Detected as "needs migration", immediately upgraded to IndexedDB
- Existing localStorage users: Data migrated to IndexedDB
- After migration: `mode` updated to `'indexedDB'`

**What actually triggers migration**:
- The app calls `runMigration()` on startup (`src/app/page.tsx:40`).
- `runMigration()` checks config via `getStorageConfig()` and migrates localStorage → IndexedDB when needed (`migration.ts`).

**StorageFactory behavior**:
- Normal application storage (`@/utils/storage`) always requests IndexedDB (`storage.ts` calls `createStorageAdapter('indexedDB')`).
- `storageFactory.ts` does **not** run migration; it rejects localStorage mode for normal operation (`storageFactory.ts:220-248`).
- There is NO localStorage fallback for normal application operation.

**The claim "app can still work with localStorage" in `migration.ts:120`** is outdated/misleading.
The app requires IndexedDB. If IndexedDB is unavailable (private mode), app shows error.

---

### 8. Complete Operations Inventory for DataStore

**Verified against codebase**: December 18, 2025

#### Players (Master Roster)

Two files exist - `masterRosterManager.ts` is the high-level API, `masterRoster.ts` has lower-level functions:

| Operation | Function | File:Line |
|-----------|----------|-----------|
| getAll | `getMasterRoster()` | `masterRosterManager.ts:17` |
| create | `addPlayer()` | `masterRosterManager.ts:35` |
| update | `updatePlayer()` | `masterRosterManager.ts:56` |
| delete | `removePlayer()` | `masterRosterManager.ts:77` |
| setGoalieStatus | `setGoalieStatus()` | `masterRosterManager.ts:96` |
| setFairPlayCard | `setFairPlayCardStatus()` | `masterRosterManager.ts:118` |

**Note**: No `getPlayerById()` exists. To get by ID, filter `getMasterRoster()` result.

Lower-level functions in `masterRoster.ts` (used internally):
- `saveMasterRoster()`, `addPlayerToRoster()`, `updatePlayerInRoster()`, `removePlayerFromRoster()`
- `setPlayerGoalieStatus()`, `setPlayerFairPlayCardStatus()`

#### Teams

| Operation | Function | File:Line |
|-----------|----------|-----------|
| getAll | `getTeams()` | `teams.ts:37` |
| getAllRaw | `getAllTeams()` | `teams.ts:25` (returns TeamsIndex) |
| getById | `getTeam()` | `teams.ts:43` |
| create | `addTeam()` | `teams.ts:96` |
| update | `updateTeam()` | `teams.ts:129` |
| delete | `deleteTeam()` | `teams.ts:166` |
| getTeamRoster | `getTeamRoster()` | `teams.ts:194` |
| setTeamRoster | `setTeamRoster()` | `teams.ts:201` |
| addPlayerToRoster | `addPlayerToRoster()` | `teams.ts:210` |
| updatePlayerInRoster | `updatePlayerInRoster()` | `teams.ts:221` |
| removePlayerFromRoster | `removePlayerFromRoster()` | `teams.ts:236` |
| duplicateTeam | `duplicateTeam()` | `teams.ts:250` |
| countGamesForTeam | `countGamesForTeam()` | `teams.ts:275` |
| getAllTeamRosters | `getAllTeamRosters()` | `teams.ts:180` |

**Note**: No `archiveTeam()` exists. Archive is done via `updateTeam(id, { isArchived: true })`.

#### Seasons

| Operation | Function | File:Line |
|-----------|----------|-----------|
| getAll | `getSeasons()` | `seasons.ts:22` |
| create | `addSeason()` | `seasons.ts:74` |
| update | `updateSeason()` | `seasons.ts:108` |
| delete | `deleteSeason()` | `seasons.ts:147` |
| saveAll | `saveSeasons()` | `seasons.ts:56` |
| countGames | `countGamesForSeason()` | `seasons.ts:177` |
| updateTeamPlacement | `updateTeamPlacement()` | `seasons.ts:207` |
| getTeamPlacement | `getTeamPlacement()` | `seasons.ts:237` |

**Note**: No `getSeasonById()` exists. To get by ID, filter `getSeasons()` result.
**Note**: No `archiveSeason()` exists. Archive via `updateSeason({ ...season, isArchived: true })`.

#### Tournaments

| Operation | Function | File:Line |
|-----------|----------|-----------|
| getAll | `getTournaments()` | `tournaments.ts:48` |
| create | `addTournament()` | `tournaments.ts:105` |
| update | `updateTournament()` | `tournaments.ts:142` |
| delete | `deleteTournament()` | `tournaments.ts:185` |
| saveAll | `saveTournaments()` | `tournaments.ts:87` |
| countGames | `countGamesForTournament()` | `tournaments.ts:215` |
| updateTeamPlacement | `updateTeamPlacement()` | `tournaments.ts:245` |
| getTeamPlacement | `getTeamPlacement()` | `tournaments.ts:275` |

**Note**: No `getTournamentById()` exists. To get by ID, filter `getTournaments()` result.
**Note**: No `archiveTournament()` exists. Archive via `updateTournament({ ...tournament, isArchived: true })`.

#### Games

| Operation | Function | File:Line |
|-----------|----------|-----------|
| getAll | `getSavedGames()` | `savedGames.ts:57` |
| getById | `getGame()` | `savedGames.ts:141` |
| create | `createGame()` | `savedGames.ts:191` |
| save | `saveGame()` | `savedGames.ts:118` |
| saveAll | `saveGames()` | `savedGames.ts:100` |
| delete | `deleteGame()` | `savedGames.ts:161` |
| getAllIds | `getAllGameIds()` | `savedGames.ts:255` |
| getFiltered | `getFilteredGames()` | `savedGames.ts:270` |
| getLatestId | `getLatestGameId()` | `savedGames.ts:350` |
| updateDetails | `updateGameDetails()` | `savedGames.ts:390` |
| addEvent | `addGameEvent()` | `savedGames.ts:424` |
| updateEvent | `updateGameEvent()` | `savedGames.ts:456` |
| removeEvent | `removeGameEvent()` | `savedGames.ts:495` |
| exportJson | `exportGamesAsJson()` | `savedGames.ts:532` |
| importJson | `importGamesFromJson()` | `savedGames.ts:563` |
| validateResumable | `validateAndGetResumableGame()` | `savedGames.ts:704` |

**Note**: No `deleteGames()` (plural) exists. Delete multiple by iterating `deleteGame()`.

#### Personnel

| Operation | Function | File:Line |
|-----------|----------|-----------|
| getAll | `getAllPersonnel()` | `personnelManager.ts:11` |
| getAllRaw | `getPersonnelCollection()` | `personnelManager.ts:31` |
| getById | `getPersonnelById()` | `personnelManager.ts:47` |
| create | `addPersonnelMember()` | `personnelManager.ts:60` |
| update | `updatePersonnelMember()` | `personnelManager.ts:117` |
| delete | `removePersonnelMember()` | `personnelManager.ts:190` |
| getByRole | `getPersonnelByRole()` | `personnelManager.ts:265` |
| getGamesWithPersonnel | `getGamesWithPersonnel()` | `personnelManager.ts:281` |

#### Settings

| Operation | Function | File:Line |
|-----------|----------|-----------|
| get | `getAppSettings()` | `appSettings.ts` |
| save | `saveAppSettings()` | `appSettings.ts` |
| getCurrentGameId | `getCurrentGameIdSetting()` | `appSettings.ts` |
| setCurrentGameId | `saveCurrentGameIdSetting()` | `appSettings.ts` |

#### Timer State (NEW in Phase 1)

| Operation | Function | File:Line |
|-----------|----------|-----------|
| load | `loadTimerState()` | `timerStateManager.ts` (NEW) |
| save | `saveTimerState()` | `timerStateManager.ts` (NEW) |
| clear | `clearTimerState()` | `timerStateManager.ts` (NEW) |
| exists | `hasTimerState()` | `timerStateManager.ts` (NEW) |

#### Backup/Export

| Operation | Function | File:Line |
|-----------|----------|-----------|
| exportAll | `generateFullBackupJson()` | `fullBackup.ts:51` |
| importAll | `importFullBackup()` | `fullBackup.ts:160` |

---

### 9. DataStore Interface Decisions (Phase 2 Scope)

Based on the operations inventory above, the DataStore interface in PR #4 must cover:

**INCLUDED in DataStore interface** (data access only):
- All CRUD operations for: Players, Teams, TeamRosters, Seasons, Tournaments, Games, Personnel, Settings
- Player adjustments (external stats) data access
- Warmup plan data access
- Team placements (embedded in Season/Tournament)
- Game events (index-based for LocalDataStore, transformed in SupabaseDataStore)
- Timer state

**EXCLUDED from DataStore interface** (stay in managers):
- Business logic: validation
- Referential integrity details (locks/transactions) should be internal to DataStore implementations
- Derived operations: `countGamesForTeam`, `getGamesWithPersonnel`, `getFilteredGames`
- Export/import: `generateFullBackupJson`, `importFullBackup` (orchestrates multiple DataStore calls)
- Duplicate operations: `duplicateTeam` (combines read + create + roster operations)
- Premium license (`PREMIUM_LICENSE_KEY`) is intentionally device-bound and remains outside DataStore scope for now

**Rationale**: DataStore is pure data access. Business logic stays in managers.

---

## ⚠️ Phase 2-3 Known Gaps (Additional Items)

**Status**: Identified in code review, December 17-18, 2025

The following issues need resolution before Phase 2-3 work begins:

### 1. DataStore Scope & Coverage (make explicit)

The interface snippet in PR #4 must match the “DATA CONTRACT” above:

**Must be explicitly included**:
- Player adjustments (`PLAYER_ADJUSTMENTS_KEY`) access methods (current source: `playerAdjustments.ts`)
- Warmup plan (`WARMUP_PLAN_KEY`) access methods (current source: `warmupPlan.ts`)

**Must be explicitly excluded (with rationale)**:
- Premium license (`PREMIUM_LICENSE_KEY`) remains device-bound and is intentionally NOT part of backend switching (keep in `premiumManager.ts` for now).

### 2. Game/Event Data Model (resolved, keep consistent)

**Decision**: Keep index-based event operations in DataStore for LocalDataStore to match current behavior (`savedGames.ts`), and transform/normalize as needed in SupabaseDataStore later.

**Event Storage Model**:
- Events stored INSIDE the game document (`savedGames.ts:495`), not separately
- For Supabase: Need to decide between embedded array or separate `game_events` table
- If separate table: Need to sync on save/load

**Null vs Empty String Convention**:
- New games use `seasonId: ''` and `tournamentId: ''` (`savedGames.ts:227-228`)
- NOT `null` or `undefined`
- Supabase schema must handle empty string as "no association"
- Consider: Normalize to `null` in SupabaseDataStore, or keep empty string?

### 3. Migration Scope & Architecture Decision

React Query hooks are NOT the only manager consumers. Direct imports exist in:

```typescript
// Example: src/app/page.tsx lines 11-13
import { getMasterRoster } from '@/utils/masterRosterManager';
import { getSeasons } from '@/utils/seasons';
import { getTournaments } from '@/utils/tournaments';
```

**Architecture Options**:

| Option | Description | Phase 3 Impact |
|--------|-------------|----------------|
| A | LocalDataStore delegates TO managers | ❌ Circular: DataStore → managers → storage. SupabaseDataStore would need to reimplement all manager logic |
| B | Managers delegate TO DataStore | ✅ Clean: managers → DataStore → storage/Supabase. Both backends implement same interface |

**DECISION: Option B** - Managers become thin wrappers around DataStore.

**Implication for Phase 3**: LocalDataStore does NOT delegate to managers. Instead:
1. Move data access logic FROM managers INTO LocalDataStore
2. Managers become thin wrappers that call DataStore
3. Business logic (validation, etc.) stays in managers

```
BEFORE (current):
  App → Managers → storage.ts → IndexedDB

AFTER (target):
  App → Managers (business logic) → DataStore interface
                                          ↓
                              ┌───────────┴───────────┐
                              ↓                       ↓
                        LocalDataStore          SupabaseDataStore
                              ↓                       ↓
                          IndexedDB               Supabase
```

This corrects the inconsistency where Phase 3 previously described LocalDataStore delegating to managers.

### 4. React Async Pattern Issue

Plan's example doesn't work in React:
```typescript
// ❌ INVALID - Can't await at hook top level
const dataStore = await getDataStore();
```

**Valid patterns**:
```typescript
// Option A: In queryFn (works)
queryFn: async () => {
  const dataStore = await getDataStore();
  return dataStore.getPlayers();
}

// Option B: Context/Provider (initialized at app startup)
const { dataStore } = useDataStoreContext();

// Option C: Sync singleton (initialized before React renders)
const dataStore = getDataStoreSync(); // throws if not initialized
```

**Action**: Choose pattern and document before Phase 2.

---

## Phase 2: DataStore Interface

**Goal**: Introduce backend-agnostic interface
**Risk**: LOW (additive, no existing code changed)
**Effort**: 8-12 hours

### PR #4: Define DataStore Interface ✅ COMPLETE

**Status**: Done (December 18, 2025)

**Purpose**: Create the TypeScript interface for backend abstraction

**Tasks**:
1. Create `src/interfaces/DataStore.ts` with full interface
2. Create `src/interfaces/DataStoreTypes.ts` for supporting types
3. Create `src/interfaces/DataStoreErrors.ts` for error handling
4. Add comprehensive JSDoc documentation

**Interface Structure** (target design, see notes below):
```typescript
// src/interfaces/DataStore.ts
export interface DataStore {
  // Lifecycle
  initialize(): Promise<void>;
  close(): Promise<void>;
  getBackendName(): string;
  isAvailable(): Promise<boolean>;

  // Players (Master Roster)
  getPlayers(): Promise<Player[]>;
  createPlayer(player: Omit<Player, 'id'>): Promise<Player>;
  updatePlayer(id: string, updates: Partial<Player>): Promise<Player | null>;
  deletePlayer(id: string): Promise<boolean>;

  // Teams
  getTeams(includeArchived?: boolean): Promise<Team[]>;
  getTeamById(id: string): Promise<Team | null>;
  createTeam(team: Omit<Team, 'id' | 'createdAt' | 'updatedAt'>): Promise<Team>;
  updateTeam(id: string, updates: Partial<Team>): Promise<Team | null>;
  deleteTeam(id: string): Promise<boolean>;
  // Team roster operations
  getTeamRoster(teamId: string): Promise<TeamPlayer[]>;
  setTeamRoster(teamId: string, roster: TeamPlayer[]): Promise<void>;

  // Seasons
  getSeasons(includeArchived?: boolean): Promise<Season[]>;
  createSeason(name: string, extra?: Partial<Season>): Promise<Season>;
  updateSeason(season: Season): Promise<Season | null>;
  deleteSeason(id: string): Promise<boolean>;

  // Tournaments
  getTournaments(includeArchived?: boolean): Promise<Tournament[]>;
  createTournament(name: string, extra?: Partial<Tournament>): Promise<Tournament>;
  updateTournament(tournament: Tournament): Promise<Tournament | null>;
  deleteTournament(id: string): Promise<boolean>;

  // Personnel
  getAllPersonnel(): Promise<Personnel[]>;
  getPersonnelById(id: string): Promise<Personnel | null>;
  addPersonnelMember(data: Omit<Personnel, 'id' | 'createdAt' | 'updatedAt'>): Promise<Personnel>;
  updatePersonnelMember(id: string, updates: Partial<Personnel>): Promise<Personnel | null>;
  removePersonnelMember(id: string): Promise<boolean>;  // Atomic CASCADE DELETE handled by DataStore implementation

  // Games
  getGames(): Promise<SavedGamesCollection>;
  getGameById(id: string): Promise<AppState | null>;
  createGame(game: Partial<AppState>): Promise<{ gameId: string; gameData: AppState }>;
  saveGame(id: string, game: AppState): Promise<AppState>;
  deleteGame(id: string): Promise<boolean>;

  // Game Events (index-based to match current implementation)
  addGameEvent(gameId: string, event: GameEvent): Promise<AppState | null>;
  updateGameEvent(gameId: string, eventIndex: number, event: GameEvent): Promise<AppState | null>;
  removeGameEvent(gameId: string, eventIndex: number): Promise<AppState | null>;

  // Settings
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<void>;

  // Player Adjustments (External Stats)
  getPlayerAdjustments(playerId: string): Promise<PlayerStatAdjustment[]>;
  addPlayerAdjustment(adjustment: Omit<PlayerStatAdjustment, 'id' | 'appliedAt'> & { id?: string; appliedAt?: string }): Promise<PlayerStatAdjustment>;
  updatePlayerAdjustment(playerId: string, adjustmentId: string, patch: Partial<PlayerStatAdjustment>): Promise<PlayerStatAdjustment | null>;
  deletePlayerAdjustment(playerId: string, adjustmentId: string): Promise<boolean>;

  // Warmup Plan
  getWarmupPlan(): Promise<WarmupPlan | null>;
  saveWarmupPlan(plan: WarmupPlan): Promise<boolean>;
  deleteWarmupPlan(): Promise<boolean>;

  // Timer State
  getTimerState(): Promise<TimerState | null>;
  saveTimerState(state: TimerState): Promise<void>;
  clearTimerState(): Promise<void>;
}
```

**Interface Design Notes**:
- Matches actual codebase APIs per Section 8 Operations Inventory
- Game events use **index-based** operations (not eventId) - matches current implementation
- No `getPlayerById`, `getSeasonById`, `getTournamentById` - filter from getAll in consuming code
- No `deleteGames` (plural) - iterate `deleteGame` in consuming code
- Bulk operations (export/import) excluded from DataStore - stay in `fullBackup.ts` (per Section 9)

**Files Created**:
- `src/interfaces/DataStore.ts` (~200 lines)
- `src/interfaces/DataStoreTypes.ts` (~100 lines)
- `src/interfaces/DataStoreErrors.ts` (~50 lines)
- `src/interfaces/index.ts` (re-exports)

**Acceptance Criteria**:
- [x] Interface covers all current data operations
- [x] TypeScript compiles without errors
- [x] Full JSDoc documentation
- [x] No runtime code (interfaces only)

---

### PR #5: Define AuthService Interface ✅ COMPLETE

**Status**: Done (December 18, 2025)

**Purpose**: Create authentication abstraction (for future cloud mode)

**Tasks**:
1. Create `src/interfaces/AuthService.ts`
2. Create `src/interfaces/AuthTypes.ts`
3. Document authentication flow

**Interface**:
```typescript
// src/interfaces/AuthService.ts
export interface AuthService {
  // Lifecycle
  initialize(): Promise<void>;
  getMode(): 'local' | 'cloud';

  // For local mode (no-op implementations)
  getCurrentUser(): Promise<User | null>;
  isAuthenticated(): boolean;

  // For cloud mode
  signUp(email: string, password: string): Promise<AuthResult>;
  signIn(email: string, password: string): Promise<AuthResult>;
  signOut(): Promise<void>;
  resetPassword(email: string): Promise<void>;

  // Session
  getSession(): Promise<Session | null>;
  refreshSession(): Promise<Session | null>;
  onAuthStateChange(callback: AuthStateCallback): () => void;
}
```

**Files Created**:
- `src/interfaces/AuthService.ts` (~80 lines)
- `src/interfaces/AuthTypes.ts` (~50 lines)

**Acceptance Criteria**:
- [x] Interface covers all auth operations
- [x] Compatible with both local (no-op) and cloud (Supabase) modes
- [x] TypeScript compiles without errors

---

## Phase 3: LocalDataStore Implementation ✅ COMPLETE

**Goal**: Implement DataStore interface using direct storage access
**Risk**: MEDIUM (changes how data is accessed, but behavior unchanged)
**Effort**: 10-14 hours

### PR #6: LocalDataStore - Core Implementation ✅ COMPLETE

**Status**: Done (December 19, 2025)

**Purpose**: Create LocalDataStore that directly accesses `@/utils/storage`

**Key Pattern**: Direct storage access (NOT delegation to managers)

Per DATA CONTRACT Section 6, Option B requires:
- LocalDataStore accesses storage DIRECTLY (not via managers)
- Managers will be refactored LATER to call DataStore
- This avoids circular dependencies: `Managers → DataStore → LocalDataStore → storage`

```typescript
// ❌ DON'T delegate to managers (creates circular deps with Option B)
export class LocalDataStore implements DataStore {
  async getPlayers(): Promise<Player[]> {
    return getMasterRoster(); // BAD: manager will eventually call DataStore
  }
}

// ✅ DO access storage directly
export class LocalDataStore implements DataStore {
  async getPlayers(): Promise<Player[]> {
    const json = await getStorageItem(MASTER_ROSTER_KEY);
    return json ? JSON.parse(json) : [];
  }

  async createPlayer(player: Omit<Player, 'id'>): Promise<Player> {
    const roster = await this.getPlayers();
    const newPlayer = { ...player, id: generateId() };
    roster.push(newPlayer);
    await setStorageItem(MASTER_ROSTER_KEY, JSON.stringify(roster));
    return newPlayer;
  }
}
```

**Migration Strategy**:
1. Phase 3: LocalDataStore implements storage logic directly
2. Post-Phase 3: Managers refactored to call DataStore instead of storage
3. Result: `App → Managers (business logic) → DataStore → storage`

**Files Created**:
- `src/datastore/LocalDataStore.ts` (~400 lines)
- `src/datastore/index.ts` (exports)

**Implementation Order**:
1. Lifecycle methods (initialize, close, getBackendName)
2. Player operations (direct storage via MASTER_ROSTER_KEY)
3. Team operations (direct storage via TEAMS_INDEX_KEY, TEAM_ROSTERS_KEY)
4. Season operations (direct storage via SEASONS_LIST_KEY)
5. Tournament operations (direct storage via TOURNAMENTS_LIST_KEY)
6. Game operations (direct storage via SAVED_GAMES_KEY)
7. Personnel operations (direct storage via PERSONNEL_KEY)
8. Settings operations (direct storage via APP_SETTINGS_KEY)
9. Timer state operations (direct storage via TIMER_STATE_KEY)

**Acceptance Criteria**:
- [x] All DataStore methods implemented
- [x] Each method accesses `@/utils/storage` directly
- [x] NO imports from manager files (no circular dependency risk)
- [x] TypeScript compiles without errors

---

### PR #7: LocalDataStore - Tests ✅ COMPLETE

**Status**: Done (December 19, 2025) - Merged with PR #6

**Purpose**: Comprehensive test coverage for LocalDataStore

**Tasks**:
1. Create test file with full coverage
2. Mock `@/utils/storage` functions (NOT managers)
3. Test each method independently
4. Test error handling and edge cases
5. **Runtime interface contract tests** - Verify implementation matches DataStore interface
   (TypeScript only checks at compile time; runtime tests catch missing methods)

**File Created**: `src/datastore/LocalDataStore.test.ts` (~400 lines)

**Test Categories**:
```typescript
// Mock storage layer, NOT managers
jest.mock('@/utils/storage', () => ({
  getStorageItem: jest.fn(),
  setStorageItem: jest.fn(),
  removeStorageItem: jest.fn(),
  getStorageJSON: jest.fn(),
  setStorageJSON: jest.fn(),
}));

describe('LocalDataStore', () => {
  describe('Lifecycle', () => {
    it('should initialize successfully');
    it('should return correct backend name');
    it('should report availability');
  });

  describe('Players', () => {
    it('should read players from MASTER_ROSTER_KEY');
    it('should write new player to storage');
    it('should update player in storage');
    it('should delete player from storage');
  });

  describe('Games', () => {
    it('should handle SavedGamesCollection object structure');
    it('should use index-based event operations');
  });

  // ... similar for Teams, Seasons, Tournaments, Personnel, Settings
});
```

**Acceptance Criteria**:
- [x] 90%+ test coverage for LocalDataStore
- [x] Each DataStore method tested
- [x] Storage layer mocked (not managers)
- [x] Error cases covered
- [x] All tests pass

---

### PR #8: LocalAuthService & DataStore Factory ✅ COMPLETE

**Status**: Done (December 19, 2025)

**Purpose**: Complete the local implementation

**LocalAuthService** (no-op for local mode):
```typescript
// src/auth/LocalAuthService.ts
export class LocalAuthService implements AuthService {
  getMode(): 'local' | 'cloud' {
    return 'local';
  }

  async getCurrentUser(): Promise<User | null> {
    return { id: 'local', email: null, isAnonymous: true };
  }

  isAuthenticated(): boolean {
    return true; // Local mode is always "authenticated"
  }

  // All auth methods are no-ops in local mode
  async signUp(): Promise<never> {
    throw new DataStoreError('Sign up not available in local mode', 'NOT_SUPPORTED');
  }
  // etc.
}
```

**DataStore Factory**:
```typescript
// src/datastore/factory.ts
let datastoreInstance: DataStore | null = null;

export async function getDataStore(): Promise<DataStore> {
  if (!datastoreInstance) {
    datastoreInstance = new LocalDataStore();
    await datastoreInstance.initialize();
  }
  return datastoreInstance;
}

export function getAuthService(): AuthService {
  return new LocalAuthService();
}
```

**Files Created**:
- `src/auth/LocalAuthService.ts` (~80 lines)
- `src/auth/LocalAuthService.test.ts` (~100 lines)
- `src/datastore/factory.ts` (~40 lines)
- `src/datastore/factory.test.ts` (~60 lines)

**Acceptance Criteria**:
- [x] LocalAuthService implements all methods
- [x] Runtime interface contract tests verify AuthService compliance
- [x] Factory returns singleton instance
- [x] All tests pass (2,700+ tests)
- [x] TypeScript compiles

---

## Phase 4: Supabase Implementation (Future)

**Goal**: Implement cloud backend
**Risk**: MEDIUM (new code, network operations)
**Effort**: 20-30 hours
**When**: After Play Store release, if cloud features wanted

> **Note**: This phase is **completely optional** for Play Store release.
> The app works fully with LocalDataStore. Only implement if:
> - Multi-device sync is desired
> - Cloud backup is desired
> - Premium tier monetization is planned

### PR #9-12: Supabase Implementation

Detailed tasks in existing documentation:
- [phased-implementation-roadmap.md](./phased-implementation-roadmap.md) - Phase 2
- [migration-strategy.md](./migration-strategy.md) - Data transformation
- [supabase-schema.md](../../02-technical/database/supabase-schema.md) - Database schema

---

## Integration with React Query

**After LocalDataStore is complete**, update React Query hooks to use it:

### Example Migration

**Before** (current):
```typescript
// src/hooks/useRoster.ts
const { data: roster = [] } = useQuery({
  queryKey: queryKeys.masterRoster,
  queryFn: () => getMasterRoster(),
});
```

**After** (with DataStore):
```typescript
// src/hooks/useRoster.ts
// Note: getDataStore() called inside queryFn, not at hook level
const { data: roster = [] } = useQuery({
  queryKey: queryKeys.masterRoster,
  queryFn: async () => {
    const dataStore = await getDataStore();
    return dataStore.getPlayers();
  },
});
```

**This can be done incrementally** - one hook at a time, after Phase 3 is complete.

---

## Risk Mitigation

### Testing Strategy

**After EACH PR**:
```bash
npm test                    # All 2,200+ tests pass
npm run lint               # No lint errors
npx tsc --noEmit           # TypeScript compiles
npm run build              # Production build succeeds
npm run dev                # Manual testing works
```

### Rollback Plan

Each PR is small and self-contained. If issues arise:
1. `git revert` the problematic commit
2. Fix the issue
3. Re-apply with fix

### Feature Flags

DataStore can be introduced behind a feature flag:
```typescript
const USE_DATASTORE = process.env.NEXT_PUBLIC_USE_DATASTORE === 'true';

// In hooks:
if (USE_DATASTORE) {
  return dataStore.getPlayers();
} else {
  return getMasterRoster();
}
```

This allows gradual rollout and easy rollback.

---

## Success Criteria

### Phase 1-3 Complete When: ✅ ALL CRITERIA MET

- [x] Zero direct storage calls outside `src/utils/` managers and `src/datastore/`
- [x] DataStore interface fully defined (per Section 9 scope)
- [x] LocalDataStore implements all methods via direct storage access (NOT delegation)
- [x] LocalDataStore has NO imports from manager files
- [x] LocalAuthService implements no-op authentication
- [x] Factory provides singleton instances
- [x] 90%+ test coverage for new code
- [x] All 2,700+ tests pass
- [x] No behavior changes (same functionality)

### Ready for Supabase When:

- [x] Phases 1-3 complete and stable ✅
- [ ] Business decision to add cloud features
- [ ] Supabase project created and configured
- [ ] Database schema reviewed and approved

---

## Timeline

| Week | PRs | Focus |
|------|-----|-------|
| Week 1 | #1-2 | Audit + Hook cleanup (useGameOrchestration) |
| Week 2 | #3-4 | Hook cleanup + DataStore interface |
| Week 3 | #5-6 | AuthService interface + LocalDataStore core |
| Week 4 | #7-8 | LocalDataStore tests + factory |
| **Total** | 8 PRs | 4 weeks for Phase 1-3 |

**Phase 4 (Supabase)**: Additional 3-4 weeks if pursued

---

## Related Documentation

- **Theoretical Design**: [phased-implementation-roadmap.md](./phased-implementation-roadmap.md)
- **Architecture**: [dual-backend-architecture.md](../../02-technical/architecture/dual-backend-architecture.md)
- **Interface Spec**: [datastore-interface.md](../../02-technical/architecture/datastore-interface.md)
- **Auth Spec**: [auth-service-interface.md](../../02-technical/architecture/auth-service-interface.md)
- **Migration**: [migration-strategy.md](./migration-strategy.md)
- **Database Schema**: [supabase-schema.md](../../02-technical/database/supabase-schema.md)

---

## Change Log

| Date | Update |
|------|--------|
| 2025-12-19 | ✅ **Phase 1-3 COMPLETE**: All 8 PRs merged to feature/backend-abstraction. PR #137 created to merge to master. Includes DataStore interface, LocalDataStore (2,700+ tests), LocalAuthService, factory pattern |
| 2025-12-18 | Added explicit **Responsibility Boundary** table in Section 6 documenting DataStore (pure data access) vs Managers (business logic) separation |
| 2025-12-18 | ✅ **Phase 1 COMPLETE**: All 3 PRs merged to feature/backend-abstraction (timerStateManager created, appSettings extended, all hooks updated) |
| 2025-12-18 | **Consistency pass**: Fixed Phase 3 PR #6-7 to match Option B (LocalDataStore uses direct storage access, NOT manager delegation); fixed Operations Inventory with verified function names; added DataStore scope decisions (Section 9); updated Success Criteria |
| 2025-12-18 | **DATA CONTRACT section**: Added comprehensive authoritative reference covering complete key inventory (including infrastructure keys), data shapes, atomicity guarantees, error handling contract, backup gaps, architecture decision, migration clarification, and complete operations inventory |
| 2025-12-17 | **Architecture decision**: Resolved Option A vs B inconsistency - chose Option B (managers wrap DataStore, not reverse) |
| 2025-12-17 | **Extended gaps section**: Added missing team roster ops, season/tournament placements, event storage model, null vs empty string |
| 2025-12-17 | **Fix**: Corrected React Query integration example (await inside queryFn, not hook level) |
| 2025-12-17 | **Critical fix**: Corrected timer state key (`soccerTimerState` not `timerState`) and schema (`timestamp`, `wasRunning`) |
| 2025-12-17 | **Added Phase 2-3 gaps section**: DataStore coverage gaps, game events API mismatch, migration scope, React async patterns |
| 2025-12-17 | **Major revision**: Fresh codebase audit, created STORAGE-AUDIT.md, updated PR #1-3 to match current state, added branch strategy |
| 2025-12-06 | Initial plan created based on actual codebase analysis |
