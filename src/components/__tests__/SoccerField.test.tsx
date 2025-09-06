/**
 * @jest-environment jsdom
 */

import { render, fireEvent } from '../../../tests/utils/test-utils';
import SoccerField from '../SoccerField';
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
});