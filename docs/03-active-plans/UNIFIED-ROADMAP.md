# MatchOps-Local: Unified Project Roadmap

**Last Updated**: December 7, 2025
**Status**: Active
**Purpose**: Single source of truth for ALL project work

---

## Quick Status

| Category | Status |
|----------|--------|
| Codebase Health | ✅ Excellent (2,201 tests, 62-line HomePage, 6 extracted hooks) |
| Security | ✅ All vulnerabilities fixed |
| Performance | ✅ React.memo optimization complete |
| Framework | ✅ Next.js 16 + React 19.2 |
| Next Major Work | 🎯 **Play Store Release** (Priority 1) |

---

## ✅ COMPLETED WORK

### Code Quality & Refactoring (December 2025)
- [x] HomePage refactoring: 3,725 → 62 lines (98% reduction)
- [x] 6 hooks extracted (all ≤665 lines)
- [x] Layer 3 Polish: React.memo, useMemo optimization
- [x] 2,201 tests passing (65% coverage)
- [x] All P0/P1/P2 fixes complete

### NPM & Security Updates (December 2025)
- [x] xlsx security fix (CVE-2023-30533)
- [x] Sentry 10.28.0
- [x] React Query 5.90.11
- [x] Jest 30.2.0
- [x] react-i18next 16.3.5
- [x] **Next.js 16.0.7 + React 19.2** ✅ (upgraded from 15.5.7)
- [x] npm audit: 0 vulnerabilities

### Infrastructure (September-October 2025)
- [x] IndexedDB migration complete
- [x] Storage abstraction layer
- [x] Entity lookup system (live name resolution)
- [x] Backup/restore with teams included

### Features (2025)
- [x] Team Final Position Tracking (🥇🥈🥉 in UnifiedTeamModal)
- [x] Personnel Management (8 role types, PersonnelManagerModal, game selection)
- [x] Tournament Series & Season Leagues (Elite/Kilpa/Haaste/Harraste + 34 Finnish leagues)

---

## 🎯 PRIORITY ORDER (December 2025)

| # | Task | Effort | Why This Order |
|---|------|--------|----------------|
| **1** | Play Store Release | 2-3 weeks | Unlocks monetization, validates product |
| **2** | Backend Architecture Refactoring | ~4 weeks | Clean architecture before more features |
| **3** | Gender Handling | 1-2 weeks | HIGH priority feature, needs design |
| **4** | Season League UX (area/age filtering) | 1 week | Nice-to-have UX improvement |
| **5** | Other features & fixes | Ongoing | As needed |

---

## 🚀 PRIORITY 1: Play Store Release

**Status**: 🎯 **NEXT UP**
**Primary Doc**: `PLAY-STORE-IMPLEMENTATION-PLAN.md` ⭐ **START HERE**
**Master Plan**: `master-execution-guide.md`
**Effort**: 2-3 weeks (26-40 hours)

### PR Breakdown

| Phase | PRs | Hours | Focus |
|-------|-----|-------|-------|
| P1: Security | #1-2 | 4-6h | CSP headers, Service Worker |
| P2: PWA Packaging | #3-5 | 8-12h | Manifest, TWA, Store assets |
| P3: Quality | #6-7 | 4-6h | Accessibility, Performance |
| P4: Monetization | #8-10 | 8-12h | Billing, Feature gating, Paywall |
| P5: Release | #11 | 2-4h | Store submission |
| **Total** | 11 PRs | 26-40h | |

### Branching Strategy

```
master
  └── release/play-store-v1  (integration branch)
        ├── ps/1-csp-headers → PR #1
        ├── ps/2-service-worker → PR #2
        ├── ... (9 more PRs)
        └── Final PR → master
```

**Why First**: App is fully functional and ready. Play Store validates product-market fit and unlocks revenue potential.

**See**: [PLAY-STORE-IMPLEMENTATION-PLAN.md](./PLAY-STORE-IMPLEMENTATION-PLAN.md) for detailed PR breakdown

---

## 🔧 PRIORITY 2: Backend Architecture Refactoring

**Status**: 📋 Plan ready
**Primary Doc**: `backend-evolution/REALISTIC-IMPLEMENTATION-PLAN.md` ⭐ **START HERE**
**Effort**: ~4 weeks (50-72 hours)

### What This Enables
- Backend switching capability (IndexedDB ↔ Supabase)
- Foundation for cloud features (multi-device sync, cloud backup)
- Premium tier monetization path
- **Cleaner architecture before adding more features**

### PR Breakdown

| Phase | PRs | Hours | Risk |
|-------|-----|-------|------|
| 1. Foundation (centralize storage calls) | #1-3 | 12-16h | LOW |
| 2. DataStore Interface | #4-5 | 8-12h | LOW |
| 3. LocalDataStore Implementation | #6-8 | 10-14h | MEDIUM |
| **Total (Phases 1-3)** | 8 PRs | ~4 weeks | |

**Key Insight**: Phases 1-3 provide backend switching capability WITHOUT requiring Supabase. Phase 4 (Supabase) is optional and can be done later.

**Why Second**:
- LOW risk (pure refactoring, same IndexedDB behavior)
- "Now or never" problem - harder to refactor after adding more features
- Enables future flexibility for cloud features

---

## 👥 PRIORITY 3: Gender Handling

**Status**: 📋 Needs design discussion
**Effort**: 1-2 weeks

### The Problem
- App tracks soccer games but doesn't distinguish gender
- Affects: teams, seasons, tournaments, players, stats filtering
- Finnish youth soccer is gender-separated

### Design Questions to Resolve
1. **Where does gender live?**
   - Team level? (most games are single-gender teams)
   - Season/Tournament level?
   - Player level?
   - All of the above?

2. **How does it propagate?**
   - Team gender → Game inherits?
   - Filter stats by gender?
   - Validation (can't mix genders in same game)?

3. **UI considerations**
   - Where to show gender?
   - How to filter by gender in stats?
   - Migration for existing data?

### Implementation (after design)
- [ ] Design document created
- [ ] Types updated
- [ ] Storage/migration
- [ ] UI components
- [ ] Stats filtering
- [ ] Translations (EN/FI)

**Why Third**: Important feature but needs design discussion. Real user feedback from Play Store may inform design decisions.

---

## 🎨 PRIORITY 4: Season League UX Improvements

**Status**: 📋 Idea documented
**Effort**: 1 week

### The Problem
Current league selection in SeasonDetailsModal shows flat list of 34 leagues. Could be more intuitive with grouping.

### Proposed Improvements
- **Area filtering**: Split by Itä (East), Länsi (West), Etelä (South)
- **Age group pre-selection**: Filter leagues applicable to age group
- **Level grouping**: Group by competition level

### Implementation
- [ ] Design area/age dropdown filters
- [ ] Update SeasonDetailsModal UI
- [ ] Add translations
- [ ] Test UX flow

**Why Fourth**: Pure UX improvement. Current UI works, just not ideal. Can wait until after more critical work.

---

## 📦 PRIORITY 5: Other Features & Fixes

**Status**: Ongoing
**Tracked in**: GitHub Issues

### Low Priority / As Needed
- GameSettingsModal refactoring (~1 hour, 1,969 lines)
- Component extraction (TournamentSeriesManager)
- Performance optimizations
- Bug fixes as reported

---

## 📁 Document Reference

| Purpose | File |
|---------|------|
| This roadmap | `UNIFIED-ROADMAP.md` |
| **Play Store (Priority 1)** | `PLAY-STORE-IMPLEMENTATION-PLAN.md` ⭐ |
| **Backend refactoring (Priority 2)** | `backend-evolution/REALISTIC-IMPLEMENTATION-PLAN.md` |
| Play Store master guide | `master-execution-guide.md` |
| Feature: Tournament/Leagues | `TOURNAMENT-SERIES-AND-SEASON-LEAGUES.md` |
| Social media launch | `SOCIAL_MEDIA_LAUNCH_STRATEGY.md` |

---

## 📝 Change Log

| Date | Update |
|------|--------|
| 2025-12-07 | **Established priority order**: Play Store → Backend → Gender → League UX |
| 2025-12-07 | Tournament Series & Season Leagues feature merged to master (PR #111) |
| 2025-12-06 | Backend abstraction realistic plan created |
| 2025-12-05 | **Next.js 16.0.7 + React 19.2 upgrade complete** |
| 2025-12-05 | Test coverage: 2,201 tests across 142 suites |
| 2025-12-05 | Personnel Management confirmed complete, plan archived |
| 2025-12-05 | Team Final Position Tracking confirmed complete, plan archived |
| 2025-12-05 | Created unified roadmap, consolidated 16 plan files |
| 2025-12-05 | Layer 3 Polish complete (PR #105) |
| 2025-12-04 | Jest 30, i18next 16, Next.js security fix |
| 2025-12-03 | NPM security updates complete |

---

**Current Focus**: 🎯 **Play Store Release** - App is ready, let's ship it!
