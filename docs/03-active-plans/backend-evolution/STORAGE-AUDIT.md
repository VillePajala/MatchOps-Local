# Storage Audit - December 18, 2025

**Purpose**: Authoritative inventory of all storage calls in the codebase
**Status**: Current (audited against actual code)
**Last Updated**: December 18, 2025

---

## Scope

This audit covers **calls to `@/utils/storage` from application code** (hooks, components, domain managers).

**Explicitly OUT OF SCOPE** (intentional direct access):
- `src/utils/migration.ts` - Direct localStorage access for one-time migration (lines 189, 215)
- `src/utils/storageBootstrap.ts` - Direct IndexedDB bootstrap before storage layer available
- `src/utils/storageFactory.ts` - Storage infrastructure itself
- `src/utils/indexedDbKvAdapter.ts` - Low-level IndexedDB adapter
- `src/utils/localStorageAdapter.ts` - Low-level localStorage adapter

These files ARE the storage infrastructure and should continue to have direct access.

---

## Executive Summary

| Metric | Original Plan (Dec 6) | Current (Dec 18) | Change |
|--------|----------------------|------------------|--------|
| Storage helper call sites | 195 | **108** | -87 |
| Files with helper call sites | 26 | **18** | -8 files |
| Files referencing helper API (imports + calls) | 26 | **20** | -6 files |
| Files needing refactoring | 4 | **6** | +2 new hooks |
| Tests | 2,200+ | 2,646 | +446 tests |

**Metric definitions (reproducible)**:
- “Storage helper call sites”: occurrences of `getStorageItem/getStorageJSON/setStorageItem/setStorageJSON/removeStorageItem/clearStorage` followed by `(` in non-test TS/TSX.
  - Command: `rg --count-matches -g'*.ts' -g'*.tsx' -g'!**/*.test.*' -g'!**/__tests__/**' "\\b(getStorageItem|getStorageJSON|setStorageItem|setStorageJSON|removeStorageItem|clearStorage)\\s*\\(" src`
- “Files referencing helper API”: occurrences of the same identifiers (imports + calls) in non-test TS/TSX (includes `src/utils/__mocks__/storage.ts`).
  - Command: `rg --count-matches -g'*.ts' -g'*.tsx' -g'!**/*.test.*' -g'!**/__tests__/**' "\\b(getStorageItem|getStorageJSON|setStorageItem|setStorageJSON|removeStorageItem|clearStorage)\\b" src`

---

## File Classification

### Domain Managers (src/utils/) - APPROPRIATE

These files SHOULD have direct storage access:

| File | Calls | Purpose |
|------|-------|---------|
| `storage.ts` | Core | Storage abstraction layer |
| `storageKeyLock.ts` | 2 | Lock management |
| `appSettings.ts` | Multiple | App settings CRUD |
| `savedGames.ts` | Multiple | Game save/load |
| `masterRoster.ts` | Multiple | Player roster |
| `masterRosterManager.ts` | Multiple | Roster operations |
| `seasons.ts` | Multiple | Season management |
| `tournaments.ts` | Multiple | Tournament management |
| `teams.ts` | Multiple | Team management |
| `personnelManager.ts` | Multiple | Personnel/staff |
| `playerAdjustments.ts` | Multiple | External stats |
| `premiumManager.ts` | Multiple | Premium/licensing |
| `warmupPlan.ts` | Multiple | Warm-up routines (NEW) |
| `fullBackup.ts` | Multiple | Import/export |
| `__mocks__/storage.ts` | Mock | Test mock |

### Files Needing Refactoring - DIRECT STORAGE ACCESS

These files bypass domain managers and need fixing:

#### 1. `src/components/HomePage/hooks/useGameOrchestration.ts`

| Line | Call | Purpose | Should Route To |
|------|------|---------|-----------------|
| 32 | import | Direct import | Remove |
| 762 | `getStorageItem('availablePlayers')` | Legacy migration | One-time, can stay |
| 764 | `setStorageItem(MASTER_ROSTER_KEY)` | Legacy migration | One-time, can stay |
| 765 | `removeStorageItem('availablePlayers')` | Legacy migration | One-time, can stay |
| 769-771 | seasons migration | Legacy migration | One-time, can stay |
| 816 | `getStorageItem(TIMER_STATE_KEY)` | Timer restore | **timerStateManager** |
| 829 | `removeStorageItem(TIMER_STATE_KEY)` | Timer clear | **timerStateManager** |
| 836 | `removeStorageItem(TIMER_STATE_KEY)` | Timer clear | **timerStateManager** |
| 878 | `getStorageItem('hasSeenFirstGameGuide')` | Onboarding check | **appSettings** |

**Verdict**: 3 timer calls + 1 onboarding call need routing. Legacy migration can stay (one-time).

#### 2. `src/components/HomePage/hooks/useGamePersistence.ts`

| Line | Call | Purpose | Should Route To |
|------|------|---------|-----------------|
| 68 | import | Direct import | Remove |
| 468 | `removeStorageItem(TIMER_STATE_KEY)` | Timer clear | **timerStateManager** |

**Verdict**: 1 timer call needs routing.

#### 3. `src/components/HomePage/hooks/useSavedGameManager.ts`

| Line | Call | Purpose | Should Route To |
|------|------|---------|-----------------|
| 14 | import | Direct import | Remove |
| 219 | `removeStorageItem(TIMER_STATE_KEY)` | Timer clear | **timerStateManager** |

**Verdict**: 1 timer call needs routing.

#### 4. `src/hooks/useGameTimer.ts`

| Line | Call | Purpose | Should Route To |
|------|------|---------|-----------------|
| 3 | import | Direct import | Remove |
| 60 | `removeStorageItem(TIMER_STATE_KEY)` | Timer clear | **timerStateManager** |
| 114 | `setStorageJSON(TIMER_STATE_KEY)` | Timer save | **timerStateManager** |
| 130 | `removeStorageItem(TIMER_STATE_KEY)` | Timer clear | **timerStateManager** |
| 182 | `setStorageJSON(TIMER_STATE_KEY)` | Timer save | **timerStateManager** |
| 192 | `getStorageJSON(TIMER_STATE_KEY)` | Timer load | **timerStateManager** |

**Verdict**: 5 timer calls need routing. This is the PRIMARY timer state user.

#### 5. `src/components/InstallPrompt.tsx`

| Line | Call | Purpose | Should Route To |
|------|------|---------|-----------------|
| 8 | import | Direct import | Remove |
| 43 | `getStorageItem("installPromptDismissed")` | Check dismissal | **appSettings** |
| 128 | `setStorageItem("installPromptDismissed")` | Save dismissal | **appSettings** |
| 147 | `setStorageItem("installPromptDismissed")` | Save dismissal | **appSettings** |

**Verdict**: 3 install prompt calls need routing to appSettings.

#### 6. `src/i18n.ts`

| Line | Call | Purpose | Should Route To |
|------|------|---------|-----------------|
| 4 | import | Direct import | Remove |
| 22 | `getStorageJSON(APP_SETTINGS_KEY)` | Get language | **appSettings** |

**Verdict**: 1 call needs routing. Use `getAppSettings()` instead.

---

## New Domain Managers Needed

### 1. `timerStateManager.ts` (NEW - ~80 lines)

**Purpose**: Centralize all timer state persistence

**IMPORTANT**: Must use existing key and schema from `src/config/storageKeys.ts`:
- Key: `TIMER_STATE_KEY = 'soccerTimerState'` (NOT 'timerState')

```typescript
// src/utils/timerStateManager.ts
import { TIMER_STATE_KEY } from '@/config/storageKeys';

// MUST match existing schema exactly (from useGameTimer.ts lines 100-104, 174-179)
export interface TimerState {
  gameId: string;
  timeElapsedInSeconds: number;
  timestamp: number;        // Date.now() when saved - used for restore calculations
  wasRunning?: boolean;     // Only set when saving on tab hidden (for resume on return)
}

export async function saveTimerState(state: TimerState): Promise<void>;
export async function loadTimerState(): Promise<TimerState | null>;
export async function clearTimerState(): Promise<void>;
export async function hasTimerState(): Promise<boolean>;
```

**Schema notes** (from existing code):
- `timestamp`: Used by `handleVisibilityChange()` to calculate time passed while tab was hidden
- `wasRunning`: Set to `true` only when saving on tab hidden, used to decide whether to auto-resume

**Consumers**:
- useGameTimer.ts (5 calls)
- useGameOrchestration.ts (3 calls)
- useGamePersistence.ts (1 call)
- useSavedGameManager.ts (1 call)

**Total**: 10 calls to centralize

### 2. Extend `appSettings.ts`

**Add methods for**:
- `getInstallPromptDismissedTime(): Promise<number | null>`
- `setInstallPromptDismissed(): Promise<void>`
- `hasSeenFirstGameGuide(): Promise<boolean>`
- `setFirstGameGuideSeen(): Promise<void>`

**Consumers**:
- InstallPrompt.tsx (3 calls)
- useGameOrchestration.ts (1 call)

**Total**: 4 calls to route

---

## Summary of Work

| Task | Files Changed | Calls Fixed | Effort |
|------|---------------|-------------|--------|
| Create timerStateManager.ts | 1 new | 0 | 1h |
| Route timer calls from hooks | 4 files | 10 calls | 2h |
| Extend appSettings.ts | 1 file | 0 | 30min |
| Route appSettings calls | 2 files | 4 calls | 1h |
| Update i18n.ts | 1 file | 1 call | 15min |
| **Total** | 9 files | 15 calls | ~5h |

---

## Storage Keys Inventory

| Key | Manager | Used By |
|-----|---------|---------|
| `TIMER_STATE_KEY` | timerStateManager (NEW) | useGameTimer, useGameOrchestration, useGamePersistence, useSavedGameManager |
| `APP_SETTINGS_KEY` | appSettings.ts | appSettings, i18n |
| `MASTER_ROSTER_KEY` | masterRoster.ts | masterRosterManager |
| `SAVED_GAMES_KEY` | savedGames.ts | savedGames |
| `SEASONS_LIST_KEY` | seasons.ts | seasons |
| `TOURNAMENTS_LIST_KEY` | tournaments.ts | tournaments |
| `TEAMS_INDEX_KEY` | teams.ts | teams |
| `TEAM_ROSTERS_KEY` | teams.ts | teams |
| `PERSONNEL_KEY` | personnelManager.ts | personnelManager |
| `PLAYER_ADJUSTMENTS_KEY` | playerAdjustments.ts | playerAdjustments |
| `PREMIUM_LICENSE_KEY` | premiumManager.ts | premiumManager |
| `WARMUP_PLAN_KEY` | warmupPlan.ts | warmupPlan |
| `installPromptDismissed` | appSettings (extend) | InstallPrompt |
| `hasSeenFirstGameGuide` | appSettings (extend) | useGameOrchestration |

---

## Legacy Migration Code

The following storage calls in `useGameOrchestration.ts` are **one-time migration** for users upgrading from old versions:

```typescript
// Lines 762-771: Migrate old storage keys
getStorageItem('availablePlayers')  // Old roster key → MASTER_ROSTER_KEY
getStorageItem('soccerSeasonsList') // Old seasons key → SEASONS_LIST_KEY
```

**Recommendation**: Keep as-is. These run once per user upgrade and are harmless.

---

## Change Log

| Date | Update |
|------|--------|
| 2025-12-17 | **Scope clarification**: Added explicit scope section - audit covers `@/utils/storage` calls, not migration/bootstrap infrastructure |
| 2025-12-17 | **Fix**: Corrected timer call count (3 not 4) in useGameOrchestration, fixed `TEAMS_INDEX_KEY` (was incorrectly `TEAMS_KEY`) |
| 2025-12-17 | **Critical fix**: Corrected TimerState interface to match actual schema (timestamp not lastUpdated, wasRunning not isRunning), added key name warning |
| 2025-12-17 | Initial audit created from live codebase analysis |
