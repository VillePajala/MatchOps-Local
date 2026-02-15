# 09. Sync Engine — Local-First Sync, Queue, Conflict Resolution

> **Audience**: AI agent building the new app
> **Purpose**: How to build local-first cloud sync — writes go to IndexedDB instantly, then background-sync to Supabase

---

## Architecture

```
┌────────────────────────────────────────────────────────┐
│                    SyncedDataStore                      │
│  Implements DataStore interface                        │
│  Writes → LocalDataStore (instant) + SyncQueue (async) │
└──────────┬────────────────────────┬────────────────────┘
           │                        │
┌──────────▼──────────┐  ┌─────────▼──────────┐
│   LocalDataStore    │  │     SyncQueue       │
│   (IndexedDB)       │  │   (IndexedDB)       │
│   Instant reads     │  │   Persistent ops    │
│   Instant writes    │  │   Survives restart  │
└─────────────────────┘  └─────────┬──────────┘
                                   │
                         ┌─────────▼──────────┐
                         │    SyncEngine       │
                         │  Background loop    │
                         │  Online detection   │
                         │  Retry logic        │
                         └─────────┬──────────┘
                                   │
                         ┌─────────▼──────────┐
                         │ SupabaseDataStore   │
                         │  (Cloud writes)     │
                         └─────────────────────┘
```

**Key insight**: The user never waits for network. Reads come from local IndexedDB. Writes go to local IndexedDB immediately, then a queue entry is created for background sync to the cloud.

---

## 1. SyncQueue — Persistent Operation Queue

The SyncQueue stores pending operations in a **separate** IndexedDB database (not the same as user data).

### Operation Structure

```typescript
interface SyncOperation {
  id: string;                    // UUID
  entityType: SyncEntityType;    // 'exercise' | 'practiceSession' | 'player' | ...
  entityId: string;              // The entity's app-level ID
  operation: SyncOperationType;  // 'create' | 'update' | 'delete'
  data: unknown;                 // Full entity data (for create/update), undefined for delete
  status: SyncOperationStatus;   // 'pending' | 'syncing' | 'failed' (no 'completed' — completed ops are deleted)
  timestamp: number;             // Date.now() — NOT string
  retryCount: number;
  maxRetries: number;            // Maximum attempts before permanent failure
  lastError?: string;
  lastAttempt?: number;          // Date.now() of last sync attempt
  createdAt: number;             // Date.now() when first enqueued (preserved during dedup)
}
```

> **Actual MatchOps-Local entity types** (for reference):
> ```typescript
> type SyncEntityType =
>   | 'player' | 'team' | 'game' | 'season' | 'tournament'
>   | 'personnel' | 'settings' | 'teamRoster'
>   | 'playerAdjustment' | 'warmupPlan';
> ```

For the practice planner, define your own entity types:

```typescript
type SyncEntityType =
  | 'exercise'
  | 'practiceSession'
  | 'practiceBlock'
  | 'player'
  | 'team'
  | 'season'
  | 'personnel'
  | 'settings'
  | 'template'
  | 'attendance';
```

### Deduplication

When updating the same entity multiple times before sync completes, replace the pending operation instead of adding a new one:

```typescript
async enqueue(input: SyncOperationInput): Promise<string> {
  // Check for existing pending operation on same entity
  const existing = await this.findByEntity(input.entityType, input.entityId);

  if (existing && existing.status === 'pending') {
    // Merge operations using rules below
    const merged = getMergedOperation(existing.operation, input.operation);

    if (merged === null) {
      // CREATE + DELETE = remove both (entity never existed on server)
      await this.delete(existing.id);
      return existing.id;
    }

    // Replace: update data, operation type, and timestamp — keep same ID and createdAt
    existing.data = input.data;
    existing.operation = merged;
    existing.timestamp = Date.now();
    await this.update(existing);
    return existing.id;
  }

  // No existing operation — create new
  const op: SyncOperation = {
    id: generateId(),
    ...input,
    status: 'pending',
    timestamp: Date.now(),
    retryCount: 0,
    maxRetries: 10,
    createdAt: Date.now(),
  };
  await this.add(op);
  return op.id;
}
```

### Deduplication Merge Rules

When combining an existing pending operation with a new operation on the same entity:

| Existing | New | Result | Reason |
|----------|-----|--------|--------|
| CREATE | UPDATE | CREATE (new data) | Entity does not exist on server yet |
| CREATE | DELETE | **null** (remove both) | Entity never existed on server |
| UPDATE | UPDATE | UPDATE (new data) | Latest data wins |
| UPDATE | DELETE | DELETE | Entity should be removed |
| DELETE | any | new operation | Rare edge case — use new |

**Why dedup matters**: User edits an exercise 10 times in 30 seconds while offline. Without dedup, sync would push 10 updates. With dedup, only the final state is synced.

---

## 2. SyncEngine — Background Processor

The SyncEngine polls the queue on a regular interval and processes pending operations.

### Processing Order

Parent entities must sync before children (to satisfy foreign key constraints):

```typescript
const ENTITY_SYNC_PRIORITY: Record<SyncEntityType, number> = {
  player: 0,           // No dependencies
  team: 1,
  season: 1,
  personnel: 1,
  exercise: 1,
  settings: 2,
  practiceSession: 3,  // References seasons, teams
  practiceBlock: 4,    // References sessions, exercises
  template: 3,
  attendance: 4,       // References sessions, players
};
```

### Online/Offline Detection

```typescript
constructor() {
  this.isOnline = navigator.onLine;

  window.addEventListener('online', () => {
    this.isOnline = true;
    this.nudge();  // Immediately try to sync
  });

  window.addEventListener('offline', () => {
    this.isOnline = false;
  });
}
```

### Sync Loop

```typescript
async processQueue(): Promise<void> {
  if (!this.isOnline || this.isSyncing) return;

  this.isSyncing = true;
  this.emitStatus('syncing');

  try {
    const pending = await this.queue.getPending();
    if (pending.length === 0) {
      this.emitStatus('idle');
      return;
    }

    // Sort by priority (parents first)
    const sorted = pending.sort((a, b) =>
      ENTITY_SYNC_PRIORITY[a.entityType] - ENTITY_SYNC_PRIORITY[b.entityType]
    );

    for (const op of sorted) {
      if (!this.isOnline) break;  // Stop if went offline mid-sync

      try {
        await this.queue.markSyncing(op.id);
        await this.executor!(op);
        await this.queue.markCompleted(op.id);
      } catch (error) {
        await this.handleOperationError(op, error);
      }
    }
  } finally {
    this.isSyncing = false;
    this.emitStatus(this.isOnline ? 'idle' : 'offline');
  }
}
```

### Retry with Exponential Backoff

```typescript
async handleOperationError(op: SyncOperation, error: unknown): Promise<void> {
  const isTransient = isTransientError(error);
  const maxRetries = this.config.maxRetries;  // Default: 5

  if (isTransient && op.retryCount < maxRetries) {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, ... (capped at 5 min)
    // Formula: baseMs * 2^(retryCount - 1), capped at backoffMaxMs
    const delay = Math.min(1000 * Math.pow(2, op.retryCount - 1), 300_000);

    await this.queue.markFailed(op.id, error instanceof Error ? error.message : 'Unknown error');
  } else {
    // Permanent failure or max retries exceeded
    await this.queue.markFailed(op.id, error instanceof Error ? error.message : 'Sync failed');
  }
}
```

---

## 3. SyncedDataStore — The Glue

```typescript
class SyncedDataStore implements DataStore {
  private local: LocalDataStore;
  private cloud: SupabaseDataStore;
  private queue: SyncQueue;
  private engine: SyncEngine;

  // All reads go to local
  async getExercises(): Promise<Exercise[]> {
    return this.local.getExercises();
  }

  // Writes go to local + queue
  async createExercise(data: Omit<Exercise, 'id' | 'createdAt' | 'updatedAt'>): Promise<Exercise> {
    // 1. Write to local (instant, returns with generated ID)
    const exercise = await this.local.createExercise(data);

    // 2. Queue for cloud sync (background)
    await this.queue.enqueue({
      entityType: 'exercise',
      entityId: exercise.id,
      operation: 'create',
      data: exercise,
    });

    // 3. Nudge engine to process immediately
    this.engine.nudge();

    return exercise;
  }

  async deleteExercise(id: string): Promise<void> {
    // 1. Delete locally
    await this.local.deleteExercise(id);

    // 2. Queue cloud delete
    await this.queue.enqueue({
      entityType: 'exercise',
      entityId: id,
      operation: 'delete',
    });

    this.engine.nudge();
  }
}
```

---

## 4. Conflict Resolution — Last Write Wins

For a single-user app, the simplest conflict strategy:

```
Local write at T1 → queued
Cloud had write at T2 (from another device)
Sync processes at T3 → local data (T1) overwrites cloud (T2)
```

This is acceptable because:
- Single user — no collaborative editing
- Local is always the source of truth (user just edited it)
- If cloud data is newer, the user can pull it explicitly

For the practice planning app, you likely won't need more complex strategies like CRDTs or three-way merge.

---

## 5. Status UI

The SyncEngine emits status events for a UI indicator:

```typescript
type SyncStatusState =
  | 'synced'    // All operations synced successfully, queue is empty
  | 'syncing'   // Currently processing the queue
  | 'pending'   // Has operations waiting (offline or between sync cycles)
  | 'error'     // Has failed operations that need attention
  | 'offline';  // No network connection

interface SyncStatusInfo {
  state: SyncStatusState;
  pendingCount: number;
  failedCount: number;
  lastSyncedAt: number | null;
  isOnline: boolean;                  // Whether the device is currently online
  cloudConnected?: boolean;           // Whether the cloud executor is initialized and ready
  isPaused?: boolean;                 // Whether sync is manually paused by the user
  hasStaleResetFailure?: boolean;     // True if failed to reset stale operations on startup
}
```

UI component:

```tsx
function SyncStatusIndicator() {
  const { state, pendingCount } = useSyncStatus();

  if (state === 'syncing') return <Spinner text={`Syncing ${pendingCount}...`} />;
  if (state === 'offline') return <Badge color="yellow">Offline</Badge>;
  if (state === 'error') return <Badge color="red">Sync error</Badge>;
  return <Badge color="green">Synced</Badge>;
}
```

---

## 6. Initial Cloud Setup (First Sync)

When a user first enables cloud mode, push all local data to cloud:

```typescript
async pushAllToCloud(): Promise<void> {
  const store = this.local;

  // Push in dependency order
  const players = await store.getPlayers();
  const exercises = await store.getExercises();
  const teams = await store.getTeams();
  const seasons = await store.getSeasons();
  // ...

  // Batch: process in chunks of 10 for parallel efficiency
  for (const chunk of chunkArray(players, 10)) {
    await Promise.all(chunk.map(p =>
      this.cloud.upsertPlayer(p).catch(err => {
        logger.error(`Failed to push player ${p.id}`, err);
      })
    ));
  }
  // ... repeat for other entities
}
```

---

## When to Skip the Sync Engine

If your app is **cloud-only** (no offline support), you don't need any of this. Just use SupabaseDataStore directly:

```typescript
// Cloud-only mode: direct writes, no queue
if (mode === 'cloud') {
  instance = new SupabaseDataStore();  // Direct cloud reads/writes
} else {
  instance = new LocalDataStore();     // Pure local
}
```

The sync engine is only needed for **local-first with cloud sync** — where writes go to local immediately and sync to cloud in the background.

---

## Traps

1. **Separate IndexedDB database for sync queue**: Don't store sync operations in the same database as user data. Clearing user data should NOT clear the sync queue (pending operations would be lost).

2. **Parent before child**: Always sync in dependency order. Creating a practice block before its parent session violates FK constraints.

3. **`Date.now()` for timestamps**: Don't use ISO strings in the sync queue — numeric timestamps are easier to compare and don't have timezone parsing issues.

4. **Dedup on enqueue, not on process**: If you dedup at process time, you might skip a critical update.

5. **`clearAllUserData` must clear local even if cloud fails**: The user expects their local data to be gone. Re-throw the cloud error for the caller to handle.

6. **Engine disposal**: When the user signs out or switches modes, dispose the engine (clear intervals, remove event listeners). Not doing so causes memory leaks and ghost sync operations.

7. **AbortError and AuthError need special handling**: Do NOT count these as retry failures. AbortError occurs during page navigation, hot reload, or when the per-operation timeout fires — reset to pending without incrementing retryCount. AuthError occurs during app startup when the sync engine starts before auth is ready — also reset to pending. Both are expected transient conditions, not real failures.

8. **Per-operation timeout (90 seconds)**: Each sync operation should have a timeout (MatchOps-Local uses 90 seconds) to prevent a single hung request from blocking all syncing. Use an `AbortController` so the timeout produces a proper `AbortError` that triggers the abort-handling path.

9. **User-scoped queue database**: Each user must get their own queue database (`sync_queue_${userId}`) to prevent stale operations from a previous user's session appearing in the current user's queue. The `SyncQueue` constructor should accept a `userId` parameter.
