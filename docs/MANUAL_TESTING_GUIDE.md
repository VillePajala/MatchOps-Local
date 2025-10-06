# Manual Testing Guide - Auto-Save & Recent Bug Fixes

This guide will help you manually test the recently implemented auto-save feature and bug fixes for storage race conditions.

## What Changed Recently

### 1. Smart Auto-Save with Tiered Debouncing (commit 0f4a500)
- **Immediate (0ms)**: Goals, scores save instantly for real-time statistics
- **Short (500ms)**: Team names, notes debounced to prevent excessive saves
- **Long (2000ms)**: Player positions, drawings debounced to save battery

### 2. Storage Race Condition Fixes (commit d4def10)
- Per-key locking prevents concurrent writes to same data
- Eliminates race conditions when multiple components save simultaneously

### 3. IndexedDB-Only Architecture Alignment (commit 564d408)
- Migration reads from localStorage directly instead of through storage adapter
- Fixes potential initialization order issues

---

## Pre-Testing Setup

### 1. Start Development Server
```bash
npm run dev
```

The app should be available at `http://localhost:3000`

### 2. Open Browser DevTools
- Press `F12` or right-click → "Inspect"
- Go to **Console** tab to see auto-save log messages
- Go to **Application** → **IndexedDB** to inspect stored data

### 3. Enable Verbose Logging (Optional)
Look for messages like:
```
[useAutoSave] Immediate save triggered for game game_...
[useAutoSave] Short-delay save triggered for game game_...
[useAutoSave] Long-delay save triggered for game game_...
```

---

## Test Suite

## Test 1: Immediate Save (Goals & Scores)

**Purpose:** Verify goals and scores save instantly without delay

**Steps:**
1. **Create a new game** or load an existing one
2. **Open Console tab** in DevTools
3. **Add a goal** by clicking a player on the field or using goal buttons
4. **Observe Console** - you should see:
   ```
   [useAutoSave] Immediate save triggered for game game_...
   ```
   This should appear **immediately** (within 10ms)

5. **Increment score** using +1 buttons for home/away
6. **Verify:** Another immediate save message appears instantly

**Expected Behavior:**
- ✅ Save triggers **instantly** (no delay)
- ✅ Statistics update immediately
- ✅ No visual lag when logging goals

**Why This Matters:**
Goals affect statistics calculations. Delayed saves would cause temporary incorrect stats.

---

## Test 2: Short Delay Save (Team Names & Notes)

**Purpose:** Verify metadata changes debounce to prevent excessive saves

**Steps:**
1. **Open game settings** (⚙️ icon or settings modal)
2. **Open Console tab** in DevTools
3. **Type in "Team Name" field** - type quickly: "My Team ABC"
4. **Stop typing** and wait
5. **Observe Console** - you should see save message **after ~500ms** of inactivity:
   ```
   [useAutoSave] Short-delay save triggered for game game_...
   ```

6. **Continue typing** - add " DEF" to the name
7. **Verify:** The 500ms timer resets, only saves **after** you stop typing

**Expected Behavior:**
- ✅ Save triggers **500ms after last keystroke**
- ✅ Multiple rapid changes result in **single save**
- ✅ No save spam during typing

**Why This Matters:**
Prevents excessive storage writes during text input, improving performance and battery life.

---

## Test 3: Long Delay Save (Player Positions & Drawings)

**Purpose:** Verify tactical data changes have longest debounce for battery savings

**Steps:**
1. **Drag a player** on the soccer field to a new position
2. **Open Console tab** in DevTools
3. **Continue dragging** - move the player 5-10 times quickly
4. **Release and wait**
5. **Observe Console** - save message appears **after ~2000ms** (2 seconds):
   ```
   [useAutoSave] Long-delay save triggered for game game_...
   ```

6. **Test with drawings:**
   - Enable drawing mode
   - Draw several lines/shapes quickly
   - Stop drawing
   - Wait 2 seconds
   - Verify single save occurs

**Expected Behavior:**
- ✅ Save triggers **2 seconds after last position change**
- ✅ Multiple rapid drags result in **single save**
- ✅ Drawings debounce similarly

**Why This Matters:**
Player positioning often involves multiple adjustments. Long debounce prevents battery drain from constant saves.

---

## Test 4: Mixed Changes (All Three Tiers)

**Purpose:** Verify different save tiers work independently without interference

**Steps:**
1. **Start fresh** - reload page or create new game
2. **Open Console tab** in DevTools
3. **Perform all three actions simultaneously:**
   - Add a goal (immediate tier)
   - Change team name (short tier)
   - Move a player (long tier)

4. **Observe Console** - you should see saves in order:
   ```
   [useAutoSave] Immediate save triggered for game game_...  (instantly)
   [useAutoSave] Short-delay save triggered for game game_...  (after 500ms)
   [useAutoSave] Long-delay save triggered for game game_...  (after 2000ms)
   ```

5. **Verify timing:**
   - First save: ~0ms (immediate)
   - Second save: ~500ms after team name change
   - Third save: ~2000ms after player position change

**Expected Behavior:**
- ✅ Three separate saves occur
- ✅ Each respects its own delay tier
- ✅ No interference between tiers

**Why This Matters:**
Real gameplay involves simultaneous changes. Independent timers ensure correct behavior.

---

## Test 5: Storage Race Condition Prevention

**Purpose:** Verify per-key locking prevents data corruption from concurrent saves

**Steps:**
1. **Open two tabs** with the same game (if multi-tab is supported)
   - OR perform rapid actions that trigger multiple save operations
2. **In Tab 1:** Add a goal
3. **In Tab 2:** Change team name
4. **Verify in DevTools → Application → IndexedDB:**
   - Open `MatchOps` database
   - Check `saved_games` store
   - Find your game entry
   - Verify both changes are present:
     - Goal is recorded in `gameEvents`
     - Team name is updated in `teamName`

5. **Test rapid concurrent changes:**
   - Add goal
   - Immediately change team name
   - Immediately move player
   - Wait 3 seconds
   - Verify all changes persisted correctly

**Expected Behavior:**
- ✅ No data loss when multiple saves happen quickly
- ✅ All changes persist correctly
- ✅ No console errors about lock timeouts

**Why This Matters:**
Per-key locks prevent data corruption when multiple components save simultaneously.

---

## Test 6: Auto-Save Disabled State

**Purpose:** Verify auto-save doesn't trigger for default/unsaved games

**Steps:**
1. **Create new game** (but don't start it yet)
2. **Open Console tab**
3. **Make changes** (add players, change name, etc.)
4. **Observe Console** - should see:
   - No auto-save messages (or messages indicating auto-save is disabled)

5. **Start the game** (click "Start Game")
6. **Make a change** (add goal)
7. **Verify:** Auto-save is now active (save messages appear)

**Expected Behavior:**
- ✅ No auto-saves before game starts
- ✅ Auto-save activates after game starts
- ✅ Only saved games trigger auto-save

**Why This Matters:**
Prevents saving incomplete game setups or default states.

---

## Test 7: Data Persistence Verification

**Purpose:** Verify auto-saved data persists across page reloads

**Steps:**
1. **Create and start a game**
2. **Make several changes:**
   - Add 2 goals
   - Change team name to "Test Team"
   - Move 2 players to specific positions
   - Add a drawing
3. **Wait 3 seconds** (ensure all saves complete)
4. **Note the exact state:**
   - Score (e.g., 2-0)
   - Team name ("Test Team")
   - Player positions (screenshot or note)
   - Drawing presence

5. **Reload the page** (F5 or Ctrl+R)
6. **Load the same game**
7. **Verify all changes persisted:**
   - Score matches (2-0)
   - Team name matches ("Test Team")
   - Player positions match
   - Drawing is present

**Expected Behavior:**
- ✅ All auto-saved changes persist
- ✅ No data loss on reload
- ✅ Game resumes exactly as left

**Why This Matters:**
Core functionality - auto-save is useless if data doesn't persist.

---

## Test 8: Migration from localStorage to IndexedDB

**Purpose:** Verify existing localStorage data migrates correctly

**Note:** This is only testable if you have existing data in localStorage from an older version.

**Steps:**
1. **If you have old localStorage data:**
   - Open DevTools → Application → Local Storage
   - Check for keys like `saved_games`, `master_roster`, etc.

2. **Load the app** (migration should run automatically on first load)

3. **Open Console** - look for migration messages:
   ```
   [Migration] Starting migration...
   [Migration] Migrated X keys successfully
   [Migration] Migration complete
   ```

4. **Verify data in IndexedDB:**
   - DevTools → Application → IndexedDB → MatchOps database
   - Check `saved_games`, `master_roster`, etc.
   - Verify data matches what was in localStorage

5. **Load a migrated game**
6. **Verify:** All data (players, scores, settings) is intact

**Expected Behavior:**
- ✅ Migration runs automatically
- ✅ All data transfers to IndexedDB
- ✅ No data loss
- ✅ Games load correctly after migration

**Why This Matters:**
Users upgrading from localStorage version shouldn't lose data.

---

## Common Issues & Troubleshooting

### Issue 1: Save Messages Not Appearing
**Symptoms:** No console messages when making changes
**Possible Causes:**
- Auto-save is disabled (game not started)
- Console filtering is hiding info messages
- Browser console is set to "Errors Only"

**Fix:**
- Ensure game is started (not DEFAULT_GAME_ID)
- Check console filter settings (should show "Info" level)
- Verify `enabled` prop is `true` in useAutoSave hook

### Issue 2: Changes Not Persisting
**Symptoms:** Changes disappear on reload
**Possible Causes:**
- IndexedDB is disabled (private/incognito mode)
- Browser storage quota exceeded
- Save didn't complete before reload

**Fix:**
- Use regular browsing mode (not private/incognito)
- Check DevTools → Application → Storage quota
- Wait 3 seconds after changes before reloading

### Issue 3: Too Many Saves / Performance Issues
**Symptoms:** Console flooded with save messages
**Possible Causes:**
- State is changing every render (infinite loop)
- Debounce delays are too short
- Circular reference in state causing constant serialization changes

**Fix:**
- Check for infinite render loops
- Verify delays: immediate=0ms, short=500ms, long=2000ms
- Check console for serialization errors

### Issue 4: Race Condition Errors
**Symptoms:** Errors about "lock timeout" or "concurrent access"
**Possible Causes:**
- Lock timeout is too short
- Deadlock in save logic
- Multiple components saving same key

**Fix:**
- Check lock timeout setting (default 5000ms)
- Verify save function completes successfully
- Check console for lock-related errors

---

## Performance Monitoring

### Check Save Frequency
Monitor the console to verify save behavior:

**Good Pattern:**
```
[useAutoSave] Immediate save triggered for game game_abc123  (goal added)
... wait 2 seconds of gameplay ...
[useAutoSave] Long-delay save triggered for game game_abc123  (positions updated)
```

**Bad Pattern (Too Frequent):**
```
[useAutoSave] Long-delay save triggered...
[useAutoSave] Long-delay save triggered...  (200ms later)
[useAutoSave] Long-delay save triggered...  (200ms later)
```
This indicates debouncing isn't working correctly.

### Check IndexedDB Size
1. DevTools → Application → Storage
2. Check "Usage" under IndexedDB
3. Typical sizes:
   - Empty app: ~50KB
   - 10 games with players: ~500KB-1MB
   - 50 games with full data: ~2-5MB

**Alert:** If size grows rapidly (>10MB in minutes), investigate save logic.

---

## Browser Compatibility Testing

Test in multiple browsers to ensure consistency:

### Chrome/Edge (Chromium)
- ✅ Full support expected
- ✅ IndexedDB quota: ~60% of disk space
- ✅ Private mode: IndexedDB available but cleared on close

### Firefox
- ✅ Full support expected
- ✅ IndexedDB quota: ~50% of disk space
- ✅ Private mode: IndexedDB available (encrypted in-memory)

### Safari
- ✅ Full support expected
- ✅ IndexedDB quota: More restrictive (~1GB)
- ✅ Private mode: In-memory only, cleared on close

**Test on at least Chrome and Firefox for comprehensive coverage.**

---

## Success Criteria

Your implementation passes if:

✅ **Immediate saves** trigger instantly (<50ms) for goals/scores
✅ **Short delay saves** debounce at 500ms for metadata
✅ **Long delay saves** debounce at 2000ms for tactical data
✅ **Multiple rapid changes** result in single save (debouncing works)
✅ **All changes persist** across page reloads
✅ **No console errors** during normal usage
✅ **No data loss** from concurrent saves
✅ **IndexedDB data** is valid and complete

---

## Reporting Issues

If you find issues during testing, provide:

1. **Browser & Version** (e.g., Chrome 120, Firefox 121)
2. **Steps to Reproduce** (exact actions taken)
3. **Expected Behavior** (what should happen)
4. **Actual Behavior** (what actually happens)
5. **Console Logs** (any errors or unexpected messages)
6. **Screenshots** (especially for UI issues)

Example:
```
Browser: Chrome 120
Steps:
1. Create new game
2. Add 3 goals rapidly
3. Reload page within 1 second
Expected: All 3 goals saved
Actual: Only 2 goals saved
Console: [useAutoSave] Immediate save triggered (x2)
```

---

## Advanced Testing (Optional)

### Test with Network Throttling
1. DevTools → Network tab → Throttling → "Slow 3G"
2. Perform saves
3. Verify: IndexedDB saves work offline (no network needed)

### Test with Large Datasets
1. Create 50+ players in roster
2. Create 10+ games
3. Perform rapid saves
4. Verify: No performance degradation

### Test Error Recovery
1. DevTools → Application → IndexedDB
2. Right-click database → Delete database
3. Reload app
4. Verify: App handles missing database gracefully

---

## Next Steps After Testing

1. ✅ **If all tests pass:** You're ready for production!
2. ⚠️ **If issues found:** Document them and prioritize fixes
3. 📊 **Performance data:** Note any slow operations (>100ms saves)
4. 🐛 **Edge cases:** Document any unusual behavior for future reference

---

**Testing completed on:** _____________
**Tested by:** _____________
**Browser(s):** _____________
**Result:** ✅ Pass / ❌ Fail (see issues below)
**Issues found:** _____________
