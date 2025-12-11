# MatchOps-Local: Unified Project Roadmap

**Last Updated**: December 11, 2025
**Status**: Active
**Purpose**: Single source of truth for ALL project work

---

## Quick Status

| Category | Status |
|----------|--------|
| Codebase Health | ✅ Excellent (2,393 tests, 62-line HomePage, 6 extracted hooks) |
| Security | ✅ All vulnerabilities fixed |
| Performance | ✅ React.memo optimization complete |
| Framework | ✅ Next.js 16 + React 19.2 |
| Next Major Work | 🎯 **Play Store Release - P5 Submission** |

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
| **3** | Gender Handling (Boys/Girls) | 3-5 days | HIGH priority, design approved (mirrors Game Type) |
| ~~4~~ | ~~Game Type (Soccer/Futsal)~~ | ~~3-5 days~~ | ✅ **COMPLETED** December 11, 2025 |
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

## 👥 PRIORITY 3: Gender Handling (Boys/Girls)

**Status**: 📋 Design approved (mirrors Game Type implementation)
**Effort**: 3-5 days
**Pattern**: Same as Game Type (Soccer/Futsal) - see merged PR for reference

### The Problem
- App tracks soccer games but doesn't distinguish gender (boys/girls)
- Finnish youth soccer is gender-separated
- Affects: games, seasons, tournaments, stats filtering
- Users need to filter stats by gender

### Design Decision: Entity-Level Labeling (Same as Game Type)

**Gender lives at these levels:**
- Game (AppState) - `gender?: Gender`
- Season - `gender?: Gender`
- Tournament - `gender?: Gender`

**NOT at player level** - Players can participate in both boys' and girls' games (especially in younger age groups).

**Type definition:**
```typescript
// src/types/game.ts
export type Gender = 'boys' | 'girls';
```

### Implementation Plan (Mirrors Game Type PR)

#### 1. Type Updates
**Files:**
- `src/types/game.ts` - Add `Gender` type, add `gender?: Gender` to `AppState`
- `src/types/index.ts` - Add `gender?: Gender` to `Season` and `Tournament`

#### 2. Reducer Updates
**File:** `src/hooks/useGameSessionReducer.ts`
- Add `SET_GENDER` action
- Add `gender` to `LOAD_PERSISTED_GAME_DATA` extraction
- Add `gender` to initial state handling

**File:** `src/hooks/useGameSessionWithHistory.ts`
- Add `SET_GENDER` to `HISTORY_SAVING_ACTIONS`

#### 3. Modal Updates (Gender Selector)
**Files to update:**
- `src/components/NewGameSetupModal.tsx` - Gender dropdown (same pattern as game type)
- `src/components/GameSettingsModal.tsx` - Gender dropdown
- `src/components/SeasonDetailsModal.tsx` - Gender dropdown (default for season games)
- `src/components/TournamentDetailsModal.tsx` - Gender dropdown (default for tournament games)

**UI Pattern (same as Game Type):**
```tsx
<div className="flex flex-col">
  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
    {t('genderLabel')}
  </label>
  <select
    value={gender || ''}
    onChange={(e) => setGender(e.target.value as Gender | undefined)}
    className="..."
  >
    <option value="">{t('genderNotSet')}</option>
    <option value="boys">{t('genderBoys')}</option>
    <option value="girls">{t('genderGirls')}</option>
  </select>
</div>
```

#### 4. Statistics Filtering
**Files to update:**
- `src/components/GameStatsModal/utils/gameFilters.ts`
  - Add `genderFilter?: Gender | 'all'` to `GameFilterOptions`
  - Add gender filtering logic (same pattern as `gameTypeFilter`)

- `src/components/GameStatsModal/hooks/useStatsFilters.ts`
  - Add `selectedGenderFilter` state
  - Add to filter props passed down

- `src/components/GameStatsModal/components/FilterControls.tsx`
  - Add gender filter dropdown

- `src/components/GameStatsModal/components/CollapsibleFilters.tsx`
  - Add gender filter to collapsible section

- `src/components/GameStatsModal.tsx`
  - Wire up gender filter state and handlers

- `src/components/PlayerStatsView.tsx`
  - Add gender filtering support

#### 5. Load Game Search
**File:** `src/components/LoadGameModal.tsx`
- Add gender to search terms (boys/girls/pojat/tytöt)

#### 6. New Game Flow
**Files:**
- `src/components/HomePage/hooks/useNewGameFlow.ts` - Add gender state
- `src/components/HomePage/hooks/useModalOrchestration.ts` - Pass gender to modal
- `src/components/HomePage/utils/newGameHandlers.ts` - Include gender in game creation

#### 7. Translations
**Files:**
- `public/locales/en/common.json`
- `public/locales/fi/common.json`

**Keys to add:**
```json
{
  "genderLabel": "Gender / Sukupuoli",
  "genderBoys": "Boys / Pojat",
  "genderGirls": "Girls / Tytöt",
  "genderNotSet": "Not set / Ei asetettu",
  "genderAll": "All / Kaikki"
}
```

#### 8. i18n Types
**File:** `src/i18n-types.ts`
- Run `npm run generate:i18n-types` after adding translations

#### 9. Tests to Update
- `src/components/NewGameSetupModal.test.tsx`
- `src/components/GameSettingsModal.test.tsx`
- `src/components/SeasonDetailsModal.test.tsx`
- `src/components/TournamentDetailsModal.test.tsx`
- `src/components/GameStatsModal/utils/gameFilters.test.ts`
- `src/components/GameStatsModal/hooks/__tests__/useStatsFilters.test.ts`
- `src/components/GameStatsModal/components/FilterControls.test.tsx`
- `src/components/LoadGameModal.test.tsx`
- `src/components/PlayerStatsView.test.tsx`
- `src/components/HomePage/utils/newGameHandlers.test.ts`

### Backward Compatibility
- `gender` field is optional (`gender?: Gender`)
- Legacy games without gender work seamlessly (treated as "not set")
- No migration needed - field simply absent on old games
- Filter "All" includes games with and without gender set

### Implementation Checklist
- [ ] Types: Add `Gender` type and fields
- [ ] Reducer: Add `SET_GENDER` action
- [ ] Reducer: Add gender to `LOAD_PERSISTED_GAME_DATA`
- [ ] History: Add `SET_GENDER` to history actions
- [ ] NewGameSetupModal: Add gender selector
- [ ] GameSettingsModal: Add gender selector
- [ ] SeasonDetailsModal: Add gender selector
- [ ] TournamentDetailsModal: Add gender selector
- [ ] gameFilters.ts: Add gender filter logic
- [ ] useStatsFilters.ts: Add gender filter state
- [ ] FilterControls.tsx: Add gender dropdown
- [ ] CollapsibleFilters.tsx: Add gender filter
- [ ] GameStatsModal.tsx: Wire up gender filter
- [ ] PlayerStatsView.tsx: Add gender filtering
- [ ] LoadGameModal.tsx: Add gender to search
- [ ] useNewGameFlow.ts: Add gender state
- [ ] useModalOrchestration.ts: Pass gender
- [ ] newGameHandlers.ts: Include gender
- [ ] Translations: EN + FI
- [ ] Generate i18n types
- [ ] Update all tests
- [ ] Run full test suite
- [ ] Run build

**Why Third**: Important feature for Finnish youth soccer. Now has clear implementation plan mirroring the Game Type feature.

---

## ⚽ PRIORITY 4: Game Type (Soccer/Futsal) Labeling

**Status**: ✅ **COMPLETED** (December 11, 2025)
**Effort**: 3-5 days (actual)

### The Problem (Solved)
Finnish youth seasons often include both outdoor soccer and indoor futsal games. ~~Currently no way to distinguish or filter by game type.~~

### Implementation Complete
Added `gameType: 'soccer' | 'futsal'` field for filtering and organization.

**Where gameType is set:**
- ✅ NewGameSetupModal (when creating new game)
- ✅ GameSettingsModal (when editing existing game)
- ✅ SeasonDetailsModal (season-level default)
- ✅ TournamentDetailsModal (tournament-level default)

**Filtering enabled in:**
- ✅ Game history lists (LoadGameModal search)
- ✅ Stats views (PlayerStatsView, GameStatsModal)
- ✅ Season/Tournament stats tabs

**Completed:**
- [x] Add `gameType` field to types (Game, Season, Tournament)
- [x] Update NewGameSetupModal with game type selector
- [x] Update GameSettingsModal with game type selector
- [x] Update SeasonDetailsModal with game type selector
- [x] Update TournamentDetailsModal with game type selector
- [x] Add filtering UI to stats views
- [x] Backward compatible (default to `'soccer'` for existing data)
- [x] Translations (EN/FI)
- [x] Search by game type in LoadGameModal

### Phase 2: Futsal Field Visualization (Future)
**Deferred** - Document for future implementation:
- Different field component for futsal (smaller court, different markings)
- Different default player positions (5 players vs 11)
- Futsal-specific tactical overlays

**Reference**: Use this implementation as pattern for Gender (Boys/Girls) feature.

---

## 🎨 PRIORITY 5: Season League UX Improvements

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

**Why Fifth**: Pure UX improvement. Current UI works, just not ideal. Can wait until after more critical work.

---

## 📦 PRIORITY 6: Other Features & Fixes

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
| **Communication & Marketing** | `../07-business/communication-infrastructure-plan.md` ⭐ |
| Monetization strategies | `../07-business/monetization-strategies.md` |

---

## 📝 Change Log

| Date | Update |
|------|--------|
| 2025-12-11 | ✅ **Game Type (Soccer/Futsal) COMPLETED** - merged to master |
| 2025-12-11 | **Gender Handling plan created** - detailed implementation mirroring Game Type |
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
