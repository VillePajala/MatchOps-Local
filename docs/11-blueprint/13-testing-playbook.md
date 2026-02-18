# 13. Testing Playbook — Jest Setup, Mocking IndexedDB, Async Patterns

> **Audience**: AI agent building the new app
> **Purpose**: How to set up testing infrastructure and write reliable tests for a local-first PWA

---

## Architecture

```
jest.config.js              # Jest configuration
src/setupTests.mjs          # Global test setup (mocks, console suppression)
tests/
├── fixtures/               # Factory functions for test data
│   ├── exercises.ts
│   ├── players.ts
│   ├── practiceSessions.ts
│   └── index.ts
└── utils/
    └── testHelpers.ts      # Shared test utilities
```

---

## 1. Jest Configuration

```javascript
// jest.config.js

import nextJest from 'next/jest.js';
const createJestConfig = nextJest({ dir: './' });

export default createJestConfig({
  testEnvironment: 'jest-environment-jsdom',
  setupFilesAfterEnv: [
    '<rootDir>/src/setupTests.mjs',           // Core mocks (Sentry, IndexedDB, i18n, localStorage, canvas, console quality gate)
    '<rootDir>/tests/utils/test-cleanup.js',   // afterEach/afterAll cleanup for DOM and timers
    '<rootDir>/tests/utils/console-control.js', // CI noise reduction: mutes console.log in CI, preserves security/perf warnings
    '<rootDir>/tests/utils/flaky-test-tracker.js' // Tracks flaky tests and generates reports in test-results/
  ],

  // Module aliases (match tsconfig paths)
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  // Coverage
  coverageThreshold: {
    global: {
      branches: 45,
      functions: 55,
      lines: 60,
      statements: 60,
    },
  },

  // Reliability
  detectOpenHandles: true,   // Catches resource leaks
  detectLeaks: false,        // High false-positive rate — disabled
  testTimeout: 30000,        // 30 seconds (IndexedDB can be slow)
  maxWorkers: process.env.CI ? 2 : '50%',
  slowTestThreshold: 5,

  // Transform ignore (keep node_modules untransformed except ESM packages)
  transformIgnorePatterns: [
    'node_modules/(?!(idb|@supabase)/)',
  ],

  // Test discovery
  testMatch: [
    '<rootDir>/src/**/*.test.{ts,tsx}',
    '<rootDir>/tests/**/*.test.{ts,tsx}',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.next/',
    '<rootDir>/tests/e2e/',  // Only ignore E2E Playwright specs
  ],
});
```

**Key settings**:
- **`detectOpenHandles: true`** — catches database connections and timers that prevent clean exit
- **`forceExit: false`** — NEVER use forceExit. Fix the underlying issue instead
- **30s timeout** — IndexedDB operations on mobile can be slow. 5s is too aggressive
- **`transformIgnorePatterns`** — ESM packages like `idb` need Jest to transform them

---

## 2. Setup File

```javascript
// src/setupTests.mjs

import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';  // Global IndexedDB polyfill
import 'jest-canvas-mock';     // Required for components that render canvas elements (field diagrams)

// Mock Sentry (not available in test environment)
jest.mock('@sentry/nextjs', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  addBreadcrumb: jest.fn(),
  withScope: jest.fn((callback) => callback({ setTag: jest.fn(), setContext: jest.fn() })),
}));

// Console quality gate: FAILS tests on unexpected console.warn/error
// This is NOT passive suppression — it is a quality gate that throws on unexpected output.
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

// Allowlist of known patterns that should NOT fail tests
const allowedConsolePatterns = [
  'ResizeObserver loop',
  'Not implemented: HTMLCanvasElement',
  'Warning: An update to',
  'was not wrapped in act(...)',
  'Error saving game',
  'Error loading game',
  // ... (full list in actual setupTests.mjs — add patterns for expected test outputs)
];

const shouldFailOnConsoleMessage = (message) => {
  const messageStr = typeof message === 'string' ? message : String(message);
  return !allowedConsolePatterns.some(pattern => messageStr.includes(pattern));
};

// Override console.warn — throws if message is not in the allowlist
console.warn = (...args) => {
  originalConsoleWarn.apply(console, args);
  const message = args[0];
  if (shouldFailOnConsoleMessage(message)) {
    const testState = expect.getState();
    const testName = testState?.currentTestName || 'unknown test';
    throw new Error(`Unexpected console.warn in test "${testName}": ${message}`);
  }
};

// Override console.error — same pattern
console.error = (...args) => {
  originalConsoleError.apply(console, args);
  const message = args[0];
  if (shouldFailOnConsoleMessage(message)) {
    const testState = expect.getState();
    const testName = testState?.currentTestName || 'unknown test';
    throw new Error(`Unexpected console.error in test "${testName}": ${message}`);
  }
};

afterAll(() => {
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
});

// Clean up between tests
afterEach(() => {
  jest.clearAllMocks();
  jest.clearAllTimers();
  localStorage.clear();
});
```

### Mocking IndexedDB

`fake-indexeddb/auto` provides a complete in-memory IndexedDB implementation. Import it in setupTests and all IndexedDB operations work in tests without any additional mocking.

---

## 3. Test Fixtures — Factory Functions

```typescript
// tests/fixtures/exercises.ts

import type { Exercise } from '@/types/exercise';

let counter = 0;

export function createExercise(overrides: Partial<Exercise> = {}): Exercise {
  counter++;
  return {
    id: `exercise_test_${counter}`,
    name: `Test Exercise ${counter}`,
    description: 'A test exercise',
    category: 'passing',
    tags: ['test'],
    durationMinutes: 15,
    intensity: 'medium',
    playerCountMin: 2,
    playerCountMax: 12,
    ageGroupSuitability: [],
    coachingPoints: [],
    equipment: [],
    variations: [],
    progressions: [],
    fieldSetup: null,
    isFavorite: false,
    source: 'user',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// Convenience builders
export const exerciseFixtures = {
  passing: (overrides?: Partial<Exercise>) =>
    createExercise({ name: 'Passing Drill', category: 'passing', ...overrides }),
  shooting: (overrides?: Partial<Exercise>) =>
    createExercise({ name: 'Shooting Drill', category: 'shooting', ...overrides }),
  favorite: (overrides?: Partial<Exercise>) =>
    createExercise({ name: 'Favorite Exercise', isFavorite: true, ...overrides }),
};
```

**Principles**:
- **Deterministic** — no `Math.random()`, no `Date.now()` in fixtures
- **Incremental IDs** — counter ensures unique IDs across a test file
- **Override-friendly** — spread `overrides` last to customize any field
- **Realistic defaults** — all required fields have sensible values

---

## 4. DataStore Testing Pattern

```typescript
// tests/datastore/LocalExerciseStore.test.ts

import 'fake-indexeddb/auto';
import { LocalDataStore } from '@/datastore/LocalDataStore';
import { createExercise } from '../fixtures/exercises';

describe('LocalExerciseStore', () => {
  let store: LocalDataStore;

  beforeEach(async () => {
    store = new LocalDataStore();
    await store.initialize();
  });

  afterEach(async () => {
    await store.close();
  });

  it('creates and retrieves an exercise', async () => {
    const data = { name: 'Passing Drill', category: 'passing', durationMinutes: 15, intensity: 'medium' as const };
    const created = await store.createExercise(data);

    expect(created.id).toBeDefined();
    expect(created.name).toBe('Passing Drill');
    expect(created.createdAt).toBeDefined();

    const retrieved = await store.getExerciseById(created.id);
    expect(retrieved).toEqual(created);
  });

  it('throws AlreadyExistsError on duplicate name', async () => {
    await store.createExercise({ name: 'Drill', category: 'passing', durationMinutes: 10, intensity: 'low' as const });

    await expect(
      store.createExercise({ name: 'Drill', category: 'shooting', durationMinutes: 20, intensity: 'high' as const })
    ).rejects.toThrow('already exists');
  });

  it('throws NotFoundError when deleting non-existent exercise', async () => {
    await expect(store.deleteExercise('nonexistent')).rejects.toThrow('not found');
  });
});
```

---

## 5. Hook Testing Pattern

```typescript
// tests/hooks/useExercises.test.tsx

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useExercises } from '@/features/exercise-library/hooks/useExercises';

// Create wrapper with QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

// Mock the DataStore
jest.mock('@/hooks/useDataStore', () => ({
  useDataStore: () => ({
    userId: 'test-user',
    getStore: async () => mockStore,
  }),
}));

const mockStore = {
  getExercises: jest.fn().mockResolvedValue([]),
  createExercise: jest.fn(),
  updateExercise: jest.fn(),
  deleteExercise: jest.fn(),
};

describe('useExercises', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStore.getExercises.mockResolvedValue([]);
  });

  it('loads exercises on mount', async () => {
    const exercises = [createExercise()];
    mockStore.getExercises.mockResolvedValue(exercises);

    const { result } = renderHook(() => useExercises(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.exercises).toEqual(exercises);
  });

  it('creates an exercise', async () => {
    const newExercise = createExercise({ name: 'New Drill' });
    mockStore.createExercise.mockResolvedValue(newExercise);

    const { result } = renderHook(() => useExercises(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.createExercise({ name: 'New Drill', category: 'passing', durationMinutes: 10, intensity: 'low' as const });
    });

    expect(mockStore.createExercise).toHaveBeenCalledTimes(1);
  });
});
```

---

## 6. Component Testing Pattern

```typescript
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

describe('ExerciseForm', () => {
  it('validates required name field', async () => {
    const onSave = jest.fn();
    render(<ExerciseForm onSave={onSave} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save/i }));
    });

    await waitFor(() => {
      expect(screen.getByText(/name is required/i)).toBeInTheDocument();
    });

    expect(onSave).not.toHaveBeenCalled();
  });

  it('submits valid form', async () => {
    const user = userEvent.setup();
    const onSave = jest.fn();
    render(<ExerciseForm onSave={onSave} />);

    await user.type(screen.getByLabelText(/name/i), 'My Drill');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'My Drill' }));
    });
  });
});
```

---

## 7. Async Testing Rules (CRITICAL)

### Always use `waitFor` — never `setTimeout`

```typescript
// ❌ FORBIDDEN — flaky and unreliable
await new Promise(resolve => setTimeout(resolve, 100));
expect(result).toBe(true);

// ✅ REQUIRED — waits for actual condition
await waitFor(() => {
  expect(screen.getByText('Success')).toBeInTheDocument();
});
```

### Always wrap interactions in `act()`

```typescript
// ❌ FORBIDDEN
fireEvent.click(button);
expect(result).toBe(true);

// ✅ REQUIRED
await act(async () => {
  fireEvent.click(button);
});
await waitFor(() => expect(result).toBe(true));
```

### Always clean up

```typescript
afterEach(() => {
  jest.clearAllMocks();
  jest.clearAllTimers();
  localStorage.clear();
  cleanup();  // RTL cleanup
});
```

---

## 8. Testing i18n

Tests use English by default (see i18n setup). Assert against English strings:

```typescript
expect(screen.getByText('Save')).toBeInTheDocument();  // ✅ English
// NOT: expect(screen.getByText('Tallenna')).toBeInTheDocument();  // ❌ Finnish
```

---

## 9. Visual Verification with agent-browser (Recommended for AI-Assisted Development)

During AI-assisted development, use `agent-browser` to visually verify UI changes instead of relying solely on unit tests. This is a **recommended tool for AI-assisted workflows** — not used in CI.

### Installation

```bash
npm install -g agent-browser
npx playwright install chromium    # One-time: install the browser binary
```

### Usage Pattern: Verify After UI Changes

After implementing or modifying any UI component, verify it visually:

```bash
# 1. Start dev server (in another terminal or background)
npm run dev -- -p 3001

# 2. Open the relevant page
agent-browser open http://localhost:3001 --ignore-https-errors

# 3. Get a compact snapshot — see what's on the page
agent-browser snapshot
# Output: element tree with refs like @e1, @e2, @e3

# 4. Interact — simulate user actions
agent-browser click @e5           # Click a button/link
agent-browser type @e3 "text"     # Type into an input
agent-browser press Enter         # Submit
agent-browser select @e7 "option" # Select from dropdown

# 5. Screenshot — capture visual state
agent-browser screenshot /tmp/after-change.png

# 6. Verify result
agent-browser snapshot            # Check the page updated correctly

# 7. Clean up
agent-browser close
```

### When to Use

| Scenario | What to Do |
|----------|-----------|
| New component/page implemented | `open` → `snapshot` → verify elements exist |
| Layout/CSS changes | `screenshot` before and after |
| Form validation | `type` invalid data → `snapshot` → check error messages |
| Navigation flow | `click` links → verify URL and page content |
| Modal behavior | `click` trigger → `snapshot` → verify modal content |
| PWA install prompt | Open on mobile viewport → check install UI |
| Responsive design | Open with `--viewport 375x812` for mobile |

### Key Notes

- **93% less context than Playwright MCP** — ref-based output is compact and AI-friendly
- **Daemon persists** between commands — fast sequential interactions
- **WSL/headless** needs `--ignore-https-errors` on first `open`
- **Multiple sessions** supported for testing auth flows (logged in vs. logged out)
- Use `agent-browser snapshot -i` for interactive elements only (even more compact)

### Anti-Pattern

```bash
# ❌ DON'T rely only on unit tests for visual features
# A component can pass all tests but render incorrectly

# ✅ DO verify visually after implementing UI
agent-browser open http://localhost:3001/exercises
agent-browser snapshot   # Confirm the exercise list renders with real data
agent-browser screenshot /tmp/exercise-list.png
```

---

## Traps

1. **`fake-indexeddb/auto` must be imported in setupTests** — not in individual test files. Import order matters.

2. **React Query `retry: false` in tests** — default retry (3) makes tests wait 30+ seconds for expected errors.

3. **`detectOpenHandles: true`** — catches leaked timers and connections. If tests hang, this tells you why.

4. **Never use `forceExit`** — it masks resource leaks. Fix the root cause.

5. **30s timeout** — IndexedDB operations can be genuinely slow. 5s timeouts cause false failures.

6. **Console output is a quality gate, not passive suppression** — `setupTests.mjs` overrides `console.warn` and `console.error` to **throw** (fail the test) on any message not in the allowlist of known patterns. This means unexpected warnings in new code immediately fail tests, catching regressions early. When adding code that produces expected console output, add the pattern to the `allowedConsolePatterns` array.
