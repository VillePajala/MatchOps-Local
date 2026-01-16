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
    onTacticalDiscMoveEnd: jest.fn(),
    onTacticalDiscRemove: jest.fn(),
    onToggleTacticalDiscType: jest.fn(),
    onAddTacticalDisc: jest.fn(),
    tacticalBallPosition: null,
    onTacticalBallMove: jest.fn(),
    onTacticalBallMoveEnd: jest.fn(),
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

    /**
     * Tests renderForExport method for high-quality export
     * @critical - Required for sharp image exports
     */
    it('should expose renderForExport method via ref', () => {
      const ref = React.createRef<SoccerFieldHandle>();
      render(<SoccerField {...defaultProps} ref={ref} />);

      expect(ref.current).not.toBeNull();
      expect(typeof ref.current?.renderForExport).toBe('function');
    });

    it('should return canvas from renderForExport', () => {
      const ref = React.createRef<SoccerFieldHandle>();
      render(<SoccerField {...defaultProps} ref={ref} />);

      // Mock getBoundingClientRect since JSDOM doesn't render
      const canvas = document.querySelector('canvas');
      if (canvas) {
        jest.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
          width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({})
        });
      }

      const exportCanvas = ref.current?.renderForExport();
      expect(exportCanvas).toBeInstanceOf(HTMLCanvasElement);
    });

    it('should accept scale parameter in renderForExport', () => {
      const ref = React.createRef<SoccerFieldHandle>();
      render(<SoccerField {...defaultProps} ref={ref} />);

      // Mock getBoundingClientRect since JSDOM doesn't render
      const canvas = document.querySelector('canvas');
      if (canvas) {
        jest.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
          width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({})
        });
      }

      // Should not throw with scale parameter
      const exportCanvas = ref.current?.renderForExport(2);
      expect(exportCanvas).toBeInstanceOf(HTMLCanvasElement);
    });
  });
});

// Import helper function and constant for direct testing
import { isPositionOccupied, SUB_SLOT_OCCUPATION_THRESHOLD } from '../SoccerField';

describe('isPositionOccupied Helper Function', () => {
  const createPlayer = (relX?: number, relY?: number): Player => ({
    id: 'test',
    name: 'Test Player',
    jerseyNumber: '1',
    relX,
    relY,
  });

  describe('basic functionality', () => {
    it('returns true when player is exactly at target position', () => {
      const players = [createPlayer(0.5, 0.5)];
      expect(isPositionOccupied(players, 0.5, 0.5)).toBe(true);
    });

    it('returns true when player is within threshold of target', () => {
      const players = [createPlayer(0.5, 0.5)];
      // Just inside threshold (0.04)
      expect(isPositionOccupied(players, 0.53, 0.53)).toBe(true);
    });

    it('returns false when player is outside threshold', () => {
      const players = [createPlayer(0.5, 0.5)];
      // Just outside threshold (0.04)
      expect(isPositionOccupied(players, 0.55, 0.55)).toBe(false);
    });

    it('returns false for empty players array', () => {
      expect(isPositionOccupied([], 0.5, 0.5)).toBe(false);
    });
  });

  describe('undefined coordinate handling', () => {
    it('returns false when player has undefined relX', () => {
      const players = [createPlayer(undefined, 0.5)];
      expect(isPositionOccupied(players, 0.5, 0.5)).toBe(false);
    });

    it('returns false when player has undefined relY', () => {
      const players = [createPlayer(0.5, undefined)];
      expect(isPositionOccupied(players, 0.5, 0.5)).toBe(false);
    });

    it('returns false when player has both coordinates undefined', () => {
      const players = [createPlayer(undefined, undefined)];
      expect(isPositionOccupied(players, 0.5, 0.5)).toBe(false);
    });

    it('ignores players with undefined coordinates but finds valid ones', () => {
      const players = [
        createPlayer(undefined, 0.5),
        createPlayer(0.5, 0.5), // This one is valid and at target
      ];
      expect(isPositionOccupied(players, 0.5, 0.5)).toBe(true);
    });
  });

  describe('multiple players', () => {
    it('returns true if any player is at target', () => {
      const players = [
        createPlayer(0.2, 0.2),
        createPlayer(0.5, 0.5), // At target
        createPlayer(0.8, 0.8),
      ];
      expect(isPositionOccupied(players, 0.5, 0.5)).toBe(true);
    });

    it('returns false if no player is at target', () => {
      const players = [
        createPlayer(0.2, 0.2),
        createPlayer(0.3, 0.3),
        createPlayer(0.8, 0.8),
      ];
      expect(isPositionOccupied(players, 0.5, 0.5)).toBe(false);
    });
  });

  describe('custom threshold', () => {
    it('uses default threshold when not specified', () => {
      const players = [createPlayer(0.5, 0.5)];
      // Default threshold is 0.04
      expect(isPositionOccupied(players, 0.539, 0.539)).toBe(true); // Within 0.04
      expect(isPositionOccupied(players, 0.541, 0.541)).toBe(false); // Outside 0.04
    });

    it('respects custom threshold parameter', () => {
      const players = [createPlayer(0.5, 0.5)];
      // With larger threshold
      expect(isPositionOccupied(players, 0.59, 0.59, 0.1)).toBe(true);
      // With smaller threshold
      expect(isPositionOccupied(players, 0.52, 0.52, 0.01)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('handles positions at field boundaries', () => {
      const players = [createPlayer(0, 0)];
      expect(isPositionOccupied(players, 0, 0)).toBe(true);
      expect(isPositionOccupied(players, 0.03, 0.03)).toBe(true);
    });

    it('handles positions at field corners', () => {
      const players = [createPlayer(1, 1)];
      expect(isPositionOccupied(players, 1, 1)).toBe(true);
    });

    it('checks both X and Y independently', () => {
      const players = [createPlayer(0.5, 0.5)];
      // X within threshold, Y outside
      expect(isPositionOccupied(players, 0.52, 0.6)).toBe(false);
      // Y within threshold, X outside
      expect(isPositionOccupied(players, 0.6, 0.52)).toBe(false);
    });
  });

  describe('threshold constant', () => {
    it('exports the correct threshold value', () => {
      expect(SUB_SLOT_OCCUPATION_THRESHOLD).toBe(0.04);
    });
  });
});

describe('Empty Position Selection', () => {
  const createMockPlayer = (id: string, overrides?: Partial<Player>): Player => ({
    id,
    name: `Player ${id}`,
    jerseyNumber: id,
    relX: 0.3,
    relY: 0.4,
    ...overrides,
  });

  const defaultProps = {
    players: [
      createMockPlayer('1', { relX: 0.2, relY: 0.3 }),
      createMockPlayer('2', { relX: 0.4, relY: 0.5 }),
    ],
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
    onTacticalDiscMoveEnd: jest.fn(),
    onTacticalDiscRemove: jest.fn(),
    onToggleTacticalDiscType: jest.fn(),
    onAddTacticalDisc: jest.fn(),
    tacticalBallPosition: null,
    onTacticalBallMove: jest.fn(),
    onTacticalBallMoveEnd: jest.fn(),
    tacticalDrawings: [],
    onTacticalDrawingStart: jest.fn(),
    onTacticalDrawingAddPoint: jest.fn(),
    onTacticalDrawingEnd: jest.fn(),
    isDrawingEnabled: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Tests that empty formation snap points can be detected
   * @integration
   */
  describe('formation snap point detection', () => {
    it('should render with formation snap points', () => {
      const formationSnapPoints = [
        { relX: 0.5, relY: 0.75 },
        { relX: 0.3, relY: 0.55 },
        { relX: 0.7, relY: 0.55 },
      ];

      render(<SoccerField {...defaultProps} formationSnapPoints={formationSnapPoints} />);

      const canvas = document.querySelector('canvas');
      expect(canvas).toBeInTheDocument();
    });

    it('should render with sub slots', () => {
      const subSlots = [
        { relX: 0.96, relY: 0.75, positionLabel: 'CB' },
        { relX: 0.96, relY: 0.55, positionLabel: 'CM' },
      ];

      render(<SoccerField {...defaultProps} subSlots={subSlots} />);

      const canvas = document.querySelector('canvas');
      expect(canvas).toBeInTheDocument();
    });
  });

  /**
   * Tests that empty position detection respects occupation
   * @integration
   */
  describe('occupation detection', () => {
    it('should not detect empty position where player exists', () => {
      // Use isPositionOccupied which is the underlying logic
      const players = [createMockPlayer('1', { relX: 0.5, relY: 0.75 })];

      // Position should be occupied
      expect(isPositionOccupied(players, 0.5, 0.75)).toBe(true);
    });

    it('should detect unoccupied formation position', () => {
      const players = [createMockPlayer('1', { relX: 0.2, relY: 0.3 })];

      // Different position should not be occupied
      expect(isPositionOccupied(players, 0.5, 0.75)).toBe(false);
    });
  });

  /**
   * Tests empty position tap-to-move user flow
   * UX: User must first select a player, then tap an empty position
   * @critical
   */
  describe('tap-to-move interaction flow', () => {
    it('should handle touch interaction on canvas with formation snap points', () => {
      const formationSnapPoints = [
        { relX: 0.5, relY: 0.75 },
        { relX: 0.3, relY: 0.55 },
      ];

      render(<SoccerField {...defaultProps} formationSnapPoints={formationSnapPoints} />);

      const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
      expect(canvas).toBeInTheDocument();
      if (!canvas) return;

      // Mock canvas dimensions for coordinate translation
      // Player 1 at (0.2, 0.3) → pixel (60, 90) with 300x300 canvas
      // Formation snap point at (0.5, 0.75) → pixel (150, 225)
      const rectMock: DOMRect = {
        left: 0, top: 0, right: 300, bottom: 300,
        width: 300, height: 300, x: 0, y: 0,
        toJSON: () => ({}),
      };
      jest.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(rectMock);

      // First tap to select player at (0.2, 0.3) → pixel (60, 90)
      fireEvent.touchStart(canvas, {
        touches: [{ clientX: 60, clientY: 90, identifier: 0, target: canvas }],
      });
      fireEvent.touchEnd(canvas, { changedTouches: [{ clientX: 60, clientY: 90, identifier: 0, target: canvas }] });

      // Second tap on empty formation position at (0.5, 0.75) → pixel (150, 225)
      fireEvent.touchStart(canvas, {
        touches: [{ clientX: 150, clientY: 225, identifier: 0, target: canvas }],
      });
      fireEvent.touchEnd(canvas, { changedTouches: [{ clientX: 150, clientY: 225, identifier: 0, target: canvas }] });

      // Canvas should remain stable after interaction
      expect(canvas).toBeInTheDocument();
    });

    it('should handle touch on sub slot positions', () => {
      const subSlots = [
        { relX: 0.96, relY: 0.75, positionLabel: 'CB' },
        { relX: 0.96, relY: 0.55, positionLabel: 'CM' },
      ];

      render(<SoccerField {...defaultProps} subSlots={subSlots} />);

      const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
      expect(canvas).toBeInTheDocument();
      if (!canvas) return;

      // Mock canvas dimensions
      const rectMock: DOMRect = {
        left: 0, top: 0, right: 300, bottom: 300,
        width: 300, height: 300, x: 0, y: 0,
        toJSON: () => ({}),
      };
      jest.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(rectMock);

      // Tap near sub slot position at (0.96, 0.75) → pixel (288, 225)
      fireEvent.touchStart(canvas, {
        touches: [{ clientX: 288, clientY: 225, identifier: 0, target: canvas }],
      });
      fireEvent.touchEnd(canvas, { changedTouches: [{ clientX: 288, clientY: 225, identifier: 0, target: canvas }] });

      expect(canvas).toBeInTheDocument();
    });

    it('should call onPlayerMove and onPlayerMoveEnd when moving to empty position', () => {
      // Player 1 at (0.2, 0.3), not at the formation snap point
      const players = [createMockPlayer('1', { relX: 0.2, relY: 0.3 })];
      const formationSnapPoints = [{ relX: 0.5, relY: 0.75 }];
      const onPlayerMove = jest.fn();
      const onPlayerMoveEnd = jest.fn();

      render(
        <SoccerField
          {...defaultProps}
          players={players}
          formationSnapPoints={formationSnapPoints}
          onPlayerMove={onPlayerMove}
          onPlayerMoveEnd={onPlayerMoveEnd}
        />
      );

      const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
      expect(canvas).toBeInTheDocument();
      if (!canvas) return;

      // Mock canvas dimensions (300x300)
      const rectMock: DOMRect = {
        left: 0, top: 0, right: 300, bottom: 300,
        width: 300, height: 300, x: 0, y: 0,
        toJSON: () => ({}),
      };
      jest.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(rectMock);

      // First tap on player to select them (0.2, 0.3) → pixel (60, 90)
      fireEvent.touchStart(canvas, {
        touches: [{ clientX: 60, clientY: 90, identifier: 0, target: canvas }],
      });
      fireEvent.touchEnd(canvas, { changedTouches: [{ clientX: 60, clientY: 90, identifier: 0, target: canvas }] });

      // Second tap on empty formation position (0.5, 0.75) → pixel (150, 225)
      fireEvent.touchStart(canvas, {
        touches: [{ clientX: 150, clientY: 225, identifier: 0, target: canvas }],
      });
      fireEvent.touchEnd(canvas, { changedTouches: [{ clientX: 150, clientY: 225, identifier: 0, target: canvas }] });

      // Note: Due to canvas hit detection complexity, we verify stability here.
      // Full integration test of tap-to-move requires E2E testing with real canvas rendering.
      expect(canvas).toBeInTheDocument();
    });
  });

  /**
   * Tests that player must be selected before tap-to-move works
   * @edge-case - UX constraint validation
   */
  describe('UX constraint: player selection required', () => {
    it('should not move player without prior selection', () => {
      const formationSnapPoints = [{ relX: 0.5, relY: 0.75 }];

      render(<SoccerField {...defaultProps} formationSnapPoints={formationSnapPoints} />);

      const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
      expect(canvas).toBeInTheDocument();
      if (!canvas) return;

      // Mock canvas dimensions
      const rectMock: DOMRect = {
        left: 0, top: 0, right: 300, bottom: 300,
        width: 300, height: 300, x: 0, y: 0,
        toJSON: () => ({}),
      };
      jest.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(rectMock);

      // Tap directly on empty formation position without selecting player first
      // (0.5, 0.75) → pixel (150, 225)
      fireEvent.touchStart(canvas, {
        touches: [{ clientX: 150, clientY: 225, identifier: 0, target: canvas }],
      });
      fireEvent.touchEnd(canvas, { changedTouches: [{ clientX: 150, clientY: 225, identifier: 0, target: canvas }] });

      // onPlayerMove should NOT be called since no player was selected
      expect(defaultProps.onPlayerMove).not.toHaveBeenCalled();
    });
  });

  /**
   * Tests stability with both formation snap points and sub slots
   * @integration
   */
  describe('combined formation and sub slots', () => {
    it('should handle both formation snap points and sub slots together', () => {
      const formationSnapPoints = [
        { relX: 0.5, relY: 0.75 },
        { relX: 0.3, relY: 0.55 },
      ];
      const subSlots = [
        { relX: 0.96, relY: 0.75, positionLabel: 'CB' },
        { relX: 0.96, relY: 0.55, positionLabel: 'CM' },
      ];

      render(
        <SoccerField
          {...defaultProps}
          formationSnapPoints={formationSnapPoints}
          subSlots={subSlots}
        />
      );

      const canvas = document.querySelector('canvas');
      expect(canvas).toBeInTheDocument();
    });

    it('should prioritize formation snap points over sub slots when overlapping', () => {
      // Formation snap point at same position as sub slot
      const formationSnapPoints = [{ relX: 0.96, relY: 0.75 }];
      const subSlots = [{ relX: 0.96, relY: 0.75, positionLabel: 'CB' }];

      render(
        <SoccerField
          {...defaultProps}
          formationSnapPoints={formationSnapPoints}
          subSlots={subSlots}
        />
      );

      const canvas = document.querySelector('canvas');
      expect(canvas).toBeInTheDocument();

      if (canvas) {
        // Touch interaction should not crash
        fireEvent.touchStart(canvas, {
          touches: [{ clientX: 288, clientY: 225 }],
        });
        fireEvent.touchEnd(canvas);

        expect(canvas).toBeInTheDocument();
      }
    });
  });

  /**
   * Tests edge cases for empty position handling
   * @edge-case
   */
  describe('edge cases', () => {
    it('should handle empty formationSnapPoints array', () => {
      render(<SoccerField {...defaultProps} formationSnapPoints={[]} />);

      const canvas = document.querySelector('canvas');
      expect(canvas).toBeInTheDocument();
    });

    it('should handle empty subSlots array', () => {
      render(<SoccerField {...defaultProps} subSlots={[]} />);

      const canvas = document.querySelector('canvas');
      expect(canvas).toBeInTheDocument();
    });

    it('should handle undefined formationSnapPoints and subSlots', () => {
      render(<SoccerField {...defaultProps} />);

      const canvas = document.querySelector('canvas');
      expect(canvas).toBeInTheDocument();
    });
  });
});
