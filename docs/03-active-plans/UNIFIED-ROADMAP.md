# MatchOps-Local: Unified Project Roadmap

**Last Updated**: January 26, 2026
**Status**: Active
**Purpose**: Single source of truth for ALL project work

---

## Quick Status

| Category | Status |
|----------|--------|
| Codebase Health | ✅ Excellent (3,500+ tests, 62-line HomePage, 9 extracted hooks) |
| Security | ✅ All vulnerabilities fixed |
| Performance | ✅ React.memo optimization complete |
| Framework | ✅ Next.js 16.0.10 + React 19.2 |
| Communication Infrastructure | ✅ Complete (domains, email, Sentry, websites, social) |
| Supabase Cloud Backend | ✅ PRs 1-11 Complete, Local-First Sync Complete |
| Billing Infrastructure | ✅ Phases 1-7 Complete (Edge Function, Play Billing, Subscription Management) |
| Next Major Work | 🎯 **Play Store Release - Enable PREMIUM_ENFORCEMENT_ENABLED + Business Setup** |

---

## ✅ COMPLETED WORK

### Code Quality & Refactoring (December 2025)
- [x] HomePage refactoring: 3,725 → 62 lines (98% reduction)
- [x] 9 hooks extracted (all ≤665 lines)
- [x] Layer 3 Polish: React.memo, useMemo optimization
- [x] 3,203 tests passing (65% coverage)
- [x] All P0/P1/P2 fixes complete

### NPM & Security Updates (December 2025)
- [x] xlsx security fix (CVE-2023-30533)
- [x] Sentry 10.28.0
- [x] React Query 5.90.11
- [x] Jest 30.2.0
- [x] react-i18next 16.3.5
- [x] **Next.js 16.0.10 + React 19.2** ✅ (upgraded from 15.5.7)
- [x] npm audit: 0 vulnerabilities

### PWA Stability (December 2025)
- [x] **Blank screen fix** - useAppResume hook for Android TWA/iOS Safari bfcache handling
- [x] ErrorBoundary auto-recovery with loop prevention (max 3 attempts)
- [x] iOS Safari pageshow debouncing for gesture navigation
- [x] Test coverage for useAppResume and ErrorBoundary visibility handling

### Infrastructure (September-October 2025)
- [x] IndexedDB migration complete
- [x] Storage abstraction layer
- [x] Entity lookup system (live name resolution)
- [x] Backup/restore with teams included

### Features (2025)
- [x] Team Final Position Tracking (🥇🥈🥉 in UnifiedTeamModal)
- [x] Personnel Management (8 role types, PersonnelManagerModal, game selection)
- [x] Tournament Series & Season Leagues (Elite/Kilpa/Haaste/Harraste + 34 Finnish leagues)
- [x] First Game Onboarding (FirstGameGuideOverlay, step-by-step guidance)
- [x] External Match Stats (PlayerStatAdjustment for games played outside app)
- [x] Instructions Modal / How It Works help system
- [x] Game Type labeling (Soccer/Futsal) with filtering
- [x] Gender labeling (Boys/Girls) with filtering
- [x] Warm-up Plan (customizable pre-match warm-up routine with sections, stored in IndexedDB)

---

## 🎯 PRIORITY ORDER (December 2025)

| # | Task | Effort | Why This Order |
|---|------|--------|----------------|
| ~~1~~ | ~~Play Store Release~~ | ~~2-3 weeks~~ | 🎯 **IN INTERNAL TESTING** |
| ~~2~~ | ~~Gender Handling (Boys/Girls)~~ | ~~3-5 days~~ | ✅ **COMPLETED** December 2025 |
| ~~3~~ | ~~Game Type (Soccer/Futsal)~~ | ~~3-5 days~~ | ✅ **COMPLETED** December 11, 2025 |
| **1** | Backend Architecture Refactoring | ~4 weeks | Clean architecture before more features |
| **2** | Season League UX (area/age filtering) | 1 week | Nice-to-have UX improvement |
| **3** | Other features & fixes | Ongoing | As needed |

---

## 🚀 PRIORITY 1: Play Store Release

**Status**: 🎯 **IN INTERNAL TESTING** (Play Store)
**Primary Doc**: `PLAY-STORE-IMPLEMENTATION-PLAN.md`
**Master Plan**: `master-execution-guide.md`

### 📅 End of Year Plan (Dec 2025 → Jan 2026)

| Phase | When | Tasks |
|-------|------|-------|
| ~~**Done**~~ | ~~Dec 14-17~~ | ~~P4E: Communication infrastructure~~ ✅ COMPLETE |
| **Now** | Dec 17-31 | Thorough app testing (internal testing track) |
| **Jan 2** | Jan 2, 2026 | P4D: Register Toiminimi at ytj.fi |
| **Jan 3-10** | Jan 2026 | Receive Y-tunnus, open bank account, Google Payments Profile |
| **Jan 10+** | Jan 2026 | P4C: Play Billing integration (~2-3h coding) |
| **Late Jan/Feb** | 2026 | Production release 🚀 |

### Completed Work
- [x] P1: Security Hardening (CSP headers, Service Worker)
- [x] P2: PWA & Store Packaging (Manifest, TWA, Asset links)
- [x] P3: Quality Gates (Accessibility, Performance)
- [x] P4A: Monetization foundation (PremiumContext, premiumLimits, premiumManager) - infrastructure built
- [x] Store assets and listing
- [x] App submitted to Play Store
- [x] **Currently in internal testing**

### Remaining Work (BEFORE PRODUCTION RELEASE)
**⚠️ Play Billing (P4C) required before public release - needs business setup first (Jan 2, 2026)**

- [x] **P4B: Upgrade UI & Limit Enforcement** ✅ COMPLETE (merged to master)
  - [x] Create `UpgradePromptModal.tsx` component
  - [x] Create `UpgradePromptManager.tsx` (connects modal to PremiumContext)
  - [x] Integrate `canCreate()` checks into newGameHandlers (game creation)
  - [x] Integrate `canCreate()` checks into TeamManagerModal (team creation)
  - [x] Integrate `canCreate()` checks into RosterSettingsModal (player creation)
  - [x] Integrate `canCreate()` checks into SeasonTournamentManagementModal
  - [x] Premium Status section in SettingsModal (with limits breakdown)
  - [x] Translations (EN/FI)
- [x] **P4C: Play Billing API integration** ✅ COMPLETE (January 2026)
  - **See**: [`docs/03-active-plans/billing-implementation-plan.md`](./billing-implementation-plan.md) for detailed implementation
  - **See**: [`docs/04-features/play-billing-implementation.md`](../04-features/play-billing-implementation.md) for feature guide
  - [x] Create `src/utils/playBilling.ts` (Digital Goods API + Payment Request API)
  - [x] Create `src/hooks/usePlayBilling.ts` (React hook with 18 tests)
  - [x] Create `supabase/functions/verify-subscription/index.ts` (Edge Function for server-side verification)
  - [x] Create `supabase/migrations/010_subscriptions.sql` (subscription storage)
  - [x] Platform detection utilities (`src/utils/platform.ts`)
  - [x] Subscription context and state management
  - [x] Grace period and expiration UI
  - [x] Cross-device subscription sync
  - [ ] **Pending**: Update `twa-manifest.json` with `playBilling: true`
  - [ ] **Pending**: Rebuild TWA with billing enabled
  - [ ] **Pending**: Set `PREMIUM_ENFORCEMENT_ENABLED = true` after business setup
- [ ] **P4D: Business & Legal Setup** - REQUIRED BEFORE BILLING
  - **Timeline**: Do this NOW while P4B testing continues
  - [ ] Register Toiminimi at ytj.fi (~60 €, 1-3 days)
  - [ ] Receive Y-tunnus (business ID)
  - [ ] Open business bank account (Holvi/Nordea/OP, 1-5 days)
  - [ ] Set up Google Payments Profile with business IBAN
  - [ ] Tax registration (ennakkoperintärekisteri)
  - [ ] Basic bookkeeping setup (Excel or Holvi built-in)

  **📅 Tax Timing: Wait until January 2026**

  ⚠️ **Don't register in December** - you'd have to file 2025 taxes for just 2-3 weeks of activity.

  **Plan:**
  - **January 2, 2026**: Register Toiminimi at ytj.fi
  - First fiscal year: Jan 1, 2026 → Dec 31, 2026 (full year)
  - First tax filing: April 2027 (for 2026)
  - No 2025 tax paperwork needed

  **Key info:**
  - Fiscal year: Calendar year (Jan 1 - Dec 31) for Toiminimi
  - VAT threshold: 15,000 €/year (below = no VAT registration needed)
  - Google handles EU VAT for digital goods sold via Play Store
- [x] **P4E: Communication Infrastructure** ✅ COMPLETE
  - **See**: [`docs/07-business/communication-infrastructure-plan.md`](../07-business/communication-infrastructure-plan.md)
  - **See**: [`docs/07-business/infrastructure-map.md`](../07-business/infrastructure-map.md) (complete infrastructure overview)
  - [x] Register velomoai.com domain (Namecheap, ~$13/year)
  - [x] Set up Cloudflare for DNS (both velomoai.com and match-ops.com)
  - [x] Cloudflare Email Routing: alerts@, dev@, hello@ → Gmail
  - [x] Cloudflare Email Routing: support@match-ops.com, hello@match-ops.com → Gmail
  - [x] Update Sentry notifications to alerts@velomoai.com
  - [x] Gmail labels and filters (MatchOps, Velomo AI, Dev, Alerts)
  - [x] Velomo AI LinkedIn page created
  - [x] velomoai.com website live on Vercel (Next.js 16.x + Tailwind 4.x)
  - Note: X/Twitter using personal account for now (can create @MatchOpsApp later)
- [ ] Complete internal testing
- [ ] Submit for production review
- [ ] Public release

**Note**: Current internal test build has **no limits enforced** - users can create unlimited everything.

**See**: [PLAY-STORE-IMPLEMENTATION-PLAN.md](./PLAY-STORE-IMPLEMENTATION-PLAN.md) for detailed PR breakdown

---

## 🔧 PRIORITY 2: Backend Architecture & Supabase Cloud

**Status**: ✅ **MOSTLY COMPLETE** (PRs 1-11 merged, Local-First Sync complete)
**Primary Doc**: `supabase-implementation-guide.md` ⭐ **MAIN REFERENCE**
**Branch**: `supabase/billing-implementation` (feature branch)

### What's Complete

| Component | Status | Description |
|-----------|--------|-------------|
| DataStore Interface | ✅ | `src/interfaces/DataStore.ts` - 60+ method interface |
| LocalDataStore | ✅ | `src/datastore/LocalDataStore.ts` - IndexedDB implementation |
| SupabaseDataStore | ✅ | `src/datastore/SupabaseDataStore.ts` - Cloud implementation |
| SyncedDataStore | ✅ | Local-first with background sync (PR #324) |
| AuthService | ✅ | `src/auth/SupabaseAuthService.ts` + `LocalAuthService.ts` |
| Auth UI | ✅ | `LoginScreen.tsx`, `AuthProvider.tsx` |
| Migration Wizard | ✅ | Local → Cloud data migration |
| Reverse Migration | ✅ | Cloud → Local data export |
| Subscription System | ✅ | Edge Function + subscription table + contexts |
| Local-First Sync | ✅ | SyncQueue, SyncEngine, conflict resolution |

### What's Pending

| Task | Status | Notes |
|------|--------|-------|
| Enable `PREMIUM_ENFORCEMENT_ENABLED` | 🔲 | Flip when business setup complete |
| Merge to master | 🔲 | After final testing |
| TWA rebuild with billing | 🔲 | After Play Console setup |

### 🔴 Data Integrity Improvements (Before Production)

These issues were identified in deep code review and have GitHub issues for tracking:

| Issue | GitHub | Priority | Description |
|-------|--------|----------|-------------|
| Optimistic Locking | [#330](https://github.com/VillePajala/MatchOps-Local/issues/330) | High | Prevent concurrent game save corruption with version field |
| Composite Unique Constraints | [#331](https://github.com/VillePajala/MatchOps-Local/issues/331) | High | Add DB-level uniqueness for teams/seasons/tournaments |
| Non-Atomic Manual Fallback | [#332](https://github.com/VillePajala/MatchOps-Local/issues/332) | High | Address partial save risk when RPC unavailable |

### Key Implementation Files

```
src/datastore/
├── factory.ts              # Singleton pattern, mode switching
├── LocalDataStore.ts       # IndexedDB (2,010 lines)
├── SupabaseDataStore.ts    # Supabase (1,800+ lines)
└── SyncedDataStore.ts      # Local-first wrapper

src/sync/
├── SyncQueue.ts            # Persists pending operations
├── SyncEngine.ts           # Background processor
├── conflictResolution.ts   # Last-write-wins strategy
└── types.ts                # Sync types and interfaces

supabase/functions/
└── verify-subscription/    # Edge Function for billing
```

---

## 👥 PRIORITY 3: Gender Handling (Boys/Girls)

**Status**: ✅ **COMPLETED** (December 2025)
**Effort**: 3-5 days (actual)
**Pattern**: Same as Game Type (Soccer/Futsal)

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
- [x] Types: Add `Gender` type and fields
- [x] Reducer: Add `SET_GENDER` action
- [x] Reducer: Add gender to `LOAD_PERSISTED_GAME_DATA`
- [x] History: Add `SET_GENDER` to history actions
- [x] NewGameSetupModal: Add gender selector
- [x] GameSettingsModal: Add gender selector
- [x] SeasonDetailsModal: Add gender selector
- [x] TournamentDetailsModal: Add gender selector
- [x] gameFilters.ts: Add gender filter logic
- [x] useStatsFilters.ts: Add gender filter state
- [x] FilterControls.tsx: Add gender dropdown
- [x] CollapsibleFilters.tsx: Add gender filter
- [x] GameStatsModal.tsx: Wire up gender filter
- [x] PlayerStatsView.tsx: Add gender filtering
- [x] LoadGameModal.tsx: Add gender to search
- [x] useNewGameFlow.ts: Add gender state
- [x] useModalOrchestration.ts: Pass gender
- [x] newGameHandlers.ts: Include gender
- [x] Translations: EN + FI
- [x] Generate i18n types
- [x] Update all tests
- [x] Run full test suite
- [x] Run build

**Reference**: Use this implementation as pattern for future similar features.

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

## 📦 BACKLOG: Future Features & Improvements

**Status**: Documented for future consideration
**Tracked in**: GitHub Issues + this document

### 🎨 UX Improvements
| Item | Effort | Notes |
|------|--------|-------|
| Season League area/age filtering | 1 week | See Priority 5 above |
| **Game Autosave** | Low-Medium | Auto-save game on: switch games, goals, period ends. Prevents timer/score loss when switching between games without manual Quick Save. |
| **External Game Cards styling** | Low | PlayerStatsView external game cards need further polish to fully match saved games cards style |
| Core Accessibility | Medium | Color contrast, touch targets, keyboard nav, screen reader support |

### ⚽ Future Features
| Item | Effort | Doc |
|------|--------|-----|
| **Field Export (Image/PDF)** | Medium | Export soccer field with match info and lineup as shareable image or PDF |
| Tactics Field Variations (half/quarter field) | Medium | `docs/04-features/tactics-field-variations.md` |
| Futsal Field Visualization | Medium | Different court, 5 players default |
| Configurable Formations | Low | TODO in useFieldCoordination.ts |
| Tactics Board Animation | High | Recording mode, playback controls, animation save/load |
| Enhanced Drawing Tools | Medium | Ball marker, arrows/shapes, multiple colors |
| Formation Management | Medium | Quick-access templates, formation save/load |
| Visual Analytics | Medium | Bar charts, event timeline, goal log filtering |
| Additional Languages | Medium | Beyond EN/FI (contribution guide needed) |

### 🔧 Quick Fixes (Post-Backend Abstraction)
| Item | Effort | Notes |
|------|--------|-------|
| Add Warmup Plan to backups | ~10 min | `WARMUP_PLAN_KEY` missing from `fullBackup.ts` |

### 🔧 Refactoring (Low Priority)
| Item | Effort | Notes |
|------|--------|-------|
| GameSettingsModal split | ~1 hour | 1,969 lines → Container/View |
| TournamentSeriesManager extraction | ~2 hours | Extract from parent component |
| ~~Gate tactical logging behind DEBUG~~ | ~~Minor~~ | ✅ Already implemented - all 7 locations gated |
| ~~Delete/complete useNewGameFlow.ts~~ | ~~Minor~~ | ✅ Deleted Dec 2025 - was dead code |

### 🧪 Testing Improvements
| Item | Notes |
|------|-------|
| Service Worker integration tests | GitHub issue #115 |
| jest-axe type definitions | Cleaner accessibility test code |
| Cross-platform bundle analysis | Currently Linux-specific |
| Integration tests | Full game creation workflow, save/load, player management, statistics |
| TimerOverlay accuracy test | Component test for timer display accuracy |

### 🐛 Known Code TODOs
| Location | Description |
|----------|-------------|
| `src/utils/clubSeason.ts:20` | After 2099, implement smart century detection |
| `src/utils/premiumManager.ts:62` | Play Billing integration (may be done) |

### 🏗️ Architecture (Long-term)
| Item | Effort | Doc |
|------|--------|-----|
| Backend Architecture Refactoring | ~4 weeks | `backend-evolution/REALISTIC-IMPLEMENTATION-PLAN.md` |
| DataStore Interface (IndexedDB ↔ Supabase) | Part of above | Enables cloud sync |

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
| 2026-01-04 | 📋 **Consolidated todo.md** - Merged unique backlog items (tactics animation, drawing tools, formation management, visual analytics, accessibility, additional languages, integration tests) into BACKLOG section. Archived todo.md |
| 2025-12-19 | ✅ **Backend Abstraction Phase 1-3 COMPLETE** - All 8 PRs merged to feature/backend-abstraction. PR #137 created to merge to master. Includes DataStore interface, LocalDataStore (2,700+ tests), LocalAuthService, factory pattern |
| 2025-12-18 | ✅ **Backend Abstraction Phase 1 COMPLETE** - PRs #1-3 merged (timerStateManager, appSettings extension). Starting Phase 2 (DataStore interface) |
| 2025-12-17 | 📋 **Roadmap cleanup** - Corrected P4B status (already merged to master, not on separate branch) |
| 2025-12-17 | ✅ **P4E Communication Infrastructure COMPLETE** - velomoai.com domain + website, Cloudflare DNS/email routing for both domains, Sentry alerts, Gmail filters, LinkedIn page. See infrastructure-map.md |
| 2025-12-14 | ✅ **Warm-up Plan feature documented** - customizable pre-match routine (bundled with P4B branch) |
| 2025-12-14 | 📋 **Added P4D (Business Setup) and P4E (Communication Infrastructure)** - required before Play Billing |
| 2025-12-13 | ✅ **Gender Handling COMPLETED** - merged to master |
| 2025-12-13 | ✅ **PWA Stability fixes merged** - Blank screen fix (useAppResume, ErrorBoundary improvements, iOS Safari bfcache) |
| 2025-12-12 | ⚠️ **Clarified monetization status** - P4B/P4C (limit enforcement, Play Billing) NOT done, required before production |
| 2025-12-12 | 📦 **Backlog section added** - consolidated all future features, refactoring, TODOs |
| 2025-12-12 | ✅ Confirmed First Game Onboarding, External Match Stats, Instructions Modal already done |
| 2025-12-12 | 🎯 **Play Store in internal testing** - updated roadmap to reflect actual status |
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

**Current Focus**: 🎯 **Backend Abstraction Complete** - PR #137 ready to merge to master. Play Store in internal testing.
