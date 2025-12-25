/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, fireEvent } from '../../../tests/utils/test-utils';
import SoccerField, { SoccerFieldHandle } from '../SoccerField';
import { Player, Opponent, Point } from '@/types';

// Mock players for testing
const createMockPlayer = (id: string, overrides?: Partial<Player>): Player => ({
  id,
  name: `Player ${id}`,
  jerseyNumber: id,
  relX: 0.3,
  relY: 0.4,
  ...overrides,
});

const createMockOpponent = (id: string): Opponent => ({
  id,
  relX: 0.7,
  relY: 0.5,
});

describe('SoccerField Component - Interaction Testing', () => {
  const defaultProps = {
    players: [
      createMockPlayer('1', { relX: 0.2, relY: 0.3 }),
      createMockPlayer('2', { relX: 0.4, relY: 0.5 }),
    ],
    opponents: [createMockOpponent('opp1')],
    drawings: [] as Point[][],
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
    isDrawingEnabled: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Component Rendering', () => {
    it('should render without crashing', () => {
      render(<SoccerField {...defaultProps} />);
      
      // Should have a canvas element for the field
      const canvas = document.querySelector('canvas');
      expect(canvas).toBeInTheDocument();
    });

    it('should render with empty player list', () => {
      const emptyProps = { ...defaultProps, players: [] };
      render(<SoccerField {...emptyProps} />);
      
      const canvas = document.querySelector('canvas');
      expect(canvas).toBeInTheDocument();
    });

    it('should handle large numbers of players', () => {
      const manyPlayers = Array.from({ length: 22 }, (_, i) => 
        createMockPlayer((i + 1).toString(), {
          relX: 0.1 + (i % 3) * 0.3,
          relY: 0.1 + Math.floor(i / 3) * 0.1,
        })
      );
      
      const largeProps = { ...defaultProps, players: manyPlayers };
      
      const startTime = performance.now();
      render(<SoccerField {...largeProps} />);
      const renderTime = performance.now() - startTime;
      
      // Should render large datasets within 200ms
      expect(renderTime).toBeLessThan(200);
      
      const canvas = document.querySelector('canvas');
      expect(canvas).toBeInTheDocument();
    });
  });

  describe('Mouse Interactions', () => {
    it('should handle mouse down events on canvas', () => {
      render(<SoccerField {...defaultProps} />);
      
      const canvas = document.querySelector('canvas');
      if (canvas) {
        fireEvent.mouseDown(canvas, { clientX: 100, clientY: 100 });
        
        // Should not crash
        expect(canvas).toBeInTheDocument();
      }
    });

    it('should handle mouse move events', () => {
      render(<SoccerField {...defaultProps} />);
      
      const canvas = document.querySelector('canvas');
      if (canvas) {
        fireEvent.mouseDown(canvas, { clientX: 100, clientY: 100 });
        fireEvent.mouseMove(canvas, { clientX: 150, clientY: 150 });
        
        // Should remain stable
        expect(canvas).toBeInTheDocument();
      }
    });

    it('should handle mouse up events', () => {
      render(<SoccerField {...defaultProps} />);
      
      const canvas = document.querySelector('canvas');
      if (canvas) {
        fireEvent.mouseDown(canvas, { clientX: 100, clientY: 100 });
        fireEvent.mouseMove(canvas, { clientX: 150, clientY: 150 });
        fireEvent.mouseUp(canvas, { clientX: 150, clientY: 150 });
        
        expect(canvas).toBeInTheDocument();
      }
    });

    it('should handle click events for drawing mode', () => {
      render(<SoccerField {...defaultProps} />);
      
      const canvas = document.querySelector('canvas');
      if (canvas) {
        // Single click should potentially start drawing
        fireEvent.click(canvas, { clientX: 200, clientY: 200 });
        
        expect(canvas).toBeInTheDocument();
      }
    });
  });

  describe('Touch Interactions', () => {
    it('should handle touch start events', () => {
      render(<SoccerField {...defaultProps} />);
      
      const canvas = document.querySelector('canvas');
      if (canvas) {
        fireEvent.touchStart(canvas, {
          touches: [{ clientX: 100, clientY: 100 }],
        });
        
        expect(canvas).toBeInTheDocument();
      }
    });

    it('should handle touch move events', () => {
      render(<SoccerField {...defaultProps} />);
      
      const canvas = document.querySelector('canvas');
      if (canvas) {
        fireEvent.touchStart(canvas, {
          touches: [{ clientX: 100, clientY: 100 }],
        });
        fireEvent.touchMove(canvas, {
          touches: [{ clientX: 150, clientY: 150 }],
        });
        
        expect(canvas).toBeInTheDocument();
      }
    });

    it('should handle touch end events', () => {
      render(<SoccerField {...defaultProps} />);
      
      const canvas = document.querySelector('canvas');
      if (canvas) {
        fireEvent.touchStart(canvas, {
          touches: [{ clientX: 100, clientY: 100 }],
        });
        fireEvent.touchMove(canvas, {
          touches: [{ clientX: 150, clientY: 150 }],
        });
        fireEvent.touchEnd(canvas);
        
        expect(canvas).toBeInTheDocument();
      }
    });
  });

  describe('Tactical Board Mode', () => {
    it('should render in tactical board mode', () => {
      const tacticalProps = { ...defaultProps, isTacticsBoardView: true };
      render(<SoccerField {...tacticalProps} />);
      
      const canvas = document.querySelector('canvas');
      expect(canvas).toBeInTheDocument();
    });

    it('should handle tactical disc interactions', () => {
      const tacticalProps = {
        ...defaultProps,
        isTacticsBoardView: true,
        tacticalDiscs: [
          { id: 'disc1', type: 'home' as const, relX: 0.3, relY: 0.4 },
          { id: 'disc2', type: 'opponent' as const, relX: 0.7, relY: 0.6 },
        ],
      };
      
      render(<SoccerField {...tacticalProps} />);
      
      const canvas = document.querySelector('canvas');
      if (canvas) {
        // Test interaction with tactical elements
        fireEvent.mouseDown(canvas, { clientX: 100, clientY: 100 });
        fireEvent.mouseMove(canvas, { clientX: 120, clientY: 120 });
        fireEvent.mouseUp(canvas);
        
        expect(canvas).toBeInTheDocument();
      }
    });
  });

  describe('Drawing Functionality', () => {
    it('should handle drawing operations', () => {
      const drawingProps = {
        ...defaultProps,
        drawings: [[{ relX: 0.2, relY: 0.2 }, { relX: 0.4, relY: 0.4 }]],
      };
      
      render(<SoccerField {...drawingProps} />);
      
      const canvas = document.querySelector('canvas');
      expect(canvas).toBeInTheDocument();
    });

    it('should handle multiple drawing paths', () => {
      const multiDrawingProps = {
        ...defaultProps,
        drawings: [
          [{ relX: 0.1, relY: 0.1 }, { relX: 0.2, relY: 0.2 }],
          [{ relX: 0.3, relY: 0.3 }, { relX: 0.4, relY: 0.4 }],
          [{ relX: 0.5, relY: 0.5 }, { relX: 0.6, relY: 0.6 }],
        ],
      };
      
      render(<SoccerField {...multiDrawingProps} />);
      
      const canvas = document.querySelector('canvas');
      expect(canvas).toBeInTheDocument();
    });

    it('cancels active drawing when drawing mode is disabled', () => {
      // Drawing requires both isDrawingEnabled AND isTacticsBoardView
      const props = { ...defaultProps, isDrawingEnabled: true, isTacticsBoardView: true };
      const { rerender } = render(<SoccerField {...props} />);

      const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
      expect(canvas).toBeInTheDocument();
      if (!canvas) return;

      // Ensure canvas has measurable size for relative calculations
      const rectMock: DOMRect = {
        left: 0,
        top: 0,
        right: 300,
        bottom: 150,
        width: 300,
        height: 150,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
      jest.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(
        rectMock
      );

      // Start drawing
      fireEvent.mouseDown(canvas, { clientX: 100, clientY: 100 });
      expect(props.onDrawingStart).toHaveBeenCalled();

      // Disable drawing mode via rerender
      rerender(<SoccerField {...props} isDrawingEnabled={false} />);

      // Drawing should be ended
      expect(props.onDrawingEnd).toHaveBeenCalled();
    });
  });

  describe('Performance and Stability', () => {
    it('should handle rapid interaction events', () => {
      render(<SoccerField {...defaultProps} />);
      
      const canvas = document.querySelector('canvas');
      if (canvas) {
        // Simulate rapid mouse movements
        for (let i = 0; i < 10; i++) {
          fireEvent.mouseMove(canvas, { clientX: 100 + i * 10, clientY: 100 + i * 5 });
        }
        
        expect(canvas).toBeInTheDocument();
      }
    });

    it('should maintain stability with edge case coordinates', () => {
      render(<SoccerField {...defaultProps} />);
      
      const canvas = document.querySelector('canvas');
      if (canvas) {
        // Test with extreme coordinates
        fireEvent.mouseDown(canvas, { clientX: -100, clientY: -100 });
        fireEvent.mouseMove(canvas, { clientX: 10000, clientY: 10000 });
        fireEvent.mouseUp(canvas, { clientX: 0, clientY: 0 });
        
        expect(canvas).toBeInTheDocument();
      }
    });

    it('should handle props updates without crashing', () => {
      const { rerender } = render(<SoccerField {...defaultProps} />);
      
      // Update with different props
      const updatedProps = {
        ...defaultProps,
        players: [createMockPlayer('3', { relX: 0.8, relY: 0.9 })],
        showPlayerNames: false,
      };
      
      rerender(<SoccerField {...updatedProps} />);
      
      const canvas = document.querySelector('canvas');
      expect(canvas).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should handle null/undefined props gracefully', () => {
      // Suppress expected console errors
      const originalConsoleError = console.error;
      console.error = jest.fn();

      try {
        const nullProps = {
          ...defaultProps,
          players: null as unknown as Player[],
          opponents: undefined as unknown as Opponent[],
        };

        render(<SoccerField {...nullProps} />);
        
        // Should either render with fallbacks or error boundary should catch
        const canvas = document.querySelector('canvas');
        expect(canvas || document.body).toBeTruthy();
      } finally {
        console.error = originalConsoleError;
      }
    });

    it('should handle malformed player data', () => {
      const originalConsoleError = console.error;
      console.error = jest.fn();

      try {
        const malformedProps = {
          ...defaultProps,
          players: [
            { id: null, name: null, relX: 'invalid', relY: 'invalid' } as unknown as Player,
            {} as unknown as Player,
            null as unknown as Player,
          ],
        };

        render(<SoccerField {...malformedProps} />);

        // Should handle malformed data gracefully
        expect(document.body).toContainHTML('canvas');
      } finally {
        console.error = originalConsoleError;
      }
    });
  });

  describe('Background Resume Recovery', () => {
    // Store original document.hidden descriptor
    const originalHiddenDescriptor = Object.getOwnPropertyDescriptor(
      document,
      'hidden'
    );

    afterEach(() => {
      // Restore original document.hidden
      if (originalHiddenDescriptor) {
        Object.defineProperty(document, 'hidden', originalHiddenDescriptor);
      }
    });

    /**
     * Tests that canvas sets up visibility change listener on mount
     * @critical - Ensures canvas redraws on app resume
     */
    it('should add visibilitychange listener on mount', () => {
      const addEventListenerSpy = jest.spyOn(document, 'addEventListener');

      render(<SoccerField {...defaultProps} />);

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'visibilitychange',
        expect.any(Function)
      );

      addEventListenerSpy.mockRestore();
    });

    /**
     * Tests that canvas removes visibility change listener on unmount
     * @critical - Prevents memory leaks
     */
    it('should remove visibilitychange listener on unmount', () => {
      const removeEventListenerSpy = jest.spyOn(document, 'removeEventListener');

      const { unmount } = render(<SoccerField {...defaultProps} />);
      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'visibilitychange',
        expect.any(Function)
      );

      removeEventListenerSpy.mockRestore();
    });

    /**
     * Tests that canvas triggers redraw when app returns from background
     * @critical - Recovery mechanism for blank screen bug
     */
    it('should trigger redraw when document becomes visible', async () => {
      // Mock requestAnimationFrame to capture the callback
      const originalRAF = window.requestAnimationFrame;
      const rafCallback = jest.fn();
      window.requestAnimationFrame = jest.fn((cb) => {
        rafCallback();
        cb(0); // Execute callback synchronously for testing
        return 0;
      });

      render(<SoccerField {...defaultProps} />);

      // Simulate returning from background
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => false,
      });
      document.dispatchEvent(new Event('visibilitychange'));

      // requestAnimationFrame should have been called to schedule redraw
      expect(rafCallback).toHaveBeenCalled();

      window.requestAnimationFrame = originalRAF;
    });

    /**
     * Tests that visibility change to hidden doesn't trigger redraw
     * @edge-case
     */
    it('should NOT trigger redraw when document becomes hidden', () => {
      const originalRAF = window.requestAnimationFrame;
      const rafCallback = jest.fn();
      window.requestAnimationFrame = jest.fn((cb) => {
        rafCallback();
        cb(0);
        return 0;
      });

      render(<SoccerField {...defaultProps} />);

      // Reset RAF spy after initial render
      rafCallback.mockClear();

      // Simulate going to background
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => true,
      });
      document.dispatchEvent(new Event('visibilitychange'));

      // requestAnimationFrame should NOT be called when going to background
      expect(rafCallback).not.toHaveBeenCalled();

      window.requestAnimationFrame = originalRAF;
    });

    /**
     * Tests that canvas still renders properly after visibility change cycle
     * @integration
     */
    it('should maintain stable canvas after background/foreground cycle', () => {
      render(<SoccerField {...defaultProps} />);

      const canvas = document.querySelector('canvas');
      expect(canvas).toBeInTheDocument();

      // Go to background
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => true,
      });
      document.dispatchEvent(new Event('visibilitychange'));

      // Return to foreground
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => false,
      });
      document.dispatchEvent(new Event('visibilitychange'));

      // Canvas should still be in DOM and functional
      const canvasAfter = document.querySelector('canvas');
      expect(canvasAfter).toBeInTheDocument();
    });
  });

  describe('Ref Exposure for Export', () => {
    /**
     * Tests that SoccerFieldHandle ref is properly exposed via forwardRef
     * @critical - Required for field export functionality
     */
    it('should expose getCanvas method via ref', () => {
      const ref = React.createRef<SoccerFieldHandle>();
      render(<SoccerField {...defaultProps} ref={ref} />);

      expect(ref.current).not.toBeNull();
      expect(typeof ref.current?.getCanvas).toBe('function');
    });

    it('should return canvas element from getCanvas', () => {
      const ref = React.createRef<SoccerFieldHandle>();
      render(<SoccerField {...defaultProps} ref={ref} />);

      const canvas = ref.current?.getCanvas();
      expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    });

    it('should return the same canvas element as rendered', () => {
      const ref = React.createRef<SoccerFieldHandle>();
      render(<SoccerField {...defaultProps} ref={ref} />);

      const canvasFromRef = ref.current?.getCanvas();
      const canvasFromDom = document.querySelector('canvas');

      expect(canvasFromRef).toBe(canvasFromDom);
    });

    it('should maintain ref stability across re-renders', () => {
      const ref = React.createRef<SoccerFieldHandle>();
      const { rerender } = render(<SoccerField {...defaultProps} ref={ref} />);

      const canvasBefore = ref.current?.getCanvas();

      // Re-render with updated props
      rerender(<SoccerField {...defaultProps} timeElapsedInSeconds={100} ref={ref} />);

      const canvasAfter = ref.current?.getCanvas();

      expect(canvasBefore).toBe(canvasAfter);
    });
  });
});
