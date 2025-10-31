# Code Review — MatchOps-Local (2025-10-30)

Author: Codex CLI

Scope: Current branch assessment across app code, hooks, storage, PWA, configuration, and tests. No changes made — read-only review with concrete, file-referenced findings and prioritized recommendations.

---

## Summary

- Overall: Solid local-first architecture, robust IndexedDB adapter, careful timer logic, PWA polish, and strong testing scaffolding.
- Main risks: Maintainability and state management in monolithic components and modal booleans, a few silent error swallows, minor platform/listener hygiene issues, and one functional Wake Lock bug.

---

## Fix Status (Updated 2025-10-30)

### ✅ FIXED - High Priority (Commit: Pending)

1. **Wake Lock Reacquisition Bug** - `src/hooks/useWakeLock.ts`
   - **Fix Applied**: Added `desiredActiveRef` to track intended lock state and re-request logic in release event handler
   - **Implementation**: Extracted `requestWakeLock()` function with recursive re-acquisition on system release
   - **Impact**: Screen will no longer sleep mid-game when system releases wake lock
   - **Status**: ✅ Fixed, lint passed, tests passed

2. **Latest Game ID NaN Handling** - `src/utils/savedGames.ts:277-282`
   - **Fix Applied**: Added explicit NaN normalization to 0 after date parsing
   - **Implementation**: `if (isNaN(dateA)) dateA = 0; if (isNaN(dateB)) dateB = 0;`
   - **Impact**: Sort comparator now handles corrupted/invalid dates consistently
   - **Status**: ✅ Fixed, lint passed, all 64 tests passed

3. **Misleading Storage Error Message** - `src/utils/storage.ts:235-237`
   - **Fix Applied**: Removed "network/offline" error check and message
   - **Rationale**: IndexedDB is 100% local, network errors are misleading in local-first PWA
   - **Impact**: Users no longer see confusing "check your internet connection" for storage issues
   - **Status**: ✅ Fixed, lint passed

### ⏳ WAITING - Low Priority (Deferred to Follow-up PR)

4. **Silent Error Swallowing** (4 instances)
   - `src/components/StartScreen.tsx:52` - Language update `.catch(() => {})`
   - `src/components/PlayerStatsView.tsx:833` - Demand correction `.catch(() => {})`
   - `src/components/HomePage.tsx:927, 932` - Timer state cleanup `.catch(() => {})`
   - **Recommendation**: Add `logger.warn()` or `showToast()` for debugging visibility
   - **Priority**: P2 - Low impact, improves debugging experience
   - **Status**: ⏳ Waiting (scheduled for next PR)

### ❌ FALSE POSITIVE - No Action Needed

5. **Service Worker Listener Cleanup** - `src/components/ServiceWorkerRegistration.tsx:88`
   - **Assessment**: Not a bug - listener triggers page reload, destroying JS context
   - **Rationale**: Cleanup unnecessary and would break update mechanism
   - **Status**: ❌ No action needed (correct as-is)

### 📋 DEFERRED - Architectural Issues (Tracked in CLAUDE.md)

6. **Monolithic Components** (Known P0/P1 Issues)
   - HomePage.tsx (3,603 lines) - P0
   - GameSettingsModal.tsx (1,707 lines) - P1
   - Modal state proliferation - P2
   - **Status**: Tracked in `docs/CRITICAL_FIXES_REQUIRED.md` with detailed fix plans

---

## High-Risk Maintainability

- Monolithic component re-renders and coupling
  - src/components/HomePage.tsx:1 — 3,603 lines coupling orchestration, data load, timer, autosave, 10+ modal flags, DnD, undo/redo, and side-effects. High cognitive load, hard to test, and every state tweak re-evaluates the whole file.

- Oversized modal component
  - src/components/GameSettingsModal.tsx:1 — 1,707 lines with a large prop surface and mixed responsibilities (metadata, events, competition, scheduling). Difficult to reason about, test, and evolve.

- Modal boolean state proliferation
  - src/contexts/ModalProvider.tsx:1 — Many independent `isXxxOpen` booleans increase race risk (overlapping modals) and drive unnecessary renders.

---

## Functional/Bug Findings

- Wake Lock reacquisition gap (user-facing)
  - src/hooks/useWakeLock.ts:25 — On `release`, the hook sets the sentinel to `null` but does not re-request the lock even if the timer is still running; only visibilitychange attempts a re-request and only when `wakeLock` is truthy. Result: screen can sleep mid-game.

- Latest game ID comparator edge case
  - src/utils/savedGames.ts:270 — Comparator mixes date parsing and timestamp extraction; when dates fail to parse, `0`/`NaN` handling can produce inconsistent ordering. Low likelihood but can yield non-deterministic results in rare data conditions.

---

## Error Handling

- Silent error swallowing (hide failures from users and devs)
  - src/components/StartScreen.tsx:52 — `updateAppSettings({ language }).catch(() => {})`
  - src/components/PlayerStatsView.tsx:833 — `updateAppSettings({ useDemandCorrection: val }).catch(() => {})`
  - src/components/HomePage.tsx:927, src/components/HomePage.tsx:932 — `removeStorageItem(...).catch(() => {})`

Recommendation: Prefer `showToast(...)` or at least `logger.warn(...)` with context to surface issues.

---

## Performance/Rendering

- Large component re-evaluations
  - src/components/HomePage.tsx:1 — Any local state or modal flag change re-runs the 3,600+ line component. On slower devices, this risks UI lag and battery drain.

- Deep equality with JSON.stringify
  - src/hooks/useUndoRedo.ts:24 and src/hooks/useAutoSave.ts:35 — Practical for current state shapes, but watch out if state grows (nested tactics, drawings). Consider structured compare for hot paths if needed.

---

## PWA/Platform

- Service worker listener hygiene
  - src/components/ServiceWorkerRegistration.tsx:88 — Adds `controllerchange` listener without removal. In practice RootLayout mounts once, but cleanup is good practice.

- Update polling cadence
  - src/components/ServiceWorkerRegistration.tsx:65 — 60s polling can be noisy in production. Consider longer interval in prod or gate by `NODE_ENV`.

- Service worker caching
  - public/sw.js:1 — Network-first for documents and cache-first for assets is sensible. Static resources list matches repo contents.

---

## Storage/IndexedDB

- Adapter lifecycle and concurrency are robust
  - src/utils/storage.ts:300 — TTL-based caching, exponential backoff, user-friendly errors, batch ops, and cleanup.
  - src/utils/storageFactory.ts:200 — Mutex-managed adapter creation, config persistence, disposal support.
  - src/utils/storageKeyLock.ts:1 and src/utils/lockManager.ts:1 — Per-key lock and queue prevent write races.

- UX copy nit
  - src/utils/storage.ts:280 — User-friendly error text mentions “network/offline” for storage operations in a local-first app; could confuse users when there is no server.

---

## Security/Privacy

- Sentry gating is appropriate and safe
  - sentry.server.config.ts:1 and sentry.edge.config.ts:1 — Only enabled with DSN and env gates. Debug only in non-prod.
  - src/__tests__/security/sentry-env.test.ts:1 — Validates DSN form and ensures no public auth tokens.

- ESLint guards
  - eslint.config.mjs:1 — Blocks direct `console` and `localStorage` across app code, allowing only in migration/infra utilities.

---

## i18n/SSR

- Client-first initialization is consistent
  - src/i18n.ts:1 and src/components/I18nInitializer.tsx:1 — Start in Finnish synchronously, then load stored user preference; avoids SSR hydration pitfalls.
  - src/app/page.tsx:1 — Client-only HomePage usage is aligned with this model.

---

## Tests/Tooling

- Jest and Playwright setup are comprehensive
  - jest.config.js:1 — Good coverage thresholds, CI reporters, and next/jest integration.
  - tests/* and src/__tests__/* — Broad surface coverage for config, security, performance, and components.

- Linting
  - eslint.config.mjs:1 — Enforces key architectural rules that support the IndexedDB-first design.

---

## Recommendations (Prioritized)

1) Refactor monoliths for maintainability and performance
   - HomePage split: container (orchestration + data) → smaller presentational components (field, bars, overlays), and a narrow `ModalManager`.
     - src/components/HomePage.tsx:1
   - GameSettingsModal split: domain-specific subcomponents (team/opponent meta, events editor, competition, scheduling).
     - src/components/GameSettingsModal.tsx:1

2) Modal state machine (reduce booleans + race risk)
   - Replace many `isXxxOpen` with a single discriminated union or XState-like finite state to prevent multi-open races and isolate re-renders.
     - src/contexts/ModalProvider.tsx:1

3) Wake Lock reliability fix (user-facing)
   - Track desired active state and re-request on `release` when still desired (or call `syncWakeLock(true)` in the release handler).
     - src/hooks/useWakeLock.ts:25

4) Replace silent `.catch(() => {})` with surfaced handling
   - Use `showToast` for user-visible settings failures and `logger.warn` for non-critical operations.
     - src/components/StartScreen.tsx:52
     - src/components/PlayerStatsView.tsx:833
     - src/components/HomePage.tsx:927, 932

5) Service worker hygiene and cadence
   - Add cleanup for `controllerchange` and gate the 60s update polling by environment or increase interval in production.
     - src/components/ServiceWorkerRegistration.tsx:65, 88

6) Comparator robustness for latest game ID
   - Normalize invalid dates and ensure consistent comparator return for `NaN` cases.
     - src/utils/savedGames.ts:270

7) Copy polish for storage errors
   - Remove or rephrase “network/offline” wording to avoid confusion in a local-first context.
     - src/utils/storage.ts:280

---

## Quick Wins (Low Risk)

- Add cleanup to SW `controllerchange` listener.
- Replace a handful of `.catch(() => {})` with `logger.warn` + optional toast.
- Implement Wake Lock re-request on `release` based on a `desiredActive` flag.
- Increase SW update interval in production.

---

## Next Steps (If Approved)

- I can provide:
  - A minimal patch for: Wake Lock fix + SW listener cleanup + replacing the few silent catches.
  - A typed `ModalState` proposal with a thin `ModalManager` API and a migration path.
  - A refactor plan sketch for `HomePage` and `GameSettingsModal` with milestones and validation points.

