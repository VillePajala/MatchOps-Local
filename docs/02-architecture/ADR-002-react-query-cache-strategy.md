# ADR-002: React Query Cache Strategy for Local-First PWA

**Status:** Accepted
**Date:** 2025-01-26
**Context:** Local-first PWA with IndexedDB persistence

---

## Context

MatchOps is a local-first Progressive Web App (PWA) for soccer coaching. All data lives in browser IndexedDB with no backend server. We use React Query for state management and caching.

**Key Characteristics:**
- Single user per device (no multi-user concurrency)
- All data in IndexedDB (no network requests)
- Write-heavy current game state (scores, positions, events)
- Read-mostly reference data (roster, seasons, tournaments)

## Decision

We use a **dual-state pattern** for data management:

### React Query Cache (Read-Mostly Data)

**Used for:**
- Master roster (player list)
- Seasons (season metadata)
- Tournaments (tournament metadata)

**Pattern:**
```typescript
const { data: roster } = useQuery({
  queryKey: queryKeys.masterRoster,
  queryFn: () => utilGetMasterRoster(),
});

// Mutations invalidate cache:
mutationFn: async (player) => utilAddPlayer(player),
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: queryKeys.masterRoster });
}
```

**Why React Query here:**
- Data changes infrequently (roster updates, season creation)
- Cache invalidation is safe (no in-memory modifications to lose)
- Automatic refetch keeps UI in sync
- Background updates work well

### Local State (Write-Heavy Data)

**Used for:**
- Current game state (savedGames)
- In-progress game session

**Pattern:**
```typescript
const [savedGames, setSavedGames] = useState<SavedGamesCollection>({});

// Update local state + persist to IndexedDB:
setSavedGames(updatedGames);
await utilSaveGame(gameId, gameSnapshot);
queryClient.invalidateQueries({ queryKey: queryKeys.savedGames });
```

**Why NOT React Query:**
- High write frequency (auto-save every 500ms-2s)
- Cache invalidations wipe in-memory state
- Caused game reset bug (see commit d52f512)
- Local state persists across renders

## Consequences

### Positive

1. **Appropriate tool for each use case:**
   - React Query for read-mostly data (roster, seasons)
   - useState for write-heavy data (current game)

2. **No race conditions:**
   - Single component manages game state
   - Single user per device
   - No concurrent access concerns

3. **Optimistic updates where needed:**
   - `setQueryData` for immediate UI updates
   - No rollback needed (IndexedDB failures are permanent, not transient)

4. **No network failure concerns:**
   - Local-first architecture (no API calls)
   - IndexedDB operations are synchronous to user

### Negative

1. **Dual state management:**
   - Need to manage both useState and React Query
   - Potential for inconsistency if not careful

2. **Manual cache invalidation:**
   - Must remember to call `invalidateQueries` after mutations
   - Easy to forget and cause stale data

3. **Not "pure" React Query:**
   - Can't leverage all React Query features for savedGames
   - More boilerplate (setState + persist + invalidate)

## Cache Invalidation Checklist

Every mutation MUST call `queryClient.invalidateQueries()`:

- ✅ **Game Operations:**
  - Quick save → invalidate savedGames
  - Create game → invalidate savedGames
  - Delete game → invalidate savedGames
  - Update game details → invalidate savedGames

- ✅ **Roster Operations:**
  - Add player → invalidate masterRoster
  - Update player → invalidate masterRoster
  - Delete player → invalidate masterRoster

- ✅ **Season/Tournament Operations:**
  - Add season → invalidate seasons
  - Update season → invalidate seasons
  - Add tournament → invalidate tournaments

## Optimistic Updates

**Pattern:**
```typescript
// 1. Optimistically update cache
queryClient.setQueryData<SavedGamesCollection>(
  queryKeys.savedGames,
  updatedSavedGames
);

// 2. Update local state
setSavedGames(updatedSavedGames);

// 3. Persist to IndexedDB
await utilSaveGame(currentGameId, currentSnapshot);

// 4. Invalidate cache (triggers refetch for other consumers)
queryClient.invalidateQueries({ queryKey: queryKeys.savedGames });
```

**Why no rollback?**
- IndexedDB writes rarely fail (only quota exceeded or corruption)
- Failures are permanent, not transient (no network flakiness)
- User sees error toast and retries manually
- No "stale server state" to reconcile

## Local-First vs Network-First

**Network-First Apps (SaaS):**
- Multiple users, concurrent access
- Network failures common (retries, rollbacks needed)
- Optimistic updates with rollback crucial
- Race conditions possible

**Local-First PWA (MatchOps):**
- Single user, single device
- No network (IndexedDB only)
- Failures are permanent, not transient
- No race conditions (single execution context)

**Conclusion:** Standard React Query patterns (optimistic updates with rollback, complex race condition handling) are **overkill** for local-first architecture.

## References

- **Bug Fix:** Commit `d52f512` - Reverted savedGames from React Query cache to useState
- **Root Cause:** Commit `6a3e804` - Introduced savedGames deduplication bug
- **Related:** ADR-001 (Modal Manager Props Pattern)

## Review History

- **2025-01-26:** Initial version (post-bug fix)
- **Next Review:** When adding sync or multi-device features

---

**Document Owner:** Development Team
**Last Updated:** 2025-01-26
