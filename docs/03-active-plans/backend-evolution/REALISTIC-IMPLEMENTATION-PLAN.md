# Backend Abstraction: Realistic PR-Chunked Implementation Plan

**Created**: December 6, 2025
**Status**: 📋 Ready for Implementation
**Purpose**: Practical, PR-by-PR guide for backend abstraction based on actual codebase analysis
**Related**: [phased-implementation-roadmap.md](./phased-implementation-roadmap.md) (theoretical), [dual-backend-architecture.md](../../02-technical/architecture/dual-backend-architecture.md)

---

## Executive Summary

This document provides a **realistic, code-reviewed implementation plan** for adding backend switching capability (IndexedDB → Supabase). Unlike the theoretical `phased-implementation-roadmap.md`, this plan is based on actual codebase analysis and addresses specific coupling issues discovered in the code.

### Key Findings from Code Analysis

| Issue | Impact | Addressed In |
|-------|--------|--------------|
| Storage calls scattered across 26 files (195 calls) | HIGH | PR #2-3 |
| Hooks bypass domain managers (direct storage calls) | HIGH | PR #3 |
| Read-modify-write patterns everywhere | MEDIUM | PR #4 |
| JSON serialization scattered in 8+ manager files | MEDIUM | PR #5 |
| High-frequency timer saves (every 2s) | LOW | PR #6 |

### Realistic Effort Estimate

| Phase | Hours | Risk | PRs |
|-------|-------|------|-----|
| Phase 1: Foundation | 12-16h | LOW | PR #1-3 |
| Phase 2: DataStore Interface | 8-12h | LOW | PR #4-5 |
| Phase 3: LocalDataStore | 10-14h | MEDIUM | PR #6-8 |
| Phase 4: Supabase (future) | 20-30h | MEDIUM | PR #9-12 |
| **Total** | **50-72h** | | **12 PRs** |

**Note**: Phases 1-3 provide backend switching capability. Phase 4 (Supabase) is optional and can be done later.

---

## Phase 1: Foundation (Clean Up Coupling Issues)

**Goal**: Centralize storage calls before introducing abstraction
**Risk**: LOW (pure refactoring, no behavior change)
**Effort**: 12-16 hours
**Tests**: Run after each PR, maintain 100% pass rate

### PR #1: Audit & Document Current State (2-3h)

**Purpose**: Create authoritative list of all storage touchpoints

**Tasks**:
1. Generate comprehensive storage call audit
2. Document all files with direct storage access
3. Categorize by type (read, write, delete)
4. Identify which calls should go through domain managers
5. Create migration tracking checklist

**Deliverables**:
- `docs/03-active-plans/backend-evolution/STORAGE-AUDIT.md`
- Checklist of all 195 storage calls with migration status

**Files Changed**: Documentation only

**Acceptance Criteria**:
- [ ] All storage calls documented with file:line references
- [ ] Each call categorized (manager, hook, component, utility)
- [ ] Migration path identified for each non-manager call

---

### PR #2: Centralize Hook Storage Calls - Part 1 (4-5h)

**Purpose**: Remove direct storage calls from useGameOrchestration.ts

**Current Problem** (useGameOrchestration.ts:33):
```typescript
// ❌ CURRENT: Hooks call storage directly
import { getStorageItem, setStorageItem, removeStorageItem } from '@/utils/storage';

// Multiple places bypass domain managers:
// - Line 145: removeStorageItem(TIMER_STATE_KEY)
// - Line 512: setStorageItem(MASTER_ROSTER_KEY, ...)
// etc.
```

**Tasks**:
1. Identify all storage calls in useGameOrchestration.ts
2. Route each call through appropriate domain manager
3. Add missing domain manager methods if needed
4. Update imports to remove direct storage access

**Target State**:
```typescript
// ✅ TARGET: Hooks use domain managers only
import { clearTimerState } from '@/utils/timerState';
import { updateMasterRoster } from '@/utils/masterRosterManager';

// All storage access goes through domain managers
await clearTimerState();
await updateMasterRoster(newRoster);
```

**Files Changed**:
- `src/components/HomePage/hooks/useGameOrchestration.ts`
- `src/utils/timerState.ts` (new or extend)
- `src/utils/masterRosterManager.ts` (extend if needed)

**Acceptance Criteria**:
- [ ] Zero direct storage imports in useGameOrchestration.ts
- [ ] All storage operations go through domain managers
- [ ] All 2,200+ tests pass
- [ ] No behavior change (same functionality)

---

### PR #3: Centralize Hook Storage Calls - Part 2 (3-4h)

**Purpose**: Remove direct storage calls from other hooks

**Files to Fix**:
- `src/components/HomePage/hooks/useGamePersistence.ts`
- `src/hooks/useGameTimer.ts`
- `src/components/InstallPrompt.tsx`
- `src/i18n.ts`

**Tasks**:
1. Audit each file for storage calls
2. Create/extend appropriate domain managers
3. Route all calls through managers
4. Remove direct storage imports

**For useGameTimer.ts specifically**:
```typescript
// ❌ CURRENT (useGameTimer.ts:3)
import { setStorageJSON, getStorageJSON, removeStorageItem } from '@/utils/storage';

// ✅ TARGET: Use dedicated timer state manager
import { saveTimerState, loadTimerState, clearTimerState } from '@/utils/timerStateManager';
```

**New File**: `src/utils/timerStateManager.ts` (~50 lines)
```typescript
// Centralized timer state operations
export async function saveTimerState(state: TimerState): Promise<void>;
export async function loadTimerState(): Promise<TimerState | null>;
export async function clearTimerState(): Promise<void>;
```

**Acceptance Criteria**:
- [ ] Zero direct storage imports in any hook file
- [ ] Zero direct storage imports in any component file
- [ ] All storage operations centralized in `src/utils/` managers
- [ ] All tests pass
- [ ] No behavior change

---

## Phase 2: DataStore Interface

**Goal**: Introduce backend-agnostic interface
**Risk**: LOW (additive, no existing code changed)
**Effort**: 8-12 hours

### PR #4: Define DataStore Interface (4-6h)

**Purpose**: Create the TypeScript interface for backend abstraction

**Tasks**:
1. Create `src/interfaces/DataStore.ts` with full interface
2. Create `src/interfaces/DataStoreTypes.ts` for supporting types
3. Create `src/interfaces/DataStoreErrors.ts` for error handling
4. Add comprehensive JSDoc documentation

**Interface Structure** (abbreviated):
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
  getPlayerById(id: string): Promise<Player | null>;
  createPlayer(player: Omit<Player, 'id'>): Promise<Player>;
  updatePlayer(id: string, updates: Partial<Player>): Promise<Player | null>;
  deletePlayer(id: string): Promise<boolean>;

  // Teams
  getTeams(includeArchived?: boolean): Promise<Team[]>;
  getTeamById(id: string): Promise<Team | null>;
  createTeam(team: Omit<Team, 'id' | 'createdAt' | 'updatedAt'>): Promise<Team>;
  updateTeam(id: string, updates: Partial<Team>): Promise<Team | null>;
  deleteTeam(id: string): Promise<boolean>;
  getTeamPlayers(teamId: string): Promise<TeamPlayer[]>;

  // Seasons
  getSeasons(includeArchived?: boolean): Promise<Season[]>;
  getSeasonById(id: string): Promise<Season | null>;
  createSeason(season: Omit<Season, 'id'>): Promise<Season>;
  updateSeason(id: string, updates: Partial<Season>): Promise<Season | null>;
  deleteSeason(id: string): Promise<boolean>;

  // Tournaments
  getTournaments(includeArchived?: boolean): Promise<Tournament[]>;
  getTournamentById(id: string): Promise<Tournament | null>;
  createTournament(tournament: Omit<Tournament, 'id'>): Promise<Tournament>;
  updateTournament(id: string, updates: Partial<Tournament>): Promise<Tournament | null>;
  deleteTournament(id: string): Promise<boolean>;

  // Games
  getGames(options?: GameFilterOptions): Promise<SavedGame[]>;
  getGameById(id: string): Promise<SavedGame | null>;
  createGame(game: SavedGame): Promise<SavedGame>;
  updateGame(id: string, updates: Partial<SavedGame>): Promise<SavedGame | null>;
  deleteGame(id: string): Promise<boolean>;
  deleteGames(ids: string[]): Promise<number>;

  // Game Events (separate from game for atomic operations)
  addGameEvent(gameId: string, event: GameEvent): Promise<GameEvent>;
  updateGameEvent(gameId: string, eventId: string, updates: Partial<GameEvent>): Promise<GameEvent | null>;
  removeGameEvent(gameId: string, eventId: string): Promise<boolean>;

  // Settings
  getSettings(): Promise<AppSettings>;
  updateSettings(updates: Partial<AppSettings>): Promise<AppSettings>;

  // Bulk Operations
  exportAllData(): Promise<DataExport>;
  importData(data: DataExport, options?: ImportOptions): Promise<ImportResult>;
  clearAllData(): Promise<boolean>;
}
```

**Files Created**:
- `src/interfaces/DataStore.ts` (~200 lines)
- `src/interfaces/DataStoreTypes.ts` (~100 lines)
- `src/interfaces/DataStoreErrors.ts` (~50 lines)
- `src/interfaces/index.ts` (re-exports)

**Acceptance Criteria**:
- [ ] Interface covers all current data operations
- [ ] TypeScript compiles without errors
- [ ] Full JSDoc documentation
- [ ] No runtime code (interfaces only)

---

### PR #5: Define AuthService Interface (3-4h)

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
- [ ] Interface covers all auth operations
- [ ] Compatible with both local (no-op) and cloud (Supabase) modes
- [ ] TypeScript compiles without errors

---

## Phase 3: LocalDataStore Implementation

**Goal**: Wrap existing storage code in DataStore interface
**Risk**: MEDIUM (changes how data is accessed, but behavior unchanged)
**Effort**: 10-14 hours

### PR #6: LocalDataStore - Core Implementation (5-6h)

**Purpose**: Create LocalDataStore that wraps existing domain managers

**Key Pattern**: Delegation, not reimplementation
```typescript
// ❌ DON'T reimplement storage logic
export class LocalDataStore implements DataStore {
  async getPlayers(): Promise<Player[]> {
    const json = await getStorageItem(MASTER_ROSTER_KEY);
    return json ? JSON.parse(json) : [];
  }
}

// ✅ DO delegate to existing managers
export class LocalDataStore implements DataStore {
  async getPlayers(): Promise<Player[]> {
    return getMasterRoster(); // Existing utility
  }

  async createPlayer(player: Omit<Player, 'id'>): Promise<Player> {
    return addPlayerToRoster(player.name, player); // Existing utility
  }
}
```

**Files Created**:
- `src/datastore/LocalDataStore.ts` (~300 lines)
- `src/datastore/index.ts` (exports)

**Implementation Order**:
1. Lifecycle methods (initialize, close, getBackendName)
2. Player operations (delegate to masterRosterManager)
3. Team operations (delegate to teams.ts)
4. Season operations (delegate to seasons.ts)
5. Tournament operations (delegate to tournaments.ts)
6. Game operations (delegate to savedGames.ts)
7. Settings operations (delegate to appSettings.ts)

**Acceptance Criteria**:
- [ ] All DataStore methods implemented
- [ ] Each method delegates to existing utility
- [ ] Zero new storage logic (pure delegation)
- [ ] TypeScript compiles without errors

---

### PR #7: LocalDataStore - Tests (3-4h)

**Purpose**: Comprehensive test coverage for LocalDataStore

**Tasks**:
1. Create test file with full coverage
2. Mock underlying domain managers
3. Test each method independently
4. Test error handling

**File Created**: `src/datastore/LocalDataStore.test.ts` (~400 lines)

**Test Categories**:
```typescript
describe('LocalDataStore', () => {
  describe('Lifecycle', () => {
    it('should initialize successfully');
    it('should return correct backend name');
    it('should report availability');
  });

  describe('Players', () => {
    it('should delegate getPlayers to getMasterRoster');
    it('should delegate createPlayer to addPlayerToRoster');
    it('should delegate updatePlayer to updatePlayerInRoster');
    it('should delegate deletePlayer to removePlayerFromRoster');
  });

  // ... similar for Teams, Seasons, Tournaments, Games, Settings
});
```

**Acceptance Criteria**:
- [ ] 90%+ test coverage for LocalDataStore
- [ ] Each DataStore method tested
- [ ] Error cases covered
- [ ] All tests pass

---

### PR #8: LocalAuthService & DataStore Factory (2-4h)

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
- [ ] LocalAuthService implements all methods
- [ ] Factory returns singleton instance
- [ ] All tests pass
- [ ] TypeScript compiles

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
const dataStore = await getDataStore();

const { data: roster = [] } = useQuery({
  queryKey: queryKeys.masterRoster,
  queryFn: () => dataStore.getPlayers(),
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

### Phase 1-3 Complete When:

- [ ] Zero direct storage calls outside `src/utils/` managers
- [ ] DataStore interface fully defined
- [ ] LocalDataStore implements all methods via delegation
- [ ] LocalAuthService implements no-op authentication
- [ ] Factory provides singleton instances
- [ ] 90%+ test coverage for new code
- [ ] All 2,200+ existing tests pass
- [ ] No behavior changes (same functionality)

### Ready for Supabase When:

- [ ] Phases 1-3 complete and stable
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
| 2025-12-06 | Initial plan created based on actual codebase analysis |
