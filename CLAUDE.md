# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## ✅ P0 REFACTORING COMPLETE! 🎉

**✅ UPDATE (Jan 21, 2025): P0 Refactoring 100% COMPLETE!** HomePage successfully reduced to **62 lines** and ALL hooks extracted.

**Status**: ✅ **P0 COMPLETE** — Critical refactoring done, December 2025 code review fixes applied

**Remaining Technical Debt**:
- **P1**: GameSettingsModal.tsx (1,995 lines) — Deferred (low priority, doesn't block development)
- ~~**P2**: Silent error swallowing~~ — ✅ FIXED (December 2025)
- **P2**: Re-render performance optimization — Deferred to Layer 3

### What Was Accomplished

| Priority | Issue | Status | Result |
|----------|-------|--------|--------|
| ~~**P0**~~ | ~~`HomePage.tsx` was 3,725 lines~~ | ✅ **COMPLETE** | Now **62 lines** (98.3% reduction!) |
| ~~**P0**~~ | ~~`useGameOrchestration.ts` was 3,373 lines~~ | ✅ **COMPLETE** | Split into 6 focused hooks (all ≤733 lines) |
| ~~**P1**~~ | ~~useAutoSave stale closure~~ | ✅ **COMPLETE** | Ref pattern implemented |
| ~~**P1**~~ | ~~handleDeleteGameEvent race condition~~ | ✅ **COMPLETE** | Atomic action created |
| ~~**P1**~~ | ~~modalManagerProps documentation~~ | ✅ **COMPLETE** | ADR-001 created |
| **P1** | `GameSettingsModal.tsx` is 1,995 lines | ⏸️ Deferred | Low priority, can address later |
| ~~**P2**~~ | ~~Modal state race conditions~~ | ✅ **COMPLETE** | Layer 2 modal reducer |
| ~~**P2**~~ | ~~Silent error swallowing~~ | ✅ **COMPLETE** | December 2025 code review fix |
| ~~**P2**~~ | ~~Memory leak (SoccerField cache)~~ | ✅ **COMPLETE** | LRU cache implemented |
| ~~**P2**~~ | ~~JSON parsing validation~~ | ✅ **COMPLETE** | Graceful degradation pattern |
| **P2** | Re-render performance | ⏸️ Deferred | Layer 3 polish |

### What You Can Do NOW

**✅ P0 COMPLETE — Major Development Speed Boost Unlocked!** 🚀

The **critical** P0 refactoring is **COMPLETE**. You can now work on most tasks at full speed:

- ✅ **Major features**: Go ahead — HomePage and hooks are clean
- ✅ **New game modes**: Ready to implement
- ✅ **Complex functionality**: Core codebase is maintainable and testable
- ✅ **Bug fixes**: Easy to locate and fix
- ✅ **Tests**: All 1615 passing
- ✅ **Production readiness**: Ready for security & service worker work

**Remaining Considerations**:
- 🟡 **GameSettingsModal** (1,995 lines): Still large but doesn't block development
- 🟡 **Layer 3 Polish**: Performance optimization deferred but not blocking
- ✅ **December 2025 Fixes**: Data integrity, error logging, memory leak all resolved

### Why This Matters

**What We've Achieved** ✅:
- HomePage: 3,725 lines → **62 lines** (98.3% reduction!)
- useGameOrchestration: Split into 6 focused hooks:
  - useGameDataManagement (361 lines) ✅
  - useGameSessionCoordination (480 lines) ✅
  - useFieldCoordination (733 lines) ✅
  - useGamePersistence (664 lines) ✅
  - useTimerManagement (~250 lines) ✅
  - useModalOrchestration (~500 lines) ✅
- Container pattern: ✅ Complete
- View-model pattern: ✅ Complete
- Modal reducer: ✅ Complete
- Architecture: ✅ Industry-standard React pattern
- P1 fixes: ✅ All complete

**Impact**:
- Development velocity: **3-5x faster** ✅
- Code maintainability: **Excellent** ✅
- Testing: **Easy** ✅
- Onboarding: **Simple** ✅

### Essential Reading

- **[REFACTORING_STATUS.md](./docs/03-active-plans/REFACTORING_STATUS.md)** ⭐ **START HERE** - Single source of truth
- **[POST-REFACTORING-ROADMAP.md](./docs/03-active-plans/POST-REFACTORING-ROADMAP.md)** 🔜 **AFTER COMPLETION** - Week-by-week plan for tasks after refactoring
- **[CRITICAL_FIXES_TRACKER.md](./docs/CRITICAL_FIXES_TRACKER.md)** - Detailed progress tracking
- **[CRITICAL_FIXES_REQUIRED.md](./docs/CRITICAL_FIXES_REQUIRED.md)** - Original analysis (updated)
- **[DOCUMENTATION_CLEANUP.md](./docs/03-active-plans/DOCUMENTATION_CLEANUP.md)** - File organization guide

### When Starting Work

**✅ Refactoring Complete — What's Next:**

1. **Merge to master**: refactor/2.6-integration → master (ready now)
2. **Follow**: [POST-REFACTORING-ROADMAP.md](./docs/03-active-plans/POST-REFACTORING-ROADMAP.md) for next steps
3. **Priorities**:
   - Security fixes (xlsx vulnerability)
   - Service Worker improvements
   - NPM updates (Sentry, React Query, Jest 30, Next.js 16)
   - Layer 3 polish (performance, error handling)
4. **Estimated effort**: 15-20 hours over 4-5 weeks

**For Any New Work:**
1. **Major features**: ✅ Full speed ahead — codebase is ready
2. **Bug fixes**: ✅ Easy to locate and fix
3. **Documentation**: ✅ Keep it updated
4. **Tests**: ✅ Maintain 100% pass rate

---

## Development Commands

### Core Commands
- `npm run dev` - Start development server (Next.js)
- `npm run build` - Build for production (includes manifest generation)
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm test` - Run all Jest tests (executes `jest`)
- `npm run test:unit` - Alias for `npm test`
- `npm run generate:i18n-types` - Generate TypeScript types for translations

### Build Process
The build process includes a custom manifest generation step that runs before Next.js build:
- `node scripts/generate-manifest.mjs` - Generates PWA manifest based on branch
- Manifest configuration varies by branch (master vs development) for different app names and themes

## Architecture Overview

### Tech Stack
- **Next.js 15** with App Router
- **React 19** with TypeScript
- **Tailwind CSS 4** for styling
- **PWA** with custom service worker
- **Browser IndexedDB** for data persistence
- **React Query** for state management
- **i18next** for internationalization (English/Finnish)

### Core Architecture

**Data Flow**: The app's data layer relies on **React Query** to fetch, cache, and manage server-side state (persisted in IndexedDB). Asynchronous storage operations in `src/utils/storage.ts` provide IndexedDB access through a unified adapter layer.

**PWA Structure**: Full PWA with custom service worker (`public/sw.js`), dynamic manifest generation, install prompts and update notifications.

**State Management**:
- **`src/app/page.tsx`**: Central orchestrator for all state management strategies
- **`useReducer` (`useGameSessionReducer.ts`)**: Core game session state (score, timer, periods, metadata)
- **`useGameState` hook**: Interactive soccer field state (player positions, drawings)
- **React Query**: Asynchronous data operations (roster, seasons, tournaments, saved games)
- **`useState`**: Local UI state within components (modal visibility, etc.)

**Key Components**:
- `SoccerField` - Interactive drag-and-drop field
- `PlayerBar` - Player roster management
- `ControlBar` - Main app controls
- Various modals for game settings, stats, and management

**Data Persistence**: All data stored in browser IndexedDB via `src/utils/storage.ts`:
- Player roster (`src/utils/masterRosterManager.ts`)
- Game saves (`src/utils/savedGames.ts`)
- Seasons and tournaments (`src/utils/seasons.ts`, `src/utils/tournaments.ts`)
- App settings (`src/utils/appSettings.ts`)

**IndexedDB Migration**: `src/utils/migration.ts` handles localStorage → IndexedDB migration with essential features (data transfer, error handling, progress tracking, rollback). Production-ready for small-scale deployments.

**Storage Requirements**:
- IndexedDB required (typically 50MB+ quota)
- No localStorage fallback (insufficient for 100+ games)
- Private/incognito mode not supported (IndexedDB disabled/restricted)
- Automatic migration on first load after upgrade

**Logging**: Centralized system in `src/utils/logger.ts` - Type-safe, environment-aware, replaces direct `console.*` usage.

**Error Monitoring**: Sentry integration for production:
- Config: `src/instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `src/app/global-error.tsx`
- Production-only by default (or `NEXT_PUBLIC_SENTRY_FORCE_ENABLE=true`)
- Filters browser noise (ResizeObserver, NetworkError)
- 10% trace sampling, error-only session replays with privacy protection

**Testing**: Jest with React Testing Library, configured for Next.js with custom setup in `jest.config.js`

## For Code Reviewers (AI or Human)

### ⚠️ Critical: This is a Local-First PWA, NOT a Traditional Web App

This is a **local-first Progressive Web App** for single-user soccer coaching. No backend, no multi-user features, no enterprise patterns needed.

### Architecture Context

**Single-User Installation**
- One soccer coach per installation, no authentication/authorization/RBAC
- 100% browser-based, no API endpoints or database servers
- Minimal network: PWA updates, license validation, error reporting only
- Works completely offline, all data in browser IndexedDB

**Data Scale & Privacy**
- 1 user, 50-100 players, 50-100 games/season, <50MB storage
- Soccer scores/stats only - NOT sensitive PII/financial/healthcare data
- Data never leaves device (except opt-in error tracking)
- Primary threat: physical device theft (mitigated by OS encryption)

**PWA Private Mode Behavior**
- PWA installation IMPOSSIBLE in private/incognito (by design across all browsers)
- IndexedDB restricted/disabled in private mode
- Current error handling is comprehensive (`storageFactory.ts`, `storage.ts`)
- ❌ DO NOT flag "missing private mode detection" - PWAs require persistent storage

### Code Review Guidelines

#### ❌ DO NOT Suggest These Patterns

**Enterprise/SaaS** (Not Applicable)
- ❌ Audit logging, multi-tenant isolation, RBAC, API auth, rate limiting, GDPR logging, centralized analytics

**Network Security** (Minimal Network Communication)
- ❌ Complex API auth (OAuth/JWT), CORS config, request signing
- ✅ Basic Play Store integration for license validation only

**Data Encryption** (Browser Sandboxing Sufficient)
- ❌ Client-side encryption, key management, encryption at rest

**Over-Engineering**
- ❌ Heavy schema validation (Zod/Yup) for self-generated data
- ❌ Complex caching, query optimization for 100 records
- ❌ CDN, edge caching, horizontal scaling

#### ✅ DO Focus On These Areas

**Browser Compatibility**
- ✅ IndexedDB edge cases (quota, corruption, private mode)
- ✅ Service Worker lifecycle, cross-browser PWA behavior

**Data Integrity**
- ✅ Corruption recovery, backup/restore, migration patterns
- ✅ Graceful handling of malformed data

**Performance & Memory**
- ✅ Memory leaks, efficient IndexedDB transactions
- ✅ UI responsiveness, bundle size

**User Experience**
- ✅ Offline-first patterns, helpful error messages
- ✅ Loading states, accessibility (a11y)

**PWA Best Practices**
- ✅ Service Worker updates, app manifest
- ✅ Install prompts, offline capability

### Quick Reference

1. **Remember**: One user, one device, no server, no network
2. **Data scale**: Hundreds of records, not millions
3. **Security**: Browser sandboxing is the boundary
4. **Performance**: Optimize for small datasets and single-user UX

See `docs/PROJECT_OVERVIEW.md` and `docs/LOCAL_FIRST_PHILOSOPHY.md` for details.

## Key Files to Understand

- `src/app/page.tsx` - Main component orchestrating entire app (hooks, reducers, data fetching)
- `src/hooks/useGameSessionReducer.ts` - Core game logic reducer (timer, score, status)
- `src/hooks/useGameState.ts` - Interactive soccer field state management
- `src/utils/masterRosterManager.ts` - Player CRUD operations
- `src/config/queryKeys.ts` - React Query cache keys
- `src/types/index.ts` - Core TypeScript interfaces
- `src/utils/localStorage.ts` - Async localStorage wrapper
- `src/utils/logger.ts` - Centralized logging utility

## Testing Rules and Principles

### Critical Testing Guidelines

**NEVER SKIP TESTS** unless explicitly requested. Tests catch regressions and ensure quality.

**Test fixes must make the project more robust, not mask issues:**
- Fix underlying problems, don't just make tests pass
- Ensure mocks accurately represent real behavior
- Don't weaken assertions or remove coverage
- Document why changes were necessary

**When fixing failing tests:**
1. Understand why it's failing (legitimate issue vs test problem?)
2. Fix the root cause, not the symptom
3. Improve robustness, not permissiveness
4. Maintain coverage
5. Document changes

**Acceptable modifications:**
- Updating expectations to match corrected behavior
- Improving reliability and reducing flakiness
- Adding better error handling/edge cases
- Fixing incorrect mocks

**Unacceptable modifications:**
- Skipping tests to avoid failures
- Weakening assertions
- Removing tests without replacement
- Using overly permissive mocks

### Test Documentation Standards

**Use JSDoc comments with tags:**
- `@critical` - Core user workflows (never skip/weaken)
- `@integration` - Component interactions
- `@edge-case` - Boundary conditions and error scenarios
- `@performance` - Performance requirements

**Example:**
```typescript
/**
 * Tests critical workflow: game creation → player selection → start
 * @critical
 */
it('should create new game → select players → start game', async () => {
  // Test implementation
});
```

### Anti-Patterns That Must Never Appear

**1. Fixed Timeouts (FORBIDDEN)**
```typescript
// ❌ FORBIDDEN - Flaky and unreliable
await new Promise(resolve => setTimeout(resolve, 100));

// ✅ REQUIRED - Wait for actual conditions
await waitFor(() => {
  expect(screen.getByText('Success')).toBeInTheDocument();
});
```

**2. Missing act() Wrappers (FORBIDDEN)**
```typescript
// ❌ FORBIDDEN - State updates not wrapped
fireEvent.click(button);
expect(result).toBe(true);

// ✅ REQUIRED - Proper React state handling
await act(async () => {
  fireEvent.click(button);
});
await waitFor(() => expect(result).toBe(true));
```

**3. Issue-Masking Mechanisms (FORBIDDEN)**
```typescript
// ❌ FORBIDDEN in jest.config.js
detectLeaks: false        // Masks memory leaks
forceExit: true           // Masks resource leaks
--bail                    // Hides multiple failures

// ✅ REQUIRED - Expose and fix real issues
detectLeaks: true
detectOpenHandles: true
forceExit: false
```

**4. Console Noise Tolerance (FORBIDDEN)**
Tests automatically fail on unexpected console warnings/errors. See `src/setupTests.mjs`.

### Required Testing Infrastructure

**jest.config.js:**
```javascript
{
  detectOpenHandles: true,  // ✅ REQUIRED
  detectLeaks: true,        // ✅ REQUIRED
  forceExit: false,         // ✅ REQUIRED
  testTimeout: 30000,       // ✅ REQUIRED
  maxWorkers: process.env.CI ? 2 : '50%',
}
```

**Test Isolation Pattern:**
```typescript
beforeEach(async () => {
  jest.clearAllMocks();
  jest.clearAllTimers();
  clearMockStore();
  localStorage.clear();
});

afterEach(async () => {
  cleanup();
  await act(async () => {
    // Allow pending updates to complete
  });
});
```

### Async Testing Pattern

```typescript
test('user interaction', async () => {
  render(<Component />);

  // Wait for initial render
  await waitFor(() => {
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  });

  // Wrap interactions in act()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
  });

  // Wait for state updates
  await waitFor(() => {
    expect(screen.getByText('Success')).toBeInTheDocument();
  });
});
```

### Flaky Test Management

**Jest Retry Configuration (jest.config.js):**
- `maxRetries: 2` - Retry failed tests up to 2 times
- `retryImmediately: true` - Retry immediately
- Reports generated in `test-results/flaky-tests-report.json`

**Common Patterns and Fixes:**
- **Timing**: Use `waitFor()` instead of `setTimeout()`
- **Async**: Wrap all interactions in `act()`, await state changes
- **DOM**: Wait for DOM updates with `waitFor()`
- **Memory**: Implement proper cleanup in `afterEach()`

**When a Test Becomes Flaky:**
1. Mark with `@flaky` tag and create issue
2. Check flaky test report for patterns
3. Apply pattern-specific solutions
4. Run multiple times locally to verify fix
5. Remove `@flaky` tag only after confirmed stable

### Test Data Management

**Use Centralized Test Fixtures:**
```typescript
// ✅ Use centralized fixtures
import { TestFixtures } from '../fixtures';

const player = TestFixtures.players.goalkeeper({ name: 'Custom Keeper' });
const game = TestFixtures.games.inProgress({ homeScore: 2 });
```

**Fixture Directory:** `tests/fixtures/` contains domain-specific factories (players, games, seasons, tournaments, settings, errors).

**Principles:**
- Deterministic generation (no random data)
- Memory efficient (on-demand creation)
- Realistic but controlled
- Full TypeScript support

**Anti-Patterns to Avoid:**
```typescript
// ❌ Scattered inline data
const player = { id: '123', name: 'Test', jerseyNumber: '10' };

// ❌ Random data that breaks tests
const score = Math.floor(Math.random() * 10);

// ❌ No cleanup
const largeDataset = Array.from({ length: 10000 }, () => createPlayer());
```

### Quality Metrics

- ✅ **Pass rate**: 100% (no failing tests in main/master)
- ✅ **Flakiness**: 0% (consistent passes)
- ✅ **Resource leaks**: 0 (detectOpenHandles catches all)
- ✅ **Memory leaks**: 0 (detectLeaks catches all)
- ✅ **Console warnings**: 0 (auto-fail on unexpected output)
- ✅ **Coverage**: 85% lines, 85% functions, 80% branches

### Anti-Pattern Detection Checklist

**Before committing test code:**
- [ ] No `setTimeout` or fixed delays
- [ ] All `fireEvent`/`userEvent` wrapped in `act()` or followed by `waitFor()`
- [ ] All async operations awaited
- [ ] No `--forceExit`, `--bail`, `--retries` in CI
- [ ] `detectLeaks: true` and `detectOpenHandles: true` in config
- [ ] Proper cleanup in `beforeEach`/`afterEach`
- [ ] No suppressed console warnings
- [ ] Tests pass locally without retries

**When you find anti-patterns:**
1. Fix immediately - don't defer
2. Add test to prevent regression
3. Update this document if pattern is common

## Git and Version Control Rules

### Critical Git Guidelines

**NEVER COMMIT OR PUSH** unless explicitly requested by the user.

**Always wait for explicit permission before:**
- Running `git add`, `git commit`, `git push`
- Creating or modifying branches
- Making any git operations that change repository state

**The user controls when changes are committed:**
- Complete work and verify it functions correctly
- Inform user when work is ready for commit
- Wait for explicit instruction to commit/push
- Let them review changes before version control

**Exception:** Only commit/push immediately if user specifically requests it (e.g., "fix this and commit it", "push this change").

## Vercel Build & ESLint Rules

### Critical Build Guidelines

**ALWAYS ensure code passes Vercel build** by following these patterns:

### Common ESLint/TypeScript Issues

**1. @typescript-eslint/no-require-imports**
```typescript
// ❌ Forbidden
const fs = require('fs');

// ✅ Correct
import fs from 'fs';
// or
const fs = await import('fs');
```

**2. @typescript-eslint/no-explicit-any**
```typescript
// ❌ Forbidden
delete (window as any).location;

// ✅ Correct
delete (window as unknown as { location: unknown }).location;
```

**Important:** Test files can use limited `any` for mocks (doesn't fail build). Production code: ZERO `any` usage.

**3. @typescript-eslint/no-unused-vars**
```typescript
// ❌ Will fail build
function beforeSend(event, hint) { return event; }

// ✅ Correct
function beforeSend(event, _hint) { return event; }
```

### Prevention Checklist

**Before committing:**
1. `npm run build` must pass without errors
2. `npm run lint` must pass without errors
3. No `any` types (use `unknown` + type assertions)
4. No `require()` imports (use ES6 imports)
5. No unused variables/parameters
6. Proper type annotations for complex objects

**Common fixes:**
- Replace `require()` with `import` or `await import()`
- Replace `any` with `unknown` + type assertions
- Add underscore prefix to unused parameters (`_param`)
- Use proper interface definitions

**Build Environment Differences:**
Code that works in dev may fail in Vercel due to stricter ESLint, different TypeScript settings, tree-shaking, and aggressive static analysis. **Always test production build** before pushing.

## Environment Variables

### Required Production
- `NEXT_PUBLIC_SENTRY_DSN` - Sentry DSN for error reporting (client-side)
- `SENTRY_AUTH_TOKEN` - Sentry auth for source map uploads (server-side)

### Optional
- `NEXT_PUBLIC_SENTRY_FORCE_ENABLE` - Force Sentry in dev (default: false)
- `SENTRY_ORG` - Sentry organization name
- `SENTRY_PROJECT` - Sentry project name
- `ANALYZE` - Enable bundle analysis during build

### Security
- Client-side vars (`NEXT_PUBLIC_*`) validated for secret exposure
- Server-side secrets never use `NEXT_PUBLIC_` prefix
- Environment validation runs automatically during build/startup
- CSP violations reported to `/api/csp-report`

## Code Quality Principles

- Always investigate thoroughly before implementing
- Review all changes professionally for optimal solutions
- Avoid quick/dirty implementations unless explicitly requested
- Be professional and factual
- Defend quality and best practices even if it means disagreeing
- Ensure `npm run lint` passes before commits and pushes
