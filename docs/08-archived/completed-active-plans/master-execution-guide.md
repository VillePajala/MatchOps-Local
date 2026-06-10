# Master Execution Guide: Play Store Readiness and Monetization

Status: Authoritative (execution sequence)
Last Updated: January 26, 2026

Purpose: a single, authoritative, step‑by‑step guide to take MatchOps‑Local from today's state to a production‑grade release on the Play Store with a sustainable monetization path. This master guide links to the canonical sub‑plans and relevant documentation.

---

## 🎯 Current Status (January 2026)

| # | Task | Status |
|---|------|--------|
| **1** | Supabase Cloud Backend (PRs 1-12) | ✅ COMPLETE |
| **2** | Local-First Sync (PR #324) | ✅ COMPLETE |
| **3** | Billing Infrastructure (Phases 1-7) | ✅ COMPLETE |
| **4** | Business Setup (Toiminimi, Bank, Google Payments) | 🔲 PENDING |
| **5** | Enable `PREMIUM_ENFORCEMENT_ENABLED` | 🔲 AFTER Business Setup |
| **6** | TWA Rebuild with Play Billing | 🔲 PENDING |
| **7** | Production Release | 🔲 PENDING |

**See**: [UNIFIED-ROADMAP.md](./UNIFIED-ROADMAP.md) for full priority breakdown

---

## 🚀 Play Store Release: PR-Chunked Plan

**Primary Doc**: [PLAY-STORE-IMPLEMENTATION-PLAN.md](./PLAY-STORE-IMPLEMENTATION-PLAN.md) ⭐ **START HERE**

### Quick Overview

| Phase | PRs | Hours | Focus | Status |
|-------|-----|-------|-------|--------|
| P1: Security | #1-2 | 4-6h | CSP headers, Service Worker | ✅ Done |
| P2: PWA Packaging | #3-5 | 8-12h | Manifest, TWA, Store assets | ✅ Done |
| P3: Quality | #6-7 | 4-6h | Accessibility, Performance | ✅ Done |
| P4: Monetization | #8-10 | 8-12h | Billing, Feature gating, Paywall | ✅ Done |
| P5: Release | #11 | 2-4h | Store submission | 🚧 In Progress |

**P5 Breakdown**:
- P5.1: TWA Build & Internal Testing ✅ Done (Dec 10)
- P5.2: Store Listing & Declarations ⏳ In Progress
- P5.3: Production Release 📋 Pending

### Branching Strategy

```
master
  └── release/play-store-v1  (integration branch)
        ├── ps/1-csp-headers → PR #1
        ├── ps/2-service-worker → PR #2
        ├── ... (9 more PRs)
        └── Final PR → master
```

---

Start Here
- Canonical checklist: PRODUCTION_READINESS_FIX_PLAN.md
- Roadmap/context: development/PRODUCTION_READINESS_ROADMAP.md
- Play Store details: play-store-deployment-guide.md, PUBLICATION_ROADMAP.md
- Monetization: business/MONETIZATION_STRATEGIES.md, paywall-implementation-guide.md
- IndexedDB Foundation: storage-integration/ACTION_PLAN_VERIFICATION.md, storage-integration/README.md

Table of Contents
- Phase 0: Scope Freeze and Owners
- Execution Workflow (Branches, PRs, Checklists)
- Phase M0: Pre‑Migration Essentials (Tests, Logging, Sentry, PWA dedup)
- Phase M1: IndexedDB Migration (KV adapter + copy/flip)
- Ongoing Feature Development
- Phase F1: Backend Architecture Evolution (Dual-Backend: Local + Cloud)
- Phase P1: Post‑Migration Hardening (Security headers, SW, Analytics gating)
- Phase P2: PWA + Store Packaging (Branding, Metadata, TWA)
- Phase P3: Quality Gates (A11y, Performance, Test expansion)
- Phase P4: Monetization Readiness (Paywall, Analytics, Compliance)
- Phase P5: Release and Post‑Launch Operations
- Phase P6: Communication Infrastructure (Email, Social Media, Websites)
- Phase F2: Feature Development (Post-Release)
- Links Index (All References)

---

## Phase 0: Scope Freeze and Owners

- Owner: TBD
- Target Date: TBD

Outcome: locked MVP scope for Play Store release; each task below has a named owner and target date.

- Define MVP scope for v1 (features toggled on/off at launch).
- Assign owners for each section in PRODUCTION_READINESS_FIX_PLAN.md.
- Convert this guide’s bullets into GitHub issues with labels: `production-readiness`, `store`, `monetization`.

---

## Execution Workflow (Branches, PRs, Checklists)

- One step per PR: keep changes small and isolated to a single checklist item.
- Branch naming: `feat/<phase>-<short-task>`, e.g., `feat/m0-jest-green`.
- PR discipline:
  - Link the relevant checklist item and issue.
  - Include acceptance checks in the PR description.
  - After merge, tick the checkbox in this guide (and the related issue), then pick the next item.
- Never bundle multiple critical items in the same PR.

Checklist Legend
- [ ] Not started  • [x] Done  • [~] In progress (use temporarily in PR text, not here)

---

## Phase M0: Pre‑Migration Essentials (Tests, Logging, Sentry, PWA dedup)

- Owner: TBD
- Target Date: TBD

Outcome: reduce migration risk with trustworthy tests and basic observability; remove sources of noise.

- M0 Checklist
  - [x] Tests: fix JSDOM `window.location` cleanup error; ensure Jest suite is green (FIX_PLAN §8)
  - [ ] Tests: stabilize a core E2E path (start → new game → save → load) per testing/E2E_TESTING_GUIDE.md [SKIPPED FOR LATER]
  - [x] Logging: replace stray `console.*` with `logger` (FIX_PLAN §4)
  - [x] Monitoring: add minimal `@sentry/nextjs` with staging/dev DSN (FIX_PLAN §5)
  - [x] Analytics (optional early): gate `<Analytics />` to production env to reduce noise (FIX_PLAN §6)
  - [x] PWA: render `ServiceWorkerRegistration` and `InstallPrompt` only once (FIX_PLAN §3)
  - [x] i18n: ensure only one `I18nInitializer` wraps the app (no duplication)

Note (optional): You may pre‑apply minimal SW changes now — remove `'/'` from pre‑cache and reduce logs — but leave the full hardening (versioned cleanup, cache policy) to Phase P1.

Acceptance
- Jest + core E2E path green locally.
- Logging routed via `logger`; console noise minimized.
- Basic Sentry events captured in staging/dev.
- Only one SW registration/prompt.

---

## Phase M1: IndexedDB Foundation ✅ COMPLETED

- Owner: Completed
- Completion Date: September 30, 2025

Outcome: Storage abstraction implemented with async operations, error handling, type safety, and comprehensive application integration. IndexedDB foundation is live; current production builds run on IndexedDB via the same abstraction (localStorage is retained only as a read-only backup snapshot).

### M1A: Storage Infrastructure ✅ COMPLETED
- [x] IndexedDB KV adapter and storage foundation
  - ✅ Created `StorageAdapter` interface with error handling
  - ✅ Implemented `IndexedDBKvAdapter` with full test suite
  - ✅ Implemented migration system with cross-tab coordination
  - ✅ Fixed critical race conditions and memory leaks
  - ✅ Added comprehensive storage infrastructure (storageMetrics, storageMutex, storageRecovery, storageBootstrap, storageConfigManager)

### M1B: Storage Abstraction Integration ✅ COMPLETED
**All Work Completed in Single Comprehensive Implementation**:
- ✅ **Storage Helper**: `src/utils/storage.ts` — async operations behind a unified interface
- ✅ **Abstraction Ready**: StorageFactory supports IndexedDB and localStorage
- ✅ **Utility Integration**: Core utilities use the abstraction (savedGames, masterRoster, appSettings, seasons, tournaments, teams, playerAdjustments, fullBackup)
- ✅ **Component Integration**: Updated i18n.ts, useGameTimer.ts, HomePage.tsx
- ✅ **Error Logging**: Added error logging to all empty catch blocks
- ✅ **Test Coverage**: 140+ tests passing with proper async patterns
- ✅ **Type Safety**: Full TypeScript compliance across application
- ℹ️ **Current Backend**: IndexedDB (localStorage retained only for backup/migration data)

**Implementation Note**: The IndexedDB foundation is active; current builds default to IndexedDB with automatic migration on first load (localStorage copy is intentionally preserved for rollback and forensic recovery).

### M1C: Data Migration ✅ COMPLETED
**Status**: Completed — one-time migration now runs automatically on every app start (`runMigration()` in `src/app/page.tsx`) to move any legacy localStorage data into IndexedDB. Legacy localStorage entries remain as a read-only safety net for recovery and forensic comparisons.
**Purpose**: Convert existing localStorage data to IndexedDB while keeping a redundant snapshot for rollback scenarios
**Implementation**: Automatic migration executes on first load (and no-ops afterward), updates `StorageConfig` to `mode: 'indexedDB'`, and intentionally preserves the localStorage copy for backups/diagnostics

Acceptance Criteria (for IndexedDB rollout)
- [x] App runs entirely on IndexedDB with no localStorage backend
- [x] Storage operations use async patterns with proper error handling
- [x] All tests pass with IndexedDB backend
- [x] Code audit passes: no direct localStorage outside dedicated migration/backup utilities
- [x] Build successful with no TypeScript or ESLint errors
- [x] Components and utilities fully integrated

**Next Step**: Maintain migration tooling for manual triggers (Settings → Storage) and monitor logs; no additional rollout work required unless we reintroduce a localStorage mode.

### M1D: Data Integrity - Linked Entities ✅ COMPLETED

- Completion Date: October 5, 2025
- Design Document: `docs/09-design/linked-entities-and-game-sync.md`

**Outcome**: Fixed name inconsistency bug where renamed teams/seasons/tournaments showed different names across UI. Implemented live entity name resolution with graceful fallbacks.

**What We Implemented** (Phase 1):
- [x] Fixed backup system to include teams (`TEAMS_INDEX_KEY`, `TEAM_ROSTERS_KEY`)
- [x] Created `entityLookup` utility for O(1) entity name resolution
- [x] Updated LoadGameModal to use live entity names via memoized maps
- [x] Graceful fallback to snapshot names for deleted entities
- [x] Cross-device import/export now preserves entity names correctly
- [x] Comprehensive test coverage (entityLookup.test.ts, fullBackup.test.ts)

**Deferred Features** (may be future work):
- Per-game team name overrides - Solving a problem that doesn't exist at current scale
- Settings sync (periods, duration, etc.) - No evidence users change mid-season
- Sync timestamps and "New settings available" prompts - Over-engineering for single-user PWA
- Bulk-apply tools - Manual updates acceptable for ~50-100 games

**Why Deferred**: Local-first PWA design principles favor simplicity over premature optimization. These features add complexity without validated user need. If future feedback indicates they're necessary, implementation path is documented in design doc.

**Implementation Files**:
- `src/utils/entityLookup.ts` - Name resolution utility (~63 lines)
- `src/utils/entityLookup.test.ts` - Comprehensive tests (~199 lines)
- `src/components/LoadGameModal.tsx` - Updated to use entity lookups
- `src/utils/fullBackup.ts` - Fixed to include teams in backups

**Acceptance**:
- ✅ All tests pass (18/18 new tests)
- ✅ TypeScript compilation clean
- ✅ ESLint passes with no warnings
- ✅ Backup/restore includes teams and rosters
- ✅ Renamed entities reflect immediately in UI
- ✅ Deleted entities show last known name (no crashes)

---

## Ongoing Feature Development

### Team Final Position Tracking ✅ COMPLETED

- Completion Date: 2025

**Overview**: Manual recording of team final positions in seasons and tournaments (e.g., 1st place, 2nd place) with trophy icons for top 3 finishers.

**Key Features**:
- Manual entry only (user's team position, not opponents)
- Backward compatible (optional `teamResults` field)
- Real-time updates via React Query invalidation
- Import/export support
- Trophy icons for top 3 positions
- Validation (no duplicate teams/positions)

**Checklist**:
- [x] Data model (`CompetitionResult` interface)
- [x] Validation logic
- [x] Storage verification (backward compatibility)
- [x] Management UI (SeasonTournamentManagementModal)
- [x] Display integration (PlayerStatsView, GameStatsModal, GameSettingsModal)
- [x] Translations (EN/FI)
- [x] Testing (16 tests: unit + component)
- [x] Manual testing
- [x] Documentation
- [x] PR & CI

---

### Personnel Management ✅ COMPLETED

- Completion Date: 2025

**Overview**: Personnel management system for coaches, trainers, managers, physiotherapists, and team managers with full CRUD operations and real-time updates.

**Key Features**:
- Personnel roster (CRUD operations with role-based system)
- Personnel selection during game setup
- Display personnel in game details
- Full i18n support (EN/FI)
- Real-time updates via React Query cache invalidation (mirrors useRoster pattern)
- Backward compatible (optional `gamePersonnel` field)
- Automatic import/export support (added to fullBackup system)
- 8 role types: Head Coach, Assistant Coach, Goalkeeper Coach, Fitness Coach, Physiotherapist, Team Manager, Support Staff, Other

**Checklist**:
- [x] Phase 0: Git branch setup
- [x] Phase 1: Type definitions & storage layer (`personnelManager.ts`)
- [x] Phase 2: Backwards compatibility & import/export integration
- [x] Phase 3: React Query hooks with real-time updates
- [x] Phase 4: UI components (`PersonnelSelectionSection`, `PersonnelManagerModal`)
- [x] Phase 5: Integration (HomePage, NewGameSetupModal, ControlBar, GameStatsModal)
- [x] Phase 6: Internationalization (40+ translation keys EN/FI)
- [x] Phase 7: Testing (unit, component, backwards compat, cache tests)
- [x] Phase 8: CI validation & manual testing
- [x] Phase 9: PR creation & merge

---

## Phase F1: Backend Architecture Evolution ✅ COMPLETED

- Completion Date: January 2026
- Documentation: `08-archived/completed-active-plans/backend-evolution/REALISTIC-IMPLEMENTATION-PLAN.md` (archived)

**Overview**: Evolved from IndexedDB-only to dual-backend architecture supporting both local (free) and cloud (premium) modes.

**What Was Implemented**:
- `DataStore` and `AuthService` interfaces
- `LocalDataStore` wrapping existing IndexedDB code
- `SupabaseDataStore` for cloud backend (PRs 1-12)
- `SyncedDataStore` for local-first with background sync
- `LocalAuthService` (no-op) and `SupabaseAuthService` (Supabase Auth)
- Migration wizard (local to cloud and cloud to local)
- Backend selection UI and authentication UI

### Phase F1.1: Interfaces & Local Wrapper ✅
- [x] Define DataStore and AuthService interfaces
- [x] Implement LocalDataStore (wraps existing storage code)
- [x] Implement LocalAuthService (no-op)
- [x] Update React Query hooks to use DataStore
- [x] All tests pass, zero functionality changes

### Phase F1.2: Supabase Implementation ✅
- [x] Set up Supabase project and database schema
- [x] Implement SupabaseDataStore (PostgreSQL queries)
- [x] Implement SupabaseAuthService (email/password)
- [x] Test cloud backend in isolation

### Phase F1.3: Backend Selection & Migration ✅
- [x] Add backend selection UI (local vs cloud)
- [x] Implement migration tool (export, transform, import)
- [x] Add authentication UI (sign up, sign in, password reset)
- [x] End-to-end migration testing

### Phase F1.4: Play Store Integration ✅
- [x] Integrate Play Store billing API
- [x] Implement feature gating (free vs premium)
- [x] Add paywall UI
- [x] Test purchase flow

**See**: [Phased Implementation Roadmap](../08-archived/completed-active-plans/backend-evolution/phased-implementation-roadmap.md) for detailed timeline and tasks (archived)

---

## Phase P1: Post‑Migration Hardening (Security headers, SW, Analytics gating)

- Owner: TBD
- Target Date: TBD

Outcome: strengthen web security and offline behavior; finalize analytics stance.

**Context for Local-First PWA**:
- Focus: XSS prevention, PWA security, offline-first optimization
- CSP scope: Appropriate for single-user PWA (Play Store API + Sentry only)
- NOT needed: Heavy API security, encryption at rest, multi-user controls
- See: `docs/02-technical/security.md` for local-first security model

- P1 Checklist
  - [x] Security headers/CSP in `next.config.ts` (FIX_PLAN §1) - local-first appropriate scope ✅ Done Dec 7
  - [x] SW: restrict caching to static assets; versioned cleanup; avoid HTML caching; update flow OK (FIX_PLAN §2) ✅ Done Dec 7
  - [x] CSP violation reporting endpoint (`/api/csp-report`) with Sentry integration ✅ Done Dec 7
  - [ ] Analytics: disabled by default outside production; gated via env/flag (FIX_PLAN §6)

Acceptance
- Security headers visible; no unexpected CSP errors.
- SW behaves as designed; offline works; no stale HTML.
- Analytics only active when explicitly enabled.

---

## Phase P2: PWA + Store Packaging (Branding, Metadata, TWA)

- Owner: TBD
- Target Date: TBD

Outcome: app installs cleanly as a PWA and is packaged for the Play Store.

- P2 Checklist
  - [x] Manifest: production values verified; icons maskable (192/512); shortcuts configured ✅ Done Dec 7
  - [x] Privacy Policy page (`/privacy-policy`) ✅ Done Dec 7
  - [x] Terms of Service page (`/terms`) ✅ Done Dec 7
  - [x] Settings modal links to Privacy/Terms ✅ Done Dec 7
  - [x] Offline page with branding and retry button ✅ Done Dec 7
  - [x] assetlinks.json structure (placeholder fingerprint - update before TWA build)
  - [x] Screenshots gathered for store listing (3 screenshots in `public/screenshots/`) ✅ Done Dec 7
  - [x] Store listing text finalized (`docs/07-business/store-listing/`) ✅ Done Dec 7
  - [x] TWA packaging ready - see manual steps below

### ⚠️ CRITICAL: Pre-Submission Checklist

**Before submitting to Play Store, you MUST complete these steps:**

1. **Update assetlinks.json** (blocks production build if not done)
   - File: `public/.well-known/assetlinks.json`
   - Replace placeholder with your signing key SHA256 fingerprint
   - Get fingerprint: `keytool -list -v -keystore your-release.keystore -alias your-alias`
   - See: `docs/05-development/twa-build-guide.md` for full instructions
   - **Note**: Build will fail on `master`/`main` branch if placeholder remains

2. **Create Store Assets** (required by Play Store)
   - [ ] 2-8 screenshots (phone + tablet recommended)
   - [ ] Feature graphic (1024x500 PNG)
   - [ ] Hi-res icon (512x512 PNG) - already in `/public/icons/`
   - See: `docs/07-business/store-listing/README.md`

3. **Verify Legal Pages**
   - [ ] Privacy Policy accessible at `/privacy-policy`
   - [ ] Terms of Service accessible at `/terms`
   - [ ] Links work from Settings > About

Acceptance
- PWA installable; Lighthouse PWA pass.
- TWA builds successfully; meets Play target API.
- Store listing assets ready; policy links reviewed.

---

## Phase P3: Quality Gates (A11y, Performance, Test expansion) ✅ COMPLETED

- Owner: Completed
- Completion Date: December 7, 2025

Outcome: broaden quality coverage beyond pre‑migration essentials.

- P3 Checklist
  - [x] Tests: CI stable with test-guards.yml; 2,232+ tests passing ✅ Done Dec 7
  - [x] Accessibility: jest-axe tests for Privacy Policy, Terms, offline.html; WCAG AA contrast verification ✅ Done Dec 7
  - [x] Performance: bundle analysis with @next/bundle-analyzer; baseline targets documented ✅ Done Dec 7

**Implementation Details**:
- `tests/accessibility/core-components.test.tsx` - Accessibility tests with jest-axe
- `docs/06-quality/performance-baseline.md` - Lighthouse targets, Core Web Vitals, bundle size goals
- `npm run build:analyze` - Bundle analysis with visual reports
- `npm run test:a11y` - Run accessibility test suite

Acceptance
- ✅ Jest passes on CI; 2,232+ tests stable
- ✅ No critical a11y violations on Privacy Policy, Terms, offline page
- ✅ Performance baseline documented; bundle analyzer configured

---

## Phase P4: Monetization (Freemium with Limits) ✅ COMPLETED

- Owner: Completed
- Completion Date: December 8, 2025
- Effort: 8-12 hours (3 PRs)

Outcome: Freemium model with usage limits and $9.99 one-time premium purchase.

**Monetization Model**:
- **Free tier**: Full features, limited quantities (1 team, 10 games/competition, 18 players, 1 season, 1 tournament)
- **Premium tier**: $9.99 one-time purchase, unlimited everything
- Aligns with local-first philosophy ("pay once, own forever")
- No subscriptions, no server infrastructure

**Privacy-First Approach**:
- User game data NEVER transmitted (scores, players, stats stay local)
- License validation: Minimal network call to Play Store API
- No behavioral tracking or usage analytics
- Offline-first: License cached locally, works offline after purchase

- P4 Checklist
  - [x] PR #8: Premium context, hooks, and limit constants ✅ Done Dec 8
  - [x] PR #9: Upgrade prompt UI and limit enforcement in creation flows ✅ Done Dec 8
  - [x] PR #10: Play Store billing integration (Digital Goods API for TWA) ✅ Done Dec 8
  - [x] Translations complete (EN/FI) ✅ Done Dec 8
  - [ ] Compliance: Play Billing policy checks complete (verify before submission)

**Free Tier Limits**:
| Resource | Free | Premium |
|----------|------|---------|
| Teams | 1 | Unlimited |
| Games per season/tournament | 10 | Unlimited |
| Players | 18 | Unlimited |
| Seasons | 1 | Unlimited |
| Tournaments | 1 | Unlimited |

Acceptance
- Limits enforced at all creation points
- Clear upgrade prompt when limit reached
- Purchase flow works in TWA
- License cached for offline premium access
- No user data transmitted (only license status)
- Play Store policies compliant

---

## Phase P5: Release and Post‑Launch Operations

- Owner: TBD
- Target Date: TBD

Outcome: staged rollout, monitoring, support, and maintenance loop defined.

### P5.1: TWA Build & Internal Testing ✅ COMPLETED

- Completion Date: December 10, 2025

**What Was Done**:
- [x] TWA (Trusted Web Activity) built using Bubblewrap
- [x] App signing configured with Play App Signing
- [x] AAB uploaded to Play Console internal testing track
- [x] Digital Asset Links (`assetlinks.json`) configured with correct SHA-256 fingerprints
  - Upload key fingerprint: `30:12:BB:EB:13:71:22:FF:42:E5:15:AB:24:33:C8:62:00:CE:9F:0B:B8:FC:E7:E1:87:F5:7D:9F:FC:14:61:2F`
  - Google Play signing key: `0A:22:9D:2B:93:8B:65:81:CC:80:11:A4:65:3D:32:DE:C5:DD:8C:00:7B:02:F2:84:8F:8B:45:62:97:83:49:F3`
- [x] TWA runs in full-screen mode (no browser bar)
- [x] App installs successfully from Play Store internal testing
- [x] Update flow verified - PWA updates deploy via Vercel, no new AAB needed for content changes
- [x] Update banner redesigned with glassmorphism effect

**Key Learnings**:
- TWA is a thin wrapper - most updates deploy via Vercel without touching Play Store
- New AAB only needed for: launcher icon, splash screen, TWA config, or permissions changes
- Digital Asset Links requires BOTH upload key AND Google Play signing key fingerprints

### P5.2: Store Listing & Content Declarations ⏳ IN PROGRESS

- [ ] Complete store listing (app name, descriptions, screenshots)
- [ ] Fill out data safety form
- [ ] Complete content rating questionnaire
- [ ] Verify privacy policy URL is accessible

### P5.3: Production Release 📋 PENDING

- P5 Checklist
  - [ ] Staged rollout plan: internal → closed → production; Sentry alerts configured
  - [ ] Support: triage SLAs; feedback channels documented
  - [ ] Maintenance: SECURITY_UPDATE_PLAN.md cadence; CI audit gate for critical prod vulns; BUG_FIX_PLAN.md

Acceptance
- Successful staged release with no critical regressions; monitoring alerts configured.

---

## Phase P6: Communication Infrastructure ✅ COMPLETED

- Completion Date: December 2025

Outcome: Professional email, website, and social media presence for product launch and user support.

**Primary Doc**: [../07-business/communication-infrastructure-plan.md](../07-business/communication-infrastructure-plan.md)

### Overview

| Component | Provider | Cost |
|-----------|----------|------|
| velomoai.com domain | Namecheap | ~10/year |
| DNS (both domains) | Cloudflare | Free |
| Email (receiving) | Cloudflare Email Routing | Free |
| Email (sending) | Zoho Mail | Free tier |
| Websites | Vercel | Free tier |
| Social media | X, LinkedIn | Free |

### Checklist

- P6 Checklist
  - [x] Register velomoai.com domain
  - [x] Set up Cloudflare DNS for both domains
  - [x] Configure email routing (Cloudflare + Zoho)
  - [x] Update Sentry notifications to alerts@velomoai.com
  - [x] Create Velomo AI website (landing page)
  - [x] Create Velomo AI LinkedIn page
  - [x] Set up Gmail labels and filters

---

## Links Index (All References)

- Production readiness
  - PRODUCTION_READINESS_FIX_PLAN.md (authoritative checklist)
  - development/PRODUCTION_READINESS_ROADMAP.md (context/strategy)
  - SECURITY.md, development/SECURITY_UPDATE_PLAN.md
- Store & publication
  - play-store-deployment-guide.md
  - PUBLICATION_ROADMAP.md
- Monetization
  - business/MONETIZATION_STRATEGIES.md (canonical)
  - paywall-implementation-guide.md
- Communication & Marketing
  - business/communication-infrastructure-plan.md ⭐ (email, social media, websites)
- Architecture & status
  - ARCHITECTURE.md, TECHNOLOGY_DECISIONS.md, PROJECT_STATUS.md, ROADMAP.md, PROJECT_OVERVIEW.md
- Testing & quality
  - testing/TESTING_STRATEGY_2025.md, testing/E2E_TESTING_GUIDE.md, testing/MANUAL_TESTING.md, testing/TEST_MAINTENANCE_GUIDE.md
- Storage migration & integration
  - development/STORAGE_MIGRATION.md
  - specs/INDEXEDDB_MIGRATION_PLAN.md
  - storage-integration/DOCUMENTATION_AUDIT_RESULTS.md ⚡ **START HERE - CORRECTED PLAN**
  - storage-integration/STORAGE_INTEGRATION_PLAN.md (original plan - over-engineered)
  - storage-integration/PHASE1_STORAGE_SERVICE.md (original implementation guide)
  - storage-integration/PHASE2_UTILITY_REFACTOR.md (original utility conversion guide)
- Data integrity
  - 09-design/linked-entities-and-game-sync.md (live entity name resolution; deferred features documented)
- Feature development (ready for implementation)
  - team-final-positions-plan.md (team final position tracking for seasons/tournaments - 6-8 hours)
  - personnel-implementation-plan.md (personnel management with real-time React Query updates - 8-10 hours)
  - personnel-feature-plan.md (older format, superseded by personnel-implementation-plan.md)
- Backend Architecture Evolution (✅ COMPLETE - archived)
  - 08-archived/completed-active-plans/backend-evolution/REALISTIC-IMPLEMENTATION-PLAN.md
  - 08-archived/completed-active-plans/backend-evolution/phased-implementation-roadmap.md
  - 08-archived/completed-active-plans/backend-evolution/migration-strategy.md
  - 02-technical/architecture/dual-backend-architecture.md (comprehensive architecture design)
  - 02-technical/architecture/datastore-interface.md (unified data access API)
  - 02-technical/architecture/auth-service-interface.md (authentication abstraction)
  - 02-technical/database/current-storage-schema.md (IndexedDB structure documentation)
  - 02-technical/database/supabase-schema.md (PostgreSQL target schema)

---

## Phase F2: Feature Development (Post-Release)

**Status**: After Play Store Release + Backend Refactoring
**Priority Order**: As defined in UNIFIED-ROADMAP.md

### Priority 3: Gender Handling ✅ COMPLETED

- Completion Date: December 2025

**Overview**: Added `gender?: 'boys' | 'girls'` field to games, seasons, and tournaments. Filtering enabled in stats views.

**Implementation**:
- [x] Design document created
- [x] Types updated
- [x] Storage/migration
- [x] UI components
- [x] Stats filtering
- [x] Translations (EN/FI)

### Priority 4: Season League UX Improvements (1 week)

**Status**: Idea documented

**Problem**: Flat list of 34 leagues in SeasonDetailsModal. Could be more intuitive.

**Proposed Improvements**:
- Area filtering (Itä, Länsi, Etelä)
- Age group pre-selection
- Level grouping

**Implementation**:
- [ ] Design area/age dropdown filters
- [ ] Update SeasonDetailsModal UI
- [ ] Add translations
- [ ] Test UX flow

### Priority 5: Other Features & Fixes

**Status**: Ongoing / As needed

- GameSettingsModal refactoring (~1 hour)
- Component extraction (TournamentSeriesManager)
- Performance optimizations
- Bug fixes as reported

**See**: [UNIFIED-ROADMAP.md](./UNIFIED-ROADMAP.md) for full details
