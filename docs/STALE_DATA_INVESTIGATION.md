# Stale Data Investigation Report

## Summary

Investigation of components that manually fetch data instead of using React Query, leading to stale state issues similar to the TeamRosterModal bug.

## Issue Pattern

**Root Cause**: Components maintain local state with manual data fetching via `useEffect`, which becomes stale when:
1. Data is updated elsewhere in the app
2. Modal is reopened without remounting
3. React Query cache has fresher data but component uses stale local state

**Example from TeamRosterModal** (Fixed):
```typescript
// ❌ BEFORE: Stale state anti-pattern
const [masterRosterPlayers, setMasterRosterPlayers] = useState<Player[]>([]);

useEffect(() => {
  if (isOpen && masterRosterPlayers.length === 0) {
    const fetchData = async () => {
      const roster = await getMasterRoster();
      setMasterRosterPlayers(roster || []);
    };
    fetchData();
  }
}, [isOpen]); // Never refetches after first load

// ✅ AFTER: Props-based fresh data
interface TeamRosterModalProps {
  masterRoster: Player[]; // Fresh from React Query
}
// Use masterRoster prop directly, always fresh
```

## Components with Similar Issues

### 1. ✅ TeamRosterModal - **FIXED**
- **File**: `src/components/TeamRosterModal.tsx`
- **Status**: Fixed in previous commit
- **Solution**: Receives `masterRoster` prop from HomePage's React Query data

---

### 2. ⚠️ GameSettingsModal - **NEEDS FIX**
- **File**: `src/components/GameSettingsModal.tsx`
- **Lines**: 207-367

**Current Implementation**:
```typescript
// State declarations (Lines 207-209)
const [seasons, setSeasons] = useState<Season[]>([]);
const [tournaments, setTournaments] = useState<Tournament[]>([]);

// Manual fetching (Lines 342-367)
useEffect(() => {
  if (isOpen) {
    const fetchModalData = async () => {
      try {
        const loadedSeasonsData = await getSeasons();
        setSeasons(Array.isArray(loadedSeasonsData) ? loadedSeasonsData : []);
      } catch (error) {
        logger.error('[GameSettingsModal] Error loading seasons:', error);
        setSeasons([]);
      }
      try {
        const loadedTournamentsData = await getTournaments();
        setTournaments(Array.isArray(loadedTournamentsData) ? loadedTournamentsData : []);
      } catch (error) {
        logger.error('[GameSettingsModal] Error loading tournaments:', error);
        setTournaments([]);
      }
    };
    fetchModalData();
  }
}, [isOpen, t]);
```

**Issue**: Re-fetches every time modal opens, but HomePage already has this data via React Query.

**Recommended Fix**:
1. Add props to interface:
```typescript
interface GameSettingsModalProps {
  // ... existing props
  seasons: Season[];
  tournaments: Tournament[];
}
```

2. Remove local state and manual fetching (delete lines 207-367)

3. Update HomePage to pass React Query data:
```typescript
<GameSettingsModal
  // ... existing props
  seasons={seasonsQueryResult.data || []}
  tournaments={tournamentsQueryResult.data || []}
/>
```

**Impact**: High - this modal is used frequently during gameplay

---

### 3. ⚠️ LoadGameModal - **NEEDS FIX**
- **File**: `src/components/LoadGameModal.tsx`
- **Lines**: 73-107

**Current Implementation**:
```typescript
// State declarations (Lines 74-76)
const [seasons, setSeasons] = useState<Season[]>([]);
const [tournaments, setTournaments] = useState<Tournament[]>([]);
const [teams, setTeams] = useState<Team[]>([]);

// Manual fetching (Lines 79-107)
useEffect(() => {
  if (isOpen) {
    const fetchModalData = async () => {
      try {
        const loadedSeasonsData = await utilGetSeasons();
        setSeasons(Array.isArray(loadedSeasonsData) ? loadedSeasonsData : []);
      } catch (error) {
        logger.error("Error loading seasons via utility:", error);
        setSeasons([]);
      }
      try {
        const loadedTournamentsData = await utilGetTournaments();
        setTournaments(Array.isArray(loadedTournamentsData) ? loadedTournamentsData : []);
      } catch (error) {
        logger.error("Error loading tournaments via utility:", error);
        setTournaments([]);
      }
      try {
        const loadedTeamsData = await getTeams();
        setTeams(Array.isArray(loadedTeamsData) ? loadedTeamsData : []);
      } catch (error) {
        logger.error("Error loading teams via utility:", error);
        setTeams([]);
      }
    };
    fetchModalData();
  }
}, [isOpen]);
```

**Issue**: Fetches on every modal open, duplicating HomePage's React Query data.

**Recommended Fix**:
1. Add props to interface:
```typescript
interface LoadGameModalProps {
  // ... existing props
  seasons: Season[];
  tournaments: Tournament[];
  teams: Team[];
}
```

2. Remove local state and manual fetching (delete lines 74-107)

3. Update HomePage to pass React Query data:
```typescript
<LoadGameModal
  // ... existing props
  seasons={seasonsQueryResult.data || []}
  tournaments={tournamentsQueryResult.data || []}
  teams={teamsQueryResult.data || []}
/>
```

**Impact**: High - this is the main game loading interface

---

### 4. ⚠️ NewGameSetupModal - **NEEDS FIX**
- **File**: `src/components/NewGameSetupModal.tsx`
- **Lines**: 78-180

**Current Implementation**:
```typescript
// State declarations (Lines 79-80)
const [seasons, setSeasons] = useState<Season[]>([]);
const [tournaments, setTournaments] = useState<Tournament[]>([]);

// Complex initialization effect (Lines 113-180)
useEffect(() => {
  if (isOpen) {
    // ... reset form logic

    const fetchData = async () => {
      try {
        const roster: Player[] = await getMasterRoster();
        setAvailablePlayersForSetup(roster || []);

        const seasonsData = await utilGetSeasons();
        setSeasons(Array.isArray(seasonsData) ? seasonsData : []);

        const tournamentsData = await utilGetTournaments();
        setTournaments(Array.isArray(tournamentsData) ? tournamentsData : []);

        const teamsData = await getTeams();
        setTeams(Array.isArray(teamsData) ? teamsData : []);

        // ... more logic
      } catch (err) {
        logger.error("[NewGameSetupModal] Error fetching initial data:", err);
        // ... error handling
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }
}, [isOpen, initialPlayerSelection, t]);
```

**Issue**: Fetches master roster, seasons, tournaments, and teams on every modal open.

**Recommended Fix**:
1. Add props to interface:
```typescript
interface NewGameSetupModalProps {
  // ... existing props
  masterRoster: Player[];
  seasons: Season[];
  tournaments: Tournament[];
  teams: Team[];
}
```

2. Simplify initialization (remove fetching, keep form reset):
```typescript
useEffect(() => {
  if (isOpen) {
    // Keep form reset logic
    setOpponentName('');
    // ... etc

    // Use props directly
    setAvailablePlayersForSetup(masterRoster);
    if (initialPlayerSelection && initialPlayerSelection.length > 0) {
      setSelectedPlayerIds(initialPlayerSelection);
    } else if (masterRoster.length > 0) {
      setSelectedPlayerIds(masterRoster.map(p => p.id));
    }

    setTimeout(() => homeTeamInputRef.current?.focus(), 100);
  }
}, [isOpen, masterRoster, initialPlayerSelection]);
```

3. Update HomePage to pass React Query data:
```typescript
<NewGameSetupModal
  // ... existing props
  masterRoster={masterRosterQueryResultData || []}
  seasons={seasonsQueryResult.data || []}
  tournaments={tournamentsQueryResult.data || []}
  teams={teamsQueryResult.data || []}
/>
```

**Impact**: Critical - this is the main new game creation flow

---

### 5. ✅ OrphanedGameHandler - **ACCEPTABLE (No Fix Needed)**
- **File**: `src/components/OrphanedGameHandler.tsx`
- **Lines**: 40-70

**Current Implementation**:
```typescript
useEffect(() => {
  if (isOpen) {
    loadOrphanedGames();
  }
}, [isOpen]);

const loadOrphanedGames = async () => {
  setIsLoading(true);
  try {
    const [savedGames, availableTeams] = await Promise.all([
      getSavedGames(),
      getTeams()
    ]);

    // ... orphan detection logic
  } catch (error) {
    logger.error('[OrphanedGameHandler] Error loading orphaned games:', error);
  } finally {
    setIsLoading(false);
  }
};
```

**Why This Is Acceptable**:
1. **Specialized Use Case**: This modal performs a specific one-time analysis (detecting orphaned games)
2. **Fresh Data Required**: Needs latest saved games state to detect orphans, not cached data
3. **User-Triggered Refresh**: Has explicit refresh button for re-scanning
4. **Not Frequently Used**: Utility/admin modal, not part of main gameplay flow
5. **Self-Contained Logic**: Orphan detection logic is specific to this component

**Recommendation**: No changes needed. This is a legitimate use case for component-level data fetching.

---

## Summary Table

| Component | File | Status | Priority | Lines | Fix Complexity |
|-----------|------|--------|----------|-------|---------------|
| TeamRosterModal | TeamRosterModal.tsx | ✅ Fixed | N/A | N/A | N/A |
| GameSettingsModal | GameSettingsModal.tsx | ⚠️ Needs Fix | High | 207-367 | Medium |
| LoadGameModal | LoadGameModal.tsx | ⚠️ Needs Fix | High | 74-107 | Low |
| NewGameSetupModal | NewGameSetupModal.tsx | ⚠️ Needs Fix | Critical | 78-180 | Medium |
| OrphanedGameHandler | OrphanedGameHandler.tsx | ✅ Acceptable | N/A | 40-70 | N/A |

## Implementation Strategy

### Step 1: LoadGameModal (Easiest)
- Simple prop addition
- Minimal state logic changes
- Good test case for the pattern

### Step 2: GameSettingsModal (Medium)
- More complex component
- Multiple data dependencies
- Verify team roster integration works correctly

### Step 3: NewGameSetupModal (Most Complex)
- Critical user flow
- Complex initialization logic
- Must preserve form reset behavior
- Test thoroughly with team selection

## Testing Checklist

For each fixed component, verify:
- [ ] Modal shows fresh data when reopened
- [ ] New items created in other modals appear immediately
- [ ] No stale data warnings in console
- [ ] Form reset behavior unchanged
- [ ] Loading states work correctly
- [ ] Error handling preserved

## Expected Outcomes

1. **Data Consistency**: All modals show same fresh data from React Query cache
2. **Performance**: Eliminate redundant fetches (data already in cache)
3. **UX**: No more "missing items" bugs like TeamRosterModal issue
4. **Maintainability**: Single source of truth (React Query in HomePage)
5. **Code Quality**: Remove 300+ lines of duplicated fetching logic

## Additional Notes

- All components already import from HomePage which has React Query hooks
- No new dependencies required
- Changes are purely architectural (data flow, not functionality)
- Risk: Low (same data, different delivery method)
- Testing: Can be done incrementally, one component at a time
