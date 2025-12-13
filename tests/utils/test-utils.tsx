import React, { ReactElement } from 'react';
import { render, RenderOptions, fireEvent, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppState, Player, Season, Tournament, GameEvent } from '@/types';
import ModalProvider from '@/contexts/ModalProvider';
import ToastProvider from '@/contexts/ToastProvider';
import { PremiumProvider } from '@/contexts/PremiumContext';

/**
 * Creates a fresh QueryClient instance optimized for testing
 *
 * @description Configures React Query with test-specific settings:
 * - Disables retries to make tests predictable
 * - Sets garbage collection time to 0 to prevent memory leaks
 * - Ensures deterministic behavior in test environments
 *
 * @returns {QueryClient} A new QueryClient instance for testing
 *
 * @example
 * ```tsx
 * const queryClient = createTestQueryClient();
 * // Use in test wrapper or individual test setup
 * ```
 */
const createTestQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,        // No retries for predictable test behavior
      gcTime: 0,          // Immediate cleanup to prevent memory leaks
    },
    mutations: {
      retry: false,        // No retries for mutations either
    },
  },
});

// Store query client reference for cleanup using ref-like pattern
const queryClientRef = { current: null as QueryClient | null };

/**
 * Wrapper component that provides all necessary contexts for testing
 *
 * @description Wraps components with essential providers:
 * - QueryClientProvider for React Query
 * - PremiumProvider for premium/freemium state
 * - ToastProvider for notifications
 * - ModalProvider for modal management
 *
 * @param props - Component props
 * @param props.children - React components to wrap with providers
 * @returns {JSX.Element} Wrapped components with all providers
 *
 * @example
 * ```tsx
 * render(<MyComponent />, { wrapper: AllTheProviders });
 * ```
 */
const AllTheProviders = ({ children }: { children: React.ReactNode }) => {
  // Create query client once per render tree using useMemo
  const queryClient = React.useMemo(() => createTestQueryClient(), []);

  // Store ref in effect (React 19 compliant)
  React.useEffect(() => {
    queryClientRef.current = queryClient;
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <PremiumProvider>
        <ToastProvider>
          <ModalProvider>
            {children}
          </ModalProvider>
        </ToastProvider>
      </PremiumProvider>
    </QueryClientProvider>
  );
};

/**
 * Enhanced render function with all providers pre-configured
 *
 * @description Extends React Testing Library's render with:
 * - Automatic provider wrapping (QueryClient, Premium, Toast, Modal)
 * - Memory leak prevention through proper cleanup
 * - Consistent test environment setup
 *
 * @param ui - React element to render
 * @param options - Render options (wrapper is automatically provided)
 * @returns {RenderResult} Enhanced render result with all providers
 *
 * @example
 * ```tsx
 * const { getByTestId } = render(<GameComponent />);
 * // Component is automatically wrapped with all providers
 * ```
 */
const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) => render(ui, { wrapper: AllTheProviders, ...options });

// Re-export everything from testing library except render (we'll override it)
export * from '@testing-library/react';
export { customRender as render };

// =============================================================================
// Mock Data Factories
// =============================================================================

/**
 * Creates a mock player with realistic test data
 *
 * @description Generates a player object with:
 * - Unique ID for test isolation
 * - Random but realistic name and jersey number
 * - Default field position (center)
 * - Configurable overrides for specific test scenarios
 *
 * @param overrides - Optional properties to override defaults
 * @returns {Player} A complete mock player object
 *
 * @example
 * ```tsx
 * const goalie = createMockPlayer({ isGoalie: true, name: 'Test Goalie' });
 * const fieldPlayer = createMockPlayer({ relX: 0.8, relY: 0.3 });
 * ```
 */
export const createMockPlayer = (overrides: Partial<Player> = {}): Player => ({
  id: `player-${Math.random().toString(36).substr(2, 9)}`,
  name: `Test Player ${Math.random().toString(36).substr(2, 4)}`,
  jerseyNumber: `${Math.floor(Math.random() * 99) + 1}`,
  isGoalie: false,
  relX: 0.5,
  relY: 0.5,
  ...overrides,
});

/**
 * Creates an array of mock players for team testing
 *
 * @description Generates a realistic team roster:
 * - First player is always the goalie
 * - Sequential names and jersey numbers for easy identification
 * - Consistent data structure for reliable test assertions
 *
 * @param count - Number of players to create
 * @returns {Player[]} Array of mock players with the first as goalie
 *
 * @example
 * ```tsx
 * const fullTeam = createMockPlayers(11); // 1 goalie + 10 field players
 * const smallSquad = createMockPlayers(6); // For testing with fewer players
 * ```
 */
export const createMockPlayers = (count: number): Player[] =>
  Array.from({ length: count }, (_, i) => createMockPlayer({
    name: `Player ${i + 1}`,
    jerseyNumber: `${i + 1}`,
    isGoalie: i === 0, // First player is goalie
  }));

export const createMockFieldPlayer = (overrides: Partial<any> = {}): any => ({
  ...createMockPlayer(),
  relX: 0.3 + Math.random() * 0.4, // Keep players in reasonable field positions
  relY: 0.2 + Math.random() * 0.6,
  isDragging: false,
  ...overrides,
});

export const createMockFieldPlayers = (count: number): any[] =>
  Array.from({ length: count }, (_, i) => createMockFieldPlayer({
    name: `Field Player ${i + 1}`,
    relX: 0.1 + (i % 3) * 0.3, // Spread across field width
    relY: 0.2 + (Math.floor(i / 3) % 3) * 0.3, // Spread across field height
  }));

export const createMockGameEvent = (overrides: Partial<GameEvent> = {}): GameEvent => ({
  id: `event-${Math.random().toString(36).substr(2, 9)}`,
  type: 'goal',
  time: Math.floor(Math.random() * 2700), // Random time within 45 min
  ...overrides,
});

export const createMockSeason = (overrides: Partial<Season> = {}): Season => ({
  id: `season-${Math.random().toString(36).substr(2, 9)}`,
  name: `Test Season ${new Date().getFullYear()}`,
  startDate: '2025-01-01',
  endDate: '2025-12-31',
  ageGroup: 'u12',
  archived: false,
  ...overrides,
});

export const createMockTournament = (overrides: Partial<Tournament> = {}): Tournament => ({
  id: `tournament-${Math.random().toString(36).substr(2, 9)}`,
  name: `Test Tournament`,
  startDate: '2025-06-01',
  endDate: '2025-06-03',
  location: 'Test Stadium',
  ageGroup: 'u12',
  level: 'competitive',
  archived: false,
  ...overrides,
});

export const createMockGameState = (overrides: Partial<AppState> = {}): AppState => ({
  teamName: 'Test Team',
  opponentName: 'Test Opponent',
  homeScore: 0,
  awayScore: 0,
  homeOrAway: 'home',
  gameStatus: 'notStarted',
  currentPeriod: 1,
  numberOfPeriods: 2,
  periodDurationMinutes: 25,
  playersOnField: [],
  opponents: [],
  availablePlayers: createMockPlayers(16),
  selectedPlayerIds: [],
  drawings: [],
  gameDate: new Date().toISOString().split('T')[0],
  seasonId: `season-${Math.random().toString(36).substr(2, 9)}`,
  tournamentId: `tournament-${Math.random().toString(36).substr(2, 9)}`,
  gameEvents: [],
  gameNotes: '',
  showPlayerNames: true,
  tacticalDiscs: [],
  tacticalDrawings: [],
  tacticalBallPosition: null,
  ...overrides,
});

export const createMockSavedGame = (overrides: Partial<AppState> = {}): AppState => {
  const gameState = createMockGameState(overrides);
  return {
    ...gameState,
    gameEvents: [
      createMockGameEvent({ type: 'goal', time: 450, scorerId: gameState.availablePlayers[0].id }),
      createMockGameEvent({ type: 'substitution', time: 900, entityId: gameState.availablePlayers[1].id }),
    ],
    homeScore: 1,
    gameStatus: 'gameEnd',
  };
};

// =============================================================================
// Interaction Helpers
// =============================================================================

export const dragAndDrop = async (
  source: HTMLElement, 
  target: HTMLElement,
  options: { clientX?: number; clientY?: number } = {}
) => {
  const { clientX = 100, clientY = 100 } = options;
  
  fireEvent.mouseDown(source, { clientX, clientY });
  fireEvent.mouseMove(target, { clientX: clientX + 50, clientY: clientY + 50 });
  fireEvent.mouseUp(target, { clientX: clientX + 50, clientY: clientY + 50 });
  
  // Wait for any async updates
  await waitFor(() => {}, { timeout: 100 });
};

export const touchDragAndDrop = async (
  source: HTMLElement,
  target: HTMLElement,
  options: { clientX?: number; clientY?: number } = {}
) => {
  const { clientX = 100, clientY = 100 } = options;
  
  fireEvent.touchStart(source, {
    touches: [{ clientX, clientY }],
  });
  
  fireEvent.touchMove(document, {
    touches: [{ clientX: clientX + 50, clientY: clientY + 50 }],
  });
  
  fireEvent.touchEnd(document);
  
  await waitFor(() => {}, { timeout: 100 });
};

export const clickButton = async (buttonText: string | RegExp) => {
  const button = screen.getByRole('button', { name: buttonText });
  fireEvent.click(button);
  await waitFor(() => {}, { timeout: 100 });
  return button;
};

export const fillInput = async (labelText: string | RegExp, value: string) => {
  const input = screen.getByLabelText(labelText);
  fireEvent.change(input, { target: { value } });
  await waitFor(() => {}, { timeout: 100 });
  return input;
};

export const selectOption = async (labelText: string | RegExp, optionText: string) => {
  const select = screen.getByLabelText(labelText);
  fireEvent.change(select, { target: { value: optionText } });
  await waitFor(() => {}, { timeout: 100 });
  return select;
};

// =============================================================================
// Test Assertions Helpers
// =============================================================================

export const expectElementToBeVisible = (text: string | RegExp) => {
  expect(screen.getByText(text)).toBeVisible();
};

export const expectElementNotToExist = (text: string | RegExp) => {
  expect(screen.queryByText(text)).not.toBeInTheDocument();
};

export const expectButtonToBeEnabled = (buttonText: string | RegExp) => {
  expect(screen.getByRole('button', { name: buttonText })).toBeEnabled();
};

export const expectButtonToBeDisabled = (buttonText: string | RegExp) => {
  expect(screen.getByRole('button', { name: buttonText })).toBeDisabled();
};

// =============================================================================
// Mock Utilities
// =============================================================================

export const mockLocalStorage = () => {
  const localStorageMock = (() => {
    let store: Record<string, string> = {};
    
    return {
      getItem: jest.fn((key: string) => store[key] || null),
      setItem: jest.fn((key: string, value: string) => {
        store[key] = String(value);
      }),
      removeItem: jest.fn((key: string) => {
        delete store[key];
      }),
      clear: jest.fn(() => {
        store = {};
      }),
      getAll: () => store,
    };
  })();

  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
  });

  return localStorageMock;
};

export const mockLocalStorageQuotaExceeded = () => {
  const originalSetItem = localStorage.setItem;
  localStorage.setItem = jest.fn(() => {
    throw new DOMException('QuotaExceededError', 'QuotaExceededError');
  });
  
  return () => {
    localStorage.setItem = originalSetItem;
  };
};

export const mockPerformanceAPI = () => {
  Object.defineProperty(global.performance, 'memory', {
    value: {
      usedJSHeapSize: 10000000,
      totalJSHeapSize: 50000000,
      jsHeapSizeLimit: 2000000000,
    },
    writable: true,
  });
};

export const mockTimers = () => {
  jest.useFakeTimers();
  return () => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  };
};

// =============================================================================
// Test Lifecycle Helpers
// =============================================================================

export const waitForNextTick = () => new Promise(resolve => setTimeout(resolve, 0));

export const waitForElement = async (text: string | RegExp, timeout = 1000) => {
  return await waitFor(() => screen.getByText(text), { timeout });
};

export const waitForElementToDisappear = async (text: string | RegExp, timeout = 1000) => {
  return await waitFor(() => expect(screen.queryByText(text)).not.toBeInTheDocument(), { timeout });
};

// =============================================================================
// Game Flow Helpers
// =============================================================================

export const setupGameWithPlayers = async () => {
  const players = createMockPlayers(11);
  const gameState = createMockGameState({
    availablePlayers: players,
    selectedPlayerIds: players.slice(0, 11).map(p => p.id),
  });
  
  return { players, gameState };
};

export const simulateGameSession = async () => {
  const { players, gameState } = await setupGameWithPlayers();
  
  // Add some game events
  gameState.gameEvents = [
    createMockGameEvent({ type: 'goal', time: 450 }),
    createMockGameEvent({ type: 'substitution', time: 900 }),
  ];
  gameState.homeScore = 1;
  gameState.gameStatus = 'inProgress';
  
  return { players, gameState };
};

export const triggerComponentError = (componentName: string) => {
  // Mock console.error to capture error boundary logs
  const originalConsoleError = console.error;
  console.error = jest.fn();

  // Note: ErrorComponent can be used to trigger error boundary in tests
  // Usage: render(<ErrorComponent />) within an ErrorBoundary
  const _ErrorComponent = () => {
    throw new Error(`Test error in ${componentName}`);
  };

  return () => {
    console.error = originalConsoleError;
  };
};

// =============================================================================
// Performance Test Helpers
// =============================================================================

export const measureRenderTime = async (renderFn: () => void): Promise<number> => {
  const startTime = performance.now();
  renderFn();
  await waitForNextTick();
  return performance.now() - startTime;
};

// Type-safe interface for Chrome's performance.memory extension
interface MemoryInfo {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

interface PerformanceWithMemory extends Performance {
  memory?: MemoryInfo;
}

export const measureMemoryUsage = (): number => {
  const perf = performance as PerformanceWithMemory;
  if (perf.memory && 'usedJSHeapSize' in perf.memory) {
    return perf.memory.usedJSHeapSize;
  }
  return 0;
};

// =============================================================================
// Accessibility Test Helpers
// =============================================================================

export const getByAriaLabel = (label: string | RegExp) => 
  screen.getByLabelText(label);

export const getAllByRole = (role: string) => 
  screen.getAllByRole(role);

export const expectToHaveAriaLabel = (element: HTMLElement, label: string) => {
  expect(element).toHaveAttribute('aria-label', label);
};

export const expectToBeAccessible = async (container: HTMLElement) => {
  // Basic accessibility checks
  const buttons = container.querySelectorAll('button');
  buttons.forEach(button => {
    // Each button should have either text content or aria-label
    const hasText = button.textContent?.trim();
    const hasAriaLabel = button.getAttribute('aria-label');
    const hasTitle = button.getAttribute('title');
    
    expect(hasText || hasAriaLabel || hasTitle).toBeTruthy();
  });
  
  // Check for form labels
  const inputs = container.querySelectorAll('input, select, textarea');
  inputs.forEach(input => {
    const hasLabel = input.getAttribute('aria-label') || 
                    input.getAttribute('aria-labelledby') ||
                    container.querySelector(`label[for="${input.id}"]`);
    expect(hasLabel).toBeTruthy();
  });
};

// Cleanup function for React Query
export const cleanupReactQuery = () => {
  if (queryClientRef.current) {
    queryClientRef.current.clear();
    queryClientRef.current = null;
  }
};

// Add cleanup after each test
if (typeof afterEach === 'function') {
  afterEach(() => {
    cleanupReactQuery();
  });
}

// Note: Exports are handled at the top of the file after the customRender definition