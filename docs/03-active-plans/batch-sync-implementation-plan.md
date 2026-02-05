# Batch Sync System Implementation Plan

## Overview

Replace individual-operation sync with batched sync for professional-grade reliability and performance.

**Branch:** `feature/batch-sync-system`
**Target:** Merge to `feature/supabase-cloud-backend` before master merge
**Estimated Work:** 26-38 hours (~4-5 days)

---

## Current vs Proposed Architecture

### Current (Individual Operations)
```
User Edit → Queue 1 operation → Process → 1 HTTP request → Cloud
User Edit → Queue 1 operation → Process → 1 HTTP request → Cloud
...
100 edits = 100 HTTP requests (slow, prone to AbortError cascade)
```

### Proposed (Batched Operations)
```
User Edit → Queue operation ─┐
User Edit → Queue operation  ├─→ Batch (up to 50) → 1 HTTP request → Cloud
User Edit → Queue operation ─┘
...
100 edits = 2-10 HTTP requests (fast, resilient)
```

---

## PR Structure

### PR 1: Bulk Sync RPC Function
**Branch:** `batch-sync/pr1-bulk-rpc`
**Effort:** 4-6 hours
**Dependencies:** None

Creates PostgreSQL function that accepts batched entities and upserts them atomically.

**Files:**
- `supabase/migrations/017_bulk_sync_rpc.sql` (new)

**Deliverable:** RPC function `bulk_sync_entities` that:
- Accepts arrays of players, teams, seasons, tournaments, personnel
- Handles settings and warmup plan
- Processes in single transaction (all-or-nothing)
- Games still use existing `save_game_with_relations` (already batched internally)

---

### PR 2: SyncQueue Batch Support
**Branch:** `batch-sync/pr2-queue-batching`
**Effort:** 4-5 hours
**Dependencies:** None (can parallel with PR1)

Adds methods to SyncQueue for retrieving operations grouped by entity type.

**Files:**
- `src/sync/SyncQueue.ts` (modify)
- `src/sync/types.ts` (modify)
- `tests/sync/SyncQueue.batch.test.ts` (new)

**New Methods:**
```typescript
// Get pending operations grouped by entity type
async getPendingBatched(maxPerType: number): Promise<Map<SyncEntityType, SyncOperation[]>>;

// Mark multiple operations as syncing atomically
async markBatchSyncing(operationIds: string[]): Promise<void>;

// Mark multiple operations as completed atomically
async markBatchCompleted(operationIds: string[]): Promise<void>;

// Mark multiple operations as failed atomically
async markBatchFailed(operationIds: string[], error: string): Promise<void>;
```

---

### PR 3: Batch Executor & Engine Integration
**Branch:** `batch-sync/pr3-engine-integration`
**Effort:** 6-8 hours
**Dependencies:** PR1, PR2

Integrates batch processing into SyncEngine and creates batch executor in SupabaseDataStore.

**Files:**
- `src/sync/SyncEngine.ts` (modify)
- `src/sync/types.ts` (modify)
- `src/datastore/SupabaseDataStore.ts` (modify)
- `src/datastore/SyncedDataStore.ts` (modify)
- `tests/sync/SyncEngine.batch.test.ts` (new)
- `tests/datastore/SupabaseDataStore.batch.test.ts` (new)

**Changes:**

1. **New Types:**
```typescript
// Payload for bulk sync RPC
interface BulkSyncPayload {
  players?: unknown[];
  teams?: unknown[];
  seasons?: unknown[];
  tournaments?: unknown[];
  personnel?: unknown[];
  settings?: unknown;
  warmupPlan?: unknown;
  teamRosters?: { teamId: string; roster: unknown[] }[];
  playerAdjustments?: unknown[];
}

// New executor type for batched operations
type BatchSyncExecutor = (payload: BulkSyncPayload) => Promise<void>;
```

2. **SyncEngine Changes:**
```typescript
// New: Set batch executor (in addition to individual executor)
setBatchExecutor(executor: BatchSyncExecutor): void;

// Modified: doProcessQueue uses batch executor when available
private async doProcessQueue(): Promise<void> {
  // If batch executor available, use batched processing
  // Otherwise, fall back to individual processing (backward compatible)
}
```

3. **SupabaseDataStore Changes:**
```typescript
// New: Bulk sync method for batch executor
async bulkSync(payload: BulkSyncPayload): Promise<void>;
```

---

### PR 4: Integration Testing & Polish
**Branch:** `batch-sync/pr4-integration`
**Effort:** 4-6 hours
**Dependencies:** PR3

End-to-end testing and edge case handling.

**Files:**
- `tests/integration/batch-sync.test.ts` (new)
- `src/sync/SyncEngine.ts` (minor fixes)
- `src/datastore/factory.ts` (wire up batch executor)

**Test Scenarios:**
1. Normal usage: Multiple edits batch correctly
2. Backup import: Uses batch sync
3. Partial failure: Transaction rolls back
4. Mixed operations: Creates + updates + deletes in one batch
5. Large batch: 100+ operations split into chunks
6. Offline → Online: Batches process correctly on reconnect

---

## Detailed Component Design

### 1. Bulk Sync RPC (`017_bulk_sync_rpc.sql`)

```sql
CREATE OR REPLACE FUNCTION bulk_sync_entities(
  p_players jsonb[] DEFAULT NULL,
  p_teams jsonb[] DEFAULT NULL,
  p_seasons jsonb[] DEFAULT NULL,
  p_tournaments jsonb[] DEFAULT NULL,
  p_personnel jsonb[] DEFAULT NULL,
  p_settings jsonb DEFAULT NULL,
  p_warmup_plan jsonb DEFAULT NULL,
  p_team_rosters jsonb[] DEFAULT NULL,  -- [{team_id, roster: [...]}]
  p_player_adjustments jsonb[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_result jsonb := '{}';
  v_item jsonb;
  v_count int;
BEGIN
  -- Auth check
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Process players
  IF p_players IS NOT NULL AND array_length(p_players, 1) > 0 THEN
    v_count := 0;
    FOREACH v_item IN ARRAY p_players LOOP
      v_item := jsonb_set(v_item, '{user_id}', to_jsonb(v_user_id::text));
      INSERT INTO players SELECT * FROM jsonb_populate_record(null::players, v_item)
      ON CONFLICT (id, user_id) DO UPDATE SET
        name = EXCLUDED.name,
        jersey_number = EXCLUDED.jersey_number,
        -- ... all fields
        updated_at = now();
      v_count := v_count + 1;
    END LOOP;
    v_result := v_result || jsonb_build_object('players', v_count);
  END IF;

  -- Process teams (similar pattern)
  -- Process seasons (similar pattern)
  -- Process tournaments (similar pattern)
  -- Process personnel (similar pattern)
  -- Process settings (single upsert)
  -- Process warmup_plan (single upsert)
  -- Process team_rosters (call set_team_roster for each)
  -- Process player_adjustments (similar pattern)

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION bulk_sync_entities FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bulk_sync_entities TO authenticated;
```

**Note:** Games are NOT included in bulk sync because:
1. Games already use `save_game_with_relations` which is internally batched
2. Games have complex related data (players, events, assessments, tactical)
3. One game save is already one RPC call - can't batch further without redesign

### 2. SyncQueue Batch Methods

```typescript
/**
 * Get pending operations grouped by entity type.
 * Used by batch sync to efficiently group operations.
 *
 * @param maxPerType - Maximum operations per entity type
 * @returns Map of entity type to operations array
 */
async getPendingBatched(maxPerType: number = 50): Promise<Map<SyncEntityType, SyncOperation[]>> {
  const db = this.ensureInitialized();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SYNC_STORE_NAME, 'readonly');
    const store = transaction.objectStore(SYNC_STORE_NAME);
    const index = store.index(INDEX_TIMESTAMP);

    const batched = new Map<SyncEntityType, SyncOperation[]>();
    const now = Date.now();

    const request = index.openCursor();

    request.onsuccess = () => {
      const cursor = request.result;

      if (cursor) {
        const op = cursor.value as SyncOperation;

        // Only pending operations ready for retry
        if (op.status === 'pending' && this.isReadyForRetry(op, now)) {
          const current = batched.get(op.entityType) || [];

          // Respect max per type
          if (current.length < maxPerType) {
            current.push(op);
            batched.set(op.entityType, current);
          }
        }

        cursor.continue();
      }
    };

    transaction.oncomplete = () => resolve(batched);
    transaction.onerror = () => reject(/* ... */);
  });
}
```

### 3. SyncEngine Batch Processing

```typescript
private async doProcessQueue(): Promise<void> {
  // ... existing guards ...

  // Use batch processing if batch executor is available
  if (this.batchExecutor) {
    return this.doProcessQueueBatched();
  }

  // Fall back to individual processing
  return this.doProcessQueueIndividual();
}

private async doProcessQueueBatched(): Promise<void> {
  const batched = await this.queue.getPendingBatched(this.config.batchSize);

  if (batched.size === 0) {
    return;
  }

  // Collect all operation IDs for status tracking
  const allOperationIds: string[] = [];

  // Build payload, separating games (individual) from others (batched)
  const batchPayload: BulkSyncPayload = {};
  const gameOperations: SyncOperation[] = [];

  for (const [entityType, operations] of batched) {
    if (entityType === 'game') {
      // Games use individual processing (already internally batched)
      gameOperations.push(...operations);
    } else {
      // Other entities go into batch
      allOperationIds.push(...operations.map(op => op.id));
      batchPayload[entityType] = operations.map(op => op.data);
    }
  }

  // Process batch (non-games)
  if (allOperationIds.length > 0) {
    try {
      await this.queue.markBatchSyncing(allOperationIds);
      await this.batchExecutor!(batchPayload);
      await this.queue.markBatchCompleted(allOperationIds);
      logger.info('[SyncEngine] Batch sync completed', { count: allOperationIds.length });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.queue.markBatchFailed(allOperationIds, errorMessage);
      logger.error('[SyncEngine] Batch sync failed', { count: allOperationIds.length, error: errorMessage });
    }
  }

  // Process games individually (existing logic)
  for (const gameOp of gameOperations) {
    await this.processOperation(gameOp, this.executor!);
  }
}
```

### 4. Delete Operations Handling

Delete operations require special handling in batch sync:

```typescript
// In bulk sync, deletes are processed AFTER creates/updates
// to avoid foreign key conflicts

interface BulkSyncPayload {
  // Upserts
  players?: unknown[];
  teams?: unknown[];
  // ...

  // Deletes (processed last)
  deletePlayerIds?: string[];
  deleteTeamIds?: string[];
  deleteSeasonIds?: string[];
  // ...
}
```

In the RPC:
```sql
-- Process deletes AFTER upserts
IF p_delete_player_ids IS NOT NULL THEN
  DELETE FROM players
  WHERE user_id = v_user_id
  AND id = ANY(p_delete_player_ids);
END IF;
```

---

## Testing Strategy

### Unit Tests
- `SyncQueue.batch.test.ts`: Test batch retrieval, marking, edge cases
- `SyncEngine.batch.test.ts`: Test batch processing logic, fallback behavior
- `SupabaseDataStore.batch.test.ts`: Test transform and RPC call

### Integration Tests
- End-to-end batch sync flow
- Backup import with batch sync
- Offline → online batch processing
- Partial failure rollback

### Manual Tests
1. Import backup with 50+ entities → verify all sync to cloud
2. Make 20 edits rapidly → verify batched into 1-2 requests
3. Go offline, make edits, come online → verify batch processes
4. Kill app mid-sync → verify retry works correctly

---

## Rollout Strategy

1. **PR1 (RPC):** Deploy to Supabase staging, test independently
2. **PR2 (Queue):** Merge to feature branch, existing tests pass
3. **PR3 (Integration):** Feature flag for batch sync (`useBatchSync: boolean`)
4. **PR4 (Testing):** Enable by default, test thoroughly
5. **Final:** Merge `feature/batch-sync-system` → `feature/supabase-cloud-backend`

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Batch partially fails | Transaction rollback in RPC (all-or-nothing) |
| Large batch times out | Chunk into smaller batches (max 50 per type) |
| Games don't batch | By design - games already use internal batching |
| Backward compatibility | Feature flag, fallback to individual sync |
| Transform bugs | Reuse existing transforms, don't change them |

---

## Success Criteria

- [ ] Backup import (100 entities) syncs in <30 seconds
- [ ] Normal usage batches operations (visible in logs)
- [ ] No increase in sync failures vs current system
- [ ] All existing tests pass
- [ ] New batch-specific tests pass
- [ ] Manual testing checklist complete

---

## Open Questions

1. **Batch timing:** Should we wait 100ms to collect operations before processing?
   - Current: Process immediately on nudge
   - Option: Add debounce to collect more operations
   - Recommendation: Keep immediate for now, optimize later if needed

2. **Batch size:** What's the optimal max batch size?
   - Too small: More requests, less benefit
   - Too large: Timeout risk, memory pressure
   - Recommendation: 50 per entity type (adjustable via config)

3. **Games batching:** Should we create a bulk games RPC?
   - Current: Games use `save_game_with_relations` individually
   - Consideration: Games are complex (5 related tables each)
   - Recommendation: No - games are already optimized, complexity not worth it
