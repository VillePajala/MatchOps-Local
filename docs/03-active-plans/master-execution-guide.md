# Master Execution Guide: Play Store Readiness and Monetization

Status: Authoritative (execution sequence)

Purpose: a single, authoritative, step‑by‑step guide to take MatchOps‑Local from today’s state to a production‑grade release on the Play Store with a sustainable monetization path. This master guide links to the canonical sub‑plans and relevant documentation.

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
- Phase P1: Post‑Migration Hardening (Security headers, SW, Analytics gating)
- Phase P2: PWA + Store Packaging (Branding, Metadata, TWA)
- Phase P3: Quality Gates (A11y, Performance, Test expansion)
- Phase P4: Monetization Readiness (Paywall, Analytics, Compliance)
- Phase P5: Release and Post‑Launch Operations
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

Outcome: Complete IndexedDB-only storage architecture implemented with async operations, error handling, type safety, and comprehensive application integration.

### M1A: Storage Infrastructure ✅ COMPLETED
- [x] IndexedDB KV adapter and storage foundation
  - ✅ Created `StorageAdapter` interface with error handling
  - ✅ Implemented `IndexedDBKvAdapter` with full test suite
  - ✅ Implemented migration system with cross-tab coordination
  - ✅ Fixed critical race conditions and memory leaks
  - ✅ Added comprehensive storage infrastructure (storageMetrics, storageMutex, storageRecovery, storageBootstrap, storageConfigManager)

### M1B: IndexedDB-Only Storage Implementation ✅ COMPLETED
**All Work Completed in Single Comprehensive Implementation**:
- ✅ **Storage Helper**: Created `src/utils/storage.ts` (877 lines) - IndexedDB-only async operations
- ✅ **localStorage Elimination**: Removed all localStorage fallbacks from storageFactory
- ✅ **Utility Integration**: All 8 utility files converted (savedGames, masterRoster, appSettings, seasons, tournaments, teams, playerAdjustments, fullBackup)
- ✅ **Component Integration**: Updated i18n.ts, useGameTimer.ts, HomePage.tsx
- ✅ **Error Logging**: Added error logging to all empty catch blocks
- ✅ **Test Coverage**: 144+ tests passing with proper async patterns
- ✅ **Type Safety**: Full TypeScript compliance across application
- ✅ **Code Verification**: No localStorage usage outside tests/adapters

**Implementation Note**: Originally planned as 4 separate sub-branches, all work was completed more efficiently in a single consolidated implementation (PR #34, merged to `feat/indexeddb-complete-implementation`).

### M1C: Data Migration ✅ COMPLETED
**Status**: ✅ One-time migration utility implemented and tested
**Purpose**: Ensures legacy localStorage data is converted to IndexedDB for existing users
**Implementation**: Migration runs automatically on first app load, then localStorage is cleared

Acceptance Criteria - ALL MET ✅
- [x] App runs entirely on IndexedDB with no localStorage fallback
- [x] Storage operations use async patterns with proper error handling
- [x] All tests pass with IndexedDB architecture (144+ tests)
- [x] Code audit passes: localStorage only in tests/adapters
- [x] Build successful with no TypeScript or ESLint errors
- [x] Components and utilities fully integrated

**Next Step**: Merge `feat/indexeddb-complete-implementation` → `master` after final verification and testing

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
  - [ ] Security headers/CSP in `next.config.ts` (FIX_PLAN §1) - local-first appropriate scope
  - [ ] SW: restrict caching to static assets; versioned cleanup; avoid HTML caching; update flow OK (FIX_PLAN §2)
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
  - [ ] Manifest: production values verified; icons maskable (192/512); screenshots gathered
  - [ ] Packaging: TWA built (Bubblewrap/PWABuilder) and passes Play targets; assetlinks configured
  - [ ] Listing: store text finalized; Privacy/Terms URLs ready and accurate

Acceptance
- PWA installable; Lighthouse PWA pass.
- TWA builds successfully; meets Play target API.
- Store listing assets ready; policy links reviewed.

---

## Phase P3: Quality Gates (A11y, Performance, Test expansion)

- Owner: TBD
- Target Date: TBD

Outcome: broaden quality coverage beyond pre‑migration essentials.

- P3 Checklist
  - [ ] Tests: expand E2E; CI stable; maintain coverage
  - [ ] Accessibility: jest‑axe on core screens; fix critical violations
  - [ ] Performance: bundle analysis baseline; Lighthouse sanity on key paths

Acceptance
- Jest + Playwright pass on CI; coverage stable.
- No critical a11y violations on core flows.
- Performance within agreed thresholds.

---

## Phase P4: Monetization Readiness (Paywall, Feature Gating, Compliance)

- Owner: TBD
- Target Date: TBD

Outcome: a privacy-compatible monetization approach with feature gating.

**Privacy-First Monetization Context**:
- User game data NEVER transmitted (scores, players, stats stay local)
- License validation: Minimal network call to Play Store API
- No behavioral tracking or usage analytics
- Feature gating: Premium features unlocked after purchase
- Offline-first: License cached locally, works offline after validation

- P4 Checklist
  - [ ] Strategy finalized in `07-business/monetization-strategies.md`
  - [ ] Play Store billing integration (in-app purchases)
  - [ ] Feature gating implementation (free vs premium tiers)
  - [ ] License caching for offline premium access
  - [ ] Paywall UI/UX components
  - [ ] Compliance: Play Billing policy checks complete

Acceptance
- Feature gating functional; premium features locked for free users
- Purchase flow works; license validated and cached
- Offline premium access after purchase
- No user data transmitted (only license status checks)
- Play Store policies compliant

---

## Phase P5: Release and Post‑Launch Operations

- Owner: TBD
- Target Date: TBD

Outcome: staged rollout, monitoring, support, and maintenance loop defined.

- P5 Checklist
  - [ ] Staged rollout plan: internal → closed → production; Sentry alerts configured
  - [ ] Support: triage SLAs; feedback channels documented
  - [ ] Maintenance: SECURITY_UPDATE_PLAN.md cadence; CI audit gate for critical prod vulns; BUG_FIX_PLAN.md

Acceptance
- Successful staged release with no critical regressions; monitoring alerts configured.

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
