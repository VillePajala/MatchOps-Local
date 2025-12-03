# Critical Fixes Progress Tracker

**Last Updated**: January 21, 2025
**Status**: ✅ Layer 1 COMPLETE (stability). ✅ Layer 2 Step 2.6.6 COMPLETE (useModalOrchestration extracted). ✅ P1 High-Priority Fixes COMPLETE.
**Overall Progress**: L1 ✅ DONE; L2 Step 2.6.6 ✅ DONE (HomePage **62 lines**, useModalOrchestration **510 lines**); Remaining: Step 2.6.7-2.6.12 (split useGameOrchestration into 6 hooks)

---

## 📊 QUICK STATUS

| Priority | Fix | Status | Progress | Est. Time Remaining | Time Spent |
|----------|-----|--------|----------|---------------------|------------|
| **P0** | HomePage Refactoring | 🟡 97% (Step 2.6.6 Done) | 97% | 12-15h (5 hooks) | ~12h |
| **P1** | useAutoSave Stale Closure | ✅ COMPLETE | 100% | - | ~2h |
| **P1** | handleDeleteGameEvent Race | ✅ COMPLETE | 100% | - | ~1h |
| **P1** | modalManagerProps Documentation | ✅ COMPLETE | 100% | - | ~0.5h |
| **P1** | NPM Dependencies & Security | 🔴 Not Started | 0% | 4-8h (4 phases) | - |
| **P1** | GameSettingsModal Refactoring | ⏸️ Deferred | 0% | 1h | - |
| **P2/L2** | Modal State Management (Reducer) | ✅ COMPLETE | 100% | - | ~2h |
| **P2/L2** | useNewGameFlow Param Grouping | ✅ COMPLETE | 100% | - | ~1h |
| **P2/L2** | FieldContainer/View-Model Grouping | ✅ COMPLETE | 100% | - | ~2h |
| **P2** | Error Handling Improvements | ⏭ Layer 3 | 0% | 1h | - |
| **P2** | Performance Optimization | ⏭ Layer 3 | 0% | 30m | - |

**Remaining Work**: Step 2.6.7-2.6.12 hook splitting (12-15 hours over 2 weeks), NPM security fixes & updates (4-8 hours)
**Work Completed**: HomePage 62 lines, useModalOrchestration extracted (510 lines), P1 fixes complete, comprehensive documentation added

### Newly Logged Fix
- **P1 – New Game autosave race** *(Nov 2025)*: `useNewGameFlow.handleStartNewGame` now fetches the latest saved game snapshot directly from storage (instead of relying on potentially stale React state) before prompting the “Save current game?” confirmation. This eliminates the documented race condition when autosave mutates state mid-flow.

### Scope Clarification: Layer 2 vs P2

- Layer 1 (this branch) focused on stability hardening to prevent regressions:
  - Autosave gating during modals; menu→modal deferral; anti-flash guard; portalization; deterministic init; import normalization.
- Layer 2 (next): structural refactor that reduces coupling/props and centralizes modal state.
  - This is separate from P2 “priority fixes” but overlaps in scope. We’ll track Layer 2 tasks under both L2/P2 where applicable.

### Before Merge (housekeeping)
- Update docs to reflect L1 completion and L2 scope (this file + MICRO-REFACTOR ROADMAP).
- Consider splitting the QueryClient singleton fix (commit 284f1da) into its own PR for cleaner history (optional when rebasing).

### Upcoming Layer 2: Modal & Flow Architecture (next PR chunk)
- **Split ModalManager** into `GameModalsManager`, `SettingsModalsManager`, and `StatsModalsManager` so each container remains <200 lines and owns a coherent prop subset.
- **useNewGameFlow parameter grouping**: ✅ Completed in Step 2.4.6 – hook now accepts cohesive `gameState`, `ui`, `orchestration`, and `dependencies` contexts.
- **Group FieldContainer props** into view-model objects (`gameState`, `fieldInteractions`, `modalTriggers`, `guideState`) to reduce prop drilling.
- **Modal State Reducer**: migrate scattered modal booleans to a single reducer (start with Load/New, then iterate per modal).
- **Add focused edge-case tests** for useGameState availablePlayers sync and backup-restore → latest-game fallback.

### Layer 3 (Future)
- Performance monitoring: add lightweight metrics for useEffect triggers (e.g., useGameState, heavy lists).
- Error boundary refinement: ensure modal portals are wrapped and present helpful fallbacks.
- Auto-save batching: tune delays based on real usage patterns; consider coalescing updates under sustained input.
- **Normalize `useHomeModalControls`** by adding open/close helpers for Training Resources & Goal Log modals and implementing `resumeGame` / `explore` initial actions.

---

## 🧪 Test Coverage Follow-ups

- [x] Automate regression for clearing `playerIdsForNewGame` after new game setup (Fix #2 – stale player selection) to ensure selections reset post-start. *(See `src/components/HomePage/utils/newGameHandlers.test.ts`)*

---

## 🔨 Recent Bug Fixes & Improvements

### January 21, 2025: P1 High-Priority Fixes

**P1-1: useAutoSave Stale Closure Risk** ✅ COMPLETE
- **Issue**: `saveFunction` in dependency arrays caused effects to re-run on every change, potentially losing debounced saves
- **Fix**: Implemented ref pattern (same as useGamePersistence)
  - Created `saveFunctionRef` to store latest saveFunction
  - Update ref when saveFunction changes (doesn't trigger effect re-runs)
  - Use `saveFunctionRef.current()` in all effects
  - Removed `saveFunction` from dependency arrays
- **Benefits**: Effects only re-run when states change, debounced saves protected, no stale closures
- **Commit**: `a6e4e70`
- **Testing**: All 13 useAutoSave tests pass

**P1-2: handleDeleteGameEvent Race Condition** ✅ COMPLETE
- **Issue**: Dispatched 2 sequential actions (DELETE_GAME_EVENT, ADJUST_SCORE_FOR_EVENT) without atomicity
- **Fix**: Created atomic `DELETE_GAME_EVENT_WITH_SCORE` action
  - Single state update: deletes event + adjusts score
  - Prevents race conditions between dispatches
  - Guarantees event/score consistency
- **Benefits**: Impossible for events and scores to become out of sync, single state update = better performance
- **Commit**: `698556e`
- **Testing**: All 21 useGamePersistence tests pass, action validation tests pass

**P1-3: modalManagerProps Documentation** ✅ COMPLETE (Non-Issue)
- **Finding**: modalManagerProps intentionally NOT memoized - correct architectural decision
- **Documentation**: Created comprehensive ADR-001 and enhanced code comments
  - Explained React rendering behavior (no automatic bailouts without React.memo)
  - Performance measurements (0.05ms per render, 0.3% CPU at 60fps)
  - Future optimization path (data-driven approach)
- **Benefits**: Prevents future code review confusion, validates architectural decision
- **Commit**: `387867f`
- **Reference**: docs/05-development/architecture-decisions/ADR-001-modalManagerProps-no-memoization.md

### November 3-18, 2025: Refactoring Progress

**Note**: These bug fixes and refactoring improvements were completed as part of ongoing maintenance, reducing technical debt incrementally while P0 comprehensive refactoring is in progress.

### 1. Event Deletion Storage-Aware Pattern (Nov 3-5, 2025)
**Issue**: Event deletion (goals, cards) inconsistently updated storage vs UI state, causing data loss on reload.
**Fix**: Refactored to storage-first pattern with rollback:
- `HomePage.tsx` handler now async, updates storage first
- `GameSettingsModal.tsx` and `GoalLogModal.tsx` simplified (call parent handler only)
- Proper rollback on storage failure
- Success/failure propagation from parent handlers

**Files Changed**:
- `src/components/HomePage.tsx` (handleDeleteGameEvent)
- `src/components/GameSettingsModal.tsx` (handleDeleteEventConfirmed)
- `src/components/GoalLogModal.tsx` (handleDeleteEventConfirmed)
- `src/components/HomePage/containers/ModalManager.tsx` (type signatures)

**Impact**: Prevents data loss, ensures storage consistency

### 2. New Game Handlers Extraction (Nov 4-5, 2025)
**Issue**: New game creation logic embedded in 3,725-line HomePage, hard to test
**Fix**: Extracted to dedicated utility with dependency injection:
- Created `src/components/HomePage/utils/newGameHandlers.ts` (180 lines)
- Created `src/components/HomePage/utils/newGameHandlers.test.ts` (98 lines)
- ~280 lines removed from HomePage.tsx
- Proper dependency injection for testability

**Files Changed**:
- `src/components/HomePage.tsx` (imports extracted handlers)
- `src/components/HomePage/utils/newGameHandlers.ts` (NEW)
- `src/components/HomePage/utils/newGameHandlers.test.ts` (NEW)

**Impact**: Initial reduction (3,725 → 2,474 lines = -1,251 lines, 33.6%)
**Note**: Further refactoring (Steps 2.4.0-2.5) ultimately reduced HomePage to 62 lines (98.3% total reduction)

### 3. Season/Tournament Type Safety Enhancement (Nov 4, 2025)
**Issue**: Season/tournament IDs typed as `string | null`, causing stale state bugs
**Fix**: Changed to non-nullable `string` with empty string default:
- Updated `GameSessionState` interface
- Fixed all handlers to use empty string
- Prevents stale prefill race conditions

**Files Changed**:
- `src/types/index.ts` (GameSessionState interface)
- `src/components/HomePage.tsx` (handlers)
- `src/components/GameSettingsModal.tsx` (prefill logic)

**Impact**: Eliminates race conditions in season/tournament selection

### 4. React Query Mutation Race Condition Fixes (Nov 4-5, 2025)
**Issue**: Multiple mutations for same resource caused stale data overwrites
**Fix**: Added mount safety, response staleness checks, sequence guards:
- Mount ref tracking in modals
- Compare sequence numbers in mutation responses
- Skip stale responses automatically

**Files Changed**:
- `src/components/GameSettingsModal.tsx` (mutation guards)
- `src/components/NewGameSetupModal.tsx` (mount tracking)

**Impact**: Prevents stale overwrites from rapid UI changes

### 5. Comprehensive Regression Tests (Nov 5, 2025)
**Issue**: Bug fixes had insufficient automated coverage
**Fix**: Added regression tests for all fixes:
- `newGameHandlers.test.ts` covers playerIdsForNewGame clearing
- `GameSettingsModal.test.tsx` updated with mount checks
- Test count: 991 → 1,306 (+315 tests, 32% increase)

**Files Changed**:
- `src/components/HomePage/utils/newGameHandlers.test.ts` (NEW)
- `src/components/GameSettingsModal.test.tsx` (updated)

**Impact**: Prevents regression of fixed bugs

### 6. Tournament/Season Date Prefill (Nov 6, 2025)
**Issue**: Game date not prefilled from selected tournament/season startDate
**Fix**: Added date prefill logic:
- `GameSettingsModal.tsx` prefills from season/tournament startDate
- `NewGameSetupModal.tsx` prefills game date on selection

**Files Changed**:
- `src/components/GameSettingsModal.tsx` (lines 582-586, 703-707)
- `src/components/NewGameSetupModal.tsx` (useEffect hooks)

**Impact**: Improved UX, fewer manual date entries

### 7. Team Selection Display Fix (Nov 6, 2025)
**Issue**: Team selection not displayed correctly when modal reopened
**Fix**: Added useEffect to sync selectedTeamId with teamId prop:
```typescript
useEffect(() => {
  if (isOpen) {
    setSelectedTeamId(teamId || null);
  }
}, [isOpen, teamId]);
```

**Files Changed**:
- `src/components/GameSettingsModal.tsx` (useEffect)

**Impact**: Correct team display on modal reopen

### 8. FieldContainer Prop Grouping + Timer VM (Nov 14, 2025)
**Issue**: FieldContainer consumed 20+ primitive props (players, tactics, timer), bloating HomePage signatures and blocking further reducer work.

**Fix**: Introduced typed view-models so the entire field/timer state is passed via two cohesive objects:
- Added `fieldVM` (players, opponents, drawings, tactical state) and `timerVM` (timer, alerts, overlays) to `FieldContainer` + tests, keeping fallback props temporarily for safety.
- Updated HomePage to pass these view-models, reducing prop count and aligning with the `GameContainer` VM approach.
- Ensured PlayerBar + timer overlays read through the new VMs, unlocking future memoization/migration of actions to reducers.

**Impact**: Shrinks FieldContainer’s surface area, makes downstream prop-grouping possible, and matches the plan set out in PR-56 without regressions (tests + manual smoke verified).

### 9. Debug Flag Unification + Tactical Instrumentation (Nov 14-15, 2025)
**Issue**: Debug logging across HomePage, undo/redo history, and the tactical board relied on ad-hoc env checks (`NEXT_PUBLIC_DEBUG_*`), making manual verification noisy and inconsistent.

**Fix**: Added a typed debug helper + documentation and migrated every call site to the centralized API:
- `src/utils/debug.ts` (NEW) exposes `debug.enabled(category)` with typed categories (`home`, `history`, `tactical`) plus build-time notes.
- `src/utils/debug.test.ts` (NEW) verifies whitespace handling, `DEBUG_ALL`, and default fallbacks.
- `.env.example` documents how to toggle categories (single flag or `NEXT_PUBLIC_DEBUG_ALL=1`).
- `src/components/HomePage.tsx`, `src/hooks/useGameSessionWithHistory.ts`, `src/hooks/useTacticalHistory.ts`, `src/hooks/useTacticalBoard.ts`, and `src/components/ControlBar.tsx` now import `{ debug }` and gate logs via the helper—no more inline `process.env` reads.

**Impact**: A single `.env` flag controls render + undo/redo logging, reducing console spam during normal use while giving engineers predictable switches when diagnosing Layer 2 regressions.

### 10. PlayerBar/GameInfo VM Adoption + useNewGameFlow Grouping (Nov 16, 2025)
**Issue**: PlayerBar/GameInfo still read directly from HomePage state, and `useNewGameFlow` had 31 parameters, making future migrations fragile.

**Fix**:
- `HomePage` now renders `PlayerBar`/`GameInfoBar` from the `GameContainerViewModel`, ensuring the VM is authoritative before GameContainer extraction.
- `GameContainer` requires a `viewModel` prop; test fixtures updated accordingly so missing data fails fast.
- `useNewGameFlow` options were grouped into `{ gameState, ui, orchestration, dependencies }`, matching the Layer 2 plan; unit tests updated to reflect the new API.

**Impact**: Eliminates redundant prop plumbing, locks the PlayerBar/GameInfo contract to the VM, and reduces hook coupling so future modal reducer work can accept cohesive contexts instead of dozens of primitives.

### 11. Field Interactions VM + Reducer-Driven Modal Intents (Nov 16, 2025)
**Issue**: FieldContainer still required 20+ ad-hoc handler props and direct modal setters, preventing clean orchestration of interactions.

**Fix**:
- Added `FieldInteractions`/`TimerInteractions` objects so FieldContainer consumers pass grouped view-model-like handlers rather than dozens of discrete props.
- HomePage memoizes these interaction objects and now calls `reducerDrivenModals.newGameSetup.open()` (and the equivalent load game helpers) when the first-time guide or shortcuts open modals.
- Control flows for Load/New modals share the reducer-backed anti-flash guard everywhere, ensuring consistent UX.

**Impact**: Reduces prop surface, paves the way for FieldContainer extraction, and proves the modal reducer API before ModalManager refactors.

### 12. Step 2.5 - Edge-Case Regression Tests & Stable Callback Pattern (Nov 18, 2025)
**Issue**: Two critical edge cases lacked test coverage—backup imports with stale `currentGameId` and roster-to-field synchronization. Additionally, potential re-render loop risk existed in `useGameState` due to unstable `saveStateToHistory` callback reference.

**Fix**:
- Added dedicated import test in `fullBackup.test.ts` ensuring `importFullBackup` rewrites `currentGameId` to latest real game when backup contains `DEFAULT_GAME_ID` or missing entry
- Extended `useGameState` tests to cover roster shrink/rename flows; players on field now drop automatically when removed from roster and inherit renamed/updated metadata without losing coordinates
- Implemented stable callback pattern in `HomePage.tsx` using ref-based indirection to prevent `saveStateToHistory` reference changes from triggering infinite re-renders
- Added custom ESLint hooks plugin to enforce memoization for function props in hooks
- Fixed TypeScript errors in `fullBackup.test.ts` (removed redundant `id` properties, added `AppState` import)

**Files Changed**:
- `src/utils/fullBackup.test.ts` (added edge-case tests, fixed TypeScript errors)
- `src/hooks/__tests__/useGameState.test.tsx` (added roster synchronization tests)
- `src/components/HomePage.tsx` (stable callback pattern implementation)
- `eslint.config.mjs` + `eslint/custom-hooks-plugin.mjs` (NEW custom ESLint plugin)

**Impact**: Prevents stale state bugs after backup imports, ensures field stays synchronized with roster changes, eliminates re-render loop risks in production, enforces memoization best practices via linting.

### Summary Statistics
- **Total commits**: 1 refactor (Step 2.5)
- **HomePage.tsx**: **62 lines** ✅ (refactoring 95% complete)
- **useGameOrchestration.ts**: **3,373 lines** (needs splitting into 6 hooks - remaining 5% of P0)
- **Test coverage increase**: +15 tests for edge cases
- **Files created**: 1 new file (custom ESLint hooks plugin)
- **Re-render safety**: Stable callback pattern prevents infinite loops
- **Type safety**: fullBackup tests now properly typed

---

## 🎯 P0: HomePage Refactoring (CRITICAL)

**Fix Plan**: [P0-HomePage-Refactoring-Plan.md](./05-development/fix-plans/P0-HomePage-Refactoring-Plan.md)

### Status: 🟡 95% Complete - Hook Splitting Remaining

### Current Situation
- **HomePage.tsx**: **62 lines** ✅ (Successfully reduced from 3,680 lines!)
- **useGameOrchestration.ts**: **3,373 lines** 🔴 (Needs splitting into 6 hooks)
- **Architecture**: ✅ CORRECT (HomePage → useGameOrchestration → containers)
- **Container Pattern**: ✅ COMPLETE
  - ✅ GameContainer.tsx (105 lines)
  - ✅ ModalManager.tsx (549 lines)
  - ✅ FieldContainer.tsx (394 lines)
- **View-Model Pattern**: ✅ COMPLETE
- **Layer 1 & 2**: ✅ COMPLETE (Steps 2.4.0–2.5)

### Remaining Work (5%)
Split `useGameOrchestration.ts` into 6 focused hooks:
  1. useGameDataManagement (~500 lines)
  2. useGamePersistence (~400 lines)
  3. useGameSessionCoordination (~500 lines)
  4. useModalOrchestration (~400 lines)
  5. useFieldCoordination (~400 lines)
  6. useTimerManagement (~300 lines)

**Estimated work**: 6 small PRs × 1-2 hours = ~12 hours over 2-3 weeks

**See**: [REFACTORING_STATUS.md](../03-active-plans/REFACTORING_STATUS.md) for complete plan

### Progress Checklist

#### Phase 1: Preparation
- [x] Create directory structure (`src/components/HomePage/utils/`)
- [x] Create placeholder files (newGameHandlers.ts)
- [x] Run baseline tests (all passing)

#### Phase 2: Extract useGameOrchestration Hook
- [x] Copy all hooks to useGameOrchestration.ts ✅ (466 lines)
- [ ] Update HomePage to import and use the hook **← NEXT STEP**
- [ ] Test - verify no regressions

#### Phase 3: Extract ModalManager
- [x] Create ModalManager.tsx with all modal JSX ✅ (709 lines)
- [ ] Update HomePage to import and use ModalManager **← PENDING**
- [ ] Remove inline modal JSX from HomePage
- [ ] Test modal functionality

#### Phase 4: Extract GameContainer
- [x] Create GameContainer.tsx with game UI ✅ (720 lines)
- [ ] Update HomePage to import and use GameContainer **← PENDING**
- [ ] Remove inline game UI from HomePage
- [ ] Test game interactions

#### Phase 5: Extract Sub-Components
- [x] Extract FieldContainer ✅ (393 lines, IN USE)
- [x] Extract supporting components (FirstGameGuide, etc.) ✅
- [x] Extract utilities (newGameHandlers, etc.) ✅

#### Phase 6: Integration (Final Step)
- [x] Import all extracted components in HomePage ✅
- [x] Replace inline code with component usage ✅
- [x] Verify HomePage is <200 lines (orchestrator only) ✅ (62 lines!)
- [x] Delete unused inline code ✅

#### Phase 7: Final Testing & Cleanup
- [ ] Run full test suite
- [ ] Run manual smoke tests
- [ ] Check bundle size
- [ ] Verify performance improvements

### Acceptance Criteria
- [x] Extracted components created and tested ✅
- [x] HomePage imports and uses all extracted components ✅
- [x] HomePage.tsx is ≤200 lines ✅ (currently **62 lines**)
- [x] All 1,300+ tests still pass ✅
- [x] No functionality regression ✅
- [ ] All extracted hooks ≤600 lines **← FINAL STEP** (useGameOrchestration needs splitting)
- [ ] React DevTools Profiler shows ≤50ms re-render times (verify after hook splitting)

### Notes
```
Started: November 4, 2025
Status: 95% Complete (HomePage integration complete, hook splitting remaining)
Developer: Multiple AIs
Blockers: None
Completed Work:
- ✅ HomePage.tsx reduced from 3,680 lines → 62 lines
- ✅ Container pattern implemented (GameContainer, ModalManager, FieldContainer)
- ✅ View-model pattern applied throughout
- ✅ Layer 1 & 2 complete (Steps 2.4.0–2.5)
- ✅ All 1,300+ tests passing
Next Steps:
- Split useGameOrchestration.ts (3,373 lines) into 6 focused hooks
- Each hook ≤600 lines
- 6 small PRs × 1-2 hours each
- Estimated time: ~12 hours over 2-3 weeks
See: docs/03-active-plans/REFACTORING_STATUS.md for complete plan
```

---

## 🎯 P1: NPM Dependencies & Security (HIGH)

**Fix Plan**: [NPM_DEPENDENCY_UPDATE_PLAN.md](../03-active-plans/NPM_DEPENDENCY_UPDATE_PLAN.md)

### Status: 🔴 Not Started (P0 Critical Security Issue)

### Current Situation
- **xlsx package**: 🔴 Known security vulnerabilities (CVE-2023-30533)
- **Sentry**: 10.12.0 → 10.28.0 ✅ UPDATED
- **React Query**: 5.90.2 → 5.90.10 (patch update available)
- **Jest**: 29.7.0 → 30.0.5 (major update with 20% performance improvement)
- **Next.js 16**: Available but DEFERRED until Step 2.6 refactoring complete

### Progress Checklist

#### Phase 1: Critical Security (P0 - Immediate)
- [ ] Update xlsx package to latest secure version
- [ ] Test Excel export functionality
- [ ] Verify no security vulnerabilities remain

#### Phase 2: Safe Updates (P1 - This Week)
- [ ] Update @sentry/nextjs to latest
- [ ] Update @tanstack/react-query to latest
- [ ] Run full test suite
- [ ] Verify production build

#### Phase 3: Jest Upgrade (P2 - This Month)
- [ ] Upgrade Jest ecosystem to v30
- [ ] Update react-i18next to v16
- [ ] Measure performance improvements
- [ ] Verify all tests pass

#### Phase 4: Next.js 16 (P3 - After Refactoring)
- [ ] ⏸️ WAIT for Step 2.6 completion (useGameOrchestration split)
- [ ] Read Next.js 16 upgrade guide
- [ ] Update lint configuration
- [ ] Migrate middleware → proxy.ts
- [ ] Test extensively with smaller hooks

### Acceptance Criteria
- [ ] No security vulnerabilities in `npm audit`
- [ ] All dependencies up to date (except Next.js 16)
- [ ] All tests pass
- [ ] Production build succeeds
- [ ] Excel export functionality verified
- [ ] Test performance improved by ~20% (Jest 30)

### Notes
```
Created: November 18, 2025
Status: P0 Critical - xlsx vulnerability must be fixed immediately
Coordination: Next.js 16 upgrade deferred until refactoring complete
Rationale: Testing major framework updates 3x easier with smaller hooks
See: docs/03-active-plans/NPM_DEPENDENCY_UPDATE_PLAN.md for detailed plan
```

---

## 🎯 P1: GameSettingsModal Refactoring (HIGH)

**Fix Plan**: [P1-GameSettingsModal-Refactoring-Plan.md](./05-development/fix-plans/P1-GameSettingsModal-Refactoring-Plan.md)

### Status: ❌ Not Started

### Progress Checklist

#### Phase 1: Preparation
- [ ] Create directory structure
- [ ] Create placeholder files
- [ ] Run baseline tests

#### Phase 2: Extract Sections
- [ ] Extract TeamsAndRosterSection
- [ ] Extract GameDetailsSection
- [ ] Extract GameConfigSection
- [ ] Extract EventLogSection
- [ ] Extract GameNotesSection

#### Phase 3: Create Main Orchestrator
- [ ] Create new GameSettingsModal/index.tsx
- [ ] Integrate all sections
- [ ] Test modal functionality

### Acceptance Criteria
- [ ] Main index.tsx ≤200 lines
- [ ] Each section ≤400 lines
- [ ] All existing functionality preserved
- [ ] All tests pass
- [ ] Each section testable in isolation

### Notes
```
Started: [DATE]
Completed: [DATE]
Developer: [NAME]
Blockers: [ANY BLOCKERS]
Learnings: [KEY LEARNINGS]
```

---

## 🎯 P2: Modal State Management Fix (MEDIUM)

**Fix Plan**: [P2-Modal-State-Management-Fix.md](./05-development/fix-plans/P2-Modal-State-Management-Fix.md)

### Status: ❌ Not Started
**Dependency**: Should be done after P1

### Progress Checklist

#### Step 1: Update ModalProvider.tsx
- [ ] Replace useState calls with useReducer
- [ ] Create modalReducer function
- [ ] Create helper functions (openModal, closeModal, etc.)
- [ ] Update context value

#### Step 2: Update Components Using Modal Context
- [ ] Update HomePage
- [ ] Update all components using modal context
- [ ] Test all modals open/close correctly

#### Step 3: Add Tests
- [ ] Test modal opens when openModal called
- [ ] Test modal closes when closeModal called
- [ ] Test prevents multiple modals from opening

### Acceptance Criteria
- [ ] Single useReducer manages all modal state
- [ ] No race conditions
- [ ] All modals still work correctly
- [ ] Type-safe modal actions
- [ ] Tests added

### Notes
```
Started: [DATE]
Completed: [DATE]
Developer: [NAME]
Blockers: [ANY BLOCKERS]
Learnings: [KEY LEARNINGS]
```

---

## 🎯 P2: Error Handling Improvements (MEDIUM)

**Fix Plan**: [P2-Error-Handling-Improvements.md](./05-development/fix-plans/P2-Error-Handling-Improvements.md)

### Status: ❌ Not Started

### Progress Checklist

#### Step 1: Find All Silent Catches
- [ ] Search codebase for `.catch(() => {})`
- [ ] Document all findings
- [ ] Prioritize by severity

#### Step 2: Fix Each Instance
- [ ] InstallPrompt.tsx
- [ ] StartScreen.tsx
- [ ] PlayerStatsView.tsx
- [ ] [Other files discovered]

#### Step 3: Add Global Error Boundary
- [ ] Verify error boundary exists
- [ ] Add onError logging
- [ ] Test error boundary catches errors

### Acceptance Criteria
- [ ] No `.catch(() => {})` patterns in codebase
- [ ] All errors logged to centralized logger
- [ ] Critical errors show user-friendly messages
- [ ] Error boundary catches unhandled React errors
- [ ] Tests added for error scenarios

### Notes
```
Started: [DATE]
Completed: [DATE]
Developer: [NAME]
Blockers: [ANY BLOCKERS]
Learnings: [KEY LEARNINGS]
```

---

## 🎯 P2: Performance Optimization (MEDIUM)

**Fix Plan**: [P2-Performance-Optimization-Plan.md](./05-development/fix-plans/P2-Performance-Optimization-Plan.md)

### Status: ❌ Not Started
**Dependency**: Most issues fixed by P0

### Progress Checklist

#### Optimization 1: Add React.memo
- [ ] SoccerField
- [ ] PlayerBar
- [ ] GameInfoBar
- [ ] ControlBar

#### Optimization 2: Memoize Expensive Calculations
- [ ] Player statistics calculations
- [ ] Sorted game lists
- [ ] Filtered roster lists
- [ ] Aggregate stats

#### Optimization 3: Memoize Event Handlers
- [ ] Wrap callbacks in useCallback
- [ ] Test re-render reduction

#### Measurement
- [ ] Measure baseline performance
- [ ] Measure after optimizations
- [ ] Run Lighthouse audit

### Acceptance Criteria
- [ ] React DevTools Profiler shows <50ms render times
- [ ] No unnecessary re-renders detected
- [ ] Lighthouse performance score ≥90
- [ ] Smooth 60fps interactions

### Notes
```
Started: [DATE]
Completed: [DATE]
Developer: [NAME]
Blockers: [ANY BLOCKERS]
Learnings: [KEY LEARNINGS]
```

---

## 📈 OVERALL PROGRESS

### Timeline

```
Sprint 1: [DATES]
- [ ] P0: HomePage Refactoring

Sprint 2: [DATES]
- [ ] P1: GameSettingsModal Refactoring
- [ ] P2: Modal State Management

Sprint 3: [DATES]
- [ ] P2: Error Handling Improvements
- [ ] P2: Performance Optimization
```

### Team Assignments

```
Developer 1: [NAME]
- Assigned: [FIXES]
- Status: [STATUS]

Developer 2: [NAME]
- Assigned: [FIXES]
- Status: [STATUS]
```

### Blockers & Risks

```
Current Blockers:
- [BLOCKER 1]
- [BLOCKER 2]

Risks:
- [RISK 1]
- [RISK 2]
```

---

## ✅ COMPLETION CRITERIA

**Ready for Next Phase When:**

- [ ] All 5 fixes marked as completed
- [ ] All tests passing (1,306+ tests)
- [ ] No ESLint errors/warnings
- [ ] No TypeScript errors
- [ ] Lighthouse performance ≥90
- [ ] Code review approved
- [ ] Manual smoke testing completed
- [ ] Documentation updated

---

## 📝 CHANGE LOG

| Date | Update | Author |
|------|--------|--------|
| 2025-10-16 | Initial tracker created | Code Review AI |
| 2025-11-07 | Updated metrics, documented 7 bug fixes, marked P0 in progress | Documentation Review AI |
| | | |

---

**Next Review Date**: [After P0 completion]
**Document Owner**: Development Team Lead
