# MatchOps-Local: Unified Project Roadmap

**Last Updated**: December 5, 2025
**Status**: Active
**Purpose**: Single source of truth for ALL project work

---

## Quick Status

| Category | Status |
|----------|--------|
| Codebase Health | ✅ Excellent (2,085 tests, 62-line HomePage, 6 extracted hooks) |
| Security | ✅ All vulnerabilities fixed |
| Performance | ✅ React.memo optimization complete |
| Framework | ✅ Next.js 16 + React 19.2 |
| Next Major Work | 🎯 Features or Play Store Release |

---

## ✅ COMPLETED WORK

### Code Quality & Refactoring (December 2025)
- [x] HomePage refactoring: 3,725 → 62 lines (98% reduction)
- [x] 6 hooks extracted (all ≤665 lines)
- [x] Layer 3 Polish: React.memo, useMemo optimization
- [x] 2,085 tests passing (65% coverage)
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

---

## 🎯 NEXT UP: Tournament Series & Season Leagues

**Design**: ✅ Complete | **Doc**: `TOURNAMENT-SERIES-AND-SEASON-LEAGUES.md`
**Branch**: `feature/tournament-series-and-leagues`
**Approach**: TDD (Test-Driven Development)

### PRs (All in one integration branch)
- [ ] **PR #1**: Types + Storage + Migration (~2h)
- [ ] **PR #2**: Tournament Series UI (~2.5h)
- [ ] **PR #3**: Season Leagues UI (~1.5h)
- [ ] **PR #4**: Stats Filtering (~3h)
- [ ] Final integration PR to master

**What this delivers**:
- Tournament series (Elite, Kilpa, Haaste, Harraste)
- Season leagues (34 Finnish youth leagues + custom)
- UI in modals (TournamentDetails, SeasonDetails, NewGameSetup)
- Stats filtering by series/league
- Translations (EN/FI)
- Backwards compatible migration

**Total effort**: ~9.5 hours

---

## 📋 PLAY STORE RELEASE (Future)

**Master Plan**: `master-execution-guide.md`

### Phase P1: Security Hardening
- [ ] CSP headers in next.config.ts
- [ ] Service worker caching policy
- [ ] Analytics gating

### Phase P2: PWA & Store Packaging
- [ ] Manifest finalization
- [ ] TWA build (Bubblewrap)
- [ ] Store listing assets
- [ ] Privacy/Terms URLs

### Phase P3: Quality Gates
- [ ] E2E test expansion
- [ ] Accessibility audit (jest-axe)
- [ ] Performance baselines

### Phase P4: Monetization
- [ ] Play Store billing integration
- [ ] Feature gating (free vs premium)
- [ ] License caching for offline

### Phase P5: Release
- [ ] Staged rollout plan
- [ ] Sentry alerts configured
- [ ] Support channels

---

## 🔮 LONG-TERM (Not Scheduled)

### Backend Evolution (4-6 months if pursued)
**Doc**: `backend-evolution/` folder

- Cloud backend (Supabase PostgreSQL)
- Multi-device sync
- Premium tier with in-app purchase

### GameSettingsModal Refactoring (~1 hour)
- Currently 1,969 lines
- Split into 5 sub-components
- Low priority (works fine)

### Component Extraction (Low Priority)
- Extract `<TournamentSeriesManager />` from TournamentDetailsModal
  - ~50 lines of series management UI
  - Benefits: testability, reusability if needed elsewhere
  - Not urgent: only used in one place currently

---

## 📁 Document Reference

| Purpose | File |
|---------|------|
| This roadmap | `UNIFIED-ROADMAP.md` |
| Play Store details | `master-execution-guide.md` |
| Feature: Tournament/Leagues | `TOURNAMENT-SERIES-AND-SEASON-LEAGUES.md` |
| Social media launch | `SOCIAL_MEDIA_LAUNCH_STRATEGY.md` |

---

## 📝 Change Log

| Date | Update |
|------|--------|
| 2025-12-06 | Tournament Series & Season Leagues plan refined (2 phases) |
| 2025-12-05 | **Next.js 16.0.7 + React 19.2 upgrade complete** |
| 2025-12-05 | Test coverage: 2,085 tests across 142 suites |
| 2025-12-05 | Personnel Management confirmed complete, plan archived |
| 2025-12-05 | Team Final Position Tracking confirmed complete, plan archived |
| 2025-12-05 | Created unified roadmap, consolidated 16 plan files |
| 2025-12-05 | Layer 3 Polish complete (PR #105) |
| 2025-12-04 | Jest 30, i18next 16, Next.js security fix |
| 2025-12-03 | NPM security updates complete |

---

**Remember**: The codebase is healthy. No urgent work required. Build features when ready.
