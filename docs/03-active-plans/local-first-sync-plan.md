# Local-First Cloud Sync Implementation Plan

**Status**: In Progress (Phase 1)
**Branch**: `feature/local-first-sync`
**Created**: 2026-01-24
**Last Updated**: 2026-01-24

---

## Overview

Transform cloud mode from "online-only" to "local-first with background sync" - the industry standard pattern used by Notion, Linear, Figma, and other professional apps.

### Problem

Current cloud mode is online-only:
- Network error during save = **data lost**
- No offline support
- Users paying for cloud sync expect data safety

### Solution

Always write to IndexedDB first, sync to cloud in background:
- Instant saves (local)
- Background sync when online
- Automatic retry on failure
- Never lose user data

---

## Architecture

### Current (Broken)

```
Local Mode:  User → LocalDataStore → IndexedDB
Cloud Mode:  User → SupabaseDataStore → Supabase (online-only!)
                                            ↓
                                    Network error = data lost
```

### New (Professional)

```
Local Mode:  User → LocalDataStore → IndexedDB (unchanged)

Cloud Mode:  User → SyncedDataStore ─┬→ IndexedDB (instant)
                                     │
                                     └→ SyncQueue (persist operation)
                                            ↓
                                     SyncEngine (background)
                                            ↓
                                     Supabase (when online)
```

---

## Core Components

| Component | File | Purpose |
|-----------|------|---------|
| **SyncQueue** | `src/sync/SyncQueue.ts` | Persists pending operations in IndexedDB |
| **SyncEngine** | `src/sync/SyncEngine.ts` | Background processor, retries, online detection |
| **SyncedDataStore** | `src/datastore/SyncedDataStore.ts` | Implements DataStore, writes local + queues sync |
| **SyncStatus** | `src/sync/SyncStatus.ts` | Observable state for UI |
| **SyncStatusIndicator** | `src/components/SyncStatusIndicator.tsx` | UI component showing sync state |

---

## Detailed Design

### 1. SyncQueue Schema

```typescript
// src/sync/types.ts

export type SyncEntityType =
  | 'player'
  | 'team'
  | 'game'
  | 'season'
  | 'tournament'
  | 'personnel'
  | 'settings'
  | 'teamRoster'
  | 'playerAdjustment'
  | 'warmupPlan';

export type SyncOperationType = 'create' | 'update' | 'delete';

export type SyncOperationStatus = 'pending' | 'syncing' | 'failed';

export interface SyncOperation {
  id: string;                      // UUID for deduplication
  entityType: SyncEntityType;
  entityId: string;                // The record's ID
  operation: SyncOperationType;
  data: unknown;                   // Full entity data (for create/update)
  timestamp: number;               // When operation occurred (for conflict resolution)
  status: SyncOperationStatus;
  retryCount: number;
  maxRetries: number;              // Default: 10
  lastError?: string;
  lastAttempt?: number;
  createdAt: number;
}

export type SyncStatusState =
  | 'synced'      // All caught up
  | 'syncing'     // Currently processing
  | 'pending'     // Has items waiting (offline or between syncs)
  | 'error'       // Failed items need attention
  | 'offline';    // No network connection

export interface SyncStatusInfo {
  state: SyncStatusState;
  pendingCount: number;
  failedCount: number;
  lastSyncedAt: number | null;
  isOnline: boolean;
}
```

### 2. SyncQueue Implementation

```typescript
// src/sync/SyncQueue.ts

const SYNC_QUEUE_STORE = 'syncQueue';
const SYNC_QUEUE_DB = 'matchops_sync';

export class SyncQueue {
  private db: IDBDatabase | null = null;

  async initialize(): Promise<void> {
    // Open/create IndexedDB for sync queue
    // Separate from main data DB for isolation
  }

  async enqueue(op: Omit<SyncOperation, 'id' | 'status' | 'retryCount' | 'createdAt'>): Promise<string> {
    // Deduplicate: if same entity+operation exists, update it
    // Otherwise insert new operation
    // Returns operation ID
  }

  async getPending(limit?: number): Promise<SyncOperation[]> {
    // Get pending operations, oldest first
    // Respects retry backoff (don't return if too soon)
  }

  async markSyncing(id: string): Promise<void> {
    // Update status to 'syncing'
  }

  async markFailed(id: string, error: string): Promise<void> {
    // Increment retryCount, set lastError, status = 'failed' or 'pending'
  }

  async markCompleted(id: string): Promise<void> {
    // Remove from queue
  }

  async getStats(): Promise<{ pending: number; failed: number }> {
    // Count by status
  }

  async clear(): Promise<void> {
    // Clear all (for mode switching)
  }
}
```

### 3. SyncEngine Implementation

```typescript
// src/sync/SyncEngine.ts

export class SyncEngine extends EventEmitter {
  private queue: SyncQueue;
  private cloudStore: SupabaseDataStore;
  private isRunning = false;
  private intervalId: number | null = null;

  constructor(queue: SyncQueue, cloudStore: SupabaseDataStore) {
    this.queue = queue;
    this.cloudStore = cloudStore;

    // Listen for online/offline
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.onOnline());
      window.addEventListener('offline', () => this.onOffline());
    }
  }

  start(): void {
    // Start background sync interval (every 30 seconds)
    // Also sync immediately if online
  }

  stop(): void {
    // Stop background sync
  }

  nudge(): void {
    // Trigger immediate sync attempt (after local write)
  }

  private async processQueue(): Promise<void> {
    if (!navigator.onLine) return;
    if (this.isRunning) return;

    this.isRunning = true;
    this.emit('statusChange', 'syncing');

    try {
      const pending = await this.queue.getPending(10); // Batch of 10

      for (const op of pending) {
        await this.processOperation(op);
      }

      const stats = await this.queue.getStats();
      if (stats.pending === 0 && stats.failed === 0) {
        this.emit('statusChange', 'synced');
      } else if (stats.failed > 0) {
        this.emit('statusChange', 'error');
      } else {
        this.emit('statusChange', 'pending');
      }
    } finally {
      this.isRunning = false;
    }
  }

  private async processOperation(op: SyncOperation): Promise<void> {
    await this.queue.markSyncing(op.id);

    try {
      await this.syncToCloud(op);
      await this.queue.markCompleted(op.id);
    } catch (error) {
      if (this.isConflictError(error)) {
        await this.resolveConflict(op);
      } else {
        await this.queue.markFailed(op.id, error.message);
      }
    }
  }

  private async syncToCloud(op: SyncOperation): Promise<void> {
    // Map operation to SupabaseDataStore method
    // Handle each entity type appropriately
  }

  private async resolveConflict(op: SyncOperation): Promise<void> {
    // Last-write-wins based on timestamp
    // See Conflict Resolution section
  }
}
```

### 4. SyncedDataStore Implementation

```typescript
// src/datastore/SyncedDataStore.ts

export class SyncedDataStore implements DataStore {
  private localStore: LocalDataStore;
  private syncQueue: SyncQueue;
  private syncEngine: SyncEngine;
  private cloudStore: SupabaseDataStore;

  async initialize(): Promise<void> {
    // Initialize all components
    await this.localStore.initialize();
    await this.syncQueue.initialize();
    await this.cloudStore.initialize();
    this.syncEngine = new SyncEngine(this.syncQueue, this.cloudStore);
    this.syncEngine.start();
  }

  // Example: saveGame
  async saveGame(id: string, game: AppState): Promise<AppState> {
    // 1. Save locally (instant)
    const saved = await this.localStore.saveGame(id, game);

    // 2. Queue for sync (non-blocking)
    await this.syncQueue.enqueue({
      entityType: 'game',
      entityId: id,
      operation: 'update',
      data: this.transformForSync(saved),
      timestamp: Date.now(),
    });

    // 3. Nudge sync engine
    this.syncEngine.nudge();

    // 4. Return immediately
    return saved;
  }

  // All other DataStore methods follow same pattern:
  // 1. Local operation
  // 2. Queue sync
  // 3. Return result

  // Read operations just read from local (it's the source of truth)
  async getGames(): Promise<AppState[]> {
    return this.localStore.getGames();
  }
}
```

### 5. Conflict Resolution

**Strategy: Last-Write-Wins with Timestamps**

```typescript
// src/sync/conflictResolution.ts

async resolveConflict(op: SyncOperation): Promise<void> {
  // 1. Fetch cloud version
  const cloudRecord = await this.fetchFromCloud(op.entityType, op.entityId);

  // 2. Record deleted in cloud
  if (!cloudRecord) {
    // Local operation wins - push to cloud
    await this.pushToCloud(op);
    await this.queue.markCompleted(op.id);
    return;
  }

  // 3. Compare timestamps
  const cloudTimestamp = new Date(cloudRecord.updatedAt).getTime();

  if (op.timestamp > cloudTimestamp) {
    // Local is newer - push to cloud (overwrite)
    await this.pushToCloud(op);
    await this.queue.markCompleted(op.id);
  } else {
    // Cloud is newer - pull to local (discard local change)
    await this.localStore.save(op.entityType, cloudRecord);
    await this.queue.markCompleted(op.id);
    // Emit event so UI can refresh if needed
    this.emit('conflictResolved', {
      entityType: op.entityType,
      entityId: op.entityId,
      winner: 'cloud'
    });
  }
}
```

**Edge Cases:**

| Scenario | Resolution |
|----------|------------|
| Same record edited on two offline devices | Newer timestamp wins when both sync |
| Record deleted on device A, edited on device B | Edit wins (resurrection) - user intent was to keep |
| Both devices delete | No conflict (both want deletion) |

---

## Mode Switching

### Cloud → Local ("Use Local Only")

```typescript
async switchToLocalMode(): Promise<SwitchResult> {
  // 1. Check pending syncs
  const stats = await this.syncQueue.getStats();

  if (stats.pending > 0) {
    // Return to UI - let user decide
    return {
      needsConfirmation: true,
      pendingCount: stats.pending,
      options: ['sync_first', 'discard', 'cancel']
    };
  }

  // 2. Stop sync engine
  this.syncEngine.stop();

  // 3. Clear sync queue (optional - could keep for re-enabling)
  await this.syncQueue.clear();

  // 4. Set mode flag
  disableCloudMode();

  // 5. Data already in IndexedDB - nothing to migrate!
  return { success: true };
}
```

**Key Insight**: Since we're local-first, switching to local mode is instant - the data is already there!

### Local → Cloud ("Enable Cloud Sync")

```typescript
async switchToCloudMode(userId: string): Promise<SwitchResult> {
  // 1. Check for existing cloud data
  const hasCloudData = await this.checkCloudHasData(userId);
  const hasLocalData = await this.localStore.hasData();

  if (hasLocalData && hasCloudData) {
    // Both have data - need merge decision
    return {
      needsConfirmation: true,
      options: ['keep_local', 'keep_cloud', 'merge']
    };
  }

  if (hasLocalData && !hasCloudData) {
    // Upload local to cloud
    await this.uploadToCloud();
  }

  if (!hasLocalData && hasCloudData) {
    // Download cloud to local
    await this.downloadFromCloud();
  }

  // 2. Enable cloud mode
  enableCloudMode();

  // 3. Start sync engine
  this.syncEngine.start();

  return { success: true };
}
```

### Re-enabling Cloud After Local-Only Period

```typescript
// User was on cloud, switched to local, now wants cloud again
async reEnableCloudMode(): Promise<MergeDecision> {
  const localData = await this.localStore.getAllData();
  const cloudData = await this.cloudStore.getAllData();

  // Calculate differences
  const diff = this.calculateDiff(localData, cloudData);

  return {
    localOnlyRecords: diff.localOnly,      // Created while offline
    cloudOnlyRecords: diff.cloudOnly,      // From other device
    conflictingRecords: diff.conflicts,    // Same ID, different data
    options: ['keep_local', 'keep_cloud', 'merge_newest']
  };
}
```

---

## UI Integration

### Sync Status Indicator

**Location**: PlayerBar (next to Cloud/Local indicator)

```tsx
// src/components/SyncStatusIndicator.tsx

export function SyncStatusIndicator() {
  const { state, pendingCount, isOnline } = useSyncStatus();

  const icons = {
    synced: <HiCheck className="text-green-400" />,
    syncing: <HiArrowPath className="text-blue-400 animate-spin" />,
    pending: <HiClock className="text-yellow-400" />,
    error: <HiExclamationTriangle className="text-red-400" />,
    offline: <HiSignal className="text-slate-400" />,
  };

  const labels = {
    synced: t('sync.synced', 'Synced'),
    syncing: t('sync.syncing', 'Syncing...'),
    pending: t('sync.pending', '{{count}} pending', { count: pendingCount }),
    error: t('sync.error', 'Sync error'),
    offline: t('sync.offline', 'Offline'),
  };

  return (
    <div className="flex items-center gap-1 text-xs">
      {icons[state]}
      <span>{labels[state]}</span>
    </div>
  );
}
```

### Settings Panel

```tsx
// In SettingsModal.tsx - Cloud Sync section

{/* Sync Status */}
<div className="flex items-center justify-between">
  <span>Sync Status</span>
  <SyncStatusIndicator />
</div>

{/* Last Synced */}
<div className="flex items-center justify-between text-sm text-slate-400">
  <span>Last synced</span>
  <span>{formatRelativeTime(lastSyncedAt)}</span>
</div>

{/* Pending Changes */}
{pendingCount > 0 && (
  <div className="flex items-center justify-between">
    <span>Pending changes</span>
    <span className="text-yellow-400">{pendingCount}</span>
  </div>
)}

{/* Sync Now Button */}
<button onClick={syncNow} disabled={!isOnline || pendingCount === 0}>
  Sync Now
</button>

{/* Failed Operations */}
{failedCount > 0 && (
  <div className="p-3 bg-red-900/20 border border-red-700 rounded-md">
    <p>{failedCount} operations failed to sync.</p>
    <button onClick={retryFailed}>Retry</button>
    <button onClick={discardFailed}>Discard</button>
  </div>
)}
```

---

## Implementation Phases

### Phase 1: Sync Infrastructure ✅
**Branch**: `local-first-sync/pr1-infrastructure`

- [x] Create `src/sync/types.ts` - Type definitions
- [x] Create `src/sync/SyncQueue.ts` - IndexedDB queue
- [x] Create `src/sync/__tests__/SyncQueue.test.ts` - Unit tests (24 passing)
- [x] Create `src/sync/index.ts` - Module exports

**Acceptance Criteria**:
- ✅ SyncQueue can enqueue, dequeue, mark status
- ✅ Operations persist across page reload (IndexedDB)
- ✅ Deduplication works (same entity+operation updates existing)

---

### Phase 2: Sync Engine ⬜
**Branch**: `local-first-sync/pr2-engine`

- [ ] Create `src/sync/SyncEngine.ts` - Background processor
- [ ] Create `src/sync/SyncEngine.test.ts` - Unit tests
- [ ] Implement retry with exponential backoff
- [ ] Implement online/offline detection
- [ ] Create `src/sync/SyncStatus.ts` - Observable state

**Acceptance Criteria**:
- Engine processes queue when online
- Pauses when offline, resumes when online
- Emits status events (synced/syncing/pending/error)
- Respects retry backoff timing

---

### Phase 3: SyncedDataStore ⬜
**Branch**: `local-first-sync/pr3-datastore`

- [ ] Create `src/datastore/SyncedDataStore.ts`
- [ ] Implement all DataStore methods (local + queue)
- [ ] Create `src/datastore/SyncedDataStore.test.ts`
- [ ] Verify interface compatibility

**Acceptance Criteria**:
- All DataStore methods work
- Writes go to local immediately
- Operations queued for sync
- Reads come from local store

---

### Phase 4: Conflict Resolution ⬜
**Branch**: `local-first-sync/pr4-conflicts`

- [ ] Create `src/sync/conflictResolution.ts`
- [ ] Implement last-write-wins logic
- [ ] Handle edge cases (deletion conflicts, etc.)
- [ ] Add conflict resolution tests

**Acceptance Criteria**:
- Newer timestamp wins
- Deletions handled correctly
- Conflicts emit events for UI

---

### Phase 5: Factory Integration ⬜
**Branch**: `local-first-sync/pr5-factory`

- [ ] Update `src/datastore/factory.ts`
- [ ] Cloud mode returns SyncedDataStore
- [ ] Handle initialization order
- [ ] Update existing tests

**Acceptance Criteria**:
- Cloud mode uses SyncedDataStore
- Local mode unchanged
- Factory handles mode switching

---

### Phase 6: UI Integration ⬜
**Branch**: `local-first-sync/pr6-ui`

- [ ] Create `src/components/SyncStatusIndicator.tsx`
- [ ] Create `src/hooks/useSyncStatus.ts`
- [ ] Add indicator to PlayerBar
- [ ] Add sync section to SettingsModal
- [ ] Add translations (en/fi)

**Acceptance Criteria**:
- Status indicator shows correct state
- Settings shows sync details
- Sync Now button works
- Failed operations can be retried/discarded

---

### Phase 7: Mode Switching ⬜
**Branch**: `local-first-sync/pr7-mode-switch`

- [ ] Update CloudSyncSection for new flow
- [ ] Handle pending syncs on mode switch
- [ ] Implement merge decision UI
- [ ] Update MigrationWizard if needed

**Acceptance Criteria**:
- Cloud → Local warns about pending syncs
- Local → Cloud handles merge scenarios
- Re-enabling cloud offers merge options

---

### Phase 8: Testing & Polish ⬜
**Branch**: `local-first-sync/pr8-polish`

- [ ] Integration tests for full flow
- [ ] Edge case testing (large queues, rapid operations)
- [ ] Performance testing
- [ ] Error handling improvements
- [ ] Documentation updates

**Acceptance Criteria**:
- All tests pass
- No data loss scenarios
- Performance acceptable
- Error messages helpful

---

## Files Changed Summary

### New Files
| File | Purpose |
|------|---------|
| `src/sync/types.ts` | Type definitions |
| `src/sync/SyncQueue.ts` | Persistent operation queue |
| `src/sync/SyncEngine.ts` | Background sync processor |
| `src/sync/SyncStatus.ts` | Observable sync state |
| `src/sync/conflictResolution.ts` | Conflict handling logic |
| `src/datastore/SyncedDataStore.ts` | Local-first DataStore wrapper |
| `src/hooks/useSyncStatus.ts` | React hook for sync state |
| `src/components/SyncStatusIndicator.tsx` | UI status indicator |

### Modified Files
| File | Changes |
|------|---------|
| `src/datastore/factory.ts` | Return SyncedDataStore for cloud mode |
| `src/config/backendConfig.ts` | Add sync-related flags |
| `src/components/PlayerBar.tsx` | Add sync status indicator |
| `src/components/SettingsModal.tsx` | Add sync settings section |
| `src/components/CloudSyncSection.tsx` | Update for new sync flow |
| `public/locales/en/common.json` | Sync translations |
| `public/locales/fi/common.json` | Sync translations (Finnish) |

---

## Size Estimate

| Metric | Estimate |
|--------|----------|
| New lines of code | ~2,500-3,500 |
| New files | 8-10 |
| Modified files | 8-12 |
| PRs | 8 |
| Estimated effort | Large |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Data corruption | Transactional writes, validation, backup before sync |
| Infinite retry loops | Max retry count (10), exponential backoff cap (5 min) |
| Memory issues | Batch processing (10 ops), queue size monitoring |
| Race conditions | Operation locks, queue deduplication by entity |
| Breaking existing users | Feature flag for gradual rollout |
| Performance degradation | Measure and optimize, lazy loading |

---

## Success Criteria

After implementation:

- [ ] User can save while offline - data persists
- [ ] Network errors don't lose data
- [ ] Sync resumes automatically when online
- [ ] User sees clear sync status
- [ ] Mode switching handles pending syncs gracefully
- [ ] No data loss in any scenario
- [ ] Performance acceptable (saves feel instant)

---

## Changelog

| Date | Change |
|------|--------|
| 2026-01-24 | Initial plan created |
| 2026-01-24 | Phase 1 complete: SyncQueue with 24 tests passing |
