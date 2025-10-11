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
- Ongoing Feature Development
- Phase F1: Backend Architecture Evolution (Dual-Backend: Local + Cloud)
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

Outcome: Storage abstraction implemented with async operations, error handling, type safety, and comprehensive application integration. IndexedDB foundation exists; current production backend uses localStorage via the same abstraction.

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
- ℹ️ **Current Backend**: localStorage (IndexedDB can be enabled in future rollout)

**Implementation Note**: The IndexedDB foundation branch is available; current builds default to localStorage for maximum compatibility.

### M1C: Data Migration (Planned)
**Status**: Planned — one-time migration utility available in foundation work; not enabled by default
**Purpose**: Convert existing localStorage data to IndexedDB when/if the IndexedDB backend is enabled
**Implementation**: Migration runs automatically on first app load (when enabled), then localStorage is cleared

Acceptance Criteria (for IndexedDB rollout)
- [ ] App runs entirely on IndexedDB with no localStorage backend
- [ ] Storage operations use async patterns with proper error handling
- [ ] All tests pass with IndexedDB backend
- [ ] Code audit passes: no direct localStorage outside adapters
- [ ] Build successful with no TypeScript or ESLint errors
- [ ] Components and utilities fully integrated

**Next Step**: Evaluate enabling IndexedDB behind a feature flag, complete migration rollout plan, and run staged rollout

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

### Team Final Position Tracking (Planned)

- Owner: TBD
- Target Date: TBD
- Plan Document: `team-final-positions-plan.md`
- Estimated Time: 6-8 hours

**Overview**: Add ability to manually record team final positions in seasons and tournaments (e.g., 1st place, 2nd place) with trophy icons for top 3 finishers.

**Key Features**:
- Manual entry only (user's team position, not opponents)
- Backward compatible (optional `teamResults` field)
- Real-time updates via React Query invalidation
- Import/export support
- Trophy icons (🥇🥈🥉) for top 3 positions
- Validation (no duplicate teams/positions)

**Status**: Plan approved, awaiting implementation

**Checklist**:
- [ ] Data model (`CompetitionResult` interface)
- [ ] Validation logic
- [ ] Storage verification (backward compatibility)
- [ ] Management UI (SeasonTournamentManagementModal)
- [ ] Display integration (PlayerStatsView, GameStatsModal, GameSettingsModal)
- [ ] Translations (EN/FI)
- [ ] Testing (16 tests: unit + component)
- [ ] Manual testing
- [ ] Documentation
- [ ] PR & CI

**See**: `team-final-positions-plan.md` for complete implementation details

---

### Personnel Management (Planned)

- Owner: TBD
- Target Date: TBD
- Plan Document: `personnel-implementation-plan.md`
- Estimated Time: 8-10 hours
- Complexity: 2/10

**Overview**: Add personnel management system for coaches, trainers, managers, physiotherapists, and team managers with full CRUD operations and real-time updates.

**Key Features**:
- Personnel roster (CRUD operations with role-based system)
- Personnel selection during game setup
- Display personnel in game details
- Full i18n support (EN/FI)
- Real-time updates via React Query cache invalidation (mirrors useRoster pattern)
- Backward compatible (optional `gamePersonnel` field)
- Automatic import/export support (added to fullBackup system)
- 7 role types: Head Coach, Assistant Coach, Goalkeeper Coach, Fitness Coach, Physiotherapist, Team Manager, Other

**Technical Highlights**:
- React Query hooks with cache invalidation for real-time sync
- Mirrors existing `useRoster` pattern for consistency
- Storage layer with `withKeyLock` for race condition protection
- Graceful handling of missing personnel (deleted staff)
- No migration needed - fully additive feature

**Status**: Plan approved, awaiting implementation

**Checklist**:
- [ ] Phase 0: Git branch setup
- [ ] Phase 1: Type definitions & storage layer (`personnelManager.ts`)
- [ ] Phase 2: Backwards compatibility & import/export integration
- [ ] Phase 3: React Query hooks with real-time updates
- [ ] Phase 4: UI components (`PersonnelSelectionSection`, `PersonnelManagerModal`)
- [ ] Phase 5: Integration (HomePage, NewGameSetupModal, ControlBar, GameStatsModal)
- [ ] Phase 6: Internationalization (40+ translation keys EN/FI)
- [ ] Phase 7: Testing (unit, component, backwards compat, cache tests)
- [ ] Phase 8: CI validation & manual testing
- [ ] Phase 9: PR creation & merge

**Acceptance Criteria**:
- ✅ User can add/edit/delete personnel with real-time updates
- ✅ Changes reflect immediately across all components
- ✅ Personnel selection works in new game setup
- ✅ Old games without `gamePersonnel` field work correctly
- ✅ Old backups without `PERSONNEL_KEY` import successfully
- ✅ Export/import includes personnel data
- ✅ All tests pass (no memory leaks, no force exit)
- ✅ Production build succeeds
- ✅ i18n works for EN/FI
- ✅ Responsive on mobile/desktop

**See**: `personnel-implementation-plan.md` for complete implementation details

---

## Phase F1: Backend Architecture Evolution (Planned)

- Owner: TBD
- Target Date: TBD
- Estimated Duration: 16-24 weeks (4-6 months)
- Complexity: High
- Documentation: `backend-evolution/` folder

**Overview**: Evolve from IndexedDB-only to dual-backend architecture supporting both local (free) and cloud (premium) modes.

**Business Context**:
- **Free Tier**: Local mode (IndexedDB), full features, single device
- **Premium Tier**: Cloud mode (Supabase PostgreSQL), multi-device sync, cloud backup, in-app purchase

**Technical Approach**:
- Introduce `DataStore` and `AuthService` interfaces
- Wrap existing IndexedDB code in `LocalDataStore` (no rewrites)
- Implement `SupabaseDataStore` for cloud backend
- User-initiated migration from local to cloud

**Key Documentation**:
- **Architecture**: [Dual-Backend Architecture](../02-technical/architecture/dual-backend-architecture.md)
- **Interfaces**: [DataStore Interface](../02-technical/architecture/datastore-interface.md) | [AuthService Interface](../02-technical/architecture/auth-service-interface.md)
- **Database**: [Current Storage Schema](../02-technical/database/current-storage-schema.md) | [Supabase Schema](../02-technical/database/supabase-schema.md)
- **Migration**: [Migration Strategy](./backend-evolution/migration-strategy.md)
- **Roadmap**: [Phased Implementation Roadmap](./backend-evolution/phased-implementation-roadmap.md) ⚡ **START HERE**

**Implementation Phases**:

### Phase F1.1: Interfaces & Local Wrapper (4-6 weeks)
- [ ] Define DataStore and AuthService interfaces
- [ ] Implement LocalDataStore (wraps existing storage code)
- [ ] Implement LocalAuthService (no-op)
- [ ] Update React Query hooks to use DataStore
- [ ] All tests pass, zero functionality changes

**Acceptance**: Same functionality, new abstraction layer

### Phase F1.2: Supabase Implementation (6-8 weeks)
- [ ] Set up Supabase project and database schema
- [ ] Implement SupabaseDataStore (PostgreSQL queries)
- [ ] Implement SupabaseAuthService (email/OAuth)
- [ ] Test cloud backend in isolation
- [ ] Performance benchmarks (<500ms queries)

**Acceptance**: Both backends work independently

### Phase F1.3: Backend Selection & Migration (4-6 weeks)
- [ ] Add backend selection UI (local vs cloud)
- [ ] Implement migration tool (export → transform → import)
- [ ] Add authentication UI (sign up, sign in, password reset)
- [ ] End-to-end migration testing
- [ ] Deploy to production

**Acceptance**: Users can migrate local data to cloud

### Phase F1.4: Play Store Integration (2-4 weeks)
- [ ] Integrate Play Store billing API
- [ ] Implement feature gating (free vs premium)
- [ ] Add paywall UI
- [ ] Test purchase flow
- [ ] Update app in Play Store

**Acceptance**: Premium tier available for purchase

**Risks & Mitigations**:
- **Data Loss**: Comprehensive validation + keep local backup
- **Network Failures**: Retry logic with exponential backoff
- **Poor Performance**: React Query caching + batch operations
- **Low Conversion**: Clear value proposition, free trial

**Success Metrics**:
- 90%+ migration success rate (zero data loss)
- Query performance <500ms (95th percentile)
- 5-15% premium conversion rate
- 4.0+ Play Store rating

**Status**: Planned - awaiting stakeholder approval and resource allocation

**See**: [Phased Implementation Roadmap](./backend-evolution/phased-implementation-roadmap.md) for detailed timeline and tasks

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
- Data integrity
  - 09-design/linked-entities-and-game-sync.md (live entity name resolution; deferred features documented)
- Feature development (ready for implementation)
  - team-final-positions-plan.md (team final position tracking for seasons/tournaments - 6-8 hours)
  - personnel-implementation-plan.md (personnel management with real-time React Query updates - 8-10 hours)
  - personnel-feature-plan.md (older format, superseded by personnel-implementation-plan.md)
- Backend Architecture Evolution (planned)
  - backend-evolution/phased-implementation-roadmap.md ⚡ **START HERE - EXECUTION PLAN**
  - backend-evolution/migration-strategy.md (data transformation: IndexedDB → Supabase)
  - 02-technical/architecture/dual-backend-architecture.md (comprehensive architecture design)
  - 02-technical/architecture/datastore-interface.md (unified data access API)
  - 02-technical/architecture/auth-service-interface.md (authentication abstraction)
  - 02-technical/database/current-storage-schema.md (IndexedDB structure documentation)
  - 02-technical/database/supabase-schema.md (PostgreSQL target schema)
