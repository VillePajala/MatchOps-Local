# Known Issues

## Development Mode Issues

### Hard Reset Shows Harmless Module Error (Dev Only)

**Symptom:**
When using the "Hard Reset" feature in development mode (`npm run dev`), you may see a webpack module error after the page reloads:
```
TypeError: Cannot read properties of undefined (reading 'call')
at layout-router.js / image-external.js
```

**Impact:**
- ✅ **Functionality works correctly** - all data is cleared
- ✅ **App reloads successfully** - starts fresh
- ❌ **Cosmetic error appears** - harmless but looks concerning

**Why This Happens:**
Next.js development mode uses Hot Module Replacement (HMR) to update code without full page reloads. When the app triggers a hard reset:

1. React components are still mounted
2. `window.location.reload()` is called
3. Next.js HMR tries to preserve state
4. Webpack module references become stale during reload
5. Error appears when HMR tries to access invalidated modules

**Why It's Safe to Ignore:**
- The error occurs AFTER storage is already cleared
- The page successfully reloads with clean data
- It's purely a timing issue with webpack's module system
- Production builds (`npm run build && npm start`) don't have HMR and never show this error

**Resolution:**
This is a limitation of Next.js development mode that cannot be fully eliminated without disabling HMR entirely. The code includes:
- Early return pattern to minimize component rendering during reset
- Full-screen overlay to hide UI complexity during transition
- These reduce but don't eliminate the race condition

**Workaround for Development:**
If the error message bothers you during development:
1. Simply refresh the page manually (F5) - the reset was successful
2. Or use the browser console method:
   ```javascript
   const { clearStorage } = await import('/src/utils/storage.js');
   await clearStorage();
   // Then press F5
   ```

**For Production:**
This issue does NOT occur in production builds. Users will never see this error.

---

## Timer State Issues

### Timer State Not Preserved When Switching Games

**Status:** Non-Critical - Deferred

**Symptom:**
When switching between games, the timer resets to 00:00 instead of preserving the elapsed time from when the game was paused.

**Impact:**
- ✅ **Timer pause works correctly** - no extra time added
- ✅ **Timer saves on pause** - `timeElapsedInSeconds` included in history
- ❌ **Timer doesn't restore** - value resets when loading a game

**Root Cause:**
The `LOAD_PERSISTED_GAME_DATA` action in `useGameSessionReducer.ts` (line 413) is supposed to restore the timer:
```typescript
const timeElapsedAtLoad = loadedData.timeElapsedInSeconds ?? fallbackTimeElapsed;
```

However, despite the fix to add `timeElapsedInSeconds` to:
- `AppState` interface (`src/types/game.ts:95`)
- `buildGameSessionHistorySlice` (`src/components/HomePage/hooks/useGameOrchestration.ts:294`)
- `HISTORY_SAVING_ACTIONS` (includes `PAUSE_TIMER`)

The value is still not being properly restored from IndexedDB.

**Investigation Needed:**
1. Verify that `timeElapsedInSeconds` is actually being written to IndexedDB
2. Check if the value is being overwritten during the load process
3. Verify the `LOAD_PERSISTED_GAME_DATA` payload contains the field
4. Check for timing issues between game load and timer initialization

**Workaround:**
Users can manually note the elapsed time before switching games. The timer works correctly within a single game session.

**Files Involved:**
- `src/hooks/useGameSessionReducer.ts` (LOAD_PERSISTED_GAME_DATA action)
- `src/types/game.ts` (AppState interface)
- `src/components/HomePage/hooks/useGameOrchestration.ts` (buildGameSessionHistorySlice)
- `src/hooks/useGameSessionWithHistory.ts` (HISTORY_SAVING_ACTIONS)

**Related Fixes Applied:**
- ✅ Fixed timer pause race condition (passes precise time to PAUSE_TIMER)
- ✅ Added `timeElapsedInSeconds` to AppState and history slice
- ✅ Moved PAUSE_TIMER to HISTORY_SAVING_ACTIONS

**Next Steps:**
- [ ] Debug actual IndexedDB writes to verify data is being saved
- [ ] Add console logging to LOAD_PERSISTED_GAME_DATA to see payload
- [ ] Check if any other code paths are overwriting the timer value
- [ ] Verify the auto-save debouncing isn't preventing the save

---

## Display Issues

### ~~Goal Timestamps Display Full Floating-Point Precision~~

**Status:** ✅ RESOLVED (December 2025)

**Discovered:** November 20, 2025 (during Step 2.6.5 manual testing)

**Symptom:**
Goal timestamps are displayed with full floating-point precision instead of being rounded to 2 decimal places:
```
00:7,233339999999977252  ❌ (what's shown)
00:7.23                  ✅ (what should be shown)
```

**Impact:**
- ❌ **Confusing display** - timestamps are hard to read
- ❌ **Inconsistent formatting** - appears in 3 different modals
- ✅ **No data corruption** - values are stored correctly in state
- ✅ **Functionality works** - goals are logged and counted correctly

**Affected Components:**
1. Goal logging modal (`OpponentGoalLogModal`)
2. Stats modal (`GameStatsModal`)
3. Game settings modal (`GameSettingsModal`)

**Root Cause:**
Goal event creation stores the raw floating-point value from `gameSessionState.timeElapsedInSeconds` without rounding:

```typescript
// Current (causes issue):
time: gameSessionState.timeElapsedInSeconds  // 7.233339999999977252

// Fixed (in useTimerManagement.ts but not committed):
time: Math.round(gameSessionState.timeElapsedInSeconds * 100) / 100  // 7.23
```

**Fix Applied (Not Yet Committed):**
Updated both goal handlers in `src/components/HomePage/hooks/useTimerManagement.ts`:

1. **`handleAddGoalEvent`** (line 155):
   ```typescript
   time: Math.round(gameSessionState.timeElapsedInSeconds * 100) / 100,
   ```

2. **`handleLogOpponentGoal`** (line 180):
   ```typescript
   time: Math.round(time * 100) / 100,
   ```

**Resolution:**
Fix was already in place in `useTimerManagement.ts` (lines 156 and 180) using `Math.round(time * 100) / 100`.

**Files Fixed:**
- `src/components/HomePage/hooks/useTimerManagement.ts` (goal event creation - rounds to 2 decimals)

---

## Other Known Issues

(None currently)
