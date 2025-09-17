/**
 * @jest-environment jsdom
 */

import { render, screen, fireEvent, waitFor } from '../utils/test-utils';
import { 
  createMockPlayers, 
  createMockFieldPlayers,
  mockLocalStorageQuotaExceeded 
} from '../utils/test-utils';
import HomePage from '@/components/HomePage';
import SoccerField from '@/components/SoccerField';

// Mock console methods to suppress expected error logs
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

describe('Edge Cases and Error Handling Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Suppress console errors for error boundary tests
    console.error = jest.fn();
    console.warn = jest.fn();
  });

  afterEach(() => {
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
  });

  describe('Data Corruption and Recovery', () => {
    it('should handle corrupted localStorage gracefully', async () => {
      // Mock corrupted localStorage data
      const mockLocalStorage = {
        getItem: jest.fn((key: string) => {
          if (key === 'soccerSavedGames') return '{invalid-json}';
          if (key === 'soccerMasterRoster') return '[{"id":}]'; // malformed
          return null;
        }),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        clear: jest.fn(),
      };

      Object.defineProperty(window, 'localStorage', {
        value: mockLocalStorage,
      });

      render(<HomePage />);

      // Should handle corrupted data without crashing
      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      }, { timeout: 5000 });

      // App should render and show some key content
      expect(screen.getByTestId('home-page')).toBeInTheDocument();
    });

    it('should recover from quota exceeded errors', async () => {
      const restoreSetItem = mockLocalStorageQuotaExceeded();
      
      render(<HomePage />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      }, { timeout: 5000 });

      // Should render successfully despite storage issues
      // App should render and show some key content
      expect(screen.getByTestId('home-page')).toBeInTheDocument();
      
      // Simulate user interaction that triggers save
      const buttons = screen.getAllByRole('button').filter(btn => !(btn as HTMLButtonElement).disabled);
      if (buttons.length > 0) {
        fireEvent.click(buttons[0]);
      }

      // App should remain stable
      // App should render and show some key content
      expect(screen.getByTestId('home-page')).toBeInTheDocument();
      
      restoreSetItem();
    });

    it('should handle network failures gracefully', async () => {
      // Mock network failure
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      render(<HomePage />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      }, { timeout: 5000 });

      // Should render despite network issues
      // App should render and show some key content
      expect(screen.getByTestId('home-page')).toBeInTheDocument();

      global.fetch = originalFetch;
    });
  });

  describe('Extreme Data Conditions', () => {
    it('should handle empty datasets', async () => {
      const emptyProps = {
        players: [],
        opponents: [],
        drawings: [],
        onPlayerMove: jest.fn(),
        onPlayerMoveEnd: jest.fn(),
        onPlayerRemove: jest.fn(),
        onOpponentMove: jest.fn(),
        onOpponentMoveEnd: jest.fn(),
        onOpponentRemove: jest.fn(),
        onPlayerDrop: jest.fn(),
        showPlayerNames: true,
        onDrawingStart: jest.fn(),
        onDrawingAddPoint: jest.fn(),
        onDrawingEnd: jest.fn(),
        draggingPlayerFromBarInfo: null,
        onPlayerDropViaTouch: jest.fn(),
        onPlayerDragCancelViaTouch: jest.fn(),
        timeElapsedInSeconds: 0,
        isTacticsBoardView: false,
        tacticalDiscs: [],
        onTacticalDiscMove: jest.fn(),
        onTacticalDiscRemove: jest.fn(),
        onToggleTacticalDiscType: jest.fn(),
        onAddTacticalDisc: jest.fn(),
        tacticalBallPosition: null,
        onTacticalBallMove: jest.fn(),
        tacticalDrawings: [],
        onTacticalDrawingStart: jest.fn(),
        onTacticalDrawingAddPoint: jest.fn(),
        onTacticalDrawingEnd: jest.fn(),
      };

      render(<SoccerField {...emptyProps} />);

      const canvas = document.querySelector('canvas');
      expect(canvas).toBeInTheDocument();
    });

    it('should handle maximum player limits', async () => {
      const maxPlayers = createMockFieldPlayers(50); // Extreme number
      const maxProps = {
        players: maxPlayers,
        opponents: Array.from({ length: 30 }, (_, i) => ({ 
          id: `opp-${i}`, 
          relX: Math.random(), 
          relY: Math.random() 
        })),
        drawings: Array.from({ length: 20 }, () => 
          Array.from({ length: 10 }, () => ({ 
            relX: Math.random(), 
            relY: Math.random() 
          }))
        ),
        onPlayerMove: jest.fn(),
        onPlayerMoveEnd: jest.fn(),
        onPlayerRemove: jest.fn(),
        onOpponentMove: jest.fn(),
        onOpponentMoveEnd: jest.fn(),
        onOpponentRemove: jest.fn(),
        onPlayerDrop: jest.fn(),
        showPlayerNames: true,
        onDrawingStart: jest.fn(),
        onDrawingAddPoint: jest.fn(),
        onDrawingEnd: jest.fn(),
        draggingPlayerFromBarInfo: null,
        onPlayerDropViaTouch: jest.fn(),
        onPlayerDragCancelViaTouch: jest.fn(),
        timeElapsedInSeconds: 0,
        isTacticsBoardView: false,
        tacticalDiscs: Array.from({ length: 20 }, (_, i) => ({ 
          id: `disc-${i}`, 
          type: i % 2 === 0 ? 'home' as const : 'opponent' as const, 
          relX: Math.random(), 
          relY: Math.random() 
        })),
        onTacticalDiscMove: jest.fn(),
        onTacticalDiscRemove: jest.fn(),
        onToggleTacticalDiscType: jest.fn(),
        onAddTacticalDisc: jest.fn(),
        tacticalBallPosition: { relX: 0.5, relY: 0.5 },
        onTacticalBallMove: jest.fn(),
        tacticalDrawings: Array.from({ length: 15 }, () => 
          Array.from({ length: 5 }, () => ({ 
            relX: Math.random(), 
            relY: Math.random() 
          }))
        ),
        onTacticalDrawingStart: jest.fn(),
        onTacticalDrawingAddPoint: jest.fn(),
        onTacticalDrawingEnd: jest.fn(),
      };

      const startTime = performance.now();
      render(<SoccerField {...maxProps} />);
      const renderTime = performance.now() - startTime;

      // Should handle extreme data within reasonable time
      expect(renderTime).toBeLessThan(1000); // 1 second
      
      const canvas = document.querySelector('canvas');
      expect(canvas).toBeInTheDocument();
    });

    it('should handle invalid coordinate values', async () => {
      const invalidPlayers = [
        { ...createMockFieldPlayers(1)[0], relX: -5, relY: 10 }, // Out of bounds
        { ...createMockFieldPlayers(1)[0], relX: NaN, relY: Infinity }, // Invalid numbers
        { ...createMockFieldPlayers(1)[0], relX: null as any, relY: undefined as any }, // Null values
      ];

      const invalidProps = {
        players: invalidPlayers,
        opponents: [],
        drawings: [],
        onPlayerMove: jest.fn(),
        onPlayerMoveEnd: jest.fn(),
        onPlayerRemove: jest.fn(),
        onOpponentMove: jest.fn(),
        onOpponentMoveEnd: jest.fn(),
        onOpponentRemove: jest.fn(),
        onPlayerDrop: jest.fn(),
        showPlayerNames: true,
        onDrawingStart: jest.fn(),
        onDrawingAddPoint: jest.fn(),
        onDrawingEnd: jest.fn(),
        draggingPlayerFromBarInfo: null,
        onPlayerDropViaTouch: jest.fn(),
        onPlayerDragCancelViaTouch: jest.fn(),
        timeElapsedInSeconds: 0,
        isTacticsBoardView: false,
        tacticalDiscs: [],
        onTacticalDiscMove: jest.fn(),
        onTacticalDiscRemove: jest.fn(),
        onToggleTacticalDiscType: jest.fn(),
        onAddTacticalDisc: jest.fn(),
        tacticalBallPosition: null,
        onTacticalBallMove: jest.fn(),
        tacticalDrawings: [],
        onTacticalDrawingStart: jest.fn(),
        onTacticalDrawingAddPoint: jest.fn(),
        onTacticalDrawingEnd: jest.fn(),
      };

      // Should handle invalid data without crashing
      expect(() => {
        render(<SoccerField {...invalidProps} />);
      }).not.toThrow();
    });
  });

  describe('Browser Environment Edge Cases', () => {
    it('should handle missing canvas support', async () => {
      // Mock canvas getContext to return null
      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = jest.fn().mockReturnValue(null);

      const props = {
        players: createMockFieldPlayers(2),
        opponents: [],
        drawings: [],
        onPlayerMove: jest.fn(),
        onPlayerMoveEnd: jest.fn(),
        onPlayerRemove: jest.fn(),
        onOpponentMove: jest.fn(),
        onOpponentMoveEnd: jest.fn(),
        onOpponentRemove: jest.fn(),
        onPlayerDrop: jest.fn(),
        showPlayerNames: true,
        onDrawingStart: jest.fn(),
        onDrawingAddPoint: jest.fn(),
        onDrawingEnd: jest.fn(),
        draggingPlayerFromBarInfo: null,
        onPlayerDropViaTouch: jest.fn(),
        onPlayerDragCancelViaTouch: jest.fn(),
        timeElapsedInSeconds: 0,
        isTacticsBoardView: false,
        tacticalDiscs: [],
        onTacticalDiscMove: jest.fn(),
        onTacticalDiscRemove: jest.fn(),
        onToggleTacticalDiscType: jest.fn(),
        onAddTacticalDisc: jest.fn(),
        tacticalBallPosition: null,
        onTacticalBallMove: jest.fn(),
        tacticalDrawings: [],
        onTacticalDrawingStart: jest.fn(),
        onTacticalDrawingAddPoint: jest.fn(),
        onTacticalDrawingEnd: jest.fn(),
      };

      render(<SoccerField {...props} />);

      // Should handle missing canvas context gracefully
      const canvas = document.querySelector('canvas');
      expect(canvas).toBeInTheDocument();

      // Restore original method
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    });

    it('should handle ResizeObserver unavailability', async () => {
      // Mock ResizeObserver as unavailable
      const originalResizeObserver = global.ResizeObserver;
      (global as any).ResizeObserver = undefined;

      render(<HomePage />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      }, { timeout: 5000 });

      // Should render successfully without ResizeObserver
      // App should render and show some key content
      expect(screen.getByTestId('home-page')).toBeInTheDocument();

      // Restore ResizeObserver
      global.ResizeObserver = originalResizeObserver;
    });

    it('should handle performance API unavailability', async () => {
      // Mock performance as unavailable
      const originalPerformance = global.performance;
      (global as any).performance = undefined;

      render(<HomePage />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      }, { timeout: 5000 });

      // Should render successfully without performance API
      // App should render and show some key content
      expect(screen.getByTestId('home-page')).toBeInTheDocument();

      // Restore performance
      global.performance = originalPerformance;
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle rapid state changes without conflicts', async () => {
      render(<HomePage />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      }, { timeout: 5000 });

      const buttons = screen.getAllByRole('button').filter(btn => !(btn as HTMLButtonElement).disabled);
      
      // Simulate rapid concurrent operations
      const promises = buttons.slice(0, 3).map(async (button, index) => {
        for (let i = 0; i < 5; i++) {
          fireEvent.click(button);
          await new Promise(resolve => setTimeout(resolve, 1));
        }
      });

      await Promise.all(promises);

      // Application should remain stable
      // App should render and show some key content
      expect(screen.getByTestId('home-page')).toBeInTheDocument();
    });

    it('should handle simultaneous canvas operations', async () => {
      const props = {
        players: createMockFieldPlayers(5),
        opponents: [],
        drawings: [],
        onPlayerMove: jest.fn(),
        onPlayerMoveEnd: jest.fn(),
        onPlayerRemove: jest.fn(),
        onOpponentMove: jest.fn(),
        onOpponentMoveEnd: jest.fn(),
        onOpponentRemove: jest.fn(),
        onPlayerDrop: jest.fn(),
        showPlayerNames: true,
        onDrawingStart: jest.fn(),
        onDrawingAddPoint: jest.fn(),
        onDrawingEnd: jest.fn(),
        draggingPlayerFromBarInfo: null,
        onPlayerDropViaTouch: jest.fn(),
        onPlayerDragCancelViaTouch: jest.fn(),
        timeElapsedInSeconds: 0,
        isTacticsBoardView: false,
        tacticalDiscs: [],
        onTacticalDiscMove: jest.fn(),
        onTacticalDiscRemove: jest.fn(),
        onToggleTacticalDiscType: jest.fn(),
        onAddTacticalDisc: jest.fn(),
        tacticalBallPosition: null,
        onTacticalBallMove: jest.fn(),
        tacticalDrawings: [],
        onTacticalDrawingStart: jest.fn(),
        onTacticalDrawingAddPoint: jest.fn(),
        onTacticalDrawingEnd: jest.fn(),
      };

      render(<SoccerField {...props} />);
      
      const canvas = document.querySelector('canvas');
      if (canvas) {
        // Simulate simultaneous mouse and touch events
        const mouseEvents = Array.from({ length: 10 }, (_, i) => 
          new MouseEvent('mousemove', { clientX: 100 + i, clientY: 100 + i })
        );
        
        const touchEvents = Array.from({ length: 10 }, (_, i) => 
          new TouchEvent('touchmove', { 
            touches: [{ clientX: 200 + i, clientY: 200 + i } as any]
          })
        );

        // Fire events rapidly
        mouseEvents.forEach(event => canvas.dispatchEvent(event));
        touchEvents.forEach(event => canvas.dispatchEvent(event));

        // Canvas should remain functional
        expect(canvas).toBeInTheDocument();
      }
    });
  });

  describe('Memory and Resource Constraints', () => {
    it('should handle low memory conditions', async () => {
      // Mock low memory condition
      const mockMemory = {
        usedJSHeapSize: 1900000000, // Near limit
        totalJSHeapSize: 2000000000,
        jsHeapSizeLimit: 2000000000,
      };

      Object.defineProperty(performance, 'memory', {
        value: mockMemory,
        writable: true,
      });

      render(<HomePage />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      }, { timeout: 5000 });

      // Should render successfully even under memory pressure
      // App should render and show some key content
      expect(screen.getByTestId('home-page')).toBeInTheDocument();
    });

    it('should handle resource cleanup on unmount', async () => {
      const { unmount } = render(<HomePage />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      }, { timeout: 5000 });

      // Unmount should not throw errors
      expect(() => unmount()).not.toThrow();
    });
  });

  describe('Error Boundary Integration', () => {
    it('should catch and handle component errors gracefully', async () => {
      // This would test the ErrorBoundary component's integration
      // For now, ensure the app renders without throwing unhandled errors
      
      expect(() => {
        render(<HomePage />);
      }).not.toThrow();
    });

    it('should provide error recovery options', async () => {
      render(<HomePage />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      }, { timeout: 5000 });

      // Check that the app provides ways to recover from errors
      // This could include retry buttons, reset options, etc.
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
      
      // App should provide some form of user controls for recovery
      // App should render and show some key content
      expect(screen.getByTestId('home-page')).toBeInTheDocument();
    });
  });
});