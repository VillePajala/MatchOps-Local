# Sync System

**Status**: ✅ Implemented (January 2026)
**Last Updated**: January 26, 2026
**Implementation**: PR #324 (Local-First Cloud Sync)

Local-first sync infrastructure for cloud mode. Operations are queued locally and synced to cloud in the background.

## Overview

The sync system ensures data safety for cloud users by:
1. Writing all changes to local IndexedDB first (instant)
2. Queuing operations for background sync to Supabase
3. Retrying failed operations with exponential backoff
4. Providing UI feedback on sync status

## Architecture

```
User Action → SyncQueue (IndexedDB) → SyncEngine → Supabase
                  ↓                       ↓
            Instant Save           Background Sync
```

## Components

### SyncQueue (`src/sync/SyncQueue.ts`)

Persistent operation queue using IndexedDB.

**When to use:**
- Internal use by SyncEngine only
- Not called directly from application code

**Key features:**
- Separate IndexedDB database (`matchops_sync_queue`)
- Operations persist across page refreshes
- Automatic deduplication for same entity

### Entity Uniqueness (Deduplication)

When multiple operations on the same entity occur before sync completes, they are intelligently merged:

```typescript
// User creates then edits player before sync
await syncQueue.enqueue({ entityType: 'player', entityId: 'p1', operation: 'create', data: { name: 'Alice' } });
await syncQueue.enqueue({ entityType: 'player', entityId: 'p1', operation: 'update', data: { name: 'Alicia' } });
// Result: ONE CREATE operation with latest data (name: 'Alicia')
```

**Uniqueness key:** `entityType + entityId`

**Operation Merge Rules:**

| Existing | New | Result |
|----------|-----|--------|
| CREATE | UPDATE | CREATE with new data |
| CREATE | DELETE | Both removed (entity never existed on server) |
| UPDATE | UPDATE | UPDATE with new data |
| UPDATE | DELETE | DELETE |

This ensures that offline-created entities are properly synced even if edited before the first sync.

Deduplication only affects `pending` operations. Once an operation is `syncing`, new changes create a separate queue entry.

### Retry Strategy

Failed operations use exponential backoff:

| Retry | Delay |
|-------|-------|
| 1 | 1 second |
| 2 | 2 seconds |
| 3 | 4 seconds |
| 4 | 8 seconds |
| ... | ... |
| 10 | 5 minutes (max) |

After `maxRetries` (default: 10), operation moves to `failed` status for manual intervention.

**Configuration:**
```typescript
const queue = new SyncQueue({
  maxRetries: 10,        // Attempts before permanent failure
  backoffBaseMs: 1000,   // Initial retry delay
  backoffMaxMs: 300000,  // Maximum retry delay (5 min)
});
```

### Operation Status Flow

```
pending → syncing → completed (removed from queue)
    ↓         ↓
    ↓    (on error)
    ↓         ↓
    ←─────────┘  (retry if under maxRetries)
    ↓
  failed (manual intervention needed)
```

## Error Handling

### Transient Errors (Auto-Retry)
- Network timeouts
- 5xx server errors
- Rate limiting (429)

### Permanent Errors (No Retry)
- 4xx client errors (except 429)
- Validation failures
- Authentication errors (trigger re-auth)

### Quota Exceeded

If IndexedDB quota is exceeded during enqueue:
- Operation is rejected with `SyncErrorCode.QUOTA_EXCEEDED`
- User should be notified to free up space or upgrade storage
- Existing queued operations are preserved

## Usage from DataStore

**DO NOT** call SyncQueue directly. Use `SyncedDataStore` (Phase 3):

```typescript
// SyncedDataStore handles queueing automatically
const dataStore = getDataStore(); // Returns SyncedDataStore in cloud mode
await dataStore.savePlayer(player); // Queued and synced automatically
```

## Testing

```bash
npm test -- --testPathPatterns=SyncQueue
```

Tests use `fake-indexeddb` to simulate IndexedDB in Node.js.

## Implementation Status

| Phase | Component | Status |
|-------|-----------|--------|
| 1 | SyncQueue | ✅ Complete |
| 2 | SyncEngine | ✅ Complete |
| 3 | SyncedDataStore | ✅ Complete |
| 4 | UI Integration | ✅ Complete |
| 5-8 | Conflict resolution, testing | ✅ Complete |

All phases merged via PR #324 (January 2026).

---

## Subscription Status Caching

Subscription status is cached to reduce API calls and provide offline access to subscription info.

### Cache Configuration

```typescript
// In SubscriptionContext.tsx
const CACHE_KEY = 'matchops_subscription_cache';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
```

### Behavior

| Scenario | Behavior |
|----------|----------|
| App opens | Read from cache if fresh (<5 min), otherwise fetch from server |
| After purchase | Cache cleared, fresh fetch triggered |
| Offline | Use cached status (may be stale) |
| Cache expired | Fetch from server on next check |

### Cross-Device Sync Expectations

**Scenario**: User purchases on Device A, then opens Device B.

| Timing | Device B Behavior |
|--------|-------------------|
| Immediate | May see stale cache (up to 5 min) |
| After cache expires | Fetches fresh status from server |
| Manual refresh | `subscription.refresh()` forces server fetch |

**Design decision**: 5-minute cache is acceptable because:
1. Subscriptions rarely change (monthly billing cycle)
2. Reduces API load for frequent app opens
3. Purchase flow always clears cache and fetches fresh

**For real-time requirements**: Call `subscription.refresh()` explicitly after sign-in or when user requests sync.

### Manual Refresh

```typescript
const { refresh } = useSubscription();

// Force server fetch (clears cache)
await refresh();
```

Currently used after:
- Successful purchase verification
- User explicitly requests refresh

---

See `docs/03-active-plans/local-first-sync-plan.md` for full implementation plan.
