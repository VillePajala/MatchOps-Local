# Auth, Data & Sync: Runtime Architecture

**Last Updated**: 2026-02-01
**Status**: Active reference document
**Purpose**: Detailed documentation of how authentication, data storage, and sync actually work at runtime

This document complements the high-level [Architecture](../architecture.md) and [Dual-Backend Architecture](./dual-backend-architecture.md) docs with implementation details discovered during debugging sessions.

---

## Table of Contents

1. [Core Principles](#core-principles)
2. [Authentication System](#authentication-system)
3. [DataStore Architecture](#datastore-architecture)
4. [User-Scoped Storage](#user-scoped-storage)
5. [Factory Pattern](#factory-pattern)
6. [Local-First Sync System](#local-first-sync-system)
7. [Migration Services](#migration-services)
8. [User Journeys](#user-journeys)
9. [Data Flow Diagrams](#data-flow-diagrams)
10. [Known Issues & Gotchas](#known-issues--gotchas)
11. [Debugging Guide](#debugging-guide)

---

## Core Principles

### 1. Authentication ≠ Sync Mode (Issue #336)

**Authentication and data sync are independent concepts:**

| Concept | What It Means | When It Happens |
|---------|---------------|-----------------|
| **Authentication** | User has a Supabase account and valid session | User signs in |
| **Cloud Mode** | Data operations go to Supabase PostgreSQL | User enables sync + has subscription |
| **Local Mode** | Data operations go to IndexedDB | Default, or sync disabled |

A user can be **authenticated** (signed in) while still in **local mode**. This allows:
- Free accounts ready for upgrade
- Support tickets tied to accounts
- Smooth transition when user subscribes

### 2. Local-First Philosophy

**All writes are instant, sync happens in background:**

```
User Action → LocalDataStore (IndexedDB) → Return immediately
                      ↓
              SyncQueue (background)
                      ↓
              SupabaseDataStore (cloud)
```

The user never waits for network. If offline, operations queue until online.

### 3. User-Scoped Storage

**Each user gets their own IndexedDB database:**

| Storage | Database Name | When Used |
|---------|---------------|-----------|
| User-scoped | `matchops_user_{userId}` | Authenticated user |
| Legacy/Anonymous | `MatchOpsLocal` | No userId provided |
| Sync Queue | `matchops_sync_queue_{userId}` | Per-user sync operations |

---

## Authentication System

### Components

| Component | File | Purpose |
|-----------|------|---------|
| AuthService Interface | `src/interfaces/AuthService.ts` | Backend-agnostic auth contract |
| LocalAuthService | `src/auth/LocalAuthService.ts` | No-op for local mode |
| SupabaseAuthService | `src/auth/SupabaseAuthService.ts` | Full Supabase Auth |
| AuthProvider | `src/contexts/AuthProvider.tsx` | React context for auth state |

### SupabaseAuthService Implementation

**Key Features:**
- Email/password authentication (no magic links in current implementation)
- Rate limiting: 5 sign-in attempts, exponential backoff
- Session validation on init (prevents stale sessions)
- GDPR consent tracking via RPC
- Account deletion via Edge Function

**Initialization:**
```typescript
// SupabaseAuthService.initialize()
1. Get Supabase client singleton
2. Check for existing session via getSession()
3. Validate session by calling getUser() (catches revoked tokens)
4. Subscribe to onAuthStateChange for future updates
```

### AuthProvider Event Handling

**Session Lock Mechanism** (prevents spurious sign-out loops):

```typescript
// In onAuthStateChange callback
const hasSignedInThisSessionRef = useRef(false);

// When user signs in:
hasSignedInThisSessionRef.current = true;

// When SIGNED_OUT event received:
if (hasSignedInThisSessionRef.current && event === 'SIGNED_OUT') {
  // Likely spurious event from Supabase - IGNORE
  logger.warn('Ignoring spurious sign-out event');
  return;
}
```

**Why This Exists:**
Supabase can emit unexpected `SIGNED_OUT` events due to:
- Token refresh timing
- Tab visibility changes
- Network reconnection
- Browser storage events

The session lock ensures users don't get logged out unexpectedly during active sessions.

### Auth State Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      App Mount                                    │
├─────────────────────────────────────────────────────────────────┤
│ 1. AuthProvider useEffect runs                                   │
│    ├─ getAuthService() → based on isCloudAvailable()            │
│    ├─ If cloud available: SupabaseAuthService                    │
│    └─ Else: LocalAuthService                                     │
│                                                                   │
│ 2. authService.getSession()                                      │
│    ├─ Load session from localStorage                             │
│    └─ Validate via getUser() call                                │
│                                                                   │
│ 3. Subscribe to onAuthStateChange                                │
│    ├─ Filter unknown events                                      │
│    ├─ Session lock prevents spurious sign-outs                   │
│    └─ Update React state on valid events                         │
│                                                                   │
│ 4. Set isLoading = false (triggers UI render)                    │
│    ├─ Timeout after 10s if auth hangs                            │
│    └─ Clear DataStore caches on user change                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## DataStore Architecture

### Three Implementations

```
┌────────────────────────────────────────────────────────────────┐
│                    DataStore Interface                          │
│     60+ methods: getPlayers, saveGame, getSeasons, etc.        │
└──────────────────────────┬─────────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ LocalDataStore  │ │SupabaseDataStore│ │ SyncedDataStore │
│   (IndexedDB)   │ │  (PostgreSQL)   │ │  (Local-First)  │
└─────────────────┘ └─────────────────┘ └────────┬────────┘
                                                  │
                                    Wraps LocalDataStore
                                    Queues to SyncEngine
```

### LocalDataStore

**File:** `src/datastore/LocalDataStore.ts`

**Characteristics:**
- Direct IndexedDB access via storage.ts utilities
- User-scoped when userId provided to constructor
- Validates all entities on write
- Cascade deletes for personnel (removes from all games)
- Lock-based atomicity via `withKeyLock()`

**Constructor:**
```typescript
constructor(userId?: string) {
  this.userId = userId;
  // Storage adapter determined by getUserStorageAdapter(userId)
}
```

### SupabaseDataStore

**File:** `src/datastore/SupabaseDataStore.ts`

**Characteristics:**
- Full PostgreSQL via Supabase client
- Transforms between app types and DB rows
- RPC-based multi-table operations
- Retry logic for transient errors
- **Not used directly** - always wrapped by SyncedDataStore in cloud mode

**Key Transforms (see CLAUDE.md for all 19 rules):**
- Empty string ↔ NULL for optional fields
- Array index → order_index for events
- Nested objects → separate tables (assessments, players)

### SyncedDataStore

**File:** `src/datastore/SyncedDataStore.ts`

**The cloud mode implementation - provides local-first sync:**

```typescript
class SyncedDataStore implements DataStore {
  private localStore: LocalDataStore;
  private syncQueue: SyncQueue;
  private syncEngine: SyncEngine;

  async updatePlayer(id: string, updates: Partial<Player>): Promise<Player> {
    // 1. Update local immediately
    const result = await this.localStore.updatePlayer(id, updates);

    // 2. Queue for cloud sync (background)
    await this.syncQueue.enqueue({
      type: 'update',
      entity: 'player',
      id,
      data: updates,
    });

    // 3. Return instantly (user doesn't wait for network)
    return result;
  }
}
```

**Lifecycle:**
```typescript
const syncedStore = new SyncedDataStore(userId);
await syncedStore.initialize();  // Init local + queue
syncedStore.startSync();         // Start engine (may be idle)
syncedStore.setExecutor(executor); // Enable actual cloud sync
```

---

## User-Scoped Storage

### Database Naming Convention

| User State | IndexedDB Database | Sync Queue Database |
|------------|-------------------|---------------------|
| Authenticated | `matchops_user_{userId}` | `matchops_sync_queue_{userId}` |
| Anonymous/Legacy | `MatchOpsLocal` | N/A (no sync) |

### How It Works

**In factory.ts:**
```typescript
async function getDataStore(userId?: string): Promise<DataStore> {
  const mode = getBackendMode();
  // Cloud sync only when user explicitly chose cloud mode, cloud is available, and authenticated
  const shouldUseCloudSync = mode === 'cloud' && isCloudAvailable() && !!userId;
  if (shouldUseCloudSync) {
    const syncedStore = new SyncedDataStore(userId);
    // SyncedDataStore passes userId to LocalDataStore
    // LocalDataStore uses matchops_user_{userId} database
  }
}
```

**In LocalDataStore:**
```typescript
constructor(userId?: string) {
  this.userId = userId;
}

private async getStorageAdapter() {
  return getUserStorageAdapter(this.userId);
  // Returns adapter for matchops_user_{userId} or MatchOpsLocal
}
```

### Security Note

**userId MUST come from Supabase Auth, never user input:**
```typescript
// CORRECT:
const { user } = useAuth();
const store = await getDataStore(user?.id);

// WRONG - security vulnerability:
const store = await getDataStore(urlParams.userId);
```

---

## Factory Pattern

### File: `src/datastore/factory.ts`

### Singleton Management

```typescript
let dataStoreInstance: DataStore | null = null;
let authServiceInstance: AuthService | null = null;
let dataStoreCreatedForUserId: string | undefined;
let dataStoreCreatedForMode: 'local' | 'cloud' | undefined;
```

### Automatic Reset Triggers

The factory automatically resets the DataStore when:

1. **User changes:** `dataStoreCreatedForUserId !== userId`
2. **Mode changes:** `dataStoreCreatedForMode !== currentMode`

```typescript
// User change detection
if (dataStoreCreatedForUserId !== undefined &&
    dataStoreCreatedForUserId !== userId) {
  logger.info('[factory] User changed, resetting DataStore');
  await closeDataStore({ force: true });
}
```

### Race Condition Prevention

**Problem:** Multiple components may call `getDataStore()` simultaneously during auth changes.

**Solution 1: Global Serialization Lock**
```typescript
let initializationPromise: Promise<DataStore> | null = null;

async function getDataStore(userId?: string): Promise<DataStore> {
  // Only one initialization at a time
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = actuallyInitialize(userId);
  try {
    return await initializationPromise;
  } finally {
    initializationPromise = null;
  }
}
```

**Solution 2: Per-userId Promise Tracking**
```typescript
const dataStoreInitPromises = new Map<string, Promise<DataStore>>();

// Concurrent calls with same userId share the same promise
const existingPromise = dataStoreInitPromises.get(userId);
if (existingPromise) {
  return existingPromise;
}
```

**Solution 3: Conflict Detection**
```typescript
// After async work, verify userId hasn't changed
if (dataStoreCreatedForUserId !== initUserId) {
  throw new Error('Concurrent initialization conflict');
}
```

### Cloud Mode Initialization

```typescript
if (shouldUseCloudSync) {
  // 1. Create SyncedDataStore (wraps LocalDataStore)
  const syncedStore = new SyncedDataStore(userId);
  await syncedStore.initialize();

  // 2. Start sync engine (may be idle without executor)
  syncedStore.startSync();

  // 3. Background: Set up cloud connection
  setupCloudInBackground().catch(err => {
    // Logged but doesn't crash app
    // App works in local-only mode
  });

  instance = syncedStore;
}

async function setupCloudInBackground() {
  const cloudStore = new SupabaseDataStore();
  await cloudStore.initialize();
  const executor = createSyncExecutor(cloudStore, syncedStore.localStore);
  syncedStore.setExecutor(executor);
  // Now queue starts processing
}
```

### AuthService Management

**Key Principle:** AuthService is based on cloud **availability**, not mode.

```typescript
async function getAuthService(): Promise<AuthService> {
  // NOT based on current mode
  // Based on whether Supabase is configured
  if (isCloudAvailable()) {
    return new SupabaseAuthService();
  }
  return new LocalAuthService();
}
```

This allows users to sign in while in local mode.

---

## Local-First Sync System

### Components

| Component | File | Purpose |
|-----------|------|---------|
| SyncQueue | `src/sync/SyncQueue.ts` | Persistent queue in IndexedDB |
| SyncEngine | `src/sync/SyncEngine.ts` | Background processor |
| SyncExecutor | `src/sync/createSyncExecutor.ts` | Actually runs sync operations |
| ConflictResolver | `src/sync/conflictResolution.ts` | Handles conflicts |

### SyncQueue

**Database:** `matchops_sync_queue_{userId}`

**Operation Lifecycle:**
```
pending → syncing → completed/failed
```

**Deduplication:**
```typescript
// If updating same entity, replace existing operation
await syncQueue.enqueue({ entity: 'player', id: '123', type: 'update' });
// Later update replaces previous:
await syncQueue.enqueue({ entity: 'player', id: '123', type: 'update' });
// Only ONE operation in queue for player 123
```

### SyncEngine

**Background processor that:**
- Runs when online
- Pauses when offline
- Processes queue via executor
- Emits status events for UI

**State Machine:**
```
IDLE → SYNCING → IDLE
  ↓       ↓
PAUSED  ERROR
```

### Conflict Resolution

**Strategy: Last-Write-Wins with Timestamps**

```typescript
// When sync fails with unique constraint conflict:
1. Fetch cloud version
2. Compare updatedAt timestamps
3. If cloud is newer: Update local with cloud version
4. If local is newer: Force push local to cloud
5. Mark operation complete
```

### Sync Flow Diagram

```
┌────────────────────────────────────────────────────────────────┐
│                    User: updatePlayer()                         │
└──────────────────────────┬─────────────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────────────┐
│               SyncedDataStore.updatePlayer()                    │
├────────────────────────────────────────────────────────────────┤
│ 1. localStore.updatePlayer() → IndexedDB                       │
│ 2. syncQueue.enqueue() → Persistent queue                      │
│ 3. return result → User sees instant save                      │
└──────────────────────────┬─────────────────────────────────────┘
                           │ (background)
                           ▼
┌────────────────────────────────────────────────────────────────┐
│                    SyncEngine (background)                      │
├────────────────────────────────────────────────────────────────┤
│ 1. Poll queue for pending operations                           │
│ 2. Call executor for each operation                            │
│ 3. On success: Mark complete                                   │
│ 4. On conflict: ConflictResolver handles                       │
│ 5. On network error: Retry with backoff                        │
└──────────────────────────┬─────────────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────────────┐
│                  SyncExecutor (per operation)                   │
├────────────────────────────────────────────────────────────────┤
│ 1. Transform local data for cloud                              │
│ 2. Call SupabaseDataStore method                               │
│ 3. Handle response/errors                                      │
└────────────────────────────────────────────────────────────────┘
```

---

## Migration Services

### Three Migration Types

| Service | Direction | When Used |
|---------|-----------|-----------|
| migrationService | Local → Cloud | User enables cloud sync |
| reverseMigrationService | Cloud → Local | User downloads cloud data |
| legacyMigrationService | Legacy → User-scoped | User signs in (first time) |

### migrationService.ts (Local → Cloud)

**Purpose:** Upload local data to Supabase when user enables cloud sync.

**Key Function:**
```typescript
export async function hasLocalDataToMigrate(userId?: string): Promise<LocalDataCheckResult>
```

**Important:** Must pass `userId` to check user-scoped storage, not legacy global storage.

### reverseMigrationService.ts (Cloud → Local)

**Two Functions:**

1. **hasCloudData()** - Quick existence check
   - Uses efficient count queries
   - Returns early on first found data
   - Does NOT fetch all data

2. **hydrateLocalFromCloud()** - Full sync
   - Downloads all cloud data
   - Writes to user-scoped local storage
   - Timestamp-based conflict resolution

**Hydration Flow (new device login):**
```typescript
// In page.tsx post-login check
if (hasMigrationCompleted(userId)) {
  const localResult = await hasLocalDataToMigrate(userId);
  if (!localResult.hasData) {
    // Local is empty, check cloud
    const cloudResult = await hasCloudData();
    if (cloudResult.hasData) {
      // Hydrate local from cloud
      await hydrateLocalFromCloud(userId);
    }
  }
}
```

### legacyMigrationService.ts (Legacy → User-scoped)

**Purpose:** Migrate data from old `MatchOpsLocal` database to new `matchops_user_{userId}` database.

**When:** First time a user signs in who previously used the app anonymously.

---

## User Journeys

### Journey 1: First-Time User (Local Mode)

```
1. Open app
2. See WelcomeScreen (no account)
3. Choose "Start without account"
4. DataStore: LocalDataStore(undefined) → MatchOpsLocal database
5. All operations local, no sync
```

### Journey 2: Sign Up for Cloud

```
1. User in local mode, has data
2. Clicks "Sign In" in settings
3. Creates account via email/password
4. Still in LOCAL mode (auth ≠ sync)
5. If subscriber: Can enable cloud sync
6. Migration wizard: Upload local data
7. Mode switches to cloud
8. DataStore: SyncedDataStore(userId)
```

### Journey 3: Sign In on New Device

```
1. Open app on new device
2. Sign in with existing account
3. AuthProvider sets userId
4. page.tsx: Post-login check runs
   a. Check local: Empty (new device)
   b. Check cloud: Has data
   c. Hydrate: Download cloud → local
5. DataStore ready with user's data
6. User sees their games, players, etc.
```

### Journey 4: Mode Switch (Cloud → Local)

```
1. User in cloud mode
2. Clicks "Disable cloud sync"
3. Check pending sync operations
   - If pending: Warn user, confirm discard
4. disableCloudMode()
5. Factory resets DataStore
6. New DataStore: LocalDataStore(userId)
7. Data stays in local storage
```

---

## Data Flow Diagrams

### Initialization Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         App Mount                                │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AuthProvider                                │
│  1. Initialize AuthService                                       │
│  2. Load/validate session                                        │
│  3. Subscribe to auth changes                                    │
│  4. Provide user context                                         │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                       page.tsx                                   │
│  1. Get userId from useAuth()                                    │
│  2. If cloud mode + authenticated:                               │
│     a. Check if migration completed                              │
│     b. Check if local has data                                   │
│     c. Check if cloud has data                                   │
│     d. Hydrate if needed                                         │
│  3. getDataStore(userId)                                         │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                       factory.ts                                 │
│  1. Check for user/mode changes                                  │
│  2. Acquire serialization lock                                   │
│  3. Create appropriate DataStore                                 │
│  4. For cloud: Background cloud setup                            │
│  5. Return DataStore instance                                    │
└─────────────────────────────────────────────────────────────────┘
```

### Write Operation Flow (Cloud Mode)

```
┌──────────────┐
│ User Action  │  (e.g., save game)
└──────┬───────┘
       ▼
┌──────────────────────────────────────┐
│        SyncedDataStore               │
│  ┌────────────────────────────────┐  │
│  │ 1. localStore.saveGame()      │  │──→ IndexedDB (instant)
│  │ 2. syncQueue.enqueue()        │  │──→ Queue DB
│  │ 3. return result              │  │──→ UI updated
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
       │ (background, async)
       ▼
┌──────────────────────────────────────┐
│          SyncEngine                  │
│  ┌────────────────────────────────┐  │
│  │ Process queue when online     │  │
│  │ Call executor for each op     │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│      SupabaseDataStore               │
│  ┌────────────────────────────────┐  │
│  │ Transform data                │  │
│  │ RPC call to PostgreSQL        │  │
│  │ Handle response               │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

---

## Known Issues & Gotchas

### Issue 1: userId Must Be Consistently Passed

**Severity:** HIGH

**Problem:** If `getDataStore()` is called without userId, it uses legacy storage. This can cause:
- Data written to wrong database
- User can't see their data
- Cross-user data access (security)

**Solution:** Always get userId from useAuth() and pass to all data utilities:
```typescript
const { user } = useAuth();
const games = await getSavedGames(user?.id);
```

### Issue 2: Session Lock Edge Case

**Severity:** MEDIUM

**Problem:** The session lock that prevents spurious sign-outs could also block real sign-outs:
- User signs in (lock activated)
- Server revokes session
- Supabase sends SIGNED_OUT
- Event ignored due to lock
- User appears signed in but API calls fail

**Mitigation:** Lock only survives until page reload. API failures eventually indicate the problem.

### Issue 3: Cloud Setup Failures Are Silent

**Severity:** MEDIUM

**Problem:** If cloud setup fails in background:
- App continues in local-only mode
- Sync engine has no executor
- Operations queue indefinitely
- No user notification

**Current Behavior:** Logged to console and Sentry, but no UI indication.

**Workaround:** User can check sync status in settings.

### Issue 4: hasCloudData() Can Be Slow

**Severity:** LOW (fixed)

**Problem:** Original implementation fetched ALL data to check if ANY exists.

**Fix:** Now uses efficient count queries with early return.

### Issue 5: Supabase Client Singleton Reset

**Severity:** HIGH (fixed)

**Problem:** `cleanupSupabaseClient()` was resetting singleton to null, causing:
- Next request creates new client
- New client needs time to load session from localStorage
- Race condition: requests made before session ready
- 406 errors from RLS

**Fix:** Cleanup now only removes channels, preserves singleton.

---

## Debugging Guide

### Common Log Patterns

**Successful cloud mode initialization:**
```
[AuthProvider] Session restored for user xxx
[factory] Creating SyncedDataStore for user xxx
[SyncedDataStore] Initialized
[SyncEngine] Started
[factory] Cloud setup starting in background
[SupabaseDataStore] Initialized
[factory] Cloud executor set
```

**Failed cloud setup (falls back to local):**
```
[factory] Cloud setup starting in background
[factory] Cloud setup failed: Network error
[SyncEngine] No executor, queue paused
```

**User change detected:**
```
[factory] User changed from xxx to yyy, resetting DataStore
[SyncedDataStore] Closed (force=true)
[factory] Creating SyncedDataStore for user yyy
```

### Key Files for Debugging

| Issue | Files to Check |
|-------|----------------|
| Auth not working | `AuthProvider.tsx`, `SupabaseAuthService.ts` |
| Data not loading | `factory.ts`, `SyncedDataStore.ts` |
| Sync not working | `SyncEngine.ts`, `SyncQueue.ts`, `createSyncExecutor.ts` |
| 406 errors | `client.ts`, `SupabaseDataStore.ts` |
| Wrong database | `LocalDataStore.ts`, `factory.ts` (userId passing) |
| Post-login issues | `page.tsx`, `reverseMigrationService.ts` |

### Useful Debug Commands

```typescript
// Check current DataStore type
const store = await getDataStore(userId);
console.log(store.constructor.name);
// SyncedDataStore (cloud) or LocalDataStore (local)

// Check sync queue status
const queue = new SyncQueue(userId);
const stats = await queue.getStats();
console.log(stats);
// { pending: 5, syncing: 1, failed: 0 }

// Check if cloud available
import { isCloudAvailable, getCurrentMode } from '@/config/backendConfig';
console.log('Cloud available:', isCloudAvailable());
console.log('Current mode:', getCurrentMode());
```

---

## Summary

The auth/data/sync system is designed around these key principles:

1. **Auth and sync are independent** - Users can sign in without enabling cloud sync
2. **Local-first** - All writes go to IndexedDB first, sync happens in background
3. **User-scoped storage** - Each user gets their own database
4. **Graceful degradation** - Cloud failures don't break the app
5. **Race condition prevention** - Serialization locks prevent concurrent init issues

When debugging issues:
1. Check if userId is being passed correctly
2. Check which DataStore type is active
3. Check sync queue status
4. Look for session/auth issues in AuthProvider logs
5. Check for network errors in cloud setup
