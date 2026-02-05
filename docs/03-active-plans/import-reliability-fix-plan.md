# Import Reliability Fix Plan

## Overview

Fix the backup import reliability issue by adding retry logic and parallel chunking to `pushAllToCloud()`.

**Problem:** Import makes 200+ sequential HTTP requests. With 99% success rate per call, there's an 87% chance of at least one failure.

**Solution:** Add retry with exponential backoff + process entities in parallel chunks.

**Branch:** `feature/batch-sync-system` (existing branch, continue work here)
**Target:** Merge to `feature/supabase-cloud-backend` when complete
**Estimated Work:** 6-8 hours
**Risk:** Low (isolated change, only affects import)

---

## Implementation Status

| Task | Status |
|------|--------|
| Create `src/utils/retry.ts` | ✅ Complete |
| Modify `pushAllToCloud()` in SyncedDataStore.ts | ✅ Complete |
| Update `fullBackup.ts` call site | ✅ Complete |
| Remove dead code (`waitForSyncCompletion`) | ✅ Complete |
| Unit tests for retry utility | ⏳ Pending |
| Unit tests for pushAllToCloud | ⏳ Pending |
| Manual testing | ⏳ Pending |

---

## Problem (Before Fix)

### `pushAllToCloud()` (SyncedDataStore.ts)

```typescript
// BEFORE: Sequential, NO RETRY, continues on failure
for (const player of players) {
  try {
    await this.remoteStore.upsertPlayer(player);
    summary.players++;
  } catch (error) {
    logger.warn(`Failed to push player ${player.id}:`, error);
    // No retry - failure is permanent
    // Continues to next - lost data not tracked
  }
}
```

**Issues:**
1. No retry on transient failures (network hiccup, rate limit, AbortError)
2. Sequential = slow (200 entities = 200 round trips)
3. Failed entities silently lost (only logged, not reported to user)

### Call Site

`pushAllToCloud()` is called from exactly ONE place:
- `fullBackup.ts` - during backup import

Normal sync (SyncQueue → SyncEngine) is **not affected** by this change.

---

## Solution (Implemented)

### 1. Shared Retry Utility ✅

**File:** `src/utils/retry.ts`

Created shared utility with:
- `isTransientError()` - Detects retryable errors (AbortError, network, 429/503/504)
- `retryWithBackoff()` - Exponential backoff retry (default: 3 attempts, 500ms initial delay)
- `chunkArray()` - Splits arrays into chunks for parallel processing

```typescript
export function isTransientError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('aborterror') ||
    message.includes('signal is aborted') ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('fetch failed') ||
    message.includes('failed to fetch') ||
    message.includes('429') ||  // Rate limit
    message.includes('503') ||  // Service unavailable
    message.includes('504')     // Gateway timeout
  );
}

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> { ... }

export function chunkArray<T>(array: T[], chunkSize: number): T[][] { ... }
```

### 2. Modified `pushAllToCloud()` ✅

**File:** `src/datastore/SyncedDataStore.ts`

Key changes:
1. Added `failures` object to return type for tracking failed entity IDs
2. Replaced sequential loops with chunked parallel + retry
3. Uses `Promise.allSettled` to handle individual failures without stopping

```typescript
// AFTER: Chunked parallel with retry
const CHUNK_SIZE = 10;
const playerChunks = chunkArray(players, CHUNK_SIZE);
for (const chunk of playerChunks) {
  const results = await Promise.allSettled(
    chunk.map(player =>
      retryWithBackoff(
        () => this.remoteStore!.upsertPlayer(player),
        { operationName: `upsertPlayer(${player.id})` }
      )
    )
  );

  for (let i = 0; i < results.length; i++) {
    if (results[i].status === 'fulfilled') {
      summary.players++;
    } else {
      summary.failures.players.push(chunk[i].id);
      logger.error(`[SyncedDataStore] Failed player ${chunk[i].id} after retries:`,
        (results[i] as PromiseRejectedResult).reason);
    }
  }
}
```

**Applied to:** players, seasons, tournaments, teams, personnel, games (all chunked)

**Single-item entities:** settings, warmupPlan, rosters, adjustments (retry only, no chunking)

**Failure tracking:** All entity types are tracked in `failures` object:
- Arrays: players, teams, seasons, tournaments, personnel, games, rosters, adjustments
- Booleans: settings, warmupPlan

### 3. Updated `fullBackup.ts` ✅

Changes:
- Removed local `retryWithBackoff` function (replaced with import from shared utility)
- Removed dead `waitForSyncCompletion` function (unused)
- Updated `PushableStore` type to include `failures` return field
- Added code to count failures and warn user

```typescript
import { retryWithBackoff } from '@/utils/retry';

// Call site now handles failures:
const pushSummary = await (dataStore as PushableStore).pushAllToCloud();
logger.log('[importFullBackup] Bulk push complete:', pushSummary);

const totalFailures = pushSummary.failures
  ? Object.values(pushSummary.failures).reduce((sum, arr) => sum + arr.length, 0)
  : 0;
if (totalFailures > 0) {
  warnings.push(`${totalFailures} items failed to sync to cloud after retries. You can retry from Settings.`);
}
```

---

## Testing Plan

### Unit Tests (Pending)

**File:** `tests/utils/retry.test.ts`

```typescript
describe('retryWithBackoff', () => {
  it('should succeed on first attempt if no error', async () => { });
  it('should retry on transient error', async () => { });
  it('should not retry on non-transient error', async () => { });
  it('should respect maxRetries', async () => { });
  it('should use exponential backoff', async () => { });
});

describe('chunkArray', () => {
  it('should split array into chunks', () => { });
  it('should handle array smaller than chunk size', () => { });
  it('should handle empty array', () => { });
  it('should throw on invalid chunk size', () => { });
});
```

**File:** `tests/datastore/SyncedDataStore.pushAllToCloud.test.ts`

```typescript
describe('pushAllToCloud with retry', () => {
  it('should retry failed operations up to 3 times', async () => { });
  it('should process chunks in parallel', async () => { });
  it('should track failures correctly', async () => { });
  it('should continue after individual failures', async () => { });
  it('should report all failures in summary', async () => { });
});
```

### Manual Testing

1. **Normal import:** Import backup with 50+ entities → verify all sync
2. **Simulated failures:** Add network throttling → verify retry behavior
3. **Large import:** Import 200+ entities → verify chunking works

---

## Files Changed

| File | Change Type | Description |
|------|-------------|-------------|
| `src/utils/retry.ts` | New | Shared retry utilities (~125 lines) |
| `src/datastore/SyncedDataStore.ts` | Modify | Chunked parallel + retry in pushAllToCloud() |
| `src/utils/fullBackup.ts` | Modify | Updated call site, removed dead code |

---

## Branch & PR Strategy

**Current state:**
- Branch: `feature/batch-sync-system`
- Parent: `feature/supabase-cloud-backend` (the "master" for cloud work)

**Steps:**
1. ✅ Implement changes on current branch
2. ⏳ Write tests
3. ⏳ Create PR: `feature/batch-sync-system` → `feature/supabase-cloud-backend`
4. After review, merge to feature branch

**Note:** `master` branch is the local-only app without Supabase. Cloud work targets `feature/supabase-cloud-backend`.

---

## Rollback Plan

If issues discovered after merge:
1. Revert the changes to `pushAllToCloud()`
2. Keep `src/utils/retry.ts` (useful utility, no harm)

The change is isolated - reverting only affects import, not normal sync.

---

## Success Criteria

- [ ] Import of 200 entities succeeds >99% of the time (vs ~13% currently)
- [ ] Failed entities are reported to user
- [ ] All new tests pass
- [ ] Existing tests still pass
- [ ] No impact on normal sync operations
