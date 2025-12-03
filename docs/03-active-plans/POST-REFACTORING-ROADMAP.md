# Post-Refactoring Roadmap

**Created**: November 20, 2025
**Status**: 🔴 PENDING - Activate when Step 2.6 is 100% complete
**Purpose**: Master checklist for work after useGameOrchestration hook splitting is finished

---

## 🎯 Executive Summary

This document provides a **prioritized, week-by-week roadmap** for all work that should be completed after the current refactoring (Step 2.6 - useGameOrchestration splitting) reaches 100%.

**Current Refactoring Status**: 96% complete (4 of 6 hooks extracted)
**When to activate this roadmap**: After all 6 hooks extracted and integrated
**Total estimated effort**: 15-20 hours over 4-5 weeks
**Expected completion**: Late December 2025 / Early January 2026

---

## ✅ Pre-Flight Checklist

**Before starting this roadmap, verify:**

- [ ] All 6 hooks extracted from useGameOrchestration:
  - [ ] useGameDataManagement (~400 lines) ✅ COMPLETE
  - [ ] useGameSessionCoordination (~350 lines) ✅ COMPLETE
  - [ ] useFieldCoordination (~650 lines) ✅ COMPLETE
  - [ ] useGamePersistence (~550 lines) ✅ COMPLETE
  - [ ] useTimerManagement (~250 lines) 🔴 NOT STARTED
  - [ ] useModalOrchestration (~500 lines) 🔴 NOT STARTED

- [ ] Final useGameOrchestration.ts is ≤600 lines (thin coordinator only)
- [ ] All 1,300+ tests passing
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes
- [ ] No functionality regressions
- [ ] Integration branch merged to master

**If any checkbox above is unchecked, DO NOT proceed with this roadmap.** Complete the refactoring first.

---

## 📅 Week-by-Week Roadmap

### Week 1: Critical Security & Documentation (2-3 hours)

**Priority**: 🔴 P0 - Must be done immediately

#### Day 1: Security Fix (30 minutes) ✅ DONE (2025-12-03, PR #96)
- [x] **Fix xlsx security vulnerability** (CVE-2023-30533)
  - Updated and pinned to 0.20.3 from SheetJS CDN
  - Excel export functionality verified (24 tests passing)
  - Production build passes
  - `npm audit` shows zero vulnerabilities

**See**: [NPM_DEPENDENCY_UPDATE_PLAN.md - Phase 1](./NPM_DEPENDENCY_UPDATE_PLAN.md#phase-1-critical-security-fix-p0---do-immediately)

#### Day 2-3: Safe NPM Updates (1.5 hours) ✅ DONE (2025-12-03, PR #96)
- [x] **Update Sentry** (10.12.0 → 10.28.0)
  - Better React 19 compatibility
  - Latest error tracking improvements

- [x] **Update React Query** (5.80.10 → 5.90.11)
  - Bug fixes for data fetching
  - Performance improvements

**Testing Checklist**:
- [x] Master roster queries work correctly
- [x] Saved games queries function properly
- [x] Season/tournament data fetching works
- [x] All tests pass (1615 tests)
- [x] Production build succeeds

**See**: [NPM_DEPENDENCY_UPDATE_PLAN.md - Phase 2](./NPM_DEPENDENCY_UPDATE_PLAN.md#phase-2-safe-minorpatch-updates-p1---this-week)

#### Day 4: Documentation Updates (1 hour)
- [ ] **Update CRITICAL_FIXES_TRACKER.md**
  - Change "HomePage.tsx still 3,680 lines" → "HomePage.tsx is 62 lines ✅"
  - Update P0 status to "100% Complete"
  - Update useGameOrchestration metrics

- [ ] **Update CRITICAL_FIXES_REQUIRED.md**
  - Change outdated line counts
  - Add note: "Refactoring 100% complete"

- [ ] **Update CLAUDE.md**
  - Update "Current Status" section
  - Change 95% → 100% complete
  - Update refactoring status table

- [ ] **Mark REFACTORING_STATUS.md as complete**
  - Update status to "✅ 100% COMPLETE"
  - Add completion date
  - Add "Next Steps: See POST-REFACTORING-ROADMAP.md"

---

### Week 2-3: Jest Ecosystem & i18n (3-6 hours)

**Priority**: 🟡 P2 - Should be done this month

#### Jest 30 Upgrade (2-4 hours)
- [ ] **Upgrade Jest ecosystem** (29.7.0 → 30.0.5)
  - 20% faster test runs
  - Better memory leak detection
  - Improved performance

**Commands**:
```bash
npm install --save-dev jest@30 ts-jest@30 jest-environment-jsdom@30
npm test  # Run full test suite and measure time
```

**Testing Checklist**:
- [ ] All unit tests pass
- [ ] Component tests work correctly
- [ ] Hook tests function properly
- [ ] No new console warnings/errors
- [ ] Memory leak detection still works
- [ ] Test performance improves (measure before/after)

**Migration Guide**: https://jestjs.io/docs/upgrading-to-jest30

**See**: [NPM_DEPENDENCY_UPDATE_PLAN.md - Phase 3](./NPM_DEPENDENCY_UPDATE_PLAN.md#phase-3-jest-ecosystem-upgrade-p2---this-month)

#### react-i18next v16 Update (1-2 hours)
- [ ] **Update react-i18next** (15.7.4 → 16.2.4)
  - React 19 compatibility improvements
  - TypeScript namespace changes
  - Trans component improvements

**Commands**:
```bash
npm install react-i18next@latest
npm test
npm run build
```

**Testing Checklist**:
- [ ] English translations work correctly
- [ ] Finnish translations work correctly
- [ ] Language switching functions properly
- [ ] Trans components render correctly
- [ ] TypeScript types compile without errors

**See**: [NPM_DEPENDENCY_UPDATE_PLAN.md - Phase 3](./NPM_DEPENDENCY_UPDATE_PLAN.md#update-react-i18next-1574--1624)

---

### Week 3-4: Test Coverage Improvement (8-12 hours)

**Priority**: 🟡 P2 - Critical for safety before Layer 3 and Next.js 16

**Why Now?**
- Jest 30 installed → 20% faster test runs make this less painful
- Before Layer 3 → Tests verify behavior before optimization changes
- Before Next.js 16 → Major framework upgrade needs solid safety net
- Before new features → Tournament Series & Season Leagues safer to implement

#### Current vs Target Coverage

| Metric | Current | Target | Gap |
|--------|---------|--------|-----|
| Statements | 62% | 85% | +23% |
| Branches | 48% | 80% | +32% |
| Functions | 59% | 85% | +26% |
| Lines | 63% | 85% | +22% |

#### Priority Areas (Highest ROI)

**1. Data Persistence Layer (3-4 hours)** - Most critical for data integrity
- [ ] `src/utils/storage.ts` - Core IndexedDB operations
- [ ] `src/utils/savedGames.ts` - Game save/load/delete
- [ ] `src/utils/masterRosterManager.ts` - Player CRUD operations
- [ ] `src/utils/seasons.ts` - Season management
- [ ] `src/utils/tournaments.ts` - Tournament management

**2. Core Game Logic (2-3 hours)** - Critical user flows
- [ ] `src/hooks/useGameSessionReducer.ts` - Scoring, timer, periods
- [ ] `src/hooks/useGameState.ts` - Field state management
- [ ] `src/hooks/useAutoSave.ts` - Auto-save logic

**3. Extracted Hooks (2-3 hours)** - New, well-isolated, testable
- [ ] `useGameDataManagement` - React Query data fetching
- [ ] `useGameSessionCoordination` - Game session lifecycle
- [ ] `useFieldCoordination` - Field interactions
- [ ] `useGamePersistence` - Save/load operations
- [ ] `useTimerManagement` - Timer logic
- [ ] `useModalOrchestration` - Modal state

**4. Backup/Restore (1-2 hours)** - Data loss prevention
- [ ] `src/utils/fullBackup.ts` - Full backup operations
- [ ] Import/export edge cases
- [ ] Corruption recovery paths

#### Testing Commands

```bash
# Run with coverage report
npm test -- --coverage

# Check specific file coverage
npm test -- --coverage --collectCoverageFrom='src/utils/storage.ts'

# Generate HTML report for detailed analysis
npm test -- --coverage --coverageReporters=html
# Open coverage/lcov-report/index.html
```

#### Success Criteria

- [ ] `npm test -- --coverage` shows:
  - Statements ≥85%
  - Branches ≥80%
  - Functions ≥85%
  - Lines ≥85%
- [ ] All critical paths have explicit tests
- [ ] Edge cases documented and tested
- [ ] No decrease in existing coverage

**Estimated Time**: 8-12 hours over 1-2 weeks

---

### Week 4-5: Layer 3 Polish (3-4 hours)

**Priority**: 🟢 P2 - Improves quality and performance

#### Performance Optimization (1-1.5 hours)
- [ ] **Add React.memo to containers**
  - SoccerField component
  - PlayerBar component
  - GameInfoBar component
  - ControlBar component

- [ ] **Memoize expensive calculations**
  - Player statistics calculations
  - Sorted game lists
  - Filtered roster lists
  - Aggregate stats

- [ ] **Add lightweight metrics**
  - useEffect trigger monitoring
  - Re-render tracking
  - Performance measurement

**Target Metrics**:
- React DevTools Profiler shows ≤50ms re-render times
- No unnecessary re-renders detected
- Lighthouse performance score ≥90

**See**: [REFACTORING_STATUS.md - Layer 3](./REFACTORING_STATUS.md#-layer-3-future-polish-after-completion)

#### Error Handling Improvements ✅ COMPLETE (December 2025)
- [x] **Find all silent error catches** ✅
  - Searched for `.catch(() => {})`
  - Documented all instances in CRITICAL_FIXES_REQUIRED.md
  - Fixed by severity

- [x] **Fix each instance** ✅
  - useGameOrchestration.ts - Added logger.error calls
  - StartScreen.tsx - Added logger.error calls
  - PlayerStatsView.tsx - Added logger.error calls

- [x] **JSON parsing graceful degradation** ✅ (bonus fix)
  - savedGames.ts, seasons.ts, tournaments.ts
  - Returns empty data on corruption instead of crashing
  - Errors logged for debugging

- [x] **Memory leak fix** ✅ (bonus fix)
  - SoccerField.tsx - LRU cache with 10 entry limit

- [ ] **Ensure modal portals wrapped in ErrorBoundary** (deferred)
  - Add friendly fallback UI
  - Add logging tags
  - Test synthetic errors

**Pattern applied**:
```typescript
// ❌ BEFORE: Silent error swallowing
.catch(() => {})

// ✅ AFTER: Proper error handling (IMPLEMENTED)
.catch((error) => {
  logger.error('Operation failed', { error, context: 'ComponentName' });
})
```

**See**: [CRITICAL_FIXES_REQUIRED.md](../CRITICAL_FIXES_REQUIRED.md) for full details

#### Auto-Save Refinement (30 minutes)
- [ ] **Tune delays per state cluster**
  - Review current auto-save intervals
  - Adjust based on state type (field changes vs metadata)

- [ ] **Add guard for heavy redraws**
  - Prevent auto-save during drag operations
  - Debounce rapid field changes

- [ ] **Batch updates under sustained input**
  - Coalesce multiple rapid changes
  - Reduce storage write frequency

**See**: [REFACTORING_STATUS.md - Layer 3](./REFACTORING_STATUS.md#-layer-3-future-polish-after-completion)

#### Query Cache Hygiene (30 minutes)
- [ ] **Centralize invalidations after backup import**
  - Ensure all queries invalidated correctly
  - Test backup restore flow

- [ ] **Ensure cache consistency after game switches**
  - Verify currentGameId updates cache
  - Test rapid game switching

**See**: [REFACTORING_STATUS.md - Layer 3](./REFACTORING_STATUS.md#-layer-3-future-polish-after-completion)

---

### Week 6+: Next.js 16 Upgrade (2-3 days)

**Priority**: 🔵 P3 - Major update, extensive testing required

**Status**: ⏸️ **WAIT UNTIL ALL PREVIOUS TASKS COMPLETE**

#### Why This Is Last
- Next.js 16 has major breaking changes
- Requires extensive testing across entire app
- Testing is 3x easier with smaller, focused hooks (≤600 lines each)
- Current Next.js 15.5.4 is stable and fully supported

#### Preparation (2-4 hours)
- [ ] Read upgrade guide: https://nextjs.org/blog/next-16
- [ ] Review middleware.ts usage (may need migration to proxy.ts)
- [ ] Plan lint configuration migration (`next lint` → `eslint .`)
- [ ] Create backup branch
- [ ] Document current Turbopack configuration

#### Breaking Changes to Address
- [ ] **Turbopack is now default bundler**
  - Review current webpack config
  - Test compatibility

- [ ] **`next lint` command deprecated**
  - Update package.json: `"lint": "next lint"` → `"lint": "eslint ."`
  - Generate explicit `eslint.config.mjs`

- [ ] **middleware.ts → proxy.ts migration** (if applicable)
  - Check if you have middleware.ts
  - Migrate to new proxy.ts pattern

- [ ] **New caching model with PPR**
  - Review caching configuration
  - Update cache strategies if needed

- [ ] **React Compiler now stable**
  - Consider enabling if beneficial

#### Update Commands
```bash
npm install next@16 eslint-config-next@16

# Update package.json
# "lint": "eslint ."

# Generate new ESLint config
npx @next/codemod@latest eslint

# Test
npm test
npm run build
npm run dev
```

#### Comprehensive Testing Checklist
- [ ] Development server starts correctly
- [ ] All pages render properly
- [ ] Production build succeeds
- [ ] PWA functionality works
- [ ] Service worker updates correctly
- [ ] IndexedDB operations function
- [ ] All routes accessible
- [ ] API routes work (if any)
- [ ] Full test suite passes (1,300+ tests)
- [ ] E2E tests pass (if applicable)
- [ ] Performance metrics acceptable or improved
- [ ] Install PWA from preview URL and verify functionality

**Benefits**:
- 5-10x faster Fast Refresh
- 2-5x faster builds
- React Compiler support
- Modern caching model
- Better developer experience

**See**: [NPM_DEPENDENCY_UPDATE_PLAN.md - Phase 4](./NPM_DEPENDENCY_UPDATE_PLAN.md#phase-4-major-updates-p3---after-refactoring-complete)

---

## 📊 Optional Tasks

### GameSettingsModal Refactoring (1 hour)

**Status**: ⏸️ **DEFERRED - Low Priority**

**Current State**: 1,995 lines, works correctly

**Only do this if**:
- You frequently need to modify GameSettingsModal
- It becomes a maintenance burden
- You have extra time and want consistency

**Plan**: Split into 5+ focused sub-components:
- TeamsAndRosterSection
- GameDetailsSection
- GameConfigSection
- EventLogSection
- GameNotesSection

**See**: [P1-GameSettingsModal-Refactoring-Plan.md](../05-development/fix-plans/P1-GameSettingsModal-Refactoring-Plan.md)

### recharts v3 Upgrade (2-4 hours)

**Status**: Optional - Only if needed

**Current**: 2.15.4
**Target**: 3.4.1

**Only upgrade if**:
- You encounter issues with current version
- You need new features from v3
- You're already updating other packages

**Commands**:
```bash
npm install recharts@3
npm test
# Test all chart components thoroughly
```

**Testing Required**:
- [ ] Game statistics charts render correctly
- [ ] Player performance charts work
- [ ] Tournament charts display properly
- [ ] Chart interactions function
- [ ] No console errors/warnings

**See**: [NPM_DEPENDENCY_UPDATE_PLAN.md - Phase 4](./NPM_DEPENDENCY_UPDATE_PLAN.md#optional-recharts-v3-upgrade)

---

## 🎯 Success Criteria for "100% Complete"

**Mark this roadmap complete when ALL of the following are true:**

### Code Quality
- [ ] All files ≤600 lines (no exceptions)
- [ ] useGameOrchestration.ts is thin coordinator (≤600 lines)
- [ ] All 6 hooks properly extracted and tested
- [ ] Clear separation of concerns throughout

### Security & Dependencies
- [ ] No security vulnerabilities (`npm audit` shows 0 issues)
- [ ] All production dependencies up to date
- [ ] All dev dependencies up to date (except optional upgrades)
- [ ] Next.js 16 upgrade complete (or explicitly deferred with reason)

### Testing & Performance
- [ ] All 1,300+ tests passing
- [ ] Jest 30 installed (20% faster test runs)
- [ ] React DevTools Profiler shows ≤50ms re-render times
- [ ] No unnecessary re-renders detected
- [ ] Lighthouse performance score ≥90

### Error Handling
- [ ] No `.catch(() => {})` silent error patterns
- [ ] All errors logged to centralized logger
- [ ] Modal portals wrapped in ErrorBoundary
- [ ] User-friendly error messages displayed

### Documentation
- [ ] All documentation updated with current metrics
- [ ] CRITICAL_FIXES_TRACKER.md shows 100% complete
- [ ] CRITICAL_FIXES_REQUIRED.md updated
- [ ] CLAUDE.md reflects current state
- [ ] REFACTORING_STATUS.md marked complete
- [ ] This roadmap marked complete with completion date

---

## 📈 Progress Tracking

### Quick Status Dashboard

| Week | Focus | Priority | Hours | Status |
|------|-------|----------|-------|--------|
| Week 1 | Security & Safe Updates | 🔴 P0 | 2-3h | ✅ Complete (PR #96) |
| Week 2-3 | Jest 30 & i18n | 🟡 P2 | 3-6h | 🔴 Not Started |
| Week 3-4 | **Test Coverage → 85%** | 🟡 P2 | 8-12h | 🔴 Not Started |
| Week 5-6 | Layer 3 Polish | 🟢 P2 | 3-4h | 🔴 Not Started |
| Week 7+ | Next.js 16 | 🔵 P3 | 2-3d | 🔴 Not Started |

**Update this table as you progress!**

---

## 🚨 Important Notes

### Testing Strategy

**After EACH task, run**:
```bash
# 1. Tests
npm test

# 2. Linting
npm run lint

# 3. Type check
npx tsc --noEmit

# 4. Production build
npm run build

# 5. Manual testing
npm run dev
# Test core functionality in browser
```

### Rollback Plan

If any update causes issues:

```bash
# 1. Restore package files from git
git checkout package.json package-lock.json

# 2. Reinstall dependencies
npm install

# 3. Verify functionality
npm test
npm run build

# 4. Document the issue in this file
```

### Commit Strategy

- Commit after EACH completed task (not at the end of a week)
- Use descriptive commit messages referencing this roadmap
- Example: `chore: fix xlsx security vulnerability (Post-Refactoring Week 1)`
- Tag commits with the week/task for easy tracking

---

## 🆕 Future Features (Designed, Pending Implementation)

### Tournament Series & Season Leagues

**Status**: 📋 Design complete, pending scheduling
**Design Document**: [TOURNAMENT-SERIES-AND-SEASON-LEAGUES.md](./TOURNAMENT-SERIES-AND-SEASON-LEAGUES.md)
**Created**: December 2025

Two related features to improve how competition levels are tracked in Finnish youth soccer:

#### Feature 1: Tournament Series
- **Problem**: Tournaments currently have a single `level` field, but tournaments have multiple series (Elite, Kilpa, Haaste, Harraste)
- **Solution**: Tournaments can define multiple series; games belong to a specific series
- **Effort**: ~4-6 hours
- **Files**: types, tournaments.ts, TournamentDetailsModal, NewGameSetupModal, GameSettingsModal

#### Feature 2: Season Leagues
- **Problem**: Seasons lack formal league association (currently embedded in season name)
- **Solution**: Predefined Finnish youth league list (29 leagues + custom option)
- **Effort**: ~2-3 hours
- **Files**: types, leagues.ts (new), seasons.ts, SeasonDetailsModal

#### Deferred Considerations
- **Gender handling**: Needs separate discussion on where gender should live
- **Age group filtering**: Needs investigation on which leagues apply to which age groups

**See design document for full details including data models, user flows, and file changes.**

---

## 🔗 Related Documentation

**Core Planning Documents:**
- [REFACTORING_STATUS.md](./REFACTORING_STATUS.md) - Current refactoring status
- [NPM_DEPENDENCY_UPDATE_PLAN.md](./NPM_DEPENDENCY_UPDATE_PLAN.md) - Detailed NPM update strategy
- [CRITICAL_FIXES_TRACKER.md](../CRITICAL_FIXES_TRACKER.md) - Overall fix tracking
- [TOURNAMENT-SERIES-AND-SEASON-LEAGUES.md](./TOURNAMENT-SERIES-AND-SEASON-LEAGUES.md) - Future feature design

**Fix Plans:**
- [P1-GameSettingsModal-Refactoring-Plan.md](../05-development/fix-plans/P1-GameSettingsModal-Refactoring-Plan.md)
- [P2-Error-Handling-Improvements.md](../05-development/fix-plans/P2-Error-Handling-Improvements.md)
- [P2-Performance-Optimization-Plan.md](../05-development/fix-plans/P2-Performance-Optimization-Plan.md)

**Project Overview:**
- [CLAUDE.md](../../CLAUDE.md) - AI assistant guidelines
- [PROJECT_OVERVIEW.md](../PROJECT_OVERVIEW.md) - Architecture overview

---

## 📝 Change Log

| Date | Update | Status |
|------|--------|--------|
| 2025-11-20 | Initial roadmap created | Ready to activate after refactoring |
| | | |
| | | |

**Add your progress updates here!**

---

## ✅ Completion

**Mark complete when all success criteria met.**

**Completed**: [DATE]
**Completed By**: [NAME]
**Total Time Spent**: [HOURS]
**Final Notes**: [LEARNINGS/OBSERVATIONS]

---

**Next Phase**: Ongoing maintenance and feature development with clean, maintainable codebase! 🚀
