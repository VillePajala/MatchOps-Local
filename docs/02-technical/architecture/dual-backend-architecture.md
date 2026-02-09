# Dual-Backend Architecture

**Status**: ✅ **Phase 1-4 Implemented** (Local + Cloud backends complete, Local-First Sync added)
**Last Updated**: 2026-01-28
**Purpose**: Comprehensive architectural plan for supporting both IndexedDB (free/local) and Supabase (premium/cloud) backends
**Related**: [DataStore Interface](./datastore-interface.md) | [AuthService Interface](./auth-service-interface.md) | [Current Storage Schema](../database/current-storage-schema.md) | [Supabase Schema](../database/supabase-schema.md) | [Auth/Data/Sync Runtime Architecture](./auth-data-sync-architecture.md)

## Executive Summary

MatchOps-Local will evolve from a local-first, single-backend application to a **dual-backend architecture** supporting both:

1. **Local Mode**: IndexedDB storage, single-device, complete offline, unlimited features
2. **Cloud Mode**: Supabase PostgreSQL, multi-device sync, cloud backup (subscriber-only)

### Key Principle: Authentication ≠ Cloud Mode (Issue #336)

**Sign-in and sync are separate concepts:**
- **Authentication** = Create/access an account (enables future features, smooth upgrade path)
- **Cloud sync** = Enable cloud mode (subscriber-only, explicitly toggled)

A user can be signed in but still use local mode. This is the **correct design** because:
- Free accounts prepare users for upgrade (no friction when subscribing)
- Accounts enable support tickets, crash reports, future community features
- Cloud sync is a clear premium value proposition

### Mode/Sync Matrix (Source of Truth)

| User State | Mode | Sync | Storage | Limits |
|------------|------|------|---------|--------|
| No account | Local | OFF | IndexedDB | None |
| Free account (signed in) | Local | OFF | IndexedDB | None |
| Subscriber + sync OFF | Local | OFF | IndexedDB | None |
| Subscriber + sync ON | Cloud | ON | Supabase | None |

### Implementation Status (January 2026)

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1: Foundation | ✅ Complete | Storage calls centralized, timerStateManager created |
| Phase 2: DataStore Interface | ✅ Complete | `src/interfaces/DataStore.ts`, `src/interfaces/AuthService.ts` |
| Phase 3: LocalDataStore | ✅ Complete | `src/datastore/LocalDataStore.ts`, `src/auth/LocalAuthService.ts`, factory |
| Phase 4: Supabase | ✅ Complete | `src/datastore/SupabaseDataStore.ts`, `src/auth/SupabaseAuthService.ts` |
| Phase 5: Local-First Sync | ✅ Complete | `src/datastore/SyncedDataStore.ts`, `src/sync/SyncEngine.ts`, `src/sync/SyncQueue.ts` |

**All Supabase PRs (1-11)** merged to `feature/supabase-cloud-backend`. **PR #324** added local-first sync infrastructure.

**Key Goals**:
- ✅ Maintain local-first benefits (privacy, offline, performance)
- ✅ Enable cloud features without rewriting codebase
- ✅ Support both modes in same codebase (feature flag/user selection)
- ✅ Provide smooth migration path (local → cloud)
- ✅ Preserve backward compatibility with current local-only version
- ✅ Separate authentication from sync mode (Issue #336)

**Business Model**:
- **Free Tier**: Local mode, full features, 1 device, optional account
- **Premium Tier**: Cloud sync (explicit toggle), multi-device, cloud backup, Play Store in-app purchase

## Current Architecture (Baseline)

### Storage Layer

```
┌─────────────────────────────────────────────────────────┐
│                   Application Layer                      │
│  (Components, Hooks, React Query)                       │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────┴────────────────────────────────────────┐
│              Domain Managers Layer                       │
│  (masterRoster.ts, savedGames.ts, seasons.ts, etc.)    │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────┴────────────────────────────────────────┐
│              Storage Abstraction Layer                   │
│  storage.ts (getStorageItem, setStorageItem, etc.)     │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────┴────────────────────────────────────────┐
│             StorageAdapter Interface                     │
│  (getItem, setItem, removeItem, clear, getKeys)        │
└────────────────┬────────────────────────────────────────┘
                 │
                 │
          ┌──────┴──────┐
          │  IndexedDB  │
          │   Adapter   │
          └─────────────┘
           (Current Prod)

Note: localStorage adapter removed. IndexedDB is the exclusive storage backend.
```

**Characteristics**:
- ✅ Clean abstraction (StorageAdapter interface)
- ✅ Domain managers isolated from storage details
- ✅ IndexedDB foundation complete (Phase M1)
- ❌ Low-level key-value interface (not domain-aware)
- ❌ Single backend only (no multi-backend support)
- ❌ No authentication layer

## Proposed Architecture (Target)

### High-Level Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                       Application Layer                           │
│         (Components, Hooks, React Query)                         │
│  ┌────────────────────────────────────────────────────────┐     │
│  │  React Components                                       │     │
│  │  - HomePage.tsx                                         │     │
│  │  - LoadGameModal.tsx                                    │     │
│  │  - RosterSettingsModal.tsx                              │     │
│  │  - ...                                                  │     │
│  └──────────┬──────────────────────────────────────────────┘     │
└─────────────┼──────────────────────────────────────────────────┘
              │
┌─────────────┼────────────────────────────────────────────────────┐
│             │        React Query Hooks Layer                     │
│  ┌──────────┴──────────────────────────────────────────────┐    │
│  │  Custom Hooks                                            │    │
│  │  - useRoster() → dataStore.getPlayers()                 │    │
│  │  - useGames() → dataStore.getGames(filters)             │    │
│  │  - useSeasons() → dataStore.getSeasons()                │    │
│  │  - useAuth() → authService.getCurrentUser()             │    │
│  └──────────┬──────────────────────────────────────────────┘    │
└─────────────┼───────────────────────────────────────────────────┘
              │
┌─────────────┼───────────────────────────────────────────────────┐
│             │         Service Layer (NEW)                        │
│  ┌──────────┴──────────────────────────────────────────────┐    │
│  │  getDataStore() → DataStore                             │    │
│  │  getAuthService() → AuthService                         │    │
│  └──────────┬──────────────┬───────────────────────────────┘    │
└─────────────┼──────────────┼────────────────────────────────────┘
              │              │
      ┌───────┴───────┐  ┌───┴──────────┐
      │               │  │              │
┌─────┴──────┐  ┌─────┴────────┐  ┌─────┴────────┐  ┌──────────────┐
│ DataStore  │  │  AuthService │  │  DataStore   │  │ AuthService  │
│ Interface  │  │  Interface   │  │  Interface   │  │  Interface   │
└─────┬──────┘  └─────┬────────┘  └─────┬────────┘  └──────┬───────┘
      │               │                 │                   │
┌─────┴──────┐  ┌─────┴────────┐  ┌─────┴────────┐  ┌──────┴───────┐
│   Local    │  │    Local     │  │  Supabase    │  │  Supabase    │
│ DataStore  │  │ AuthService  │  │  DataStore   │  │ AuthService  │
│            │  │  (no-op)     │  │              │  │ (full auth)  │
└─────┬──────┘  └──────────────┘  └─────┬────────┘  └──────┬───────┘
      │                                  │                   │
┌─────┴──────────────┐            ┌──────┴──────────┐   ┌───┴────────┐
│ Storage Abstraction│            │ Supabase Client │   │ Supabase   │
│ (storage.ts)       │            │ (JS Library)    │   │   Auth     │
└─────┬──────────────┘            └─────────────────┘   └────────────┘
      │
┌─────┴────────────┐
│ IndexedDB Adapter│
│ (IndexedDBKvStore│
└──────────────────┘

LOCAL MODE (FREE)              CLOUD MODE (PREMIUM)
```

### Architecture Layers

#### 1. Application Layer
**Role**: UI components and user interactions
**Changes**: Minimal - uses same React Query hooks
**Benefit**: Business logic decoupled from backend

#### 2. React Query Hooks Layer
**Role**: State management, caching, invalidation
**Changes**: Replace direct storage calls with DataStore methods
**Example**:
```typescript
// Before (direct storage)
const roster = await getStorageItem(MASTER_ROSTER_KEY);

// After (DataStore)
const dataStore = await getDataStore();
const roster = await dataStore.getPlayers();
```

#### 3. Service Layer (NEW)
**Role**: Backend selection and instance management
**Components**:
- `getDataStore()` - Returns active DataStore (Local or Supabase)
- `getAuthService()` - Returns active AuthService (Local or Supabase)

**Backend Selection Logic**:
```typescript
export async function getDataStore(): Promise<DataStore> {
  const authService = getAuthService();
  const mode = authService.getMode(); // 'local' | 'cloud'

  if (mode === 'local') {
    return new LocalDataStore();
  } else {
    const supabase = await authService.getSupabaseClient();
    return new SupabaseDataStore(supabase);
  }
}
```

#### 4. Interface Layer (NEW)
**Role**: Define contracts for data access and authentication
**Interfaces**:
- `DataStore` - Domain-oriented data operations (see [DataStore Interface](./datastore-interface.md))
- `AuthService` - Authentication and session management (see [AuthService Interface](./auth-service-interface.md))

#### 5. Implementation Layer
**Implementations**:
- `LocalDataStore` + `LocalAuthService` - Wrap existing IndexedDB code
- `SupabaseDataStore` + `SupabaseAuthService` - New PostgreSQL + Auth implementation

## Backend Comparison

### Feature Matrix

| Feature | Local Mode | Cloud Mode (Subscriber + Sync ON) |
|---------|------------|-----------------------------------|
| **Storage** | IndexedDB (50+ MB) | PostgreSQL (500 MB free tier) |
| **Authentication** | Optional (can have account) | Required (subscriber) |
| **Multi-Device Sync** | ❌ No | ✅ Yes |
| **Offline Support** | ✅ Full (always offline) | ✅ Cached session + queued ops |
| **Data Privacy** | ✅ Never leaves device | ✅ Encrypted, user-isolated (RLS) |
| **Performance** | ✅ <50ms (no network) | ~200-500ms (network latency) |
| **Cloud Backup** | ❌ Manual export/import | ✅ Automatic (database) |
| **Data Ownership** | ✅ Full (local storage) | ✅ Full (can export/delete) |
| **Cost** | Free forever | Subscription required |
| **Setup** | Zero (account optional) | Subscribe + enable sync |

### User Experience Comparison

**Local Mode (No Account)**:
```
Install App → Start Fresh → Start Using Immediately
                            ↓
              All data on device, works offline
                            ↓
                Export data manually for backup
```

**Local Mode (With Free Account)** - Issue #336:
```
Install App → Sign In → Create Account
                            ↓
              "Welcome! Your data stays on this device."
                            ↓
              Same as above, but ready for upgrade
```

**Cloud Mode (Subscriber + Sync Enabled)**:
```
Subscribe → "Enable sync now?" → Yes
                                   ↓
              Migration wizard (if local data exists)
                                   ↓
              Data synced across devices automatically
```

## Key Design Decisions

### 1. Interface-Based Abstraction

**Decision**: Use `DataStore` and `AuthService` interfaces instead of extending `StorageAdapter`

**Rationale**:
- Domain-oriented operations (getPlayers vs getItem)
- Type-safe with TypeScript
- Hides backend complexity from business logic
- Easier to test (mock interfaces)

**Trade-offs**:
- Additional abstraction layer (slight complexity)
- Need to maintain two implementations
- ✅ Worth it for clean separation and future flexibility

### 2. Direct Storage Access Pattern for LocalDataStore

**Decision**: LocalDataStore accesses storage directly (NOT delegation to managers)

**Rationale** (see REALISTIC-IMPLEMENTATION-PLAN.md Section 6, Option B):
- Avoids circular dependencies (Managers → DataStore → Managers)
- Both backends implement identical DataStore interface
- Managers become thin wrappers calling DataStore for business logic

**Implementation** (actual pattern from `src/datastore/LocalDataStore.ts`):
```typescript
class LocalDataStore implements DataStore {
  async getPlayers(): Promise<Player[]> {
    // Direct storage access - NOT delegation to managers
    const json = await getStorageItem(MASTER_ROSTER_KEY);
    return json ? JSON.parse(json) : [];
  }

  async createPlayer(player: Omit<Player, 'id'>): Promise<Player> {
    // Direct storage with validation
    return withKeyLock(MASTER_ROSTER_KEY, async () => {
      const roster = await this.loadPlayers();
      const newPlayer = { ...player, id: generateId('player') };
      roster.push(newPlayer);
      await setStorageItem(MASTER_ROSTER_KEY, JSON.stringify(roster));
      return newPlayer;
    });
  }
}
```

**Architecture**:
```
App → Managers (business logic) → DataStore interface
                                        ↓
                          ┌─────────────┴─────────────┐
                          ↓                           ↓
                    LocalDataStore              SupabaseDataStore
                          ↓                           ↓
                      IndexedDB                    Supabase
```

**Trade-offs**:
- Data access logic duplicated between DataStore implementations (acceptable - different backends need different code)
- ✅ Worth it for clean architecture and no circular dependencies

### 3. No Foreign Keys on Player References

**Decision**: Player IDs in games, assessments, etc. have NO foreign key constraints

**Rationale**:
- Graceful degradation when players deleted
- Preserve historical game records
- Cross-device imports work (players may not exist on target device)

**Behavior**:
- Player deleted → UI shows last known name (from snapshot)
- Player ID not found → Trophy hidden, stats show "(Deleted Player)"
- Import with missing players → Creates placeholder or shows fallback

**Trade-offs**:
- Risk of orphaned references (acceptable)
- Can't rely on referential integrity
- ✅ Worth it for UX (games survive roster changes)

### 4. JSONB for Complex Arrays

**Decision**: Store opponents, drawings, tactical data as JSONB columns (not normalized tables)

**Rationale**:
- These are tightly coupled to individual games
- No need to query individual points
- Atomic updates (all or nothing)
- Simpler queries (no joins)

**Example**:
```sql
-- Instead of:
CREATE TABLE field_drawings (
  game_id uuid,
  drawing_index int,
  point_index int,
  rel_x numeric,
  rel_y numeric
);

-- Use:
CREATE TABLE game_tactical_data (
  game_id uuid,
  drawings jsonb DEFAULT '[]'::jsonb
);
```

**Trade-offs**:
- Can't query points individually (not needed)
- Larger column size (acceptable)
- ✅ Worth it for simplicity

### 5. Soft Deletes for Seasons/Tournaments

**Decision**: Use `archived` flag instead of hard deletes

**Rationale**:
- Preserve game references (games can't exist without season)
- User can unarchive if needed
- Easier to implement "show archived" filter

**Behavior**:
- Delete season → Set `archived = true`
- Games still reference season (foreign key intact)
- UI hides archived seasons by default

**Trade-offs**:
- Database grows (archived data stays)
- Need to filter `archived = false` in queries
- ✅ Worth it for data preservation

### 6. Client-Side UUID Generation

**Decision**: Generate UUIDs on client, not database

**Rationale**:
- Offline support (no server round-trip for ID)
- Consistent with current pattern (`season_timestamp_random`)
- Works with optimistic updates (React Query)

**Implementation**:
```typescript
const id = crypto.randomUUID(); // Browser API
// OR
const id = `season_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
```

**Trade-offs**:
- Slightly larger risk of collisions (negligible with UUIDs)
- Can't use auto-increment (not needed)
- ✅ Worth it for offline-first design

## Impedance Mismatch Resolution

### Challenge: Key-Value → Relational

**Problem**: Current code expects JSON objects, Supabase uses relational rows

**Example**:
```typescript
// Current: Key-value
SAVED_GAMES_KEY = {
  "game_123": {
    teamName: "PEPO",
    playersOnField: [...],
    gameEvents: [...],
    assessments: {...},
  }
}

// Target: Relational
games table: { id, team_name, home_score, ... }
game_players table: { game_id, player_id, on_field, ... }
game_events table: { game_id, type, time, ... }
player_assessments table: { game_id, player_id, overall, ... }
```

**Solution**: SupabaseDataStore handles transformation

### Transformation Patterns

**1. Array → Rows**:
```typescript
// Local: seasons array
const seasons = [{ id: 's1', name: 'Spring 2025' }, ...]

// Supabase: seasons table
INSERT INTO seasons (id, user_id, name) VALUES ('s1', $userId, 'Spring 2025');
```

**2. Nested Object → Foreign Keys**:
```typescript
// Local: assessments embedded in game
game.assessments['player_123'] = { overall: 8, sliders: {...} }

// Supabase: separate table
INSERT INTO player_assessments (game_id, player_id, overall, ...)
VALUES ('game_123', 'player_123', 8, ...);
```

**3. Flatten/Unflatten**:
```typescript
// SupabaseDataStore.mapGameFromDb()
private mapGameFromDb(row: any): AppState {
  return {
    // Scalar fields
    teamName: row.team_name,
    homeScore: row.home_score,

    // Reconstruct arrays
    playersOnField: row.game_players
      .filter(p => p.on_field)
      .map(this.mapGamePlayerFromDb),

    // Reconstruct assessments object
    assessments: row.player_assessments.reduce((acc, a) => ({
      ...acc,
      [a.player_id]: this.mapAssessmentFromDb(a),
    }), {}),
  };
}
```

## Data Flow Examples

### Example 1: Get Roster

**Local Mode**:
```
Component
  → useRoster()
    → dataStore.getPlayers()
      → LocalDataStore
        → getStorageItem(MASTER_ROSTER_KEY)  // Direct storage access
          → IndexedDB
```

**Cloud Mode**:
```
Component
  → useRoster()
    → dataStore.getPlayers()
      → SupabaseDataStore
        → supabase.from('players').select('*')
          → PostgreSQL (with RLS filter: user_id = current_user)
```

### Example 2: Create Game

**Local Mode**:
```
Component
  → createGame(gameData)
    → dataStore.createGame(gameData)
      → LocalDataStore
        → saveGame(id, gameData) (existing util)
          → setStorageItem(SAVED_GAMES_KEY, {...all games})
            → IndexedDB
```

**Cloud Mode**:
```
Component
  → createGame(gameData)
    → dataStore.createGame(gameData)
      → SupabaseDataStore
        → BEGIN TRANSACTION
          → INSERT INTO games (...)
          → INSERT INTO game_players (...) [batch]
          → INSERT INTO game_events (...) [batch]
          → INSERT INTO player_assessments (...) [batch]
          → INSERT INTO game_tactical_data (...)
        → COMMIT
```

### Example 3: Sign In (Authentication Only - Does NOT Change Mode)

**Important (Issue #336)**: Sign-in creates/accesses an account but does NOT enable cloud mode. User stays in their current mode (typically local).

```
Component
  → signIn(email)
    → authService.signIn(email)
      → SupabaseAuthService
        → supabase.auth.signInWithOtp({email})  // Magic link
          → Supabase Auth API
            → Returns: { user, session }
              → Store session in localStorage
              → Trigger onAuthStateChange → invalidate queries
              → MODE STAYS 'local' (sync not enabled)
```

### Example 4: Enable Cloud Sync (Subscriber + Enable Toggle)

**This is when mode actually changes** - requires subscription + explicit action.

```
Component (CloudSyncSection)
  → enableSync() [subscriber clicks toggle]
    → Check subscription status (must be subscriber)
    → Check local data exists?
       → YES: Show MigrationWizard
       → NO: enableCloudMode() directly
    → If migration chosen:
       → Upload local data to cloud
       → enableCloudMode()
       → Reinitialize DataStore (SupabaseDataStore)
       → Invalidate all queries → refetch from cloud
```

## Migration Architecture

### Local → Cloud Migration Flow (Issue #336 Model)

**Key Principle**: Authentication and sync are separate. A user may already have an account (from previous sign-in) but be in local mode. Migration happens when a subscriber explicitly enables sync.

```
┌─────────────────────────────────────────────────────────────┐
│  STEP 1: User in Local Mode (May or May Not Have Account)   │
│  - Has existing data in IndexedDB                           │
│  - Is a subscriber who wants to enable cloud sync           │
└───────────────────────┬─────────────────────────────────────┘
                        │
┌───────────────────────┴─────────────────────────────────────┐
│  STEP 2: Authenticate (If Not Already Signed In)            │
│  - User signs in via magic link                             │
│  - SupabaseAuthService.signIn(email)                        │
│  - User is authenticated but STILL IN LOCAL MODE            │
│  - (Sync not enabled yet)                                   │
└───────────────────────┬─────────────────────────────────────┘
                        │
┌───────────────────────┴─────────────────────────────────────┐
│  STEP 3: Enable Cloud Sync (Subscriber-Only)                │
│  - User clicks "Enable Cloud Sync" toggle in Settings       │
│  - Check subscription status (must be subscriber)           │
│  - Check if local data exists → trigger migration wizard    │
└───────────────────────┬─────────────────────────────────────┘
                        │
┌───────────────────────┴─────────────────────────────────────┐
│  STEP 4: Migration Wizard (Upload Choice)                   │
│  - Show data comparison: Local vs Cloud                     │
│  - User chooses: Upload Local → Cloud                       │
│  - LocalDataStore.exportAllData()                           │
└───────────────────────┬─────────────────────────────────────┘
                        │
┌───────────────────────┴─────────────────────────────────────┐
│  STEP 5: Upload to Cloud                                    │
│  - SupabaseDataStore.importData(exportedData)               │
│  - Transforms: Key-value → Relational                       │
│  - Inserts into PostgreSQL tables                           │
└───────────────────────┬─────────────────────────────────────┘
                        │
┌───────────────────────┴─────────────────────────────────────┐
│  STEP 6: Verify Migration                                   │
│  - Count records: local vs cloud                            │
│  - Validate key entities (games, players, seasons)          │
│  - Show migration report to user                            │
└───────────────────────┬─────────────────────────────────────┘
                        │
┌───────────────────────┴─────────────────────────────────────┐
│  STEP 7: Enable Cloud Mode                                  │
│  - enableCloudMode() called                                 │
│  - Set syncEnabled = true                                   │
│  - Reinitialize app with SupabaseDataStore                  │
│  - User now in Cloud Mode with sync active                  │
└───────────────────────┬─────────────────────────────────────┘
                        │
┌───────────────────────┴─────────────────────────────────────┐
│  STEP 8: (Optional) Clear Local Data                        │
│  - LocalDataStore.clearAllData()                            │
│  - Free up device storage                                   │
│  - Keep local data as backup option                         │
└─────────────────────────────────────────────────────────────┘
```

**Important**: Step 2 (authentication) may have happened days/weeks earlier. The user could have signed in, remained in local mode, and only later decided to enable sync after subscribing.

**See**: [Migration Strategy](../../08-archived/completed-active-plans/backend-evolution/migration-strategy.md) for detailed implementation
**See**: [Cloud Sync User Flows](../../08-archived/completed-active-plans/cloud-sync-user-flows.md) for all sync scenarios

## Testing Strategy

### Unit Tests

**LocalDataStore**:
- Each method delegates to existing utility
- Verify correct utility called with correct params
- Mock `getStorageItem` / `setStorageItem`

**SupabaseDataStore**:
- Each method makes correct Supabase query
- Verify transformations (DB row → AppState)
- Mock Supabase client

**AuthService Implementations**:
- LocalAuthService always returns anonymous user
- SupabaseAuthService handles sign in/out correctly
- Mock Supabase Auth

### Integration Tests

**Local Mode End-to-End**:
```typescript
test('create player → save game → load game', async () => {
  const dataStore = new LocalDataStore();
  await dataStore.initialize();

  // Create player
  const player = await dataStore.createPlayer({ name: 'Test Player' });

  // Create game with player
  const game = await dataStore.createGame({
    teamName: 'Test Team',
    selectedPlayerIds: [player.id],
    ...
  });

  // Load game
  const loaded = await dataStore.getGameById(game.id);
  expect(loaded.selectedPlayerIds).toContain(player.id);
});
```

**Cloud Mode End-to-End** (requires test database):
```typescript
test('sign up → create player → sign out → sign in → load player', async () => {
  const authService = new SupabaseAuthService(testUrl, testKey);
  const dataStore = new SupabaseDataStore(authService.getSupabaseClient());

  // Sign up
  await authService.signUp('test@example.com', 'password123');

  // Create player
  const player = await dataStore.createPlayer({ name: 'Cloud Player' });

  // Sign out + sign in
  await authService.signOut();
  await authService.signIn('test@example.com', 'password123');

  // Load player (RLS should allow)
  // Note: No getPlayerById - filter from getPlayers()
  const players = await dataStore.getPlayers();
  const loaded = players.find(p => p.id === player.id);
  expect(loaded).toEqual(player);
});
```

### Manual Testing

**Scenarios**:
1. ✅ Create data in local mode
2. ✅ Export data
3. ✅ Sign up for cloud account
4. ✅ Import data to cloud
5. ✅ Verify data visible in cloud mode
6. ✅ Test multi-device sync (two browsers)
7. ✅ Test offline behavior (disable network)
8. ✅ Switch back to local mode
9. ✅ Import cloud data back to local

## Performance Considerations

### Local Mode

**No Change**: Same performance as current

**Characteristics**:
- Read: <50ms (IndexedDB)
- Write: <100ms (IndexedDB)
- No network latency
- Main thread blocking minimal

### Cloud Mode

**Network Overhead**:
- Read: 200-500ms (depends on region)
- Write: 300-700ms (transaction overhead)
- Batch operations critical
- React Query caching essential

**Optimizations**:
1. **Aggressive Caching**: React Query with long stale times
2. **Optimistic Updates**: Update UI immediately, sync in background
3. **Batch Operations**: Insert multiple records in single transaction
4. **Selective Loading**: Only fetch needed fields (Supabase select)
5. **Pagination**: Limit query results (default 100 games per page)
6. **Materialized Views**: Pre-computed stats (if needed at scale)

**Example: Optimistic Update**:
```typescript
const mutation = useMutation({
  mutationFn: (player: Player) => dataStore.createPlayer(player),
  onMutate: async (newPlayer) => {
    // Cancel outgoing queries
    await queryClient.cancelQueries({ queryKey: ['roster'] });

    // Snapshot previous value
    const previousRoster = queryClient.getQueryData(['roster']);

    // Optimistically update
    queryClient.setQueryData(['roster'], (old: Player[]) => [...old, newPlayer]);

    return { previousRoster };
  },
  onError: (err, newPlayer, context) => {
    // Rollback on error
    queryClient.setQueryData(['roster'], context.previousRoster);
  },
  onSettled: () => {
    // Refetch to ensure sync
    queryClient.invalidateQueries({ queryKey: ['roster'] });
  },
});
```

## Security Model

### Local Mode

**Threat Model**:
- Physical device theft (mitigated by OS encryption)
- Malicious extensions (mitigated by browser sandboxing)
- No network threats (no data transmission)

**Security Measures**:
- Browser sandboxing (IndexedDB isolated per origin)
- OS-level disk encryption (user responsibility)
- No sensitive data collection

### Cloud Mode

**Threat Model**:
- Unauthorized account access (mitigated by auth)
- Data leakage between users (mitigated by RLS)
- Man-in-the-middle attacks (mitigated by TLS)

**Security Measures**:
- **Authentication**: Supabase Auth with bcrypt password hashing
- **Authorization**: Row Level Security (RLS) enforces user isolation
- **Encryption in Transit**: TLS 1.3 for all API calls
- **Session Management**: JWT tokens with expiration + refresh
- **API Key Security**: Anon key safe to expose (RLS protects data)

**RLS Example**:
```sql
CREATE POLICY "Users can only access their own games"
  ON games FOR ALL
  USING (auth.uid() = user_id);

-- Even with exposed API key, this query only returns user's games:
SELECT * FROM games WHERE season_id = 'season_123';
-- → Automatically filtered: WHERE user_id = current_user
```

## Cost Analysis

### Development Cost

| Phase | Effort | Complexity |
|-------|--------|-----------|
| Interface Design | 8-12 hours | Low |
| LocalDataStore (wrapper) | 16-24 hours | Medium |
| SupabaseDataStore (new) | 40-60 hours | High |
| AuthService Implementations | 16-24 hours | Medium |
| Migration Tool | 24-32 hours | High |
| Testing & QA | 40-60 hours | Medium |
| **Total** | **144-212 hours** | **18-26 days** |

### Operational Cost (Cloud Mode)

**Supabase Pricing** (as of 2025):
- **Free Tier**: 500 MB database, 2 GB bandwidth, good for 500+ users
- **Pro Tier**: $25/month, 8 GB database, 50 GB bandwidth
- **Estimated**: $0.05-0.10 per active user/month (free tier sufficient initially)

**Revenue Model** (In-App Purchase):
- One-time premium upgrade: $9.99-19.99
- OR: Subscription $2.99/month
- Break-even: ~100-500 premium users (depending on model)

## Rollout Strategy

### Phase 1: Foundation ✅ COMPLETE (December 2025)
- Centralized storage calls (timerStateManager, appSettings extension)
- All hooks now use domain managers
- **Result**: Clean separation ready for DataStore interface

### Phase 2: DataStore Interface ✅ COMPLETE (December 2025)
- Created DataStore and AuthService interfaces
- Full TypeScript definitions with JSDoc
- **Result**: Backend-agnostic API defined

### Phase 3: LocalDataStore ✅ COMPLETE (December 2025)
- Implemented LocalDataStore (direct IndexedDB access)
- Implemented LocalAuthService (no-op for local mode)
- Created factory with singleton pattern
- 2,700+ tests passing
- **Result**: Same functionality, new interfaces

### Phase 4: Supabase Implementation ✅ COMPLETE
- Set up Supabase project (database, auth)
- Implemented SupabaseDataStore with full DataStore interface
- Implemented SupabaseAuthService with Supabase Auth
- Added UI for mode selection and migration wizard
- Added optimistic locking for concurrent save protection (Issue #330)
- **Result**: Cloud features available

**See**: [REALISTIC-IMPLEMENTATION-PLAN.md](../../08-archived/completed-active-plans/backend-evolution/REALISTIC-IMPLEMENTATION-PLAN.md) for detailed plan

---

**Next Steps**:
1. Review [Migration Strategy](../../08-archived/completed-active-plans/backend-evolution/migration-strategy.md) for data transformation details
2. Check [Phased Implementation Roadmap](../../08-archived/completed-active-plans/backend-evolution/phased-implementation-roadmap.md) for execution plan
3. See [Master Execution Guide](../../03-active-plans/master-execution-guide.md) for integration with overall roadmap
