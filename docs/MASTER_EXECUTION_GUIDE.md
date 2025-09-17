# Master Execution Guide: Play Store Readiness and Monetization

Status: Authoritative (execution sequence)

Purpose: a single, authoritative, step‑by‑step guide to take MatchOps‑Local from today’s state to a production‑grade release on the Play Store with a sustainable monetization path. This master guide links to the canonical sub‑plans and relevant documentation.

Start Here
- Canonical checklist: PRODUCTION_READINESS_FIX_PLAN.md
- Roadmap/context: development/PRODUCTION_READINESS_ROADMAP.md
- Play Store details: play-store-deployment-guide.md, PUBLICATION_ROADMAP.md
- Monetization: business/MONETIZATION_STRATEGIES.md, paywall-implementation-guide.md
- Storage migration: development/STORAGE_MIGRATION.md, specs/INDEXEDDB_MIGRATION_PLAN.md

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
  - [ ] Tests: fix JSDOM `window.location` cleanup error; ensure Jest suite is green (FIX_PLAN §8)
  - [ ] Tests: stabilize a core E2E path (start → new game → save → load) per testing/E2E_TESTING_GUIDE.md
  - [ ] Logging: replace stray `console.*` with `logger` (FIX_PLAN §4)
  - [ ] Monitoring: add minimal `@sentry/nextjs` with staging/dev DSN (FIX_PLAN §5)
  - [ ] Analytics (optional early): gate `<Analytics />` to production env to reduce noise (FIX_PLAN §6)
  - [ ] PWA: render `ServiceWorkerRegistration` and `InstallPrompt` only once (FIX_PLAN §3)
  - [ ] i18n: ensure only one `I18nInitializer` wraps the app (no duplication)

Note (optional): You may pre‑apply minimal SW changes now — remove `'/'` from pre‑cache and reduce logs — but leave the full hardening (versioned cleanup, cache policy) to Phase P1.

Acceptance
- Jest + core E2E path green locally.
- Logging routed via `logger`; console noise minimized.
- Basic Sentry events captured in staging/dev.
- Only one SW registration/prompt.

---

## Phase M1: IndexedDB Migration (KV adapter + copy/flip)

- Owner: TBD
- Target Date: TBD

 Outcome: swap persistence to IndexedDB with minimal churn and rollback safety; defer normalization.

- M1 Checklist
  - [ ] Add IndexedDB KV adapter and `storage-mode` flag (no domain API changes)
  - [ ] Create comprehensive backup before migration (migrationBackup)
  - [ ] Copy critical keys to IDB KV; verify round‑trip per key
  - [ ] Flip `storage-mode` to `indexedDB`; retain rollback path
  - [ ] Validate with seeded datasets across browsers (React Query flows + core paths)

Acceptance
- After flip, app runs solely on IDB; backup cleared on success.
- No data loss; core workflows pass (unit + core E2E).
- Rollback confirmed to work in failure simulation.

---

## Phase P1: Post‑Migration Hardening (Security headers, SW, Analytics gating)

- Owner: TBD
- Target Date: TBD

Outcome: strengthen web security and offline behavior; finalize analytics stance.

- P1 Checklist
  - [ ] Security headers/CSP in `next.config.ts` (FIX_PLAN §1) with validation (no CSP violations)
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

## Phase P4: Monetization Readiness (Paywall, Analytics, Compliance)

- Owner: TBD
- Target Date: TBD

Outcome: a compliant monetization approach gated behind feature flags.

- P4 Checklist
  - [ ] Strategy finalized in business/MONETIZATION_STRATEGIES.md
  - [ ] Implementation: feature gating wired behind flags; initially disabled
  - [ ] Compliance: Play Billing vs paid listing decision documented; policy checks complete

Acceptance
- Monetization paths gated and testable; no policy conflicts for chosen packaging.

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
- Storage migration
  - development/STORAGE_MIGRATION.md
  - specs/INDEXEDDB_MIGRATION_PLAN.md
