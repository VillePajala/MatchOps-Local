# Testing Strategy 2025
MatchOps‑Local — Comprehensive Testing Implementation Plan

**Updated**: January 2025  
**Current Coverage**: 41.41% → **Target Coverage**: 90%+  
**Timeline**: 6-8 weeks  

## Executive Summary

This document outlines a comprehensive testing strategy to transform MatchOps-Local from a moderately-tested application (41% coverage) to a robustly-tested, production-ready system (90%+ coverage) with immediate break detection and confidence for future refactoring.

### Key Objectives
1. **Immediate Safety**: Protect against regressions during ongoing development
2. **Comprehensive Coverage**: Achieve 90%+ test coverage across all critical paths
3. **Break Detection**: Instant notification when core functionality fails
4. **Refactor Confidence**: Enable safe architectural improvements
5. **Development Velocity**: Faster feature development through test-driven workflows

---

## Current Testing Analysis

### ✅ **Well-Tested Areas** (70%+ coverage)
```typescript
src/utils/              // 70%+ coverage - Excellent foundation
├── appSettings.test.ts         // 100% - Recently improved
├── localStorage.test.ts        // 73% - Core data layer
├── masterRosterManager.test.ts // 100% - Player management
├── savedGames.test.ts          // 76% - Game persistence  
├── seasons.test.ts             // 93% - Season management
└── tournaments.test.ts         // 93% - Tournament management

src/hooks/              // 80%+ coverage - Good state management
├── useGameSessionReducer.test.ts // Complex game logic
├── useGameTimer.test.ts         // Timer functionality
├── useRoster.test.tsx           // Player management
└── useTacticalBoard.test.ts     // Tactical features

src/contexts/           // 90%+ coverage - Provider patterns
├── ToastProvider.test.tsx       // UI notifications
└── ModalProvider.test.tsx       // Modal management
```

### 🚨 **Critical Testing Gaps** (0% coverage)
```typescript
src/app/
├── page.tsx                     // 0% - 97 lines - App entry point
└── layout.tsx                   // 0% - 37 lines - App wrapper

src/components/
├── HomePage.tsx                 // 0% - 3,332 lines - CRITICAL
├── SoccerField.tsx             // 0% - 1,183 lines - CRITICAL  
├── ControlBar.tsx              // 0% - 499 lines - Core UI
├── GameInfoBar.tsx             // 0% - 166 lines - Game state
├── TimerOverlay.tsx            // 0% - 373 lines - Timer UI
├── TeamManagerModal.tsx        // 0% - 531 lines - Team management
└── OrphanedGameHandler.tsx     // 0% - 266 lines - Edge cases
```

### 📊 **Risk Assessment Matrix**

| Component | Lines | Complexity | User Impact | Risk Level | Priority |
|-----------|-------|------------|-------------|------------|----------|
| HomePage.tsx | 3,332 | Very High | Critical | 🔴 EXTREME | P0 |
| SoccerField.tsx | 1,183 | High | Critical | 🔴 HIGH | P0 |
| ControlBar.tsx | 499 | Medium | High | 🟡 MEDIUM | P1 |
| page.tsx | 97 | Low | Critical | 🟡 MEDIUM | P1 |
| TimerOverlay.tsx | 373 | Medium | High | 🟡 MEDIUM | P2 |

---

## Testing Strategy Framework

### **Phase 1: Critical Safety Net** (Weeks 1-2)
**Goal**: Immediate protection against breaking core user flows

#### **1.1 Integration Test Suite**
Create comprehensive integration tests covering complete user journeys:

```typescript
// tests/integration/core-workflows.test.ts
describe('Core User Workflows', () => {
  describe('Game Creation Flow', () => {
    it('should create new game → select players → start timer → log goals → save', async () => {
      // Full happy path integration test
      await createNewGame('Test Team', 'Opponent Team');
      await selectPlayers(['Player 1', 'Player 2', 'Player 3']);
      await startGameTimer();
      await logGoal('Player 1', 450); // 7:30 into game
      await saveGame();
      
      expect(await getLastSavedGame()).toMatchObject({
        teamName: 'Test Team',
        homeScore: 1,
        gameEvents: expect.arrayContaining([
          expect.objectContaining({ type: 'goal', playerId: 'player-1' })
        ])
      });
    });

    it('should handle game resume flow', async () => {
      // Resume existing game workflow
      const gameId = await createAndSaveGame();
      await resumeGame(gameId);
      await continueGamePlay();
      expect(getGameState().gameStatus).toBe('in_progress');
    });
  });

  describe('Error Recovery Flows', () => {
    it('should recover from component crashes with error boundaries', async () => {
      // Test our error boundary implementation
      await triggerComponentError('SoccerField');
      expect(screen.getByText(/soccer field crashed/i)).toBeVisible();
      await clickRetryButton();
      expect(screen.getByTestId('soccer-field')).toBeVisible();
    });

    it('should handle localStorage quota exceeded', async () => {
      // Test storage limits
      mockLocalStorageQuotaExceeded();
      await attemptGameSave();
      expect(screen.getByText(/storage limit exceeded/i)).toBeVisible();
    });
  });

  describe('Data Persistence Flows', () => {
    it('should maintain data integrity across browser sessions', async () => {
      // Cross-session persistence
      await createGameWithPlayers();
      await simulateBrowserReload();
      expect(await getResumableGames()).toHaveLength(1);
    });

    it('should handle migration and backup scenarios', async () => {
      // Data migration testing
      await setupLegacyGameData();
      await runMigration();
      expect(await getModernGameData()).toBeDefined();
    });
  });
});
```

#### **1.2 Component Smoke Tests**
Ensure critical components render without crashing:

```typescript
// tests/components/smoke-tests.test.tsx
describe('Component Smoke Tests', () => {
  const mockGameState = createMockGameState();
  const mockProps = createMockProps();

  describe('Critical Components Render', () => {
    it('HomePage should render without crashing', async () => {
      render(<HomePage {...mockProps} />);
      expect(screen.getByTestId('home-page')).toBeInTheDocument();
    });

    it('SoccerField should render and handle basic interactions', async () => {
      render(<SoccerField players={mockProps.players} {...mockProps} />);
      
      const field = screen.getByTestId('soccer-field');
      expect(field).toBeInTheDocument();
      
      // Test basic drag interaction doesn't crash
      fireEvent.mouseDown(field, { clientX: 100, clientY: 100 });
      fireEvent.mouseMove(field, { clientX: 150, clientY: 150 });
      fireEvent.mouseUp(field);
      
      expect(field).toBeInTheDocument(); // Still renders after interaction
    });

    it('ControlBar should render all critical buttons', async () => {
      render(<ControlBar {...mockProps} />);
      
      expect(screen.getByLabelText(/start timer/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/save game/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/undo/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/redo/i)).toBeInTheDocument();
    });
  });
});
```

#### **1.3 State Management Tests**
Test complex state logic in isolation:

```typescript
// tests/state/game-session-state.test.ts
describe('Game Session State Management', () => {
  describe('useGameSessionReducer', () => {
    it('should handle timer state transitions correctly', () => {
      const { result } = renderHook(() => useGameSessionReducer(initialState));
      
      act(() => {
        result.current.dispatch({ type: 'START_TIMER' });
      });
      
      expect(result.current.state.gameStatus).toBe('in_progress');
      expect(result.current.state.timerRunning).toBe(true);
    });

    it('should handle goal logging with correct timestamps', () => {
      const { result } = renderHook(() => useGameSessionReducer(initialState));
      
      act(() => {
        result.current.dispatch({ 
          type: 'LOG_GOAL', 
          payload: { playerId: 'player-1', timestamp: 450 }
        });
      });
      
      expect(result.current.state.homeScore).toBe(1);
      expect(result.current.state.gameEvents).toHaveLength(1);
    });
  });
});
```

#### **1.4 Continuous Integration Guards**
Set up immediate break detection:

```yaml
# .github/workflows/test-guards.yml
name: Critical Path Guards
on: [push, pull_request]

jobs:
  critical-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run Critical Integration Tests
        run: npm run test:critical
        
      - name: Run Component Smoke Tests  
        run: npm run test:smoke
        
      - name: Check Minimum Coverage Thresholds
        run: npm run test:coverage -- --coverageThreshold='{"global":{"statements":75,"branches":70,"functions":75,"lines":75}}'
        
      - name: Notify on Failure
        if: failure()
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '🚨 CRITICAL TESTS FAILED - Core functionality may be broken!'
            })
```

### **Phase 2: Component-Level Testing** (Weeks 3-4)
**Goal**: Comprehensive component coverage with focus on user interactions

#### **2.1 HomePage Component Testing**
Break down the monolithic HomePage into testable units:

```typescript
// tests/components/HomePage/HomePage.test.tsx
describe('HomePage Component', () => {
  describe('Game State Management', () => {
    it('should initialize with default game state', async () => {
      render(<HomePage />);
      
      expect(screen.getByText(/new game/i)).toBeVisible();
      expect(screen.getByTestId('player-bar')).toBeEmptyDOMElement();
    });

    it('should load saved game state correctly', async () => {
      const savedGame = createMockSavedGame();
      mockGetSavedGames.mockResolvedValue({ [savedGame.id]: savedGame });
      
      render(<HomePage />);
      
      await waitFor(() => {
        expect(screen.getByText(savedGame.teamName)).toBeVisible();
      });
    });
  });

  describe('Player Management Integration', () => {
    it('should add players from roster to field', async () => {
      const mockRoster = createMockRoster();
      render(<HomePage />);
      
      // Drag player from roster to field
      const player = screen.getByText(mockRoster[0].name);
      const field = screen.getByTestId('soccer-field');
      
      await dragAndDrop(player, field);
      
      expect(screen.getByTestId(`player-on-field-${mockRoster[0].id}`)).toBeVisible();
    });
  });

  describe('Timer Integration', () => {
    it('should start/stop timer and update game time', async () => {
      render(<HomePage />);
      
      const startButton = screen.getByLabelText(/start timer/i);
      fireEvent.click(startButton);
      
      await waitFor(() => {
        expect(screen.getByText(/00:01/)).toBeVisible();
      }, { timeout: 2000 });
    });
  });
});

// tests/components/HomePage/HomePage-Performance.test.tsx
describe('HomePage Performance', () => {
  it('should not re-render excessively on state changes', async () => {
    const renderSpy = jest.fn();
    const TestComponent = React.memo(() => {
      renderSpy();
      return <HomePage />;
    });
    
    render(<TestComponent />);
    
    // Simulate multiple state changes
    fireEvent.click(screen.getByLabelText(/start timer/i));
    fireEvent.click(screen.getByLabelText(/pause timer/i));
    
    // Should not re-render more than necessary
    expect(renderSpy).toHaveBeenCalledTimes(3); // Initial + start + pause
  });
});
```

#### **2.2 SoccerField Component Testing**
Test the complex drag-and-drop field interactions:

```typescript
// tests/components/SoccerField/SoccerField.test.tsx
describe('SoccerField Component', () => {
  describe('Player Positioning', () => {
    it('should position players correctly on field', async () => {
      const mockPlayers = createMockFieldPlayers();
      render(<SoccerField players={mockPlayers} />);
      
      mockPlayers.forEach(player => {
        const playerElement = screen.getByTestId(`field-player-${player.id}`);
        expect(playerElement).toHaveStyle({
          left: `${player.relX * 100}%`,
          top: `${player.relY * 100}%`
        });
      });
    });

    it('should handle drag and drop positioning', async () => {
      const mockPlayers = createMockFieldPlayers();
      const onPlayerMove = jest.fn();
      
      render(<SoccerField players={mockPlayers} onPlayerMove={onPlayerMove} />);
      
      const player = screen.getByTestId(`field-player-${mockPlayers[0].id}`);
      
      // Simulate drag from (0.1, 0.1) to (0.5, 0.5)
      fireEvent.mouseDown(player, { clientX: 50, clientY: 50 });
      fireEvent.mouseMove(document, { clientX: 250, clientY: 250 });
      fireEvent.mouseUp(document);
      
      expect(onPlayerMove).toHaveBeenCalledWith(
        mockPlayers[0].id,
        expect.closeTo(0.5, 0.1),
        expect.closeTo(0.5, 0.1)
      );
    });
  });

  describe('Drawing Functionality', () => {
    it('should create tactical drawings', async () => {
      const onDrawingStart = jest.fn();
      const onDrawingAddPoint = jest.fn();
      const onDrawingEnd = jest.fn();
      
      render(
        <SoccerField 
          onDrawingStart={onDrawingStart}
          onDrawingAddPoint={onDrawingAddPoint}
          onDrawingEnd={onDrawingEnd}
        />
      );
      
      const field = screen.getByTestId('soccer-field');
      
      // Start drawing
      fireEvent.mouseDown(field, { clientX: 100, clientY: 100 });
      expect(onDrawingStart).toHaveBeenCalledWith(expect.closeTo(0.2, 0.1), expect.closeTo(0.2, 0.1));
      
      // Add points
      fireEvent.mouseMove(field, { clientX: 150, clientY: 150 });
      expect(onDrawingAddPoint).toHaveBeenCalled();
      
      // End drawing
      fireEvent.mouseUp(field);
      expect(onDrawingEnd).toHaveBeenCalled();
    });
  });

  describe('Touch Support', () => {
    it('should handle touch interactions for mobile', async () => {
      const mockPlayers = createMockFieldPlayers();
      const onPlayerMove = jest.fn();
      
      render(<SoccerField players={mockPlayers} onPlayerMove={onPlayerMove} />);
      
      const player = screen.getByTestId(`field-player-${mockPlayers[0].id}`);
      
      // Simulate touch drag
      fireEvent.touchStart(player, { 
        touches: [{ clientX: 50, clientY: 50 }] 
      });
      fireEvent.touchMove(document, { 
        touches: [{ clientX: 250, clientY: 250 }] 
      });
      fireEvent.touchEnd(document);
      
      expect(onPlayerMove).toHaveBeenCalled();
    });
  });
});
```

#### **2.3 Modal Component Testing**
Test all modal interactions and state management:

```typescript
// tests/components/Modals/Modal-Integration.test.tsx
describe('Modal System Integration', () => {
  describe('NewGameSetupModal', () => {
    it('should create new game with selected options', async () => {
      const onCreateGame = jest.fn();
      render(<NewGameSetupModal isOpen={true} onCreateGame={onCreateGame} />);
      
      // Fill form
      fireEvent.change(screen.getByLabelText(/team name/i), { 
        target: { value: 'Test Team' } 
      });
      fireEvent.change(screen.getByLabelText(/opponent/i), { 
        target: { value: 'Opponent Team' } 
      });
      
      // Select players
      const playerCheckbox = screen.getAllByRole('checkbox')[0];
      fireEvent.click(playerCheckbox);
      
      // Submit
      fireEvent.click(screen.getByText(/start game/i));
      
      expect(onCreateGame).toHaveBeenCalledWith(
        expect.objectContaining({
          teamName: 'Test Team',
          opponentName: 'Opponent Team',
          selectedPlayerIds: expect.arrayContaining([expect.any(String)])
        })
      );
    });
  });

  describe('GameStatsModal', () => {
    it('should display comprehensive game statistics', async () => {
      const mockGame = createMockGameWithStats();
      render(<GameStatsModal isOpen={true} game={mockGame} />);
      
      expect(screen.getByText(mockGame.teamName)).toBeVisible();
      expect(screen.getByText(`${mockGame.homeScore} - ${mockGame.awayScore}`)).toBeVisible();
      
      // Check player stats
      mockGame.gameEvents.forEach(event => {
        if (event.type === 'goal') {
          expect(screen.getByText(event.playerName)).toBeVisible();
        }
      });
    });
  });
});
```

### **Phase 3: Advanced Testing Infrastructure** (Weeks 5-6)
**Goal**: Performance, accessibility, and edge case testing

#### **3.1 Performance Testing**
```typescript
// tests/performance/performance.test.ts
describe('Performance Tests', () => {
  describe('Component Render Performance', () => {
    it('HomePage should render within performance budgets', async () => {
      const startTime = performance.now();
      
      render(<HomePage />);
      
      await waitFor(() => {
        expect(screen.getByTestId('home-page')).toBeVisible();
      });
      
      const renderTime = performance.now() - startTime;
      expect(renderTime).toBeLessThan(100); // 100ms budget
    });

    it('SoccerField should handle 22 players without performance degradation', async () => {
      const manyPlayers = createMockPlayers(22);
      const startTime = performance.now();
      
      render(<SoccerField players={manyPlayers} />);
      
      const renderTime = performance.now() - startTime;
      expect(renderTime).toBeLessThan(50); // 50ms budget for field render
    });
  });

  describe('Memory Usage', () => {
    it('should not create memory leaks during game sessions', async () => {
      const initialMemory = performance.memory?.usedJSHeapSize || 0;
      
      // Simulate long game session
      const { unmount } = render(<HomePage />);
      await simulateLongGameSession();
      unmount();
      
      // Force garbage collection if available
      if (global.gc) global.gc();
      
      const finalMemory = performance.memory?.usedJSHeapSize || 0;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Should not leak more than 5MB
      expect(memoryIncrease).toBeLessThan(5 * 1024 * 1024);
    });
  });
});
```

#### **3.2 Accessibility Testing**
```typescript
// tests/accessibility/a11y.test.tsx
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

describe('Accessibility Tests', () => {
  describe('WCAG 2.1 AA Compliance', () => {
    it('HomePage should have no accessibility violations', async () => {
      const { container } = render(<HomePage />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('ControlBar should be keyboard navigable', async () => {
      render(<ControlBar />);
      
      const firstButton = screen.getAllByRole('button')[0];
      firstButton.focus();
      
      // Tab through all buttons
      for (let i = 0; i < 10; i++) {
        fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
      }
      
      // Should be able to activate with Enter/Space
      fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
      
      expect(document.activeElement).toHaveAttribute('role', 'button');
    });

    it('SoccerField should provide screen reader alternatives', async () => {
      const players = createMockFieldPlayers();
      render(<SoccerField players={players} />);
      
      expect(screen.getByLabelText(/soccer field/i)).toBeInTheDocument();
      
      // Should have accessible descriptions
      players.forEach(player => {
        expect(screen.getByText(new RegExp(player.name))).toBeInTheDocument();
      });
    });
  });

  describe('Screen Reader Support', () => {
    it('should announce game events to screen readers', async () => {
      render(<HomePage />);
      
      // Simulate goal event
      await simulateGoalEvent();
      
      const liveRegion = screen.getByRole('status', { hidden: true });
      expect(liveRegion).toHaveTextContent(/goal scored/i);
    });
  });
});
```

### **Phase 4: End-to-End Testing** (Weeks 7-8)
**Goal**: Real browser testing with full user scenarios

#### **4.1 Playwright E2E Tests**
```typescript
// tests/e2e/game-workflows.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Complete Game Workflows', () => {
  test('should complete full game session from start to finish', async ({ page }) => {
    await page.goto('/');
    
    // Start new game
    await page.click('text=New Game');
    
    // Setup game
    await page.fill('[data-testid=team-name-input]', 'Test Team');
    await page.fill('[data-testid=opponent-input]', 'Opponent Team');
    
    // Select players
    await page.click('[data-testid=player-checkbox]:first-child');
    await page.click('[data-testid=player-checkbox]:nth-child(2)');
    
    // Start game
    await page.click('text=Start Game');
    
    // Verify game started
    await expect(page.locator('[data-testid=game-timer]')).toBeVisible();
    
    // Start timer
    await page.click('[data-testid=start-timer-button]');
    
    // Wait for timer to start
    await expect(page.locator('[data-testid=game-timer]')).toContainText('00:01');
    
    // Log a goal
    await page.click('[data-testid=log-goal-button]');
    await page.selectOption('[data-testid=goal-player-select]', { index: 0 });
    await page.click('[data-testid=confirm-goal-button]');
    
    // Verify score updated
    await expect(page.locator('[data-testid=home-score]')).toContainText('1');
    
    // Save game
    await page.click('[data-testid=save-game-button]');
    
    // Verify save success
    await expect(page.locator('text=Game saved successfully')).toBeVisible();
  });

  test('should handle browser refresh and resume game', async ({ page }) => {
    // Create and start a game
    await createGameSession(page);
    
    // Refresh browser
    await page.reload();
    
    // Should prompt to resume
    await expect(page.locator('text=Resume Game')).toBeVisible();
    
    // Resume game
    await page.click('text=Resume Game');
    
    // Verify game state preserved
    await expect(page.locator('[data-testid=game-timer]')).toBeVisible();
  });

  test('should work offline (PWA functionality)', async ({ page, context }) => {
    // Go online and load app
    await page.goto('/');
    
    // Go offline
    await context.setOffline(true);
    
    // Should still work
    await page.click('text=New Game');
    await expect(page.locator('[data-testid=new-game-modal]')).toBeVisible();
    
    // Go back online
    await context.setOffline(false);
    
    // Should sync data
    await expect(page.locator('text=Data synced')).toBeVisible({ timeout: 5000 });
  });
});
```

#### **4.2 Visual Regression Testing**
```typescript
// tests/visual/visual-regression.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Visual Regression Tests', () => {
  test('should match HomePage screenshot', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    await expect(page).toHaveScreenshot('homepage.png');
  });

  test('should match SoccerField with players', async ({ page }) => {
    await setupGameWithPlayers(page);
    
    const field = page.locator('[data-testid=soccer-field]');
    await expect(field).toHaveScreenshot('soccer-field-with-players.png');
  });

  test('should match modal designs', async ({ page }) => {
    await page.goto('/');
    await page.click('text=New Game');
    
    const modal = page.locator('[data-testid=new-game-modal]');
    await expect(modal).toHaveScreenshot('new-game-modal.png');
  });
});
```

---

## Testing Infrastructure Setup

### **Jest Configuration Improvements**
```javascript
// jest.config.js
module.exports = {
  // ... existing config
  
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    },
    // Critical components must have 95%+ coverage
    './src/components/HomePage.tsx': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95
    },
    './src/components/SoccerField.tsx': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95
    }
  },
  
  // Test categories
  projects: [
    {
      displayName: 'unit',
      testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}']
    },
    {
      displayName: 'integration',
      testMatch: ['<rootDir>/tests/integration/**/*.test.{ts,tsx}']
    },
    {
      displayName: 'performance',
      testMatch: ['<rootDir>/tests/performance/**/*.test.{ts,tsx}'],
      testEnvironment: 'jsdom'
    }
  ],
  
  // Improved reporting
  reporters: [
    'default',
    ['jest-junit', { outputDirectory: 'test-results', outputName: 'results.xml' }],
    ['jest-html-reporters', { publicPath: 'test-results', filename: 'report.html' }]
  ]
};
```

### **Test Utilities and Helpers**
```typescript
// tests/utils/test-utils.tsx
import { render, RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactElement } from 'react';

// Custom render with providers
const AllTheProviders = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) => render(ui, { wrapper: AllTheProviders, ...options });

export * from '@testing-library/react';
export { customRender as render };

// Mock factories
export const createMockGameState = (): AppState => ({
  // ... mock game state
});

export const createMockPlayers = (count: number): Player[] => 
  Array.from({ length: count }, (_, i) => ({
    id: `player-${i}`,
    name: `Player ${i + 1}`,
    // ... other properties
  }));

// Test helpers
export const dragAndDrop = async (source: HTMLElement, target: HTMLElement) => {
  fireEvent.mouseDown(source);
  fireEvent.mouseMove(target);
  fireEvent.mouseUp(target);
};

export const waitForNextTick = () => new Promise(resolve => setTimeout(resolve, 0));
```

### **NPM Scripts Enhancement**
```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:critical": "jest --testNamePattern=\"Critical|Integration|Smoke\"",
    "test:smoke": "jest tests/smoke",
    "test:unit": "jest src/",
    "test:integration": "jest tests/integration",
    "test:performance": "jest tests/performance",
    "test:a11y": "jest tests/accessibility",
    "test:e2e": "playwright test",
    "test:visual": "playwright test tests/visual",
    "test:all": "npm run test:unit && npm run test:integration && npm run test:e2e",
    
    "test:ci": "jest --ci --coverage --watchAll=false",
    "test:debug": "jest --runInBand --no-cache",
    
    "coverage:open": "open coverage/lcov-report/index.html",
    "coverage:report": "jest --coverage --silent && npm run coverage:open"
  }
}
```

---

## Implementation Timeline

### **Week 1-2: Critical Safety Net**
- [ ] **Day 1-2**: Set up enhanced Jest configuration and test utilities
- [ ] **Day 3-5**: Create integration tests for core user workflows
- [ ] **Day 6-8**: Add component smoke tests for critical components
- [ ] **Day 9-10**: Implement CI/CD test guards and break detection
- [ ] **Deliverable**: 60% coverage with critical paths protected

### **Week 3-4: Component Deep Dive**
- [ ] **Day 1-3**: HomePage component test suite (break into logical sections)
- [ ] **Day 4-6**: SoccerField component test suite (drag/drop, positioning)
- [ ] **Day 7-8**: ControlBar and modal component tests
- [ ] **Day 9-10**: Hook integration tests and state management
- [ ] **Deliverable**: 80% coverage with component-level testing

### **Week 5-6: Advanced Testing**
- [ ] **Day 1-2**: Performance testing infrastructure
- [ ] **Day 3-4**: Accessibility testing with axe-core
- [ ] **Day 5-6**: Memory leak and optimization tests
- [ ] **Day 7-8**: Edge case and error handling tests
- [ ] **Day 9-10**: Cross-browser compatibility testing
- [ ] **Deliverable**: 90% coverage with performance and a11y validation

### **Week 7-8: E2E and Polish**
- [ ] **Day 1-3**: Playwright setup and core workflow E2E tests
- [ ] **Day 4-5**: Visual regression testing setup
- [ ] **Day 6-7**: PWA and offline functionality testing
- [ ] **Day 8-10**: Test documentation and maintenance guides
- [ ] **Deliverable**: 95% coverage with full E2E validation

---

## Success Metrics

### **Coverage Targets**
| Phase | Target Coverage | Critical Components | Integration Tests |
|-------|----------------|-------------------|------------------|
| Week 2 | 60% | Smoke tests | Core workflows |
| Week 4 | 80% | Full component tests | State management |
| Week 6 | 90% | Performance + A11y | Edge cases |
| Week 8 | 95% | Visual regression | E2E scenarios |

### **Quality Gates**
```typescript
// These must pass for every PR
const qualityGates = {
  unitTests: {
    coverage: 90,
    threshold: 'no regressions'
  },
  integrationTests: {
    coreWorkflows: 'all passing',
    errorRecovery: 'all passing'
  },
  performance: {
    renderTime: '< 100ms',
    memoryLeaks: 'none detected'
  },
  accessibility: {
    violations: 'zero WCAG AA violations',
    keyboardNav: '100% navigable'
  }
};
```

### **Break Detection SLA**
- **🚨 Critical breaks**: Detected within 30 seconds of commit
- **⚠️ Performance regressions**: Detected within 5 minutes
- **📱 Accessibility violations**: Detected before PR merge
- **🔄 Integration failures**: Block deployment automatically

---

## Risk Mitigation

### **High-Risk Areas**
1. **HomePage.tsx (3,332 lines)**: Break into 20+ test files by feature area
2. **SoccerField.tsx (1,183 lines)**: Focus on interaction and positioning logic  
3. **State management**: Test all reducer actions and side effects
4. **LocalStorage operations**: Test quota limits and data corruption

### **Testing Philosophy**
- **Test behavior, not implementation**: Focus on user interactions and outcomes
- **Maintain test independence**: Each test can run in isolation
- **Prefer integration over unit**: Test components working together
- **Keep tests fast**: Unit tests < 50ms, integration tests < 500ms

### **Maintenance Strategy**
- **Living documentation**: Tests serve as component documentation
- **Refactoring safety**: High coverage enables confident refactoring
- **Performance monitoring**: Automated performance regression detection
- **Accessibility compliance**: Built-in WCAG 2.1 AA validation

---

## Conclusion

This comprehensive testing strategy transforms MatchOps-Local from a moderately-tested application into a robustly-tested, production-ready system. The phased approach ensures immediate protection of critical functionality while building toward comprehensive coverage.

**Key Benefits:**
- 🛡️ **Immediate break detection** for core user flows
- 🚀 **Confident refactoring** enabled by comprehensive coverage
- 📱 **Accessibility compliance** built into the development process
- ⚡ **Performance monitoring** preventing regressions
- 🔄 **Maintainable codebase** with living documentation through tests

**Investment**: 6-8 weeks of focused testing implementation  
**ROI**: Dramatically reduced bug rates, faster feature development, confident architectural improvements

The application's excellent technical foundations make this testing strategy highly achievable and valuable for long-term success.