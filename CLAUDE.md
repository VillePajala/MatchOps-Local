# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
- **Browser localStorage** for data persistence
- **React Query** for state management
- **i18next** for internationalization (English/Finnish)

### Core Architecture

**Data Flow**: The app's data layer relies on **React Query** to fetch, cache, and manage server-side state (persisted in localStorage). Asynchronous wrappers in `src/utils/localStorage.ts` are used for direct localStorage access. This approach centralizes data fetching and reduces manual state management.

**PWA Structure**: The app is a full PWA with:
- Custom service worker (`public/sw.js`)
- Dynamic manifest generation based on git branch
- Install prompts and update notifications

**State Management**: 
- **`src/app/page.tsx`**: Acts as the central orchestrator, bringing together different state management strategies.
- **`useReducer` (`useGameSessionReducer.ts`)**: Manages the core game session state, including score, timer, periods, and game metadata. This provides predictable state transitions.
- **`useGameState` hook**: Manages the interactive state of the soccer field, including player positions on the field and drawings.
- **React Query**: Handles all asynchronous data operations, such as fetching and updating the master roster, seasons, tournaments, and saved games.
- **`useState`**: Used for managing local UI state within components (e.g., modal visibility).

**Key Components**:
- `SoccerField` - Interactive drag-and-drop field
- `PlayerBar` - Player roster management
- `ControlBar` - Main app controls
- Various modals for game settings, stats, and management

**Data Persistence**: All data is stored in browser localStorage with async wrappers in `src/utils/localStorage.ts`. Key data includes:
- Player roster (`src/utils/masterRosterManager.ts`)
- Game saves (`src/utils/savedGames.ts`)
- Seasons and tournaments (`src/utils/seasons.ts`, `src/utils/tournaments.ts`)
- App settings (`src/utils/appSettings.ts`)

**IndexedDB Migration System** ✅ **SIMPLIFIED**: Pragmatic localStorage → IndexedDB migration for small-scale deployments:
- ✅ `src/utils/migration.ts` - Core migration logic with essential features only (~300 lines)
- ✅ `src/utils/migration.test.ts` - Focused test coverage for essential functionality (11 tests)
- ✅ **Simplification**: Reduced from 12 files (~4,700 lines) to 2 files (~400 lines) - 92% complexity reduction
- ✅ **Removed**: Enterprise features (background processing, memory management, cross-tab coordination, pause/resume)
- ✅ **Maintained**: Essential features (data transfer, error handling, progress tracking, rollback capability)
- ✅ **Status**: Production-ready for 1-3 user deployments with appropriate complexity level

**Logging**: Centralized logging system with environment-aware behavior:
- `src/utils/logger.ts` - Type-safe logger utility with development/production modes
- Replaces direct `console.*` usage throughout the application
- Comprehensive test coverage in `src/utils/logger.test.ts`
- Integration tests in `src/components/__tests__/logger-integration.test.tsx`

**Error Monitoring**: Sentry integration for production error tracking:
- **Configuration Files**:
  - `src/instrumentation-client.ts` - Client-side Sentry initialization with router tracking
  - `sentry.server.config.ts` - Server-side error capture configuration
  - `sentry.edge.config.ts` - Edge runtime error handling
  - `src/app/global-error.tsx` - Global error boundary with user-friendly UI and Sentry reporting
- **Environment-Aware Setup**:
  - Only initializes in production by default (or when `NEXT_PUBLIC_SENTRY_FORCE_ENABLE=true`)
  - Filters out common browser noise (ResizeObserver, NetworkError)
  - 10% performance trace sampling in production, 100% in development
  - Session replays only captured on errors with privacy protection (masks text, blocks media)
- **Error Handling Guidelines**:
  - Use structured error messages with clear context
  - Avoid logging sensitive data in error messages (passwords, tokens, PII)
  - Test error scenarios with feature flags before production deployment
  - Monitor Sentry dashboard for new error patterns after deployments
- **Expected Error Types**:
  - **Filtered (ignored)**: ResizeObserver errors, generic NetworkError events
  - **Captured**: Application errors, unhandled promises, React error boundaries
  - **Enhanced tracking**: Server-side errors via `onRequestError` hook with route context

**Testing**: Jest with React Testing Library, configured for Next.js with custom setup in `jest.config.js`

## For Code Reviewers (AI or Human)

### ⚠️ Critical: This is a Local-First PWA, NOT a Traditional Web App

Before reviewing, understand this architecture is fundamentally different from typical web applications.

### Architecture Classification

This is a **local-first Progressive Web App**, NOT:
- ❌ A SaaS (Software-as-a-Service) application
- ❌ A client-server web application
- ❌ A multi-tenant system
- ❌ An enterprise application
- ❌ A cloud-hosted service

### Deployment Context

**Single-User Installation**
- One soccer coach per installation
- No user authentication or authorization needed
- No multi-user access control
- No role-based permissions

**No Backend Server**
- 100% browser-based application
- No API endpoints or database servers
- Minimal network requests: PWA updates, license validation, error reporting (opt-in)
- No server-side processing of user data

**Offline-First Design**
- Works completely without internet connection
- All data stored in browser IndexedDB
- No cloud synchronization
- No external dependencies

**Privacy-First Philosophy**
- **User data stays local**: Game data, scores, statistics never transmitted
- **Minimal opt-in telemetry**: Only error tracking (Sentry) and basic analytics (Vercel) in production
  - **Sentry**: Error messages and stack traces only - NO user data or game content
  - **Vercel Analytics**: Anonymous page views and Web Vitals - NO user identification
  - **Gated by environment**: Requires `NODE_ENV=production` OR `NEXT_PUBLIC_ANALYTICS_ENABLED=true`
- **No behavioral tracking**: No feature usage analytics or user pattern analysis
- **Complete data ownership**: Users control their data, no cloud lock-in
- **No third-party data sharing**: User data never sold or shared

**Monetization Strategy (Privacy-Compatible)**
- **Feature gating**: Premium features unlocked via purchase
- **License validation**: Minimal network call to verify Play Store purchase
- **Offline-first after purchase**: License cached locally, works offline
- **No usage analytics**: Premium status checked, but not feature usage tracking

**Telemetry Transparency**
- **What We Collect**:
  - **Sentry (Error Tracking)**: JavaScript errors, stack traces, browser/OS info
  - **Vercel Analytics**: Page views, navigation paths, Web Vitals performance metrics
- **What We DON'T Collect**:
  - ❌ Game data (scores, player names, statistics)
  - ❌ User identification (no cookies, no tracking IDs)
  - ❌ Feature usage patterns or behavioral analytics
  - ❌ Form inputs or user-generated content
- **Privacy Controls**:
  - Telemetry only active in production builds (`NODE_ENV=production`)
  - Can be force-enabled in dev with `NEXT_PUBLIC_ANALYTICS_ENABLED=true`
  - Session replays only captured on errors (with text masking enabled)
  - 10% trace sampling to minimize data collection
- **Data Retention**:
  - Sentry: 90 days (configurable)
  - Vercel Analytics: 30 days
  - All data automatically purged after retention period
- **Third-Party Access**:
  - Only Anthropic (Sentry org owner) and project maintainers
  - No data sold or shared with advertisers
  - No cross-site tracking or profiling

### Scale & Performance Context

**Expected Data Volumes**
- **Users**: 1 coach per installation
- **Players**: 50-100 players maximum
- **Games**: 50-100 games per season
- **Storage**: <10MB typical, <50MB maximum
- **Concurrent operations**: Single-threaded user actions only

**Performance Targets**
- Works smoothly on 5-year-old devices
- Offline operation with instant response
- No network latency considerations

### Security & Privacy Context

**Data Type**
- Soccer game scores and statistics
- Player names and jersey numbers
- Game timestamps and events
- **NOT** sensitive personal information
- **NOT** financial data
- **NOT** healthcare data
- **NOT** regulated under GDPR/HIPAA/PCI-DSS (beyond basic user privacy)

**Threat Model**
- **Primary risk**: Physical device theft (mitigated by OS disk encryption)
- **NOT defending against**: Network attacks (no network communication)
- **NOT defending against**: SQL injection (no database queries)
- **NOT defending against**: Multi-user attacks (single-user app)
- **NOT defending against**: Data breaches (data never leaves device)

**Browser Security**
- IndexedDB isolated per-origin by browser
- Content Security Policy (CSP) in place
- No eval() or dangerous dynamic code
- Service Worker security best practices

### Code Review Guidelines

#### ❌ DO NOT Suggest These Patterns

**Enterprise/SaaS Patterns** (Not Applicable)
- ❌ Audit logging or activity tracking
- ❌ Multi-tenant data isolation
- ❌ Role-based access control (RBAC)
- ❌ API authentication/authorization
- ❌ Rate limiting for API endpoints
- ❌ Data retention policies or GDPR logging
- ❌ Centralized monitoring or analytics
- ❌ Server-side validation

**Network Security** (Minimal Network Communication)
- ❌ Complex API authentication schemes (OAuth/JWT)
- ❌ CORS configuration (no backend APIs)
- ❌ Request signing or verification for user data
- ✅ Basic Play Store API integration (for license validation only)
- ✅ HTTPS/TLS for license checks (handled by Play Store SDK)

**Data Encryption** (Browser Sandboxing Sufficient)
- ❌ Client-side encryption for stored data
- ❌ Key management systems
- ❌ Encryption at rest (OS handles via disk encryption)

**Over-Engineering for Scale**
- ❌ Heavy schema validation libraries (Zod, Yup) for self-generated data
- ❌ Complex caching strategies (simple is fine)
- ❌ Database query optimization for 100 records
- ❌ CDN or edge caching
- ❌ Horizontal scaling patterns

#### ✅ DO Focus On These Areas

**Browser Compatibility**
- ✅ IndexedDB edge cases (quota exceeded, corruption, private mode)
- ✅ Service Worker lifecycle and caching strategies
- ✅ Cross-browser PWA installation behavior
- ✅ Mobile browser quirks and limitations

**Data Integrity**
- ✅ Data corruption recovery patterns
- ✅ Backup and restore functionality
- ✅ Migration path from localStorage to IndexedDB
- ✅ Handling malformed data gracefully

**Performance & Memory**
- ✅ Memory leaks in long-running browser sessions
- ✅ Efficient IndexedDB transaction patterns
- ✅ UI responsiveness during data operations
- ✅ Bundle size and code splitting

**User Experience**
- ✅ Offline-first patterns and conflict resolution
- ✅ Error messages that help users recover
- ✅ Loading states and progress indicators
- ✅ Accessibility (a11y) for PWAs

**PWA Best Practices**
- ✅ Service Worker update strategies
- ✅ App manifest correctness
- ✅ Install prompts and user onboarding
- ✅ Offline capability and sync patterns

### Review Context Summary

When reviewing this codebase:

1. **Remember**: One user, one device, no server, no network
2. **Data scale**: Think hundreds, not millions
3. **Security**: Browser sandboxing is the security boundary
4. **Privacy**: Zero telemetry is a feature, not a gap
5. **Performance**: Optimize for small datasets and single-user UX

For detailed architecture rationale, see:
- `docs/PROJECT_OVERVIEW.md` - Complete project context
- `docs/LOCAL_FIRST_PHILOSOPHY.md` - Architecture decisions
- `README.md` - Quick start and overview

## Key Files to Understand

- `src/app/page.tsx` - The main component that orchestrates the entire application, integrating hooks, reducers, and data fetching.
- `src/hooks/useGameSessionReducer.ts` - The reducer managing core game logic (timer, score, status). Crucial for understanding state transitions.
- `src/hooks/useGameState.ts` - The hook for managing interactive state on the soccer field (player positions, drawings).
- `src/utils/masterRosterManager.ts` - Handles all CRUD operations for the master player list, interacting with localStorage.
- `src/config/queryKeys.ts` - Defines the keys used for caching and invalidating data with React Query.
- `src/types/index.ts` - Core TypeScript interfaces (Player, Season, Tournament, AppState).
- `src/utils/localStorage.ts` - Async localStorage wrapper utilities.
- `src/utils/logger.ts` - Centralized logging utility with type safety and environment awareness.

## Development Notes

### Data Storage
All data is stored in browser localStorage. The app includes backup/restore functionality through `src/utils/fullBackup.ts`.

### Internationalization
The app supports English and Finnish with i18next. All translation files now live in `public/locales/`.

### PWA Features
The app includes install prompts, update notifications, and works offline. The service worker is updated during build to trigger cache updates.

### Testing Strategy
- Unit tests cover utilities and components and are co-located with source files using the `.test.tsx` suffix
- The Jest configuration excludes Playwright specs located in the `/tests/` directory
- Integration tests for Sentry error reporting in `src/__tests__/integration/`
- Performance tests for bundle size validation in `src/__tests__/performance/`
- Security tests for environment validation in `src/__tests__/security/`

## Testing Rules and Principles

### Critical Testing Guidelines

**NEVER SKIP TESTS** unless explicitly requested by the user. Tests exist to catch regressions and ensure code quality.

**Test fixes must make the project more robust, not mask real issues:**
- Fix the underlying problem, don't just make tests pass
- Ensure mocks accurately represent real behavior
- Don't weaken assertions to avoid failures
- Don't remove test coverage without good reason

**When fixing failing tests:**
1. **Understand why the test is failing** - Is it a legitimate issue or a test problem?
2. **Fix the root cause** - Address the actual problem, not just the test symptom
3. **Improve robustness** - Make tests and code more reliable, not more permissive
4. **Maintain coverage** - Don't reduce test coverage to fix failures
5. **Document changes** - Explain why changes were necessary

**Acceptable test modifications:**
- Updating test expectations to match corrected application behavior
- Improving test reliability and reducing flakiness
- Adding better error handling or edge case coverage
- Fixing incorrect mocks to better represent real dependencies

**Unacceptable test modifications:**
- Skipping tests to avoid dealing with failures
- Weakening assertions to prevent failures
- Removing tests without replacement
- Making tests pass by ignoring real issues
- Using overly permissive mocks that hide problems

**Before skipping any test:**
- Investigate the root cause thoroughly
- Consider if the test reveals a real issue
- Explore proper fixes before considering removal
- Document why skipping is necessary if unavoidable
- Create a plan to restore the test

## Test Writing Guidelines

### Critical Test Documentation Standards

**Use JSDoc comments for all test scenarios:**
```typescript
/**
 * Tests critical user workflow: game creation → player selection → game start
 * This ensures the core app flow remains functional after changes
 * @critical
 */
it('should create new game → select players → start game', async () => {
  // Test implementation
});
```

**Required JSDoc tags:**
- `@critical` - For tests that validate core user workflows
- `@integration` - For tests that validate component interactions
- `@edge-case` - For boundary condition and error scenario tests
- `@performance` - For tests that validate performance requirements

### Test Categories and Standards

**1. Critical Workflow Tests (`@critical`)**
- Must cover primary user journeys (game creation, player management, data persistence)
- Should never be skipped or weakened
- Must have comprehensive assertions covering UI state and data consistency
- Examples: game setup flow, player selection, data saving/loading

**2. Integration Tests (`@integration`)**
- Validate multiple components working together
- Test real provider interactions (React Query, Context providers)
- Cover cross-component state management
- Examples: modal interactions, form submissions with state updates

**3. Edge Case Tests (`@edge-case`)**
- Handle boundary conditions and error scenarios
- Test graceful degradation (storage failures, network errors)
- Validate error recovery mechanisms
- Examples: localStorage quota exceeded, malformed data handling

**4. Performance Tests (`@performance`)**
- Validate bundle size, render performance, memory usage
- Use realistic data volumes for testing
- Monitor memory leaks and resource cleanup
- Examples: large roster rendering, migration performance

### Memory Leak Prevention

**Always implement proper cleanup:**
```typescript
afterEach(async () => {
  // 1. Clean up React state immediately
  cleanup();

  // 2. Clear all timers and mocks
  jest.clearAllTimers();
  jest.clearAllMocks();

  // 3. Wait for pending async operations
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
});
```

**Jest Configuration Requirements:**
- `detectOpenHandles: true` - Always enabled to catch resource leaks
- `detectLeaks: true` - Enable when investigating memory issues
- `forceExit: false` - Never use; fix root causes instead
- `testTimeout: 30000` - Reasonable timeout for complex integration tests

### Test Isolation Standards

**Each test must be completely isolated:**
- No shared state between tests
- Clean up all global modifications
- Reset all mocks and timers
- Clear all data stores (localStorage, sessionStorage)

**Mock Data Best Practices:**
- Use factory functions for consistent test data
- Include JSDoc for all mock utilities
- Provide realistic but deterministic data
- Support easy customization via overrides

### Async Testing Patterns

**Always use proper async patterns:**
```typescript
// ✅ Correct - proper async/await with act()
await act(async () => {
  fireEvent.click(button);
  await waitFor(() => {
    expect(screen.getByText('Success')).toBeInTheDocument();
  });
});

// ❌ Incorrect - missing act() wrapper
fireEvent.click(button);
await waitFor(() => {
  expect(screen.getByText('Success')).toBeInTheDocument();
});
```

### Error Testing Requirements

**Always test error scenarios:**
- Storage failures and quota exceeded errors
- Network failures and timeout scenarios
- Invalid data formats and parsing errors
- Component error boundaries and recovery

**Use descriptive error messages:**
```typescript
expect(() => parseData(invalidData)).toThrow(
  'Invalid game data format: missing required field "teamName"'
);
```

### Professional Testing Standards (Infrastructure Requirements)

**CRITICAL: These standards are mandatory for all test code and must never be compromised.**

#### Anti-Patterns That Must Never Appear in Tests

**1. Fixed Timeouts (FORBIDDEN)**
```typescript
// ❌ FORBIDDEN - Flaky and unreliable
await new Promise(resolve => setTimeout(resolve, 100));
setTimeout(() => expect(something).toBe(true), 50);

// ✅ REQUIRED - Wait for actual conditions
await waitFor(() => {
  expect(screen.getByText('Success')).toBeInTheDocument();
});
```

**Why forbidden:** Fixed timeouts assume operations complete within arbitrary time limits. They fail randomly in CI, on slow machines, or under load. They mask real timing issues and make tests unreliable.

**2. Missing act() Wrappers (FORBIDDEN)**
```typescript
// ❌ FORBIDDEN - State updates not wrapped
fireEvent.click(button);
expect(result).toBe(true);

// ✅ REQUIRED - Proper React state handling
await act(async () => {
  fireEvent.click(button);
});
await waitFor(() => {
  expect(result).toBe(true);
});
```

**Why forbidden:** React state updates must be wrapped in `act()` to ensure all updates and effects complete before assertions. Missing wrappers cause "not wrapped in act()" warnings and flaky tests.

**3. Issue-Masking Mechanisms (FORBIDDEN)**
```typescript
// ❌ FORBIDDEN in jest.config.js
detectLeaks: false        // Masks memory leaks
forceExit: true           // Masks resource leaks
--bail                    // Hides multiple failures

// ❌ FORBIDDEN in test files
jest.setTimeout(999999)   // Masks slow tests
jest.retryTimes(10)       // Masks flaky tests

// ✅ REQUIRED - Expose and fix real issues
detectLeaks: true         // Find memory leaks
detectOpenHandles: true   // Find resource leaks
forceExit: false          // Ensure clean exit
```

**Why forbidden:** These mechanisms hide real problems instead of fixing them. They create technical debt and allow issues to accumulate until they become critical failures.

**4. Console Noise Tolerance (FORBIDDEN)**
```typescript
// ❌ FORBIDDEN - Ignoring console warnings
console.warn('Something went wrong'); // Test still passes

// ✅ REQUIRED - Console monitoring enabled
// Tests automatically fail on unexpected console.warn/console.error
// See src/setupTests.mjs for monitoring implementation
```

**Why forbidden:** Console warnings indicate real problems. Tolerating them leads to warning fatigue and masks critical issues. Our test infrastructure automatically fails tests that produce unexpected console output.

#### Required Testing Infrastructure

**Configuration Requirements (jest.config.js):**
```javascript
{
  detectOpenHandles: true,  // ✅ REQUIRED
  detectLeaks: true,        // ✅ REQUIRED
  forceExit: false,         // ✅ REQUIRED
  testTimeout: 30000,       // ✅ REQUIRED - Reasonable but not infinite
  maxWorkers: process.env.CI ? 2 : '50%', // ✅ REQUIRED
}
```

**Setup Requirements (src/setupTests.mjs):**
- ✅ Console.warn/console.error monitoring (fails tests on unexpected output)
- ✅ Unhandled promise rejection detection
- ✅ Proper cleanup in afterEach (cleanup(), clear mocks, clear timers)
- ✅ Resource cleanup in afterAll (restore console, remove listeners)

**CI Requirements (.github/workflows/ci.yml):**
```yaml
# ✅ REQUIRED - No issue-masking flags
- run: CI=true npx jest --ci --maxWorkers=1 --testTimeout=10000

# ❌ FORBIDDEN - Never use these
- run: CI=true npx jest --forceExit --bail=1 --retries=3
```

#### Async Testing Standards

**Always follow this pattern for React interactions:**
```typescript
// ✅ COMPLETE PATTERN - Use this consistently
test('user interaction test', async () => {
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

**Test Isolation Requirements:**
```typescript
// ✅ REQUIRED in every describe block
beforeEach(async () => {
  // Clear mocks and state
  jest.clearAllMocks();
  jest.clearAllTimers();

  // Clear storage (if applicable)
  clearMockStore();
  localStorage.clear();

  // Reset to defaults (if applicable)
  if (factory) {
    await factory.resetToDefaults(); // Note: await async methods!
  }
});

afterEach(async () => {
  // Clean up React
  cleanup();

  // Flush any pending updates (if needed)
  await act(async () => {
    // Allow pending updates to complete
  });
});
```

#### Quality Metrics and Enforcement

**Test Suite Quality Requirements:**
- ✅ **Pass rate**: 100% (no failing tests in main/master)
- ✅ **Flakiness**: 0% (tests pass consistently, no random failures)
- ✅ **Resource leaks**: 0 (detectOpenHandles catches all)
- ✅ **Memory leaks**: 0 (detectLeaks catches all)
- ✅ **Console warnings**: 0 (monitoring fails tests automatically)
- ✅ **Coverage thresholds**: 85% lines, 85% functions, 80% branches

**Monitoring and Enforcement:**
- CI fails on any test failure (no --bail to hide multiple failures)
- CI fails on resource leaks (no --forceExit to mask them)
- Tests fail on console warnings (automatic monitoring in setupTests.mjs)
- Flaky test reports generated automatically
- Test timeouts set to catch slow/hanging tests (30s default)

#### Anti-Pattern Detection Checklist

**Before committing test code, verify:**
- [ ] No `setTimeout` or fixed delays (use `waitFor()` instead)
- [ ] All `fireEvent`/`userEvent` calls wrapped in `act()` or followed by `waitFor()`
- [ ] All async operations properly awaited
- [ ] No `--forceExit`, `--bail`, or `--retries` flags in CI
- [ ] `detectLeaks: true` and `detectOpenHandles: true` in jest.config
- [ ] Proper cleanup in `beforeEach`/`afterEach`
- [ ] No suppressed console warnings
- [ ] Tests pass locally without retries

**When you find anti-patterns:**
1. Fix immediately - don't defer or document as "known issue"
2. Add test to prevent regression
3. Update this document if pattern is common

### Flaky Test Management

**Jest Retry Configuration:**
```javascript
// jest.config.js
retries: {
  maxRetries: 2,          // Retry failed tests up to 2 times
  retryImmediately: true  // Retry immediately rather than at end
}
```

**Flaky Test Identification and Tracking:**
- Automatic tracking of retry attempts with pattern detection
- Reports generated in `test-results/flaky-tests-report.json`
- Human-readable summaries for quick analysis
- Pattern analysis for timing, async, DOM, network, and memory issues

**Common Flaky Test Patterns and Solutions:**

**1. Timing Issues (`timing` pattern)**
```typescript
// ❌ Flaky - Fixed delays
setTimeout(() => expect(result).toBeTruthy(), 100);

// ✅ Robust - Wait for condition
await waitFor(() => {
  expect(screen.getByText('Loading complete')).toBeInTheDocument();
});
```

**2. Async Operations (`async` pattern)**
```typescript
// ❌ Flaky - Missing act() wrapper
fireEvent.click(button);
expect(screen.getByText('Success')).toBeInTheDocument();

// ✅ Robust - Proper async handling
await act(async () => {
  fireEvent.click(button);
  await waitFor(() => {
    expect(screen.getByText('Success')).toBeInTheDocument();
  });
});
```

**3. DOM Timing (`dom` pattern)**
```typescript
// ❌ Flaky - Immediate assertion
render(<Component />);
expect(screen.getByTestId('dynamic-content')).toBeInTheDocument();

// ✅ Robust - Wait for DOM updates
render(<Component />);
await waitFor(() => {
  expect(screen.getByTestId('dynamic-content')).toBeInTheDocument();
});
```

**4. Resource Cleanup (`memory` pattern)**
```typescript
// ❌ Flaky - No cleanup
test('should handle data', () => {
  const data = createLargeDataSet();
  // test logic
}); // data not cleaned up

// ✅ Robust - Proper cleanup
test('should handle data', () => {
  const data = createLargeDataSet();
  // test logic

  afterEach(() => {
    cleanup();
    data.clear();
  });
});
```

**Flaky Test Prevention Guidelines:**
- Always use `waitFor()` instead of fixed timeouts
- Wrap all async operations in `act()`
- Clean up all resources in `afterEach()`
- Mock time-dependent operations with Jest fake timers
- Use deterministic test data instead of random values
- Isolate tests completely (no shared global state)

**When a Test Becomes Flaky:**
1. **Immediate Action**: Mark test with `@flaky` tag and create issue
2. **Investigation**: Check flaky test report for patterns
3. **Fix Strategy**: Apply pattern-specific solutions
4. **Verification**: Run test multiple times locally to confirm fix
5. **Monitoring**: Remove `@flaky` tag only after confirmed stable

**Flaky Test Reporting:**
- Reports automatically generated after test runs
- CI integration shows flaky test trends over time
- Pattern analysis helps prioritize fixes
- Recommendations provided for common flaky patterns

### Test Data Management

**Centralized Test Fixtures Architecture:**
```typescript
// ✅ Use centralized fixtures
import { TestFixtures } from '../fixtures';

const player = TestFixtures.players.goalkeeper({ name: 'Custom Keeper' });
const game = TestFixtures.games.inProgress({ homeScore: 2 });
const season = TestFixtures.seasons.current();
```

**Fixture Directory Structure:**
```
tests/fixtures/
├── index.ts          // Main exports and utilities
├── players.ts        // Player data factories
├── games.ts          // Game state factories
├── seasons.ts        // Season management data
├── tournaments.ts    // Tournament data
├── settings.ts       // App settings data
└── errors.ts         // Error scenarios and edge cases
```

**Fixture Factory Patterns:**

**1. Domain-Specific Factories**
```typescript
// Player fixtures with realistic positioning
const goalkeeper = TestFixtures.players.goalkeeper();
const defender = TestFixtures.players.defender({ name: 'John Doe' });
const fullTeam = TestFixtures.players.fullTeam({ count: 11, formation: '4-3-3' });

// Game state fixtures with proper progression
const newGame = TestFixtures.games.newGame({ teamName: 'FC Test' });
const inProgress = TestFixtures.games.inProgress({ homeScore: 1 });
const completed = TestFixtures.games.completed({ homeScore: 2, awayScore: 1 });
```

**2. Scenario-Based Collections**
```typescript
// Pre-configured realistic scenarios
const derbyMatch = TestFixtures.games.scenarios.derbyMatch();
const cupFinal = TestFixtures.games.scenarios.cupFinal();
const trainingMatch = TestFixtures.games.scenarios.trainingMatch();

// Player collections for different needs
const startingEleven = TestFixtures.players.collections.startingEleven();
const fullSquad = TestFixtures.players.collections.fullSquad();
const quickTest = TestFixtures.players.collections.quickTest();
```

**3. Edge Cases and Error Testing**
```typescript
// Edge cases for boundary testing
const longName = TestFixtures.players.edgeCases.longName();
const maxScore = TestFixtures.games.edgeCases.maxScore();
const noPlayers = TestFixtures.games.edgeCases.noPlayers();

// Error scenarios for robust testing
const quotaError = TestFixtures.errors.storage.quotaExceeded();
const networkTimeout = TestFixtures.errors.network.timeout();
const invalidData = TestFixtures.errors.validation.invalidPlayer();
```

**Test Data Principles:**

**Deterministic Generation:**
- Use predictable data patterns instead of random values
- Implement consistent ID generation with `TestIdGenerator`
- Ensure test reliability through reproducible data

**Memory Efficiency:**
- Create data on-demand rather than pre-generating large datasets
- Use factory functions instead of static objects
- Implement proper cleanup in fixtures

**Realistic but Controlled:**
- Provide realistic data that reflects real application usage
- Include edge cases and boundary conditions
- Support easy customization through overrides pattern

**Type Safety:**
- Full TypeScript support with proper interfaces
- Generic factory base classes for consistency
- IDE autocompletion for all fixture methods

**Test Data Anti-Patterns to Avoid:**

```typescript
// ❌ Scattered inline data
const player = { id: '123', name: 'Test', jerseyNumber: '10' };

// ❌ Random data that breaks tests
const score = Math.floor(Math.random() * 10);

// ❌ Hardcoded arrays in multiple files
const players = [{ id: '1' }, { id: '2' }, { id: '3' }];

// ❌ No cleanup or resource management
const largeDataset = Array.from({ length: 10000 }, () => createPlayer());
```

**Fixture Usage Guidelines:**

**1. Import Pattern:**
```typescript
// Single domain import
import { TestFixtures } from '../fixtures';
const { players, games } = TestFixtures;

// Direct imports for specific needs
import * as PlayerFixtures from '../fixtures/players';
import * as GameFixtures from '../fixtures/games';
```

**2. Test Structure:**
```typescript
describe('Component Tests', () => {
  // Use realistic scenarios for integration tests
  const gameScenario = TestFixtures.utils.createCompleteGameScenario({
    teamSize: 11,
    gameStatus: 'inProgress',
    includeEvents: true
  });

  // Use minimal data for unit tests
  const minimalPlayer = TestFixtures.players.fieldPlayer({ name: 'Test' });
});
```

**3. Performance Testing:**
```typescript
// Use performance-specific fixtures for large datasets
const performanceData = TestFixtures.utils.createPerformanceTestData('large');
const migrationData = TestFixtures.utils.createMigrationTestData(1000);
```

**Benefits of Centralized Test Data:**
- **Consistency**: Same data patterns across all tests
- **Maintainability**: Single place to update test data structures
- **Discoverability**: Easy to find and reuse existing test scenarios
- **Type Safety**: Full IntelliSense support and compile-time checking
- **Performance**: Memory-efficient on-demand data generation
- **Reliability**: Deterministic data prevents flaky tests due to randomness

## Git and Version Control Rules

### Critical Git Guidelines

**NEVER COMMIT OR PUSH** unless explicitly requested by the user.

**Always wait for explicit permission before:**
- Running `git add`
- Running `git commit`
- Running `git push`
- Creating or modifying branches
- Making any git operations that change repository state

**The user controls when changes are committed:**
- Complete your work and verify it functions correctly
- Inform the user when work is ready for commit
- Wait for their explicit instruction to commit/push
- Let them review changes before they go into version control

**Exception:** Only commit/push immediately if the user specifically requests it in their message (e.g., "fix this and commit it", "push this change").

## Vercel Build & ESLint Rules

### Critical Build Guidelines

**ALWAYS ensure code passes Vercel build requirements** by following these patterns to avoid common build failures:

### Common ESLint/TypeScript Issues and Fixes

1. **@typescript-eslint/no-require-imports**
   ```typescript
   // ❌ Forbidden in build:
   const fs = require('fs');
   const path = require('path');

   // ✅ Correct approach:
   const fs = await import('fs');
   const path = await import('path');
   // or
   import fs from 'fs';
   import path from 'path';
   ```

2. **@typescript-eslint/no-explicit-any**
   ```typescript
   // ❌ Forbidden in build:
   delete (window as any).location;
   (window as any).location = { href: '/' };

   // ✅ Correct approach:
   delete (window as unknown as { location: unknown }).location;
   (window as unknown as { location: { href: string } }).location = { href: '/' };
   ```

   **Important Note on `any` Type Usage:**
   - **Production code**: ZERO `any` usage allowed (enforced by TypeScript strict mode)
   - **Test files**: Limited `any` usage is acceptable for test mocks and utilities
     - Current status: 8 instances in 3 test files (all in mock functions)
     - These do NOT cause Vercel build failures (test files have relaxed rules)
   - **Code review guidance**: Before flagging `any` as a critical issue, verify:
     1. Is it in production code or test files? (Test files are acceptable)
     2. Does `npm run build` actually fail? (If not, it's likely a false positive)
     3. Check actual ESLint output: `npm run lint`
   - **Migration to stricter types**: Use `unknown` with type guards instead of `any` when possible

3. **@typescript-eslint/no-unused-vars**
   ```typescript
   // ❌ Will fail build:
   function beforeSend(event, hint) { return event; }

   // ✅ Correct approach:
   function beforeSend(event) { return event; }
   // or if parameter is needed for signature:
   function beforeSend(event, _hint) { return event; }
   ```

### Prevention Checklist

**Before committing any code, verify:**

1. **Run the build locally**: `npm run build` must pass without errors
2. **Check linting**: `npm run lint` must pass without errors
3. **Use TypeScript properly**:
   - No `any` types (use `unknown` with type assertions)
   - No `require()` imports (use ES6 imports or dynamic imports)
   - No unused variables/parameters
   - Proper type annotations for complex objects

4. **Test file patterns**:
   - Use ES6 imports for Node.js modules in tests
   - Use proper TypeScript assertions instead of `any`
   - Mock browser APIs with proper typing
   - Use dynamic imports for Node.js-specific operations in test files

5. **Common fixes**:
   - Replace `require()` with `import` or `await import()`
   - Replace `any` with `unknown` + type assertions
   - Add underscore prefix to unused parameters (`_param`)
   - Use proper interface definitions for complex types

### Build Environment Differences

**Important**: Code that works in development may fail in Vercel builds due to:
- Stricter ESLint rules in production builds
- Different TypeScript compiler settings
- Tree-shaking and optimization differences
- Static analysis tools being more aggressive

**Always test the production build** before pushing to ensure compatibility.

## Environment Variables

### Required Production Environment Variables
- `NEXT_PUBLIC_SENTRY_DSN` - Sentry Data Source Name for error reporting (client-side)
- `SENTRY_AUTH_TOKEN` - Sentry authentication token for build-time source map uploads (server-side)

### Optional Environment Variables
- `NEXT_PUBLIC_SENTRY_FORCE_ENABLE` - Force enable Sentry in development mode (default: false)
- `SENTRY_ORG` - Sentry organization name for build configuration
- `SENTRY_PROJECT` - Sentry project name for build configuration
- `ANALYZE` - Set to `true` to enable bundle analysis during build

### Security Configuration
- All client-side environment variables (prefixed with `NEXT_PUBLIC_`) are validated for secret exposure
- Server-side secrets should never use the `NEXT_PUBLIC_` prefix
- Environment validation runs automatically during build and startup
- CSP violations are automatically reported to `/api/csp-report` endpoint
- Always investigate throughly and after implemeting anything (feature/fix), always review what you have done throughly and professionally to find the most perfect solution to everything. We do not want quick and dirty implementation unless explicitly asked so
- always be prfessional and factual. Do not try to overly please me and defend quality and best bractises even if that would mean disagreeing with my a bit
- always make sure eslint passes before commits and psuhes