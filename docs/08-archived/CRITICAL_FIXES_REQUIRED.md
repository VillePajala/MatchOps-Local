# ⚠️ CRITICAL FIXES REQUIRED - DO NOT PROCEED TO NEXT PHASE

**Status**: 🟡 **MOSTLY RESOLVED** - Major issues fixed, minor items remaining
**Last Updated**: December 1, 2025 (fixes implemented)
**Source**: November 2025 Code Review + December 2025 Fixes

---

## 🚨 EXECUTIVE SUMMARY

**UPDATE (Dec 1, 2025)**: Critical issues from November 2025 code review have been **FIXED** on branch `fix/december-2025-code-review`.

### Fixes Completed (December 1, 2025)
| Issue | Status | Description |
|-------|--------|-------------|
| C1 | ✅ FIXED | JSON parsing validation with graceful degradation |
| C3 | ✅ FIXED | Silent error swallowing - added proper logging |
| C4 | ✅ FIXED | SoccerField LRU cache (10 entry limit) |
| H1 | ✅ FALSE POSITIVE | Already has proper cleanup |
| H3 | ✅ FALSE POSITIVE | Already returns defaults correctly |
| H4 | ✅ FIXED | Fire-and-forget promise with mounted flag |

### P0 Refactoring Status: ✅ COMPLETE
- **HomePage.tsx**: **62 lines** ✅ (down from 3,680 - **98.3% reduction!**)
- **useGameOrchestration.ts**: Split into 6 focused hooks ✅
- **Architecture**: ✅ CORRECT (industry-standard React pattern)

### Remaining Issues (Lower Priority)
- **C2**: Transaction safety - documented, risk mitigated by existing `withKeyLock`
- **C5**: Prop drilling - architectural, defer to Layer 3
- **H2**: Race condition in game loading - needs investigation
- **H5**: Data migration verification - low frequency operation
- **H6**: Error boundaries for modals - would improve UX

**Bottom Line**: Critical data integrity risks **RESOLVED**. Remaining issues are lower priority and don't block feature development.

---

## 📝 REFACTORING APPROACH DECISION (2025-11-05)

**Decision**: **SKIPPING comprehensive test-driven refactoring approach**

**Reason**: After detailed analysis, the proposed test-driven refactoring (Phase 0: Tests → Phase 1: Hook Extraction → Phase 2: Component Decomposition) was determined to be **too complex and time-consuming** for the current project phase.

### Why Skipped

1. **Excessive Upfront Cost**: Estimated 5 weeks (25 days) total effort
   - Phase 0 alone: 3-4 days just writing tests before ANY refactoring
   - Risk of analysis paralysis and scope creep

2. **Complexity**: Required coordinating multiple extraction phases:
   - 4 custom hooks to extract (useModalState, useCompetitionManagement, useGamePersistence, useTimerControls)
   - 8 new components to create
   - Extensive test infrastructure buildout

3. **Diminishing Returns**: The codebase already has:
   - ~57% statement coverage, 45% branch coverage
   - Existing integration tests for core workflows
   - Working domain hooks (useGameSessionReducer, useGameTimer, etc.)

4. **Better Path Forward**: Incremental, targeted fixes as needed:
   - Fix specific bugs when encountered
   - Extract components only when actively working in that area
   - Add tests for new features, not comprehensive retroactive coverage

### What This Means

✅ **DO**:
- Continue with iterative improvements
- Write tests for NEW code and bug fixes
- Extract components opportunistically when modifying areas
- Focus on delivering features over perfect architecture

❌ **DON'T**:
- Attempt large-scale refactoring without immediate business need
- Block feature development waiting for "perfect" architecture
- Create elaborate test infrastructure for legacy code

### Future Consideration

If the monolithic structure becomes a genuine blocker (e.g., multiple developers blocked, high bug rate), revisit with:
- Smaller scope (target ONE specific component, not entire codebase)
- Business justification (clear ROI calculation)
- Incremental approach (one component at a time, not all phases)

**Bottom Line**: Pragmatic iteration beats perfect architecture every time.

### Related Documentation

- **[TECH_DEBT_REDUCTION_PLAN.md](./TECH_DEBT_REDUCTION_PLAN.md)**: Comprehensive 5-phase plan that was considered but NOT adopted. Archived for reference.
- **Current Approach**: Incremental extraction as demonstrated by newGameHandlers.ts extraction (33.6% reduction in 2 hours).

---

## ⛔ DO NOT PROCEED WARNING

**STOP before starting any of these activities:**

- [ ] Adding new major features
- [ ] Implementing new game modes
- [ ] Adding complex UI components
- [ ] Refactoring other parts of the system
- [ ] Performance optimization work
- [ ] New integrations or APIs

**WHY?** While P0 refactoring is complete, the codebase has **data integrity risks** that could cause silent data loss.

---

## 🆕 NOVEMBER 2025 CODE REVIEW FINDINGS

### CRITICAL ISSUES (Must Fix Before New Features)

#### C1. Data Integrity: Unvalidated JSON Parsing ✅ FIXED
**Severity**: CRITICAL | **Risk**: Data Loss/App Crash | **Effort**: 2-3h | **Status**: ✅ FIXED (Dec 1, 2025)

**Locations**:
- `src/utils/savedGames.ts:51-62`
- `src/utils/appSettings.ts:83` (already handled correctly)
- `src/utils/teams.ts`
- `src/utils/seasons.ts`

**Problem**:
```typescript
// Current pattern - NO VALIDATION
return JSON.parse(gamesJson) as SavedGamesCollection;  // ❌ Crashes on corruption
```

**Impact**:
- Single corrupted record in IndexedDB crashes entire app
- No schema validation before type casting
- No try-recovery pattern for malformed data
- Users cannot recover without factory reset

**Solution Implemented**: Added graceful degradation pattern with safe JSON parsing:
```typescript
// Now returns empty data on corruption instead of crashing
let parsed: unknown;
try {
  parsed = JSON.parse(gamesJson);
} catch (parseError) {
  logger.error('[getSavedGames] JSON parse failed - data may be corrupted.', { error: parseError });
  return {};  // Graceful degradation
}
```
Applied to: `savedGames.ts`, `seasons.ts`, `tournaments.ts`

---

#### C2. Missing Transaction Safety in Multi-Step Operations
**Severity**: CRITICAL | **Risk**: Race Conditions/Data Corruption | **Effort**: 2h

**Location**: `src/utils/savedGames.ts:87-103`

**Problem**:
```typescript
const allGames = await getSavedGames();  // Step 1: READ
allGames[gameId] = gameData;              // Step 2: MODIFY (in memory)
await setStorageItem(key, JSON.stringify(allGames)); // Step 3: WRITE
```

**Impact**:
- If getSavedGames() throws, operation partially completes
- If write fails, in-memory modification is lost
- Concurrent operations can overwrite each other

**Fix**: Implement read-modify-write with verification, consider optimistic concurrency.

---

#### C3. Silent Error Swallowing (80+ Locations) ✅ FIXED
**Severity**: CRITICAL | **Risk**: Data Loss Without User Awareness | **Effort**: 2-3h | **Status**: ✅ FIXED (Dec 1, 2025)

**Locations (All `.catch(() => {})` patterns)**:
| File | Line | Operation |
|------|------|-----------|
| `src/components/HomePage/hooks/useGameOrchestration.ts` | 302 | `utilUpdateAppSettings()` |
| `src/components/HomePage/hooks/useGameOrchestration.ts` | 877 | `removeStorageItem()` |
| `src/components/HomePage/hooks/useGameOrchestration.ts` | 882 | `utilSaveCurrentGameIdSetting()` |
| `src/components/HomePage/hooks/useGameOrchestration.ts` | 1643 | Settings update |
| `src/components/StartScreen.tsx` | 52 | `updateAppSettings()` |
| `src/components/PlayerStatsView.tsx` | 853 | `updateAppSettings()` |

**Impact**:
- Language changes won't persist
- Timer state won't be cleaned
- Current game ID won't be saved
- User never knows their data didn't save

**Solution Implemented**: Added proper error logging to all silent catch blocks:
```typescript
// Before: .catch(() => {})
// After:
.catch((error) => {
  logger.error('[context] Operation failed:', { error });
});
```
Applied to: `useGameOrchestration.ts`, `StartScreen.tsx`, `PlayerStatsView.tsx`

---

#### C4. Memory Leak: SoccerField Background Cache ✅ FIXED
**Severity**: HIGH | **Risk**: App Slowdown/Crash on Long Sessions | **Effort**: 1h | **Status**: ✅ FIXED (Dec 1, 2025)

**Location**: `src/components/SoccerField.tsx:48`

**Problem**:
```typescript
const backgroundCache: Map<string, HTMLCanvasElement> = new Map();
// Never clears - grows unbounded with window resizing
```

**Impact**: 2-hour game with orientation changes could accumulate 100+ canvas elements, causing memory exhaustion.

**Solution Implemented**: LRU cache with 10 entry limit:
```typescript
const MAX_CACHE_SIZE = 10;

const getFromCache = (key: string): HTMLCanvasElement | undefined => {
  if (!backgroundCache.has(key)) return undefined;
  const value = backgroundCache.get(key)!;
  backgroundCache.delete(key);  // Move to end (most recently used)
  backgroundCache.set(key, value);
  return value;
};

const addToCache = (key: string, value: HTMLCanvasElement): void => {
  if (backgroundCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = backgroundCache.keys().next().value;
    backgroundCache.delete(oldestKey);  // Remove oldest
  }
  backgroundCache.set(key, value);
};
```

---

#### C5. Prop Drilling: useModalOrchestration (80+ Props)
**Severity**: CRITICAL (Architectural) | **Risk**: Unmaintainable Code | **Effort**: 8h+ (DEFER)

**Location**: `src/components/HomePage/hooks/useModalOrchestration.ts:38-150`

**Problem**: 80+ props passed through modal orchestration layer.

**Impact**:
- Extreme coupling between hooks
- Testing requires mocking 80+ parameters
- High risk of stale closures
- Any child modal change requires interface updates

**Fix**: Defer to Layer 3 - decompose using React Context pattern.

---

### HIGH SEVERITY ISSUES

#### H1. useWakeLock Missing Cleanup on Unmount ✅ FALSE POSITIVE
**Location**: `src/hooks/useWakeLock.ts:39-58, 77-80, 100-150`
**Effort**: N/A | **Status**: ✅ FALSE POSITIVE (Dec 1, 2025)

**Problem**: Retry timeout can fire after component unmounts.
**Verification**: Upon code review, this was a **false positive**. The hook already has proper cleanup at lines 116-134 that clears `retryTimeoutRef` and releases wake lock on unmount.

---

#### H2. Race Condition in Game Loading
**Location**: `src/app/page.tsx:28-71, 75, 81`
**Effort**: 1h

**Problem**:
- Import success increments `refreshTrigger` (line 75)
- Effect re-runs during import (line 81)
- Two concurrent `runMigration()` calls possible

**Impact**: IndexedDB data corruption.
**Fix**: Add migration lock or debounce.

---

#### H3. Inconsistent Error Handling Across Storage Functions ✅ FALSE POSITIVE / FIXED
**Locations**:
- `src/utils/savedGames.ts:51-62` - ✅ Now implements graceful degradation (returns {} on error)
- `src/utils/appSettings.ts:83-86` - ✅ FALSE POSITIVE - already returns `DEFAULT_APP_SETTINGS` at line 125
- `src/utils/teams.ts` - ✅ Implements graceful degradation
**Effort**: N/A | **Status**: ✅ RESOLVED (Dec 1, 2025)

**Verification**: Upon code review, `appSettings.ts` was a **false positive**. Line 125 already returns `DEFAULT_APP_SETTINGS` in the catch block. The other storage functions now consistently implement graceful degradation pattern.

---

#### H4. Fire-and-Forget Promise in useGameOrchestration ✅ FIXED
**Location**: `src/components/HomePage/hooks/useGameOrchestration.ts:552-558`
**Effort**: 30min | **Status**: ✅ FIXED (Dec 1, 2025)

**Problem**: No cleanup if component unmounts before promise resolves.
```typescript
getTeams().then(teams => {
  setAvailableTeams(teams);  // Can fire on unmounted component
}).catch(error => {...});
```

**Solution Implemented**: Added mounted flag pattern:
```typescript
useEffect(() => {
  let mounted = true;
  getTeams().then(teams => {
    if (mounted) setAvailableTeams(teams);
  }).catch(error => {
    if (mounted) logger.warn('[Team Loading] Failed', { error });
  });
  return () => { mounted = false; };
}, []);
```

---

#### H5. Data Migration Without Success Verification
**Location**: `src/components/HomePage/hooks/useGameOrchestration.ts:809-824`
**Effort**: 1h

**Problems**:
- Old key deleted before verifying new key written
- Query invalidations commented out (stale cache)
- No rollback on partial failure

**Fix**: Verify write success before deleting old key, uncomment invalidations.

---

#### H6. Missing Error Boundaries for Modal Operations
**Locations**: `GameStatsModal.tsx`, `LoadGameModal.tsx`, and other modal components
**Effort**: 1-2h

**Problem**: If modal throws during async operation, entire modal system crashes.
**Fix**: Add React Error Boundary wrapper to modal container.

---

### MEDIUM SEVERITY ISSUES

#### Performance Issues
| Issue | Location | Line | Problem |
|-------|----------|------|---------|
| JSON.stringify comparison | `src/hooks/useUndoRedo.ts` | 34-35 | Expensive on every history update |
| usePrecisionTimer recreates start/stop | `src/hooks/usePrecisionTimer.ts` | 91-102 | Unnecessary effect re-runs |
| useAutoSave race condition | `src/hooks/useAutoSave.ts` | 151-175 | Data loss if enabled changes during debounce |
| SoccerField complex conditional | `src/components/SoccerField.tsx` | 1008 | Logic error risk from precedence |
| Multiple OR drag conditions | `src/components/SoccerField.tsx` | 1073 | Easy to miss flags |

#### Code Quality Issues
| Issue | Location | Line | Problem |
|-------|----------|------|---------|
| Redundant inner if statement | `src/components/GameSettingsModal.tsx` | 531-535 | Dead code |
| currentPeriod can exceed numberOfPeriods | `src/utils/appStateSchema.ts` | 92-95 | Invalid states pass validation |
| Typo in error message | `src/utils/appStateSchema.ts` | 95 | "period period" |
| 30+ eslint-disable comments | Throughout | Various | Masked potential issues |
| Magic timing numbers | Multiple files | Various | 100ms, 200ms delays without constants |

---

### LOW SEVERITY ISSUES
| Issue | Location | Notes |
|-------|----------|-------|
| Commented-out logging | `src/utils/masterRosterManager.ts:18,21,38,78` | Should remove |
| Inconsistent import ordering | `src/components/GameSettingsModal.tsx:1-21` | Multiple imports from same module |
| ModalProvider refs never cleared | `src/contexts/ModalProvider.tsx:75-80` | Accumulating stale refs |
| TODO comments in production | `src/contexts/ModalProvider.tsx:6-39` | Should extract or remove |
| Removed-code comments | `src/components/HomePage/hooks/useGameOrchestration.ts:20` | Should be in changelog only |

---

### POSITIVE FINDINGS (What's Working Well)
| Area | Status | Evidence |
|------|--------|----------|
| Type Guards | Excellent | `src/utils/memoryManager.ts:21-52` - proper predicates |
| Formation Utility | Excellent | `src/utils/formations.ts` - pure functions, edge cases handled |
| Centralized Logger | Excellent | `src/utils/logger.ts` - type-safe, environment-aware |
| Ref Patterns | Good | `useAutoSave.ts` - saveFunctionRef for stale closures |
| ADR Documentation | Good | ADR-001 for modalManagerProps |
| Test Infrastructure | Good | 1,593 tests passing |

---

## 📋 UPDATED PRIORITY FIX MATRIX (November 2025)

### Completed Work
| Priority | Issue | Status |
|----------|-------|--------|
| **P0-OLD** | HomePage Refactoring (3,680→62 lines) | ✅ **COMPLETE** |
| **P0-OLD** | Hook Splitting (useGameOrchestration) | ✅ **COMPLETE** |
| **P2-OLD** | Modal State Races | ✅ **COMPLETE** (Layer 2 modal reducer) |

### NEW Blocking Issues (Must Complete Before New Features)
| Priority | Issue | File(s) | Effort | Blocks |
|----------|-------|---------|--------|--------|
| **P0-NEW** | C1: JSON parsing validation | `savedGames.ts`, `appSettings.ts`, etc. | 2-3h | Data integrity |
| **P0-NEW** | C3: Fix silent error swallowing | 6+ files (see table above) | 2-3h | User awareness |
| **P0-NEW** | H1-H4: Async effect cleanup | Multiple hooks | 1-2h | Memory leaks |
| **P1-NEW** | C4: SoccerField LRU cache | `SoccerField.tsx` | 1h | Long session memory |
| **P1-NEW** | H3: Standardize error handling | Storage utilities | 2h | Predictable behavior |
| **P1-NEW** | H6: Modal error boundaries | Modal components | 1-2h | UI crash recovery |

### Deferred (Layer 3 / Future Work)
| Priority | Issue | Effort | Notes |
|----------|-------|--------|-------|
| **DEFER** | C5: Decompose useModalOrchestration | 8h+ | Architectural, needs context pattern |
| **DEFER** | Split-brain playerAssessments | 4h+ | Documented in useGamePersistence.ts |
| **DEFER** | GameSettingsModal refactoring | 4h+ | Low priority, 1,995 lines |
| **DEFER** | Medium severity performance issues | 2h+ | Polish work |

**Total Blocking Work**: ~10-12 hours (P0-NEW + P1-NEW items)

---

## 🎯 FIX DEPENDENCIES (Updated November 2025)

```
✅ P0-OLD: HomePage Refactoring (COMPLETE)
    ↓
P0-NEW: Data Integrity Fixes
    ├─→ C1: JSON Parsing Validation (independent)
    ├─→ C3: Silent Error Swallowing (independent)
    └─→ H3: Standardize Error Handling (depends on C3 pattern decision)
            ↓
P1-NEW: Stability Fixes
    ├─→ H1-H4: Async Cleanup (independent)
    ├─→ C4: SoccerField Cache (independent)
    └─→ H6: Modal Error Boundaries (independent)
            ↓
DEFER: Architectural Polish (Layer 3)
    ├─→ C5: useModalOrchestration decomposition
    └─→ GameSettingsModal refactoring
```

**Recommended Order**:
1. **C1: JSON Parsing** - Most critical data integrity fix
2. **C3: Silent Errors** - Establish error handling pattern
3. **H3: Standardize Errors** - Apply pattern across storage
4. **H1-H4: Async Cleanup** - Quick wins, low risk
5. **C4: LRU Cache** - Simple fix, high impact
6. **H6: Error Boundaries** - UI resilience

---

## 📊 IMPACT ANALYSIS

### If Fixed ✅
- Clean, testable component architecture
- 3-5x faster feature development
- Reduced bug introduction risk
- Easier onboarding for new developers
- Improved app performance
- Maintainable codebase for 2+ years

### If NOT Fixed ❌
- Every new feature takes 3-5x longer
- High risk of introducing bugs
- Impossible to properly test
- New developer onboarding takes days instead of hours
- Technical debt compounds exponentially
- Potential project stall in 6-12 months

---

## 🔍 DETAILED ISSUES SUMMARY

### P0: HomePage.tsx - Monolithic Component (95% COMPLETE ✅)

**Original Problem**: 3,680-line component that violated Single Responsibility Principle

**Current Status**: **SOLVED** - HomePage reduced to **62 lines**

**Responsibilities Mixed Together**:
- Game timer logic
- Auto-save functionality
- 18 modal state handlers
- Player field drag & drop
- Score management
- React Query data fetching
- Event handling (goals, substitutions)
- Undo/redo state management
- Tactical board state
- Game session reducer orchestration

**Real-World Impact**:
```typescript
// Current: Change modal state = re-evaluate 3,725 lines
setIsGameStatsModalOpen(true); // 🐛 Causes full HomePage re-render

// After Fix: Change modal state = re-evaluate 150 lines
setModalState({ type: 'OPEN_GAME_STATS' }); // ✅ Only ModalManager re-renders
```

**Evidence from Code Review**:
- ~7.7x larger than industry standard (400 lines, down from ~9.3x)
- Impossible to write comprehensive unit tests
- State flows through 3,600 lines making debugging nightmare
- Adding new features requires understanding entire file

**Remaining Work**: Split `useGameOrchestration.ts` (3,373 lines) into 6 hooks

**Fix Plan**: [REFACTORING_STATUS.md](./03-active-plans/REFACTORING_STATUS.md) (supersedes P0 plan)

---

### P1: GameSettingsModal.tsx - Overly Complex Modal (HIGH)

**Problem**: 1,995-line component with too many responsibilities

**Issues**:
- All configuration UI in single file
- 90+ props passed to component
- Complex state management (refs, effects, local state)
- Cognitive overload - impossible to hold in memory

**Fix Plan**: [P1-GameSettingsModal-Refactoring-Plan.md](./05-development/fix-plans/P1-GameSettingsModal-Refactoring-Plan.md)

---

### P2: Modal State Management - Race Conditions (MEDIUM)

**Problem**: 10 independent `useState` calls for modal state

**Current Code**:
```typescript
const [isGameStatsModalOpen, setIsGameStatsModalOpen] = useState(false);
const [isLoadGameModalOpen, setIsLoadGameModalOpen] = useState(false);
// ... 8 more independent states
```

**Race Condition Risk**:
```typescript
// User clicks rapidly:
setIsGameStatsModalOpen(true);
setIsLoadGameModalOpen(true);  // 🐛 Both modals open!
```

**Fix Plan**: [P2-Modal-State-Management-Fix.md](./05-development/fix-plans/P2-Modal-State-Management-Fix.md)

---

### P2: Silent Error Swallowing (MEDIUM)

**Problem**: Multiple components silently ignore errors

**Affected Files**:
- `InstallPrompt.tsx`
- `StartScreen.tsx`
- `PlayerStatsView.tsx`

**Code Pattern**:
```typescript
.catch(() => {})  // ❌ Error disappears, debugging impossible
```

**Fix Plan**: [P2-Error-Handling-Improvements.md](./05-development/fix-plans/P2-Error-Handling-Improvements.md)

---

### P2: Performance - Large Component Re-renders (MEDIUM)

**Problem**: HomePage's size causes unnecessary re-renders

**Impact**:
- Any state change triggers 3,725-line re-evaluation
- Slower devices experience lag
- Battery drain on mobile

**Fix Plan**: [P2-Performance-Optimization-Plan.md](./05-development/fix-plans/P2-Performance-Optimization-Plan.md)

---

## 📈 PROGRESS TRACKING

**Detailed Tracker**: [CRITICAL_FIXES_TRACKER.md](./CRITICAL_FIXES_TRACKER.md)

### Completed (P0-OLD)
- [x] HomePage Refactoring (3,680 → 62 lines) ✅
- [x] Hook Splitting (useGameOrchestration → 6 hooks) ✅
- [x] Modal State Management (Layer 2 modal reducer) ✅

### NEW Blocking Issues (P0-NEW, P1-NEW)
- [ ] C1: JSON Parsing Validation (CRITICAL)
- [ ] C3: Silent Error Swallowing Fix (CRITICAL)
- [ ] H1-H4: Async Effect Cleanup (HIGH)
- [ ] H3: Standardize Error Handling (HIGH)
- [ ] C4: SoccerField LRU Cache (HIGH)
- [ ] H6: Modal Error Boundaries (HIGH)

### Deferred
- [ ] C5: useModalOrchestration Decomposition (Layer 3)
- [ ] GameSettingsModal Refactoring (Low Priority)
- [ ] Medium Severity Performance Issues (Layer 3)

**See**: [REFACTORING_STATUS.md](./03-active-plans/REFACTORING_STATUS.md) for architecture status
**Track**: [CRITICAL_FIXES_TRACKER.md](./CRITICAL_FIXES_TRACKER.md) for detailed progress

---

## 🎓 LEARNING RESOURCES

### For Developers Working on Fixes

**Component Composition**:
- [React Docs: Composition vs Inheritance](https://react.dev/learn/composition-vs-inheritance)
- [Patterns for Large React Components](https://kentcdodds.com/blog/compound-components-with-react-hooks)

**useReducer Pattern**:
- [React Docs: useReducer](https://react.dev/reference/react/useReducer)
- [When to useReducer vs useState](https://kentcdodds.com/blog/should-i-usestate-or-usereducer)

**Error Handling**:
- [React Error Boundaries](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary)
- [Async Error Handling Patterns](https://kentcdodds.com/blog/use-react-error-boundary-to-handle-errors-in-react)

---

## 🔗 RELATED DOCUMENTS

- **Source**: [Comprehensive Code Review (Oct 16, 2025)](./reviews/code-review-2025-10-16.md)
- **Quick Reference**: [Quick Fix Reference Card](./05-development/QUICK_FIX_REFERENCE.md)
- **Progress Tracker**: [Critical Fixes Tracker](./CRITICAL_FIXES_TRACKER.md)
- **Known Issues**: [Known Issues](./KNOWN_ISSUES.md) (now focused on critical fixes)
- **Testing Guide**: [Manual Testing Guide](./MANUAL_TESTING_GUIDE.md)

---

## ✅ ACCEPTANCE CRITERIA

### Completed (P0-OLD) ✅
1. **HomePage.tsx**: ✅ DONE
   - [x] No single file exceeds 600 lines
   - [x] Main HomePage.tsx acts only as orchestrator (62 lines)
   - [x] All integration tests still pass
   - [x] No regression in functionality

2. **Modal State Management**: ✅ DONE
   - [x] Single useReducer for all modal state
   - [x] Type-safe action creators
   - [x] Race condition tests added

### NEW Acceptance Criteria (P0-NEW, P1-NEW)

3. **Data Integrity (C1)**:
   - [ ] All JSON.parse calls wrapped in try-catch
   - [ ] appStateSchema.safeParse() used on game loads
   - [ ] Graceful degradation on corrupted data (skip bad records, not crash)
   - [ ] User notification when data recovery occurs

4. **Error Handling (C3, H3)**:
   - [ ] No silent `.catch(() => {})` patterns
   - [ ] All errors logged to centralized logger
   - [ ] Critical operations show toast notification on failure
   - [ ] Consistent pattern across all storage utilities

5. **Memory Management (C4, H1-H4)**:
   - [ ] SoccerField cache limited to 10 entries (LRU)
   - [ ] All async effects have cleanup functions
   - [ ] No "setState on unmounted component" warnings
   - [ ] Memory usage stable during 2+ hour sessions

6. **UI Resilience (H6)**:
   - [ ] Error boundaries wrap modal content
   - [ ] Modal crash shows recovery UI, not blank screen
   - [ ] User can close/retry after modal error

### Deferred Criteria (Layer 3)
- [ ] GameSettingsModal split into focused components
- [ ] useModalOrchestration decomposed with Context
- [ ] React DevTools Profiler shows <50ms re-render times

---

## 🆘 GETTING HELP

**Questions about fixes?**

1. Read the detailed fix plan for your priority
2. Check the [Quick Fix Reference](./05-development/QUICK_FIX_REFERENCE.md)
3. Review original [Code Review Document](./reviews/code-review-2025-10-16.md)
4. Consult [CLAUDE.md](../CLAUDE.md) for AI assistance guidelines

**Stuck during implementation?**

- Create an issue in the GitHub repository
- Reference the specific fix plan document
- Include code snippets and error messages

---

## 📝 NOTES

**Why These Fixes Are Critical**:

The P0 architectural refactoring is complete - HomePage is now 62 lines and follows industry-standard React patterns. However, the November 2025 code review identified **data integrity risks** that could cause silent data loss:

1. **JSON parsing without validation** - a single corrupted record crashes the app
2. **Silent error swallowing** - users don't know their data didn't save
3. **Memory leaks** - long sessions could exhaust device memory

These are not theoretical risks - they represent real scenarios that could cause user frustration and data loss.

**Investment vs. Return**:
- **Investment**: ~10-12 hours of focused fixes
- **Return**:
  - Zero silent data loss
  - Stable long-running sessions
  - User confidence in data persistence
  - Professional error handling throughout

**This is not optional technical debt. This is production readiness work.**

---

## 🔗 CROSS-REFERENCE: December 2025 Review vs Existing Documentation

### ALREADY DOCUMENTED (Verify Coverage in Other Docs)

| Issue | Status | Where Documented |
|-------|--------|------------------|
| C2: Storage transaction safety | ✅ **MITIGATED** | `storage-concurrency-assessment.md` - Phase A COMPLETE, `withKeyLock` implemented |
| C3: Silent error swallowing | ✅ Documented | `POST-REFACTORING-ROADMAP.md` Week 4-5, `CRITICAL_FIXES_TRACKER.md` P2 |
| H6: Modal error boundaries | ✅ Documented | `POST-REFACTORING-ROADMAP.md` Week 4-5, `REFACTORING_STATUS.md` Layer 3 |
| Performance optimization | ✅ Documented | `POST-REFACTORING-ROADMAP.md` Week 4-5 Layer 3 Polish |
| NPM xlsx vulnerability | ✅ Documented | `NPM_DEPENDENCY_UPDATE_PLAN.md` Phase 1 P0 Critical |

### NEW FINDINGS (Not Previously Documented)

| Issue | Severity | Location | Notes |
|-------|----------|----------|-------|
| **C1: JSON parsing validation** | CRITICAL | Multiple storage utils | No validation on JSON.parse - NEW |
| **C4: SoccerField cache leak** | HIGH | `SoccerField.tsx:48` | Unbounded Map grows with resize - NEW |
| **H1: useWakeLock cleanup** | HIGH | `useWakeLock.ts:39-58` | retryTimeoutRef not cleaned on unmount - NEW |
| **H2: Migration race condition** | HIGH | `page.tsx:28-71` | refreshTrigger causes concurrent migrations - NEW |
| **H3: appSettings.ts BUG** | HIGH | `appSettings.ts:83-86` | Returns undefined instead of defaults - NEW |
| **H4: Fire-and-forget promise** | HIGH | `useGameOrchestration.ts:552-558` | No cleanup on unmount - NEW |
| **H5: Migration verification** | HIGH | `useGameOrchestration.ts:809-824` | Old key deleted before verifying new - NEW |
| usePrecisionTimer deps | MEDIUM | `usePrecisionTimer.ts:91-102` | Recreates start/stop every render - NEW |
| useAutoSave debounce race | MEDIUM | `useAutoSave.ts:151-175` | Data loss if enabled changes - NEW |
| SoccerField complex conditional | MEDIUM | `SoccerField.tsx:1008` | Operator precedence unclear - NEW |
| appStateSchema validation | MEDIUM | `appStateSchema.ts:92-95` | currentPeriod can exceed numberOfPeriods - NEW |

### ALREADY FIXED (Confirmed in Codebase)

| Issue | Status | Evidence |
|-------|--------|----------|
| useAutoSave stale closure | ✅ FIXED | Commit a6e4e70, ref pattern implemented |
| handleDeleteGameEvent race | ✅ FIXED | Commit 698556e, atomic action created |
| modalManagerProps documentation | ✅ FIXED | ADR-001 created |
| Storage same-tab race conditions | ✅ FIXED | `withKeyLock` in all CRUD operations |

---

**Last Updated**: December 1, 2025
**Next Review**: After P0-NEW and P1-NEW completion
**Document Owner**: Development Team Lead
**Review Source**: Comprehensive December 2025 Code Review (architecture, quality, bugs)
