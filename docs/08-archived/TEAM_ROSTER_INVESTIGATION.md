# Investigation: Missing Players in Team Roster Modal

## Issue Reported
When adding players to the master roster and then trying to edit a team, the **newly added players don't appear** in the roster listing opened from the team modal.

## Root Cause Analysis

### The Problem: Stale Master Roster Data

**TeamRosterModal** uses component state to store master roster data instead of React Query, causing stale data issues.

### Code Flow

1. **User adds players to master roster**
   - Opens RosterSettingsModal
   - Adds new players (e.g., "John", "Jane", "Bob")
   - Players saved to IndexedDB
   - React Query cache invalidated ✅
   - HomePage's `masterRosterQueryResultData` updates ✅

2. **User opens TeamRosterModal to edit a team**
   - TeamRosterModal opens
   - **Line 48-87** in TeamRosterModal.tsx:
     ```typescript
     useEffect(() => {
       if (isSelectingFromMaster && masterRosterPlayers.length === 0) {
         getMasterRoster()
           .then((players) => {
             setMasterRosterPlayers(players || []);
           })
       }
     }, [isSelectingFromMaster, masterRosterPlayers.length, teamRoster]);
     ```

3. **First time opening modal**:
   - `masterRosterPlayers.length === 0` → **TRUE**
   - Fetches master roster from IndexedDB
   - Shows all players correctly ✅

4. **User closes modal, adds MORE players, reopens modal**:
   - `masterRosterPlayers.length === 0` → **FALSE** (still has old data)
   - **Master roster is NOT refetched** ❌
   - New players are missing ❌

### The Bug in Detail

**File**: `src/components/TeamRosterModal.tsx`

**Problem 1: Component State Instead of React Query** (Line 31)
```typescript
const [masterRosterPlayers, setMasterRosterPlayers] = useState<Player[]>([]);
```
- Uses local component state
- Doesn't sync with React Query cache
- Persists across modal open/close cycles

**Problem 2: Incomplete State Reset** (Line 40-45)
```typescript
useEffect(() => {
  if (isOpen) {
    setIsSelectingFromMaster(false);
    setSelectedPlayerIds([]);
    // ❌ MISSING: setMasterRosterPlayers([]);
  }
}, [isOpen]);
```
- Resets selection state
- **Does NOT reset master roster data**
- Stale data persists

**Problem 3: Conditional Fetch** (Line 49)
```typescript
if (isSelectingFromMaster && masterRosterPlayers.length === 0) {
```
- Only fetches if state is empty
- State is never cleared → never refetches
- Always shows stale data after first load

### Why HomePage Doesn't Have This Issue

**HomePage uses React Query correctly**:
```typescript
// Line 292-293
const {
  masterRoster: masterRosterQueryResultData,
  // ... other queries
} = useGameDataQueries();

// Line 749-752
useEffect(() => {
  if (masterRosterQueryResultData && Array.isArray(masterRosterQueryResultData)) {
    setAvailablePlayers(masterRosterQueryResultData);
  }
}, [masterRosterQueryResultData]);
```

**Benefits**:
- ✅ Automatically refetches on cache invalidation
- ✅ Always has latest data
- ✅ No manual state management needed

### TeamRosterModal's Approach (Broken)

**TeamRosterModal fetches manually**:
```typescript
// Line 50-85
getMasterRoster()
  .then((players) => {
    setMasterRosterPlayers(players || []);
  })
```

**Problems**:
- ❌ Manual fetch, no cache integration
- ❌ Conditional logic prevents refetching
- ❌ Stale data not detected
- ❌ State not reset on modal close

## Architecture Issue

### Current Data Flow (Broken)

```
[User adds player to master roster]
         ↓
[RosterSettingsModal saves to IndexedDB]
         ↓
[React Query cache invalidated] ✅
         ↓
[HomePage's masterRosterQueryResultData updates] ✅
         ↓
[TeamRosterModal's masterRosterPlayers] ❌ STALE - Not updated!
```

### HomePage vs TeamRosterModal

| Component | Data Source | Updates? | Stale Data? |
|-----------|-------------|----------|-------------|
| HomePage | React Query (`masterRosterQueryResultData`) | ✅ Auto | ❌ Never |
| TeamRosterModal | Component State (`masterRosterPlayers`) | ❌ Manual | ✅ Always |

## Solution Options

### Option 1: Pass masterRosterQueryResultData as Prop (Simplest)

**Changes Needed**:

1. **HomePage.tsx** (Line ~3259):
```typescript
<TeamRosterModal
  isOpen={isTeamRosterModalOpen}
  onClose={handleCloseTeamRosterModal}
  onBack={handleBackToTeamManager}
  teamId={selectedTeamForRoster}
  team={teams.find(t => t.id === selectedTeamForRoster) || null}
  masterRoster={masterRosterQueryResultData || []} // ✅ ADD THIS
/>
```

2. **TeamRosterModal.tsx** (Line ~12-18):
```typescript
interface TeamRosterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBack?: () => void;
  teamId: string | null;
  team: Team | null;
  masterRoster: Player[]; // ✅ ADD THIS
}
```

3. **TeamRosterModal.tsx** (Line ~31, 48-87):
```typescript
// ❌ REMOVE component state
// const [masterRosterPlayers, setMasterRosterPlayers] = useState<Player[]>([]);

// ❌ REMOVE manual fetch useEffect (entire block line 48-87)

// ✅ USE prop directly
const { masterRoster } = props; // Already available from React Query
```

**Benefits**:
- ✅ Simple change (3 lines)
- ✅ Leverages existing React Query infrastructure
- ✅ Always has latest data
- ✅ No stale data possible
- ✅ Consistent with HomePage pattern

**Drawbacks**:
- None

### Option 2: Use React Query Hook in TeamRosterModal (Cleaner)

**Changes Needed**:

1. **TeamRosterModal.tsx**:
```typescript
import { useGameDataQueries } from '@/hooks/useGameDataQueries';

const TeamRosterModal: React.FC<TeamRosterModalProps> = ({ ... }) => {
  const { masterRoster } = useGameDataQueries(); // ✅ ADD THIS

  // ❌ REMOVE: const [masterRosterPlayers, setMasterRosterPlayers] = useState...
  // ❌ REMOVE: getMasterRoster() fetch logic

  // ✅ USE: masterRoster directly (from React Query)
};
```

**Benefits**:
- ✅ More independent component
- ✅ Direct access to React Query cache
- ✅ Automatic refetching
- ✅ No prop drilling

**Drawbacks**:
- Slightly more coupling to React Query

### Option 3: Reset State on Modal Close (Band-Aid)

**Changes Needed**:

1. **TeamRosterModal.tsx** (Line 40-45):
```typescript
useEffect(() => {
  if (isOpen) {
    setIsSelectingFromMaster(false);
    setSelectedPlayerIds([]);
    setMasterRosterPlayers([]); // ✅ ADD THIS
  }
}, [isOpen]);
```

**Benefits**:
- ✅ Minimal change (1 line)
- ✅ Forces refetch on modal open

**Drawbacks**:
- ❌ Still uses component state (anti-pattern)
- ❌ Unnecessary fetch every time modal opens
- ❌ Doesn't leverage React Query cache
- ❌ Inconsistent with HomePage approach

## Recommended Solution

**Option 1: Pass masterRosterQueryResultData as Prop**

**Rationale**:
1. Simplest implementation (3 small changes)
2. Leverages existing React Query infrastructure
3. Consistent with HomePage pattern
4. No unnecessary refetching
5. Always guarantees fresh data

## Testing Steps After Fix

1. **Add players to master roster**:
   - Open RosterSettingsModal
   - Add 3 new players: "Alice", "Bob", "Charlie"
   - Save

2. **Verify players appear in team roster**:
   - Open TeamManagerModal
   - Click "Manage Roster" on any team
   - Click "Select from Master Roster"
   - **Expected**: Alice, Bob, Charlie appear in list ✅

3. **Add more players without closing team modal**:
   - Close team roster modal
   - Open RosterSettingsModal again
   - Add 2 more players: "Dave", "Eve"
   - Save
   - Reopen TeamManagerModal → Manage Roster → Select from Master
   - **Expected**: All 5 players appear (Alice, Bob, Charlie, Dave, Eve) ✅

4. **Verify multiple teams see same roster**:
   - Add players to Team A's roster
   - Switch to Team B → Manage Roster → Select from Master
   - **Expected**: Same master roster players available ✅

## Related Issues

This is the same pattern as the previous fix for savedGames:
- **Similar Issue**: LoadGameModal showing stale scores (0-0)
- **Root Cause**: Local state not syncing with React Query cache
- **Solution**: Invalidate cache / Use React Query data directly

Both issues stem from mixing React Query with manual component state management.

## File Summary

**Files Involved**:
- `src/components/TeamRosterModal.tsx` - Needs fix
- `src/components/HomePage.tsx` - Pass prop or already has query data
- `src/hooks/useGameDataQueries.ts` - Already provides masterRoster query

**Lines to Change**:
- HomePage.tsx: ~3264 (add prop)
- TeamRosterModal.tsx: ~12-18 (add prop interface)
- TeamRosterModal.tsx: ~31 (remove state or use prop)
- TeamRosterModal.tsx: ~48-87 (remove manual fetch or use prop)

---

**Status**: 🔍 Investigation Complete
**Next Step**: Choose solution and implement fix
**Recommendation**: Option 1 (pass prop) - simplest and most consistent
