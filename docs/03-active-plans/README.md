# Active Plans — START HERE

**Last Updated**: 2025-12-04

---

## 🚨 WHAT TO DO NEXT (Priority Order)

### 1. Structural Refactoring (8-12 hours) — DO FIRST

| # | Task | Current | Target | Time | Plan |
|---|------|---------|--------|------|------|
| 1 | **useGameOrchestration cleanup** | 2,199 lines | ~200 lines | 4-6h | [L2-2.7 Plan](./L2-2.7-useGameOrchestration-Cleanup-PLAN.md) |
| 2 | **GameSettingsModal refactoring** | 1,969 lines | ~200 lines | 4-6h | [P1 Plan](../05-development/fix-plans/P1-GameSettingsModal-Refactoring-Plan.md) |

### 2. Production Hardening (After Structural Work)

| # | Task | Time | Plan |
|---|------|------|------|
| 3 | Security headers & CSP | 1-2h | [production-readiness.md](./production-readiness.md) §1 |
| 4 | Service Worker hardening | 2-3h | [production-readiness.md](./production-readiness.md) §2 |
| 5 | Test coverage (64.8% → 85%) | 6-8h | [TEST_COVERAGE_IMPROVEMENT_PLAN.md](./TEST_COVERAGE_IMPROVEMENT_PLAN.md) |

### 3. Polish & Performance (After Production Hardening)

| # | Task | Time | Plan |
|---|------|------|------|
| 6 | Error handling improvements | 1h | [P2-Error-Handling-Improvements.md](../05-development/fix-plans/P2-Error-Handling-Improvements.md) |
| 7 | Modal state reducer completion | 0.5h | [P2-Modal-State-Management-Fix.md](../05-development/fix-plans/P2-Modal-State-Management-Fix.md) |
| 8 | Performance optimization | 0.5h | [P2-Performance-Optimization-Plan.md](../05-development/fix-plans/P2-Performance-Optimization-Plan.md) |

---

## 📊 Current Status at a Glance

| Component | Status | Lines |
|-----------|--------|-------|
| HomePage.tsx | ✅ Complete | 62 |
| useGameDataManagement.ts | ✅ Complete | 361 |
| useGameSessionCoordination.ts | ✅ Complete | 501 |
| useFieldCoordination.ts | ✅ Complete | 602 |
| useGamePersistence.ts | ✅ Complete | 665 |
| useTimerManagement.ts | ✅ Complete | 235 |
| useModalOrchestration.ts | ✅ Complete | 581 |
| GameStatsModal refactoring | ✅ Complete | — |
| **useGameOrchestration.ts** | 🔴 **NEEDS CLEANUP** | 2,199 |
| **GameSettingsModal.tsx** | 🔴 **NEEDS REFACTORING** | 1,969 |

---

## 📁 Document Index

### 🔴 Structural Refactoring (ACTIVE)
| Document | Purpose | Status |
|----------|---------|--------|
| [L2-2.7-useGameOrchestration-Cleanup-PLAN.md](./L2-2.7-useGameOrchestration-Cleanup-PLAN.md) | Step 2.7 cleanup with 4 PRs | 🔴 NOT STARTED |
| [P1-GameSettingsModal-Refactoring-Plan.md](../05-development/fix-plans/P1-GameSettingsModal-Refactoring-Plan.md) | GameSettingsModal split into 5 components | 🔴 NOT STARTED |
| [REFACTORING_STATUS.md](./REFACTORING_STATUS.md) | Single source of truth for refactoring | 🟡 90% COMPLETE |
| [L2-2.6-useGameOrchestration-Splitting-PLAN.md](./L2-2.6-useGameOrchestration-Splitting-PLAN.md) | Original hook extraction plan | ✅ HOOKS DONE |

### 🟠 Production Hardening (AFTER STRUCTURAL)
| Document | Purpose | Status |
|----------|---------|--------|
| [production-readiness.md](./production-readiness.md) | Security headers, SW, analytics | 🔴 NOT STARTED |
| [TEST_COVERAGE_IMPROVEMENT_PLAN.md](./TEST_COVERAGE_IMPROVEMENT_PLAN.md) | Test coverage 64.8% → 85% | 🟡 IN PROGRESS |
| [NPM_DEPENDENCY_UPDATE_PLAN.md](./NPM_DEPENDENCY_UPDATE_PLAN.md) | Dependency updates | ✅ PHASE 1-2 DONE |

### 🟡 Polish & Performance (AFTER PRODUCTION)
| Document | Purpose | Status |
|----------|---------|--------|
| [P2-Error-Handling-Improvements.md](../05-development/fix-plans/P2-Error-Handling-Improvements.md) | Replace silent catches | 🔴 NOT STARTED |
| [P2-Modal-State-Management-Fix.md](../05-development/fix-plans/P2-Modal-State-Management-Fix.md) | Complete modal reducer | ⏸️ DEFERRED |
| [P2-Performance-Optimization-Plan.md](../05-development/fix-plans/P2-Performance-Optimization-Plan.md) | React.memo, render optimization | 🔴 NOT STARTED |

### 📅 Future Features (NOT SCHEDULED)
| Document | Purpose | Status |
|----------|---------|--------|
| [TOURNAMENT-SERIES-AND-SEASON-LEAGUES.md](./TOURNAMENT-SERIES-AND-SEASON-LEAGUES.md) | Tournament series & league features | 📅 DESIGN DONE |
| [team-final-positions-plan.md](./team-final-positions-plan.md) | Track team final positions | 📅 PLANNED |
| [personnel-comprehensive-plan-2025.md](./personnel-comprehensive-plan-2025.md) | Personnel management feature | 📅 PLANNED |

### 📚 Reference & Historical
| Document | Purpose | Status |
|----------|---------|--------|
| [POST-REFACTORING-ROADMAP.md](./POST-REFACTORING-ROADMAP.md) | Week-by-week roadmap | 🟡 ACTIVE |
| [MICRO-REFactor-ROADMAP.md](./MICRO-REFactor-ROADMAP.md) | Original micro-step plan | ✅ L1-L2 DONE |
| [master-execution-guide.md](./master-execution-guide.md) | Play Store execution guide | 📖 REFERENCE |
| [project-status.md](./project-status.md) | Overall project status | 📖 REFERENCE |
| [roadmap.md](./roadmap.md) | Strategic vision | 📖 REFERENCE |
| [GameStatsModal-Refactoring-Session-1-Complete.md](./GameStatsModal-Refactoring-Session-1-Complete.md) | GameStatsModal refactoring notes | ✅ COMPLETE |

---

## ✅ Completed Work

- ✅ HomePage reduced from 3,725 to 62 lines
- ✅ 6 hooks extracted from useGameOrchestration
- ✅ GameStatsModal refactoring (Phases 1 & 2)
- ✅ Layer 1 stability (modal guards, anti-flash)
- ✅ Layer 2 architecture (container pattern, view-model)
- ✅ Jest 30 upgrade
- ✅ Sentry 10.28 upgrade
- ✅ React Query 5.90 upgrade
- ✅ xlsx security fix
- ✅ 303 new tests added (total: 1,997)
- ✅ IndexedDB migration (Phase M1)

---

## 🚫 Do NOT Start Until Structural Work Done

These tasks should wait until Step 2.7 and GameSettingsModal are complete:

- Production readiness tasks (security headers, SW)
- Play Store packaging
- Performance optimization (React.memo, etc.)
- Additional feature development

---

## 📈 Estimated Total Remaining Work

| Category | Hours | Priority |
|----------|-------|----------|
| Structural refactoring | 8-12h | 🔴 P0 |
| Production hardening | 10-13h | 🟠 P1 |
| Polish & performance | 2h | 🟡 P2 |
| **Total** | **20-27h** | — |

---

**Questions?** Check [REFACTORING_STATUS.md](./REFACTORING_STATUS.md) for detailed status.
