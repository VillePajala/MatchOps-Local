# User-Scoped Data Architecture Plan v2

**Status:** Complete ✅
**Created:** 2026-01-29
**Last Updated:** 2026-01-31 (Steps 9-10 complete - SQL migrations created)
**Branch:** `feature/supabase-cloud-backend`

### Progress

| Step | Description | Status |
|------|-------------|--------|
| 1-4 | Storage layer, LocalDataStore, SyncedDataStore, Factory | ✅ Complete (PR #344 merged) |
| 5 | useDataStore helper hook | ✅ Complete (PR #346 merged) |
| 6 | Update ~36 callers to pass userId | ✅ Complete (PR #346 merged) |
| 7 | Export/import updates | ✅ Complete (PR #347 merged - fullBackup.ts uses DataStore, 51 tests) |
| 8 | Legacy migration (MatchOpsLocal → user DB) | ✅ Complete (legacyMigrationService.ts, triggered on sign-in, 17 tests) |
| 9-10 | SQL migrations (composite keys, RPC updates) | ✅ Complete (013_composite_primary_keys.sql, 014_update_rpc_for_composite_keys.sql) |
| 11 | Tests | ✅ Complete (4481 tests passing) |

**Note:** User isolation is now active. When cloud mode is enabled and user is authenticated, data is stored in user-scoped IndexedDB (`matchops_user_{userId}`).

### Related Documents

| Document | Purpose |
|----------|---------|
| [user-scoped-storage-verification.md](./user-scoped-storage-verification.md) | Data model verification - IndexedDB ↔ Supabase mapping |
| [supabase-schema.md](../02-technical/database/supabase-schema.md) | Supabase PostgreSQL schema |
| [current-storage-schema.md](../02-technical/database/current-storage-schema.md) | IndexedDB storage schema |

---

## Executive Summary

This plan implements user-scoped data isolation through two changes:

### The Two Changes

| Change | What | Why |
|--------|------|-----|
| **1. Per-User IndexedDB** | Each user gets own database | Local isolation without prefix logic |
| **2. Composite Primary Keys** | `PRIMARY KEY (user_id, id)` in Supabase | Same ID can exist for different users |

### Result

| Operation | Implementation |
|-----------|----------------|
| Export | `JSON.stringify(data)` |
| Import | `JSON.parse(file)` → save |
| Cloud sync | Same IDs everywhere, no conflicts |
| Backup sharing | Works - composite key allows same IDs per user |

**No ID regeneration. No ID mapping. No reference tracking. No prefix stripping.**

### Work Required

| Task | Effort |
|------|--------|
| Per-user IndexedDB + storage layer | ~200 lines |
| SyncedDataStore updates | ~30 lines |
| Factory + DataStore callers | ~150 lines |
| SQL migration (composite keys) | ~100 lines |
| RPC function updates | ~30 lines |
| Export/import updates | ~50 lines |
| Data management UI (Settings page) | ~150 lines |
| Test updates | ~100 lines |
| **Total** | **~810 lines** |

---

## 1. Local Storage: Per-User IndexedDB

### 1.1 Concept

```
User A signs in  → Opens IndexedDB "matchops_user_{userId_A}"
User B signs in  → Opens IndexedDB "matchops_user_{userId_B}"
```

Complete isolation at the database level. No key prefixes needed in code.

### 1.2 Database Naming

**File:** `src/datastore/userDatabase.ts` (NEW)

```typescript
/**
 * Get the database name for a user.
 * Uses userId directly - no hashing needed since userId is not secret.
 */
export function getUserDatabaseName(userId: string): string {
  if (!userId) {
    throw new Error('userId is required');
  }
  return `matchops_user_${userId}`;
}

/**
 * Database names:
 * - User data: matchops_user_{userId}
 * - Legacy (pre-migration): MatchOpsLocal
 */
```

### 1.3 Storage Layer Changes

The current storage chain is:
```
LocalDataStore → storage.ts → StorageFactory → IndexedDBKvAdapter (dbName='MatchOpsLocal')
```

The storage layer provides important functionality (mutex, retry logic, validation, error handling) that must be preserved. Add user-scoping without bypassing it.

**File:** `src/utils/storageFactory.ts` - Add method to create user-scoped adapter:

```typescript
/**
 * Create a storage adapter for a specific user's database.
 */
createUserAdapter(userId: string): StorageAdapter {
  const dbName = getUserDatabaseName(userId);
  return this.createAdapterWithDbName(dbName);
}

private createAdapterWithDbName(dbName: string): StorageAdapter {
  return new IndexedDBKvAdapter({ dbName });
}
```

**File:** `src/utils/storage.ts` - Add user-scoped storage functions:

```typescript
// User-scoped adapter cache
let userAdapterPromise: Promise<StorageAdapter> | null = null;
let currentAdapterUserId: string | null = null;

/**
 * Get storage adapter for a specific user.
 * Preserves existing retry logic, mutex, validation, and error handling.
 */
export async function getUserStorageAdapter(userId: string): Promise<StorageAdapter> {
  if (currentAdapterUserId === userId && userAdapterPromise) {
    return userAdapterPromise;
  }

  // Close previous adapter if different user
  if (userAdapterPromise && currentAdapterUserId !== userId) {
    const oldAdapter = await userAdapterPromise;
    await (oldAdapter as IndexedDBKvAdapter).close?.();
  }

  currentAdapterUserId = userId;
  userAdapterPromise = createUserAdapterWithRetry(userId);
  return userAdapterPromise;
}

/**
 * Create user adapter with existing retry and mutex logic.
 * Implements same patterns as existing getStorageAdapter().
 *
 * Note: adapterCreationMutex, MAX_RETRY_ATTEMPTS, BASE_RETRY_DELAY, MAX_RETRY_DELAY
 * are existing variables from storage.ts - reuse them.
 */
async function createUserAdapterWithRetry(userId: string): Promise<StorageAdapter> {
  // Uses existing mutex from storage.ts for thread-safe adapter creation
  return adapterCreationMutex.runExclusive(async () => {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        const adapter = storageFactory.createUserAdapter(userId);

        // Validate adapter works
        await adapter.getItem('__health_check__');

        return adapter;
      } catch (error) {
        lastError = error as Error;

        if (attempt < MAX_RETRY_ATTEMPTS) {
          const delay = Math.min(
            BASE_RETRY_DELAY * Math.pow(2, attempt - 1),
            MAX_RETRY_DELAY
          );
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // StorageError is defined in src/datastore/errors.ts
    throw new StorageError(
      `Failed to create user storage adapter after ${MAX_RETRY_ATTEMPTS} attempts`,
      lastError
    );
  });
}

/**
 * Close user storage adapter (call on sign-out).
 */
export async function closeUserStorageAdapter(): Promise<void> {
  if (userAdapterPromise) {
    const adapter = await userAdapterPromise;
    await (adapter as IndexedDBKvAdapter).close?.();
    userAdapterPromise = null;
    currentAdapterUserId = null;
  }
}
```

### 1.4 LocalDataStore Changes

**File:** `src/interfaces/DataStore.ts` - Add to interface:

```typescript
interface DataStore {
  // ... existing methods ...

  /** Check if the DataStore has been initialized */
  isInitialized(): boolean;
}
```

**File:** `src/datastore/LocalDataStore.ts`

```typescript
export class LocalDataStore implements DataStore {
  private userId: string;
  private adapter: StorageAdapter | null = null;
  private initialized: boolean = false;

  constructor(userId: string) {
    if (!userId) {
      throw new Error('userId is required for LocalDataStore');
    }
    this.userId = userId;
  }

  async initialize(): Promise<void> {
    this.adapter = await getUserStorageAdapter(this.userId);
    this.initialized = true;
  }

  async close(): Promise<void> {
    // Adapter cleanup handled by storage.ts when user changes
    this.adapter = null;
    this.initialized = false;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  // All methods use simple keys - no prefix logic!
  // Change from getStorageJSON(key) to using this.adapter
  async getPlayers(): Promise<Player[]> {
    const data = await this.getItem<Player[]>(MASTER_ROSTER_KEY);
    return data ?? [];
  }

  private async getItem<T>(key: string): Promise<T | null> {
    if (!this.adapter) throw new NotInitializedError();
    const value = await this.adapter.getItem(key);
    return value ? JSON.parse(value) : null;
  }

  private async setItem(key: string, value: unknown): Promise<void> {
    if (!this.adapter) throw new NotInitializedError();
    await this.adapter.setItem(key, JSON.stringify(value));
  }

  // ... rest of methods unchanged, just use simple keys
}

/**
 * Error thrown when DataStore methods are called before initialize().
 * Add to src/datastore/errors.ts or similar.
 */
class NotInitializedError extends Error {
  constructor() {
    super('DataStore not initialized. Call initialize() first.');
    this.name = 'NotInitializedError';
  }
}
```

### 1.5 SyncedDataStore Changes

**File:** `src/datastore/SyncedDataStore.ts`

```typescript
export class SyncedDataStore implements DataStore {
  private localStore: LocalDataStore;
  private syncQueue: SyncQueue;
  private userId: string;
  // ...

  constructor(userId: string) {
    if (!userId) {
      throw new Error('userId is required for SyncedDataStore');
    }
    this.userId = userId;
    this.localStore = new LocalDataStore(userId);  // Pass userId
    this.syncQueue = new SyncQueue();
  }

  // ... rest unchanged
}
```

**Note on SupabaseDataStore:** `SupabaseDataStore` does NOT need userId passed in the constructor. It uses `auth.uid()` directly from Supabase context, which automatically scopes queries to the authenticated user via RLS policies.

### 1.6 Factory Changes

**File:** `src/datastore/factory.ts`

```typescript
let currentDataStore: DataStore | null = null;
let currentUserId: string | null = null;
let currentMode: 'local' | 'cloud' | null = null;

/**
 * Get the DataStore singleton instance for a user.
 *
 * @param userId - The authenticated user's ID (required)
 */
export async function getDataStore(userId: string): Promise<DataStore> {
  if (!userId) {
    throw new Error('userId is required for getDataStore');
  }

  const mode = getBackendMode();

  // Return existing store if same user and mode
  if (currentUserId === userId && currentMode === mode && currentDataStore) {
    if (!currentDataStore.isInitialized()) {
      await currentDataStore.initialize();
    }
    return currentDataStore;
  }

  // Close previous store if different user or mode
  if (currentDataStore) {
    // ... existing cleanup logic for sync engine, Supabase client
    await currentDataStore.close();
  }

  // Create new store for this user
  let instance: DataStore;

  if (mode === 'cloud' && isCloudAvailable()) {
    const syncedStore = new SyncedDataStore(userId);  // Pass userId
    await syncedStore.initialize();
    // ... existing cloud setup
    instance = syncedStore;
  } else {
    instance = new LocalDataStore(userId);  // Pass userId
    await instance.initialize();
  }

  currentDataStore = instance;
  currentUserId = userId;
  currentMode = mode;

  return instance;
}

export async function closeDataStore(): Promise<void> {
  if (currentDataStore) {
    await currentDataStore.close();
    currentDataStore = null;
    currentUserId = null;
    currentMode = null;
  }
}
```

### 1.7 DataStore Callers - Files That Need Updates

All files that call `getDataStore()` need to pass `userId`. The userId comes from the auth context.

**Pattern for React hooks/components:**

```typescript
// Before
const dataStore = await getDataStore();

// After - get userId from auth context
import { useAuth } from '@/contexts/AuthProvider';

const { user } = useAuth();
if (!user?.id) throw new Error('User not authenticated');
const dataStore = await getDataStore(user.id);
```

### ⚠️ CRITICAL: userId Security Requirements

**The `userId` parameter MUST only come from trusted, authenticated sources.**

When updating the ~36 callers in Step 6, **NEVER** pass:
- ❌ User-provided input (form fields, URL params, query strings)
- ❌ localStorage values (can be tampered with)
- ❌ Values from unverified contexts

**ONLY** pass:
- ✅ `user.id` from authenticated Supabase session (via `useAuth()` hook)
- ✅ `session.user.id` from `supabase.auth.getSession()` (server-side)

**Why this matters:**
- If an attacker can control the `userId` parameter, they could potentially access or modify another user's IndexedDB database
- The `userId` determines which database (`matchops_user_{userId}`) is opened
- Supabase Auth is the single source of truth for authenticated user identity

**Code Review Checklist for Step 6 PRs:**
- [ ] Every `getDataStore(userId)` call gets userId from `useAuth()` or equivalent
- [ ] No userId values derived from user input
- [ ] No userId values from localStorage/sessionStorage
- [ ] No userId values from URL parameters

**Files requiring updates (~36 files):**

| Category | Files |
|----------|-------|
| **Utils** | `masterRoster.ts`, `seasons.ts`, `tournaments.ts`, `teams.ts`, `savedGames.ts`, `personnelManager.ts`, `playerAdjustments.ts`, `warmupPlan.ts`, `appSettings.ts`, `timerStateManager.ts`, `fullBackup.ts` |
| **Services** | `migrationService.ts`, `reverseMigrationService.ts` |
| **Hooks** | `useGameOrchestration.ts`, `useSavedGames.ts`, `useSeasons.ts`, `useTournaments.ts`, `useTeams.ts`, `usePlayers.ts`, `usePersonnel.ts`, `useSettings.ts` |
| **Components** | `SettingsModal.tsx`, `MigrationWizard.tsx`, `WelcomeScreen.tsx`, `BackupRestore.tsx` |
| **Context** | `AuthProvider.tsx` (if it initializes DataStore) |

**To find ALL files that need updates, run:**

```bash
grep -r "getDataStore" src/ --include="*.ts" --include="*.tsx" -l
```

This will list every file that calls `getDataStore()` and needs the userId parameter added.

**Strategy:** Create a helper hook that wraps `getDataStore` with auth context:

```typescript
// src/hooks/useDataStore.ts
export function useDataStore() {
  const { user } = useAuth();

  const getStore = useCallback(async () => {
    if (!user?.id) {
      throw new Error('User not authenticated');
    }
    return getDataStore(user.id);
  }, [user?.id]);

  return { getStore, userId: user?.id };
}
```

### 1.8 Sign-Out Flow

```typescript
async function handleSignOut(): Promise<void> {
  // Close user's database
  await closeDataStore();
  await closeUserStorageAdapter();

  // Clear React Query cache
  queryClient.clear();

  // Sign out from auth
  await authService.signOut();
}
```

---

## 2. Cloud Storage: Composite Primary Keys

### 2.1 Concept

Change from single-column to composite primary keys:

```sql
-- From:
PRIMARY KEY (id)

-- To:
PRIMARY KEY (user_id, id)
```

This allows User A and User B to both have `player_123` without conflict.

### 2.1.1 Pre-Implementation Checklist

Before implementing the SQL migration:

- [ ] **Verify `team_players` table structure**: Check if it's a junction table with `(team_id, player_id)` PK or has its own `id`. The migration may need adjustment.
- [ ] **Verify `user_settings` table structure**: Check if it uses `user_id` as sole PK (1:1 with user) or has an `id` column. If it has `id`, add to migration:
  ```sql
  ALTER TABLE user_settings DROP CONSTRAINT IF EXISTS user_settings_pkey;
  ALTER TABLE user_settings ADD PRIMARY KEY (user_id, id);
  ```
  If `user_id` is the sole PK, no change needed (already user-scoped).
- [ ] **Audit ALL RPC functions**: Search for `ON CONFLICT` clauses that need updating:
  ```bash
  grep -r "ON CONFLICT" supabase/migrations/ supabase/functions/
  ```
- [ ] **Verify current PK names**: Run `\d tablename` in Supabase SQL editor to confirm constraint names match the DROP statements.
- [ ] **Follow staging → production deployment order**: See Section 2.2.2 for detailed checklist. **NEVER run directly on production.**

### 2.2 Migration Script

**File:** `supabase/migrations/013_composite_primary_keys.sql`

```sql
-- ============================================================================
-- COMPOSITE PRIMARY KEY MIGRATION
-- Changes all tables from PRIMARY KEY (id) to PRIMARY KEY (user_id, id)
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Drop all foreign keys
-- ============================================================================

ALTER TABLE game_events DROP CONSTRAINT IF EXISTS game_events_game_id_fkey;
ALTER TABLE game_players DROP CONSTRAINT IF EXISTS game_players_game_id_fkey;
ALTER TABLE game_tactical_data DROP CONSTRAINT IF EXISTS game_tactical_data_game_id_fkey;
ALTER TABLE player_assessments DROP CONSTRAINT IF EXISTS player_assessments_game_id_fkey;
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_season_id_fkey;
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_tournament_id_fkey;
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_team_id_fkey;
ALTER TABLE player_adjustments DROP CONSTRAINT IF EXISTS player_adjustments_season_id_fkey;
ALTER TABLE player_adjustments DROP CONSTRAINT IF EXISTS player_adjustments_tournament_id_fkey;
ALTER TABLE team_players DROP CONSTRAINT IF EXISTS team_players_team_id_fkey;

-- Also drop composite FK constraints if they exist (from previous attempts)
ALTER TABLE game_events DROP CONSTRAINT IF EXISTS game_events_game_fkey;
ALTER TABLE game_players DROP CONSTRAINT IF EXISTS game_players_game_fkey;
ALTER TABLE game_tactical_data DROP CONSTRAINT IF EXISTS game_tactical_data_game_fkey;
ALTER TABLE player_assessments DROP CONSTRAINT IF EXISTS player_assessments_game_fkey;
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_season_fkey;
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_tournament_fkey;
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_team_fkey;
ALTER TABLE player_adjustments DROP CONSTRAINT IF EXISTS player_adjustments_season_fkey;
ALTER TABLE player_adjustments DROP CONSTRAINT IF EXISTS player_adjustments_tournament_fkey;
ALTER TABLE team_players DROP CONSTRAINT IF EXISTS team_players_team_fkey;

-- ============================================================================
-- STEP 2: Drop existing primary keys
-- ============================================================================

ALTER TABLE players DROP CONSTRAINT IF EXISTS players_pkey;
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_pkey;
ALTER TABLE seasons DROP CONSTRAINT IF EXISTS seasons_pkey;
ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_pkey;
ALTER TABLE personnel DROP CONSTRAINT IF EXISTS personnel_pkey;
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_pkey;
ALTER TABLE game_events DROP CONSTRAINT IF EXISTS game_events_pkey;
ALTER TABLE game_players DROP CONSTRAINT IF EXISTS game_players_pkey;
ALTER TABLE game_tactical_data DROP CONSTRAINT IF EXISTS game_tactical_data_pkey;
ALTER TABLE player_assessments DROP CONSTRAINT IF EXISTS player_assessments_pkey;
ALTER TABLE player_adjustments DROP CONSTRAINT IF EXISTS player_adjustments_pkey;
ALTER TABLE user_consents DROP CONSTRAINT IF EXISTS user_consents_pkey;
ALTER TABLE warmup_plans DROP CONSTRAINT IF EXISTS warmup_plans_pkey;
ALTER TABLE team_players DROP CONSTRAINT IF EXISTS team_players_pkey;

-- ============================================================================
-- STEP 3: Add composite primary keys
-- ============================================================================

ALTER TABLE players ADD PRIMARY KEY (user_id, id);
ALTER TABLE teams ADD PRIMARY KEY (user_id, id);
ALTER TABLE seasons ADD PRIMARY KEY (user_id, id);
ALTER TABLE tournaments ADD PRIMARY KEY (user_id, id);
ALTER TABLE personnel ADD PRIMARY KEY (user_id, id);
ALTER TABLE games ADD PRIMARY KEY (user_id, id);
ALTER TABLE game_events ADD PRIMARY KEY (user_id, id);
ALTER TABLE game_players ADD PRIMARY KEY (user_id, id);
ALTER TABLE game_tactical_data ADD PRIMARY KEY (user_id, game_id);  -- Note: uses game_id not id
ALTER TABLE player_assessments ADD PRIMARY KEY (user_id, id);
ALTER TABLE player_adjustments ADD PRIMARY KEY (user_id, id);
ALTER TABLE user_consents ADD PRIMARY KEY (user_id, id);
ALTER TABLE warmup_plans ADD PRIMARY KEY (user_id, id);

-- team_players: Current PK is 'id' (text column with format {team_id}_{player_id})
-- Convert to composite PK like other tables
ALTER TABLE team_players ADD PRIMARY KEY (user_id, id);

-- ============================================================================
-- STEP 4: Add composite foreign keys
-- ============================================================================

-- Game child tables → games
ALTER TABLE game_events
  ADD CONSTRAINT game_events_game_fkey
  FOREIGN KEY (user_id, game_id) REFERENCES games(user_id, id) ON DELETE CASCADE;

ALTER TABLE game_players
  ADD CONSTRAINT game_players_game_fkey
  FOREIGN KEY (user_id, game_id) REFERENCES games(user_id, id) ON DELETE CASCADE;

ALTER TABLE game_tactical_data
  ADD CONSTRAINT game_tactical_data_game_fkey
  FOREIGN KEY (user_id, game_id) REFERENCES games(user_id, id) ON DELETE CASCADE;

ALTER TABLE player_assessments
  ADD CONSTRAINT player_assessments_game_fkey
  FOREIGN KEY (user_id, game_id) REFERENCES games(user_id, id) ON DELETE CASCADE;

-- Games → seasons, tournaments, teams (nullable FKs)
ALTER TABLE games
  ADD CONSTRAINT games_season_fkey
  FOREIGN KEY (user_id, season_id) REFERENCES seasons(user_id, id) ON DELETE SET NULL
  NOT VALID;  -- Don't validate existing data (allows NULL season_id)

ALTER TABLE games
  ADD CONSTRAINT games_tournament_fkey
  FOREIGN KEY (user_id, tournament_id) REFERENCES tournaments(user_id, id) ON DELETE SET NULL
  NOT VALID;

ALTER TABLE games
  ADD CONSTRAINT games_team_fkey
  FOREIGN KEY (user_id, team_id) REFERENCES teams(user_id, id) ON DELETE SET NULL
  NOT VALID;

-- Player adjustments → seasons, tournaments
ALTER TABLE player_adjustments
  ADD CONSTRAINT player_adjustments_season_fkey
  FOREIGN KEY (user_id, season_id) REFERENCES seasons(user_id, id) ON DELETE SET NULL
  NOT VALID;

ALTER TABLE player_adjustments
  ADD CONSTRAINT player_adjustments_tournament_fkey
  FOREIGN KEY (user_id, tournament_id) REFERENCES tournaments(user_id, id) ON DELETE SET NULL
  NOT VALID;

-- Team players → teams (NO FK to players - intentional for graceful degradation)
-- See supabase-schema.md "Intentionally No Foreign Keys" section
ALTER TABLE team_players
  ADD CONSTRAINT team_players_team_fkey
  FOREIGN KEY (user_id, team_id) REFERENCES teams(user_id, id) ON DELETE CASCADE;

COMMIT;
```

### 2.2.1 Deployment Order (IMPORTANT)

**Deploy client code BEFORE running SQL migration:**

1. **Deploy new client code** - Code should handle both old schema (single PK) and new schema (composite PK) gracefully during transition
2. **Run SQL migration on STAGING first** - Never run directly on production
3. **Verify on staging** - Test with real data scenarios
4. **Run SQL migration on PRODUCTION** - Only after staging verification passes
5. **Verify on production** - Both client and database now use composite keys

**Why this order?**
- If SQL migration runs first, old client code will fail (expects single-column PK)
- New client code can work with old schema (uses user_id from auth context anyway)
- The transition is seamless for users

**Rollback scenario:**
- If issues found after SQL migration, run rollback script (Section 7.1)
- Client code should still work with single-column PKs

### 2.2.2 Staging → Production Deployment Checklist

**⚠️ NEVER run SQL migrations directly on production. Always staging first.**

#### Phase 1: Staging Deployment

| Step | Action | Verification |
|------|--------|--------------|
| 1 | Run `013_composite_primary_keys.sql` on **staging** Supabase | Migration completes without errors |
| 2 | Run `014_update_rpc_for_composite_keys.sql` on **staging** | RPC function updated |
| 3 | Connect app to staging Supabase | App loads without errors |
| 4 | Create test user, add players/games | Data saves correctly |
| 5 | Create second test user, import same backup | Both users have same IDs, no conflict |
| 6 | Verify RLS policies still work | User A cannot see User B's data |

#### Phase 2: Production Deployment

Only proceed after ALL staging verifications pass.

| Step | Action | Verification |
|------|--------|--------------|
| 1 | **Backup production database** | Export via Supabase dashboard |
| 2 | Schedule maintenance window (if needed) | Notify users if app will be briefly unavailable |
| 3 | Run `013_composite_primary_keys.sql` on **production** | Migration completes without errors |
| 4 | Run `014_update_rpc_for_composite_keys.sql` on **production** | RPC function updated |
| 5 | Verify existing users can still access data | Spot-check a few accounts |
| 6 | Monitor error logs for 24 hours | No unexpected errors |

#### Rollback Procedure

If production migration fails:
1. **Do NOT panic** - Data is not lost, only schema changed
2. Run rollback script (Section 7.1) to restore single-column PKs
3. Investigate failure cause on staging
4. Fix and re-test on staging before retrying production

### 2.3 RPC Function Updates

**File:** `supabase/migrations/014_update_rpc_for_composite_keys.sql`

```sql
-- ============================================================================
-- RPC FUNCTION UPDATES FOR COMPOSITE PRIMARY KEYS
-- Updates ON CONFLICT clauses to use composite keys
-- ============================================================================

-- Update save_game_with_relations
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
SET search_path = public, pg_temp
AS $$
DECLARE
  v_game_id text;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_game_id := p_game->>'id';

  -- Verify ownership
  IF EXISTS (SELECT 1 FROM games WHERE id = v_game_id AND user_id != v_user_id) THEN
    RAISE EXCEPTION 'Access denied: game belongs to another user';
  END IF;

  -- Override user_id
  p_game := jsonb_set(p_game, '{user_id}', to_jsonb(v_user_id::text));
  p_game := jsonb_set(p_game, '{updated_at}', to_jsonb(now()));
  IF NOT (p_game ? 'created_at') OR (p_game->>'created_at') IS NULL THEN
    p_game := jsonb_set(p_game, '{created_at}', to_jsonb(now()));
  END IF;

  -- Upsert game - UPDATED: ON CONFLICT uses composite key
  INSERT INTO games SELECT * FROM jsonb_populate_record(null::games, p_game)
  ON CONFLICT (user_id, id) DO UPDATE SET
    team_id = EXCLUDED.team_id,
    season_id = EXCLUDED.season_id,
    tournament_id = EXCLUDED.tournament_id,
    tournament_series_id = EXCLUDED.tournament_series_id,
    tournament_level = EXCLUDED.tournament_level,
    team_name = EXCLUDED.team_name,
    opponent_name = EXCLUDED.opponent_name,
    game_date = EXCLUDED.game_date,
    game_time = EXCLUDED.game_time,
    game_location = EXCLUDED.game_location,
    home_or_away = EXCLUDED.home_or_away,
    age_group = EXCLUDED.age_group,
    number_of_periods = EXCLUDED.number_of_periods,
    period_duration_minutes = EXCLUDED.period_duration_minutes,
    sub_interval_minutes = EXCLUDED.sub_interval_minutes,
    demand_factor = EXCLUDED.demand_factor,
    game_status = EXCLUDED.game_status,
    current_period = EXCLUDED.current_period,
    is_played = EXCLUDED.is_played,
    time_elapsed_in_seconds = EXCLUDED.time_elapsed_in_seconds,
    home_score = EXCLUDED.home_score,
    away_score = EXCLUDED.away_score,
    show_player_names = EXCLUDED.show_player_names,
    game_notes = EXCLUDED.game_notes,
    game_type = EXCLUDED.game_type,
    gender = EXCLUDED.gender,
    league_id = EXCLUDED.league_id,
    custom_league_name = EXCLUDED.custom_league_name,
    game_personnel = EXCLUDED.game_personnel,
    formation_snap_points = EXCLUDED.formation_snap_points,
    updated_at = now();

  -- Delete and re-insert players
  DELETE FROM game_players WHERE game_id = v_game_id AND user_id = v_user_id;
  IF array_length(p_players, 1) > 0 THEN
    INSERT INTO game_players
    SELECT * FROM jsonb_populate_recordset(null::game_players,
      (SELECT jsonb_agg(
        jsonb_set(
          jsonb_set(elem, '{user_id}', to_jsonb(v_user_id::text)),
          '{game_id}', to_jsonb(v_game_id)
        )
      )
      FROM unnest(p_players) elem));
  END IF;

  -- Delete and re-insert events
  DELETE FROM game_events WHERE game_id = v_game_id AND user_id = v_user_id;
  IF array_length(p_events, 1) > 0 THEN
    INSERT INTO game_events
    SELECT * FROM jsonb_populate_recordset(null::game_events,
      (SELECT jsonb_agg(
        jsonb_set(
          jsonb_set(elem, '{user_id}', to_jsonb(v_user_id::text)),
          '{game_id}', to_jsonb(v_game_id)
        )
      )
      FROM unnest(p_events) elem));
  END IF;

  -- Delete and re-insert assessments
  DELETE FROM player_assessments WHERE game_id = v_game_id AND user_id = v_user_id;
  IF array_length(p_assessments, 1) > 0 THEN
    INSERT INTO player_assessments
    SELECT * FROM jsonb_populate_recordset(null::player_assessments,
      (SELECT jsonb_agg(
        jsonb_set(
          jsonb_set(elem, '{user_id}', to_jsonb(v_user_id::text)),
          '{game_id}', to_jsonb(v_game_id)
        )
      )
      FROM unnest(p_assessments) elem));
  END IF;

  -- Upsert tactical data - UPDATED: ON CONFLICT uses composite key
  IF p_tactical_data IS NOT NULL THEN
    p_tactical_data := jsonb_set(
      jsonb_set(p_tactical_data, '{user_id}', to_jsonb(v_user_id::text)),
      '{game_id}', to_jsonb(v_game_id)
    );
    INSERT INTO game_tactical_data SELECT * FROM jsonb_populate_record(null::game_tactical_data, p_tactical_data)
    ON CONFLICT (user_id, game_id) DO UPDATE SET
      opponents = EXCLUDED.opponents,
      drawings = EXCLUDED.drawings,
      tactical_discs = EXCLUDED.tactical_discs,
      tactical_drawings = EXCLUDED.tactical_drawings,
      tactical_ball_position = EXCLUDED.tactical_ball_position,
      completed_interval_durations = EXCLUDED.completed_interval_durations,
      last_sub_confirmation_time_seconds = EXCLUDED.last_sub_confirmation_time_seconds,
      updated_at = now();
  END IF;

END;
$$;

-- Restrict execute to authenticated users only
REVOKE ALL ON FUNCTION save_game_with_relations FROM PUBLIC;
GRANT EXECUTE ON FUNCTION save_game_with_relations TO authenticated;
```

**Other RPC Functions to Check:**

Before deploying, verify no other RPC functions need `ON CONFLICT` updates:

```bash
# Find all RPC functions with ON CONFLICT
grep -r "ON CONFLICT" supabase/migrations/*.sql supabase/functions/**/*.sql
```

Known RPC functions that may need updates:
- `save_game_with_relations` - ✅ Updated above
- Any other upsert RPCs found by the grep

---

## 3. Export/Import

### 3.1 Current Implementation

The existing `src/utils/fullBackup.ts` uses raw storage access:

```typescript
// Current - bypasses DataStore, uses global database
const itemData = await getStorageJSON<unknown>(key);
```

This needs to be updated to use the DataStore interface with userId.

### 3.2 Updated Export

**File:** `src/utils/fullBackup.ts`

```typescript
import { getDataStore } from '@/datastore/factory';

/**
 * Generate backup JSON for a user.
 * @param userId - The authenticated user's ID
 */
export const generateFullBackupJson = async (userId: string): Promise<string> => {
  const store = await getDataStore(userId);

  const backupData: FullBackupData = {
    meta: {
      schema: 2,  // Increment schema version
      exportedAt: new Date().toISOString(),
    },
    data: {
      [SAVED_GAMES_KEY]: await store.getGames(),
      [APP_SETTINGS_KEY]: await store.getSettings(),
      [SEASONS_LIST_KEY]: await store.getSeasons(true),
      [TOURNAMENTS_LIST_KEY]: await store.getTournaments(true),
      [MASTER_ROSTER_KEY]: await store.getPlayers(),
      [PLAYER_ADJUSTMENTS_KEY]: await getAllPlayerAdjustmentsAsIndex(store),
      [TEAMS_INDEX_KEY]: await getTeamsAsIndex(store),
      [TEAM_ROSTERS_KEY]: await store.getAllTeamRosters(),
      [PERSONNEL_KEY]: await getPersonnelAsCollection(store),
      [WARMUP_PLAN_KEY]: await store.getWarmupPlan(),
    },
  };

  return JSON.stringify(backupData, null, 2);
};

/**
 * Export full backup for a user.
 */
export const exportFullBackup = async (
  userId: string,
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void
): Promise<string> => {
  // ... existing download logic, but use generateFullBackupJson(userId)
};
```

### 3.3 Updated Import

```typescript
/**
 * Import backup for a user.
 * @param userId - The authenticated user's ID
 * @param jsonContent - The backup JSON string
 */
export const importFullBackup = async (
  userId: string,
  jsonContent: string,
  // ... other params
): Promise<BackupRestoreResult | null> => {
  const store = await getDataStore(userId);

  // Parse and validate
  const backupData: FullBackupData = JSON.parse(jsonContent);

  // Clear existing data
  await store.clearAllUserData();

  // Import all data using DataStore methods
  if (backupData.data[MASTER_ROSTER_KEY]) {
    for (const player of backupData.data[MASTER_ROSTER_KEY]) {
      await store.upsertPlayer(player);
    }
  }
  // ... other entities

  return result;
};
```

**Note:** The `clearAllUserData()` method already exists in the DataStore interface (line 595). The LocalDataStore implementation:
```typescript
async clearAllUserData(): Promise<void> {
  const keys = [
    MASTER_ROSTER_KEY, SAVED_GAMES_KEY, SEASONS_LIST_KEY,
    TOURNAMENTS_LIST_KEY, TEAMS_INDEX_KEY, TEAM_ROSTERS_KEY,
    PERSONNEL_KEY, WARMUP_PLAN_KEY, APP_SETTINGS_KEY,
    PLAYER_ADJUSTMENTS_KEY
  ];
  for (const key of keys) {
    await this.adapter?.removeItem(key);
  }
}
```

### 3.4 Why This Works

With composite primary keys `(user_id, id)`:

```
User A has: (user_A, player_123)
User B imports same backup
User B gets: (user_B, player_123)  ← Different composite key!
```

No conflict because the full key is different.

---

## 4. Legacy Migration

### 4.1 Migrating from Global Database

For existing users with data in the old `MatchOpsLocal` database:

```typescript
async function migrateLegacyData(userId: string): Promise<MigrationResult> {
  const legacyDbName = 'MatchOpsLocal';  // Current global database name

  // Check if legacy database exists and has data
  const legacyAdapter = new IndexedDBKvAdapter({ dbName: legacyDbName });
  const hasLegacyData = await checkLegacyHasData(legacyAdapter);

  if (!hasLegacyData) {
    return { status: 'no_legacy_data' };
  }

  // Check if user already has data (idempotent - safe to re-run)
  const userStore = await getDataStore(userId);
  const hasUserData = (await userStore.getPlayers()).length > 0;
  if (hasUserData) {
    return { status: 'already_migrated' };
  }

  // Read from legacy database
  const legacyData = await readAllFromLegacy(legacyAdapter);
  await legacyAdapter.close();

  // Write to user's database
  await importAllData(userStore, legacyData);

  return { status: 'migrated', entityCount: countEntities(legacyData) };
}
```

### 4.2 Migration Trigger

**When to call migration:** In `AuthProvider.tsx` after successful sign-in:

```typescript
// In AuthProvider.tsx, after auth state confirms user is signed in
useEffect(() => {
  async function handleAuthStateChange() {
    if (user?.id && isAuthenticated) {
      // Check and run legacy migration on first sign-in after upgrade
      const result = await migrateLegacyData(user.id);

      if (result.status === 'migrated') {
        // Show success toast
        showToast(`Migrated ${result.entityCount} items to your account`);
      }
      // 'no_legacy_data' and 'already_migrated' are silent - no action needed
    }
  }
  handleAuthStateChange();
}, [user?.id, isAuthenticated]);
```

**Migration UI states:**
- `no_legacy_data` → Silent, proceed to app
- `already_migrated` → Silent, proceed to app (user can manually import from backup if needed)
- `migrated` → Show success toast with count

### 4.3 Error Recovery

The migration is **idempotent** - safe to re-run if interrupted:

1. **Check before migrate**: If user already has data, skip migration
2. **Uses upsert operations**: Writing same data twice doesn't create duplicates
3. **Legacy data preserved**: Original `MatchOpsLocal` database is NOT deleted until migration confirmed successful

**Recovery flow if migration fails midway:**
1. User signs in again
2. `hasUserData` check returns true (partial migration detected as "already_migrated")
3. Migration is skipped (user already has some data)
4. User can manually import from backup file if data is incomplete

**Post-migration cleanup** (only after confirmed success):
```typescript
async function cleanupLegacyDatabase(): Promise<void> {
  // Only call this after user confirms migration worked!
  const request = indexedDB.deleteDatabase('MatchOpsLocal');
  // ... handle success/error
}
```

### 4.4 Legacy Migration Troubleshooting

**How do I know if migration succeeded?**

| Notification | Meaning |
|--------------|---------|
| Toast: "Your data has been migrated to your account (X items)" | ✅ Success - all data migrated |
| No notification (silent) | Already migrated OR no legacy data found |
| Toast: "Could not migrate your data..." | ❌ Error occurred |

**What if migration fails?**

1. **Automatic retry**: The app will retry on next sign-in (the error flag is reset)
2. **Data is safe**: Your original data remains in the legacy `MatchOpsLocal` database (non-destructive)
3. **Contact support**: If error persists after multiple sign-ins

**What if migration only partially completed?**

If the migration fails midway (e.g., players migrated but games failed):
- The app detects existing data and skips further migration attempts
- You may have incomplete data in your new user database
- **Recovery option**: Export a backup from the legacy database (before signing in) and import it manually

**Technical note**: The migration does NOT rollback on failure. This is intentional - partial data is better than no data, and the user can always manually import a complete backup.

### 4.5 Partial Migration Recovery FAQ

**Q: Migration failed - how do I know what was migrated?**

A: Check your roster (Players tab). If you see players, they migrated successfully. Entity types are migrated in this order: players → seasons → tournaments → teams → personnel → games → adjustments → warmup plan → settings. If migration fails at "games", you'll have players/seasons/tournaments but no games. Contact support with the error toast timestamp for detailed assistance.

**Q: Can I re-run the migration?**

A: No - once you have any data, the migration detects "user already has data" and skips. To re-migrate, you would need to clear your user data first (not recommended). Instead, export a backup from the legacy database and import it manually.

**Q: My legacy data is still there after migration - is that normal?**

A: Yes! The migration is non-destructive. Your legacy `MatchOpsLocal` database is preserved until you manually delete it. This allows you to verify the migration worked before cleaning up.

---

## 5. Data Management Operations

This section covers all data management scenarios users need:

### 5.1 Overview of Data Locations

| Location | Description | Managed By |
|----------|-------------|------------|
| **Local IndexedDB** | `matchops_user_{userId}` database | LocalDataStore |
| **Cloud (Supabase)** | PostgreSQL with RLS per user | SupabaseDataStore |

### 5.2 GDPR Data Export (Cloud)

**Requirement**: Users MUST be able to download their cloud data even without an active subscription.

This is already partially covered by the export/import functionality. The key requirement:

```typescript
// In cloud mode, export should work regardless of subscription status
export const exportCloudData = async (userId: string): Promise<string> => {
  // SupabaseDataStore.getGames(), getPlayers(), etc. should NOT check subscription
  // Subscription only gates SYNC functionality, not data access
  const store = await getDataStore(userId);  // Works in cloud mode
  return generateFullBackupJson(userId);
};
```

**UI Location**: Settings → Data Management → "Download My Data"

**Implementation Note**: The existing `SupabaseDataStore` read methods (getGames, getPlayers, etc.) should NOT check subscription status. RLS policies ensure users can only read their own data. Subscription checks only apply to:
- Enabling sync
- Writing new data to cloud (optional - may allow writes without subscription)

### 5.3 Delete Local Data Only

**Requirement**: Users can clear local data without affecting cloud data.

```typescript
// src/datastore/LocalDataStore.ts - clearAllUserData() already exists
// This clears the user's IndexedDB database

async function deleteLocalDataOnly(userId: string): Promise<void> {
  const localStore = new LocalDataStore(userId);
  await localStore.initialize();
  await localStore.clearAllUserData();
  await localStore.close();

  // Optionally delete the entire IndexedDB database
  const dbName = getUserDatabaseName(userId);
  await indexedDB.deleteDatabase(dbName);
}
```

**UI Location**: Settings → Data Management → "Clear Local Data"

**Warning to show**: "This will delete all data stored on this device. Your cloud data (if any) will not be affected."

### 5.4 Delete Cloud Data Only

**Requirement**: Users can clear cloud data without affecting local data.

```typescript
// Uses existing SupabaseDataStore.clearAllUserData()
async function deleteCloudDataOnly(userId: string): Promise<void> {
  const supabaseStore = new SupabaseDataStore();
  await supabaseStore.initialize();
  await supabaseStore.clearAllUserData();  // Calls clear_all_user_data RPC
}
```

**UI Location**: Settings → Data Management → "Clear Cloud Data"

**Warning to show**: "This will delete all data stored in the cloud. Your local data will not be affected. You can re-sync from local data later."

### 5.5 Delete Account (Cloud + Auth)

**Requirement**: Users can delete their entire cloud account (GDPR "right to be forgotten").

This already exists via the `delete-account` Edge Function:
1. Calls `clear_all_user_data` RPC (deletes all user data)
2. Calls `auth.admin.deleteUser()` (deletes auth account)

```typescript
// Uses existing AuthService.deleteAccount()
async function deleteAccount(userId: string): Promise<void> {
  // Delete cloud account and data via Edge Function
  await authService.deleteAccount();

  // Also clear local data
  await closeDataStore();
  await closeUserStorageAdapter();

  // Delete local IndexedDB
  const dbName = getUserDatabaseName(userId);
  await indexedDB.deleteDatabase(dbName);
}
```

**UI Location**: Settings → Account → "Delete Account"

**Warnings to show**:
1. "This will permanently delete your account and ALL data (local and cloud)."
2. "This action cannot be undone."
3. Require typing "DELETE" to confirm.

**Note**: Consent records are retained for GDPR compliance (legal requirement).

### 5.6 User Switching Summary

| Action | Local Data | Cloud Data | Auth |
|--------|-----------|------------|------|
| Sign out → Sign in as different user | Switches to new user's IndexedDB | Switches to new user's RLS scope | New session |
| Clear local data | Deleted | Unchanged | Unchanged |
| Clear cloud data | Unchanged | Deleted | Unchanged |
| Delete account | Deleted | Deleted | Deleted |

### 5.7 Data Management UI Requirements

Settings page should have a "Data Management" section with:

- [ ] **Export Data** - Download all data as JSON (works in both modes)
- [ ] **Import Data** - Restore from backup file
- [ ] **Clear Local Data** - Delete IndexedDB data only
- [ ] **Clear Cloud Data** - Delete Supabase data only (cloud mode)
- [ ] **Delete Account** - Full account deletion (cloud mode)

Each destructive action needs:
- Clear warning message
- Confirmation dialog
- Loading state during operation
- Success/error feedback

---

## 6. Testing

### 6.1 Test Updates Required

The signature changes will break existing tests. Key updates needed:

**Files with test updates:**

| Test File | Changes Needed |
|-----------|----------------|
| `src/datastore/factory.test.ts` | Pass userId to getDataStore() |
| `src/datastore/LocalDataStore.test.ts` | Pass userId to constructor |
| `src/datastore/__tests__/SyncedDataStore.test.ts` | Pass userId to constructor |
| `src/utils/fullBackup.test.ts` | Pass userId to export/import |
| All React component tests | Mock useAuth to provide userId |

**Test helper pattern:**

```typescript
// tests/helpers/testDataStore.ts
const TEST_USER_ID = 'test-user-123';

export async function getTestDataStore(): Promise<DataStore> {
  return getDataStore(TEST_USER_ID);
}

export function mockAuthContext() {
  return {
    user: { id: TEST_USER_ID, email: 'test@example.com' },
    isAuthenticated: true,
  };
}
```

### 6.2 Local Storage Tests

- [ ] User A data isolated from User B
- [ ] Sign-out closes database
- [ ] Sign-in opens correct database
- [ ] Legacy migration works

### 6.3 Cloud Storage Tests

- [ ] Composite key migration runs without errors
- [ ] User A can have `player_123`
- [ ] User B can also have `player_123`
- [ ] Foreign key constraints still work
- [ ] RLS policies still work

### 6.4 Export/Import Tests

- [ ] Export produces valid JSON
- [ ] Import restores all data
- [ ] Backup from User A can be imported by User B
- [ ] Cloud sync works after import

### 6.5 Data Management Tests

- [ ] GDPR export works without subscription
- [ ] Clear local data only works (cloud unaffected)
- [ ] Clear cloud data only works (local unaffected)
- [ ] Delete account removes all cloud data + auth
- [ ] Delete account clears local data

---

## 7. Rollback Plan

### 7.1 Database Migration Rollback

If composite key migration fails:

```sql
-- Reverse the migration (restore single-column PKs)
-- Keep this script ready but hopefully never needed

BEGIN;

-- Drop composite FKs
ALTER TABLE game_events DROP CONSTRAINT IF EXISTS game_events_game_fkey;
ALTER TABLE game_players DROP CONSTRAINT IF EXISTS game_players_game_fkey;
ALTER TABLE game_tactical_data DROP CONSTRAINT IF EXISTS game_tactical_data_game_fkey;
ALTER TABLE player_assessments DROP CONSTRAINT IF EXISTS player_assessments_game_fkey;
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_season_fkey;
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_tournament_fkey;
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_team_fkey;
ALTER TABLE player_adjustments DROP CONSTRAINT IF EXISTS player_adjustments_season_fkey;
ALTER TABLE player_adjustments DROP CONSTRAINT IF EXISTS player_adjustments_tournament_fkey;
ALTER TABLE team_players DROP CONSTRAINT IF EXISTS team_players_team_fkey;

-- Drop composite PKs
-- NOTE: user_consents is NOT included - it was not migrated (nullable user_id for GDPR)
ALTER TABLE players DROP CONSTRAINT IF EXISTS players_pkey;
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_pkey;
ALTER TABLE seasons DROP CONSTRAINT IF EXISTS seasons_pkey;
ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_pkey;
ALTER TABLE personnel DROP CONSTRAINT IF EXISTS personnel_pkey;
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_pkey;
ALTER TABLE game_events DROP CONSTRAINT IF EXISTS game_events_pkey;
ALTER TABLE game_players DROP CONSTRAINT IF EXISTS game_players_pkey;
ALTER TABLE game_tactical_data DROP CONSTRAINT IF EXISTS game_tactical_data_pkey;
ALTER TABLE player_assessments DROP CONSTRAINT IF EXISTS player_assessments_pkey;
ALTER TABLE player_adjustments DROP CONSTRAINT IF EXISTS player_adjustments_pkey;
ALTER TABLE warmup_plans DROP CONSTRAINT IF EXISTS warmup_plans_pkey;
ALTER TABLE team_players DROP CONSTRAINT IF EXISTS team_players_pkey;

-- Restore single-column PKs
ALTER TABLE players ADD PRIMARY KEY (id);
ALTER TABLE teams ADD PRIMARY KEY (id);
ALTER TABLE seasons ADD PRIMARY KEY (id);
ALTER TABLE tournaments ADD PRIMARY KEY (id);
ALTER TABLE personnel ADD PRIMARY KEY (id);
ALTER TABLE games ADD PRIMARY KEY (id);
ALTER TABLE game_events ADD PRIMARY KEY (id);
ALTER TABLE game_players ADD PRIMARY KEY (id);
ALTER TABLE game_tactical_data ADD PRIMARY KEY (game_id);
ALTER TABLE player_assessments ADD PRIMARY KEY (id);
ALTER TABLE player_adjustments ADD PRIMARY KEY (id);
ALTER TABLE warmup_plans ADD PRIMARY KEY (id);
ALTER TABLE team_players ADD PRIMARY KEY (id);

-- Restore single-column FKs
ALTER TABLE game_events ADD CONSTRAINT game_events_game_id_fkey
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;
ALTER TABLE game_players ADD CONSTRAINT game_players_game_id_fkey
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;
ALTER TABLE game_tactical_data ADD CONSTRAINT game_tactical_data_game_id_fkey
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;
ALTER TABLE player_assessments ADD CONSTRAINT player_assessments_game_id_fkey
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;
ALTER TABLE games ADD CONSTRAINT games_season_id_fkey
  FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE SET NULL;
ALTER TABLE games ADD CONSTRAINT games_tournament_id_fkey
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE SET NULL;
ALTER TABLE games ADD CONSTRAINT games_team_id_fkey
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE player_adjustments ADD CONSTRAINT player_adjustments_season_id_fkey
  FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE SET NULL;
ALTER TABLE player_adjustments ADD CONSTRAINT player_adjustments_tournament_id_fkey
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE SET NULL;
ALTER TABLE team_players ADD CONSTRAINT team_players_team_id_fkey
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
-- NOTE: No FK for player_id - intentional for graceful degradation

COMMIT;
```

---

## 8. Manual Verification Checklist

Use your existing backup files to verify the implementation works correctly.

### 8.1 Prerequisites

- [ ] Have at least one backup file from the current system
- [ ] Have access to two different user accounts (User A and User B)
- [ ] Have access to Supabase dashboard (for cloud verification)

### 8.2 Test 1: Basic Import Works

**Goal**: Verify backup import still works after changes.

1. Sign in as User A
2. Import your backup file
3. Verify all data is present:
   - [ ] Players appear in roster
   - [ ] Games appear in saved games list
   - [ ] Seasons appear in season selector
   - [ ] Tournaments appear in tournament selector
   - [ ] Teams appear in team selector
   - [ ] Personnel appear in personnel list
   - [ ] Settings are restored

### 8.3 Test 2: User Isolation (Local Mode)

**Goal**: Verify User A's data is isolated from User B locally.

1. Sign in as User A
2. Import your backup file → verify data appears
3. Sign out
4. Sign in as User B (different account)
5. [ ] Verify User B sees empty state (no players, no games, etc.)
6. Import the SAME backup file as User B
7. [ ] Verify User B now has the data
8. Sign out
9. Sign back in as User A
10. [ ] Verify User A's data is still intact and unchanged

### 8.4 Test 3: Export/Import Round-Trip

**Goal**: Verify export produces equivalent data to import.

1. Sign in as User A
2. Import your original backup file
3. Export backup from User A → save as `backup_from_A.json`
4. Compare files:
   - [ ] Both have same number of players
   - [ ] Both have same number of games
   - [ ] Both have same number of seasons/tournaments/teams
   - [ ] Game details match (scores, events, player positions)

### 8.5 Test 4: Cloud Sync with Composite Keys

**Goal**: Verify cloud sync works and data syncs across devices.

1. Sign in as User A in **cloud mode**
2. Import backup file
3. [ ] Verify sync indicator shows "synced" (not "syncing" indefinitely)
4. Open different browser or browser profile (avoid incognito - IndexedDB restrictions)
5. Sign in as User A in cloud mode
6. [ ] Verify all data appears (players, games, etc.)
7. Make a change on Device 1 (e.g., add a player)
8. [ ] Verify change appears on Device 2

### 8.6 Test 5: Two Users, Same IDs in Cloud

**Goal**: Verify composite keys allow same entity IDs for different users.

1. User A imports backup → syncs to cloud
2. User B imports SAME backup → syncs to cloud
3. Verify in Supabase dashboard:
   - [ ] `players` table has rows for both `user_A` and `user_B`
   - [ ] Same `id` values exist for both users (e.g., `player_123` for both)
   - [ ] No constraint violations
4. [ ] User A can still access all their data
5. [ ] User B can still access all their data

### 8.7 Test 6: Legacy Migration (First-Time User)

**Goal**: Verify existing data in old database migrates correctly.

**Setup** (simulate legacy state):
1. Temporarily revert to old code OR manually populate `MatchOpsLocal` database

**Test**:
1. Sign in as User A (first time after upgrade)
2. [ ] Legacy migration prompt appears
3. Accept migration
4. [ ] All data transfers to user-scoped database
5. [ ] Verify data is complete (players, games, etc.)

### 8.8 Test 7: Mode Switching

**Goal**: Verify switching between local and cloud modes works.

1. Sign in as User A in local mode
2. Import backup file
3. Switch to cloud mode (enable sync)
4. [ ] Data uploads to cloud successfully
5. Switch back to local mode
6. [ ] Data still accessible locally
7. Switch to cloud mode again
8. [ ] Data still in sync

### 8.9 Test 8: Data Management Operations

**Goal**: Verify all data management operations work correctly.

**Test 8a: GDPR Export Without Subscription**
1. Sign in as User A in cloud mode (no active subscription)
2. Add some data (players, games)
3. Navigate to Settings → Data Management → "Download My Data"
4. [ ] Export succeeds (should NOT require subscription)
5. [ ] Downloaded file contains all data

**Test 8b: Clear Local Data Only**
1. Sign in as User A in cloud mode
2. Add data, let it sync to cloud
3. Navigate to Settings → Data Management → "Clear Local Data"
4. Confirm deletion
5. [ ] Local data is gone (verify in DevTools IndexedDB)
6. [ ] Cloud data still exists (check Supabase dashboard)
7. Refresh page
8. [ ] Data re-syncs from cloud

**Test 8c: Clear Cloud Data Only**
1. Sign in as User A in cloud mode
2. Add data locally
3. Navigate to Settings → Data Management → "Clear Cloud Data"
4. Confirm deletion
5. [ ] Cloud data is deleted (check Supabase dashboard)
6. [ ] Local data still exists
7. [ ] Can re-sync local data to cloud

**Test 8d: Delete Account**
1. Sign in as User A in cloud mode
2. Add data
3. Navigate to Settings → Account → "Delete Account"
4. Type "DELETE" to confirm
5. [ ] Cloud data is deleted
6. [ ] Auth account is deleted
7. [ ] Local data is cleared
8. [ ] User is signed out
9. [ ] Cannot sign in with same credentials

### 8.10 Verification Commands

**Check IndexedDB databases in browser DevTools:**
```javascript
// List all IndexedDB databases
const databases = await indexedDB.databases();
console.log(databases);
// Should show: matchops_user_{userId} for each signed-in user
```

**Check Supabase for composite key data:**
```sql
-- Verify players for multiple users
SELECT user_id, id, name FROM players ORDER BY user_id, id;

-- Verify same ID exists for different users
SELECT user_id, id FROM players WHERE id = 'some-player-id';
```

---

## Appendix A: File Changes Summary

| File | Change |
|------|--------|
| `src/datastore/userDatabase.ts` | New file (~15 lines) |
| `src/datastore/LocalDataStore.ts` | Add userId constructor, use adapter (~50 lines changed) |
| `src/datastore/SyncedDataStore.ts` | Pass userId to LocalDataStore (~10 lines changed) |
| `src/datastore/factory.ts` | User-aware factory, track userId (~50 lines changed) |
| `src/utils/storage.ts` | Add user-scoped adapter functions (~40 lines) |
| `src/utils/storageFactory.ts` | Add createUserAdapter method (~15 lines) |
| `src/utils/fullBackup.ts` | Use DataStore instead of raw storage (~50 lines changed) |
| `src/hooks/useDataStore.ts` | New helper hook (~20 lines) |
| `src/utils/masterRoster.ts` | Pass userId to getDataStore (~10 lines) |
| `src/utils/seasons.ts` | Pass userId to getDataStore (~10 lines) |
| `src/utils/tournaments.ts` | Pass userId to getDataStore (~10 lines) |
| `src/utils/teams.ts` | Pass userId to getDataStore (~10 lines) |
| `src/utils/savedGames.ts` | Pass userId to getDataStore (~10 lines) |
| ... ~26 more utility files | Pass userId to getDataStore (~5-10 lines each) |
| `supabase/migrations/013_composite_primary_keys.sql` | New migration (~100 lines) |
| `supabase/migrations/014_update_rpc_for_composite_keys.sql` | RPC updates (~80 lines) |
| Test files | Update to pass userId (~100 lines total) |
| Data management UI | Settings page section (~150 lines) |

**Total: ~810 lines of changes**

---

## Appendix B: Security Considerations

| Aspect | Implementation |
|--------|----------------|
| Local isolation | Per-user IndexedDB databases |
| Cloud isolation | Composite PK + RLS policies |
| Backup anonymity | No user ID in backup file |

This is industry-standard multi-tenant architecture used by Salesforce, Stripe, and most SaaS platforms.

### For Security-Conscious Deployments

**Timing Attack Mitigation (Optional)**

The `legacyDatabaseExists()` function supports a `constantTime` option that ensures consistent response time regardless of whether the database exists:

```typescript
// Standard usage (fine for most apps)
const exists = await legacyDatabaseExists();

// For paranoid deployments - prevents timing side-channel
const exists = await legacyDatabaseExists({ constantTime: true });
```

**When to use `constantTime: true`:**
- High-security environments where database existence could be sensitive
- Applications subject to security audits that flag timing differences
- If you're unsure, the default (false) is appropriate for most use cases

**Note:** This is for migration detection only. The timing difference reveals only whether a user has previously used the app (the legacy database exists), which is generally not sensitive information.

---

## Appendix C: Implementation Order

Recommended implementation order to minimize risk:

1. **Storage layer changes** - Add new functions, don't remove old ones yet
2. **LocalDataStore + factory** - Core change
3. **SyncedDataStore** - Depends on LocalDataStore
4. **Update callers** - Update all 36+ files
5. **Export/import** - Update fullBackup.ts
6. **SQL migration** - Deploy to Supabase
7. **RPC updates** - Deploy to Supabase
8. **Legacy migration** - Handle existing users
9. **Data management UI** - Settings page with export/delete options
10. **Remove old code** - Clean up unused global storage functions

## Appendix D: Requirements Checklist

Summary of all user requirements this plan addresses:

| Requirement | Section | Status |
|-------------|---------|--------|
| User switching (local isolation) | 1.1-1.8 | ✅ Covered |
| User switching (cloud isolation) | 2.1-2.3 | ✅ Covered |
| Export all game data | 3.2 | ✅ Covered |
| Import all game data | 3.3 | ✅ Covered |
| GDPR data export (no subscription) | 5.2 | ✅ Covered |
| Delete local data only | 5.3 | ✅ Covered |
| Delete cloud data only | 5.4 | ✅ Covered |
| Delete account (all data + auth) | 5.5 | ✅ Covered |
| Backup sharing between users | 3.4 | ✅ Covered |
| Legacy data migration | 4.1-4.2 | ✅ Covered |
