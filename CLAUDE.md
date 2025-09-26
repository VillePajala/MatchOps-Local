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