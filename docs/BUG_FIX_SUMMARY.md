# Bug Fix Summary: LoadGameModal Not Updating Scores

## Issue Reported
When logging goals during a game, the statistics update correctly and auto-save triggers, but the **saved games list** (LoadGameModal) still shows **0-0** instead of the actual score.

## Root Cause Analysis

### The Problem
The app has **two sources of truth** for saved games data:

1. **Local React State** (`savedGames` useState) - Updated by `handleQuickSaveGame`
2. **React Query Cache** (`allSavedGamesQueryResultData`) - Fetched from IndexedDB

### The Bug Flow
1. User logs a goal → Score changes to 1-0
2. Auto-save triggers → `handleQuickSaveGame()` runs
3. Function updates:
   - ✅ IndexedDB (via `utilSaveGame`)
   - ✅ Local state (via `setSavedGames`)
4. User opens LoadGameModal
5. **BUG**: HomePage's useEffect (lines 864-866) runs:
   ```typescript
   if (allSavedGamesQueryResultData) {
     setSavedGames(allSavedGamesQueryResultData || {});
   }
   ```
6. React Query cache is **stale** (not invalidated)
7. Local `savedGames` state gets **overwritten** with stale 0-0 data
8. LoadGameModal displays 0-0 ❌

## Solution

Add `queryClient.invalidateQueries()` after **every** game save operation to tell React Query the cache is stale and needs refetching.

### Files Changed
- `src/components/HomePage.tsx` (5 locations)
- `src/hooks/useAutoSave.test.ts` (TypeScript fix - unrelated)

### Changes Made

#### 1. Auto-Save Function (Line ~2123)
```typescript
await utilSaveGame(currentGameId, currentSnapshot);
await utilSaveCurrentGameIdSetting(currentGameId);

// ✅ NEW: Invalidate cache
queryClient.invalidateQueries({ queryKey: queryKeys.savedGames });
```

#### 2. Team Reassignment (Line ~604)
```typescript
await utilSaveGame(currentGameId, updatedGame);
setSavedGames(prev => ({...prev, [currentGameId]: updatedGame}));

// ✅ NEW: Invalidate cache
queryClient.invalidateQueries({ queryKey: queryKeys.savedGames });
```

#### 3. Auto-Save useEffect (Line ~1219)
```typescript
await utilSaveGame(currentGameId, currentSnapshot);
await utilSaveCurrentGameIdSetting(currentGameId);

// ✅ NEW: Invalidate cache
queryClient.invalidateQueries({ queryKey: queryKeys.savedGames });
```

#### 4. Goalie Toggle (Line ~1978)
```typescript
await utilSaveGame(currentGameId, {
  ...gameSessionState,
  availablePlayers: updatedAvailablePlayers,
  playersOnField: updatedFieldPlayers,
});

// ✅ NEW: Invalidate cache
queryClient.invalidateQueries({ queryKey: queryKeys.savedGames });
```

#### 5. New Game Creation (Line ~2448)
```typescript
await utilSaveGame(newGameId, newGameState);
await utilSaveCurrentGameIdSetting(newGameId);

// ✅ NEW: Invalidate cache
queryClient.invalidateQueries({ queryKey: queryKeys.savedGames });
```

### Dependency Array Updates
Added `queryClient` to dependency arrays for:
- `handleQuickSaveGame` (line 2198)
- `handleToggleGoalieForGame` (line 1989)
- `handleStartNewGameWithSetup` (line 2482)
- Auto-save useEffect (line 1242)

## How React Query Works

### Before Fix (Broken)
```
[User Action] → [Save to IndexedDB] → [Update Local State]
                                    ↓
                            [React Query Cache: STALE]
                                    ↓
[User Opens Modal] → [useEffect runs] → [Overwrites with stale data]
                                    ↓
                            [Modal shows 0-0 ❌]
```

### After Fix (Working)
```
[User Action] → [Save to IndexedDB] → [Update Local State]
                                    ↓
                            [Invalidate Query Cache]
                                    ↓
[User Opens Modal] → [useEffect runs] → [Refetches from IndexedDB]
                                    ↓
                            [Modal shows 2-1 ✅]
```

## Testing Performed

### Build & Lint
```bash
npm run build  # ✅ Passed
npm run lint   # ✅ Passed
npx tsc --noEmit  # ✅ Passed
```

### Manual Testing Steps
1. Create a new game
2. Log 2 goals (score becomes 2-0)
3. Verify console shows: `[useAutoSave] Immediate save triggered`
4. Open LoadGameModal
5. **Verify**: Current game card shows **2-0** (not 0-0)

## Similar Issues Found & Fixed

During investigation, found **4 additional places** where `utilSaveGame` was called without invalidating the cache:
1. ✅ Team reassignment (line 595)
2. ✅ Auto-save useEffect (line 1213)
3. ✅ Goalie toggle (line 1971)
4. ✅ New game creation (line 2444)

All fixed in this commit.

## Why This Pattern?

### Alternative Approaches Considered

#### ❌ Don't Use React Query
**Rejected**: Would lose caching, automatic refetching, loading states, error handling

#### ❌ Use Only Local State
**Rejected**: Loses persistence across page reloads, no automatic sync with IndexedDB

#### ❌ Optimistic Updates Only
**Rejected**: Risk of drift between local state and IndexedDB if save fails

#### ✅ Invalidate Cache After Mutations (Chosen)
**Benefits**:
- Maintains single source of truth (IndexedDB)
- React Query automatically refetches when needed
- No risk of stale data
- Consistent with other mutations in the app (seasons, tournaments)

## Commit Info
```
Commit: 6ed75d6
Branch: feat/indexeddb-complete-implementation
Files Changed: 2 files (HomePage.tsx, useAutoSave.test.ts)
Lines Added: ~25 (5 invalidateQueries calls + dependency updates)
```

## To Push Changes
```bash
# Manual push required due to git credential issue
git push origin feat/indexeddb-complete-implementation
```

## Related Documentation
- See [MANUAL_TESTING_GUIDE.md](MANUAL_TESTING_GUIDE.md) for comprehensive testing steps
- See commit `0f4a500` for auto-save implementation details
- See commit `d4def10` for storage race condition fixes

---

**Status**: ✅ Fixed and tested
**Impact**: High - fixes critical UX issue where users see incorrect scores
**Risk**: Low - follows established pattern from other mutations
