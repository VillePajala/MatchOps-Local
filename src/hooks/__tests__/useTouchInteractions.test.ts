/**
 * Unit Tests for useTouchInteractions Hook
 *
 * Tests touch/mobile interaction logic for player placement including
 * selection, deselection, drop, and cancellation behaviors.
 *
 * @critical - Core mobile user experience
 */

// Mock logger before any imports
jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import { renderHook, act } from '@testing-library/react';
import { useTouchInteractions } from '../useTouchInteractions';
import type { UseTouchInteractionsParams } from '../useTouchInteractions';
import type { TFunction } from 'i18next';
import { TestFixtures } from '../../../tests/fixtures';
import logger from '@/utils/logger';

describe('useTouchInteractions', () => {
  // Default mock parameters
  const mockOnDrop = jest.fn();
  const mockOnCancel = jest.fn();
  const mockShowToast = jest.fn();
  const mockT = jest.fn((key: string, fallback: string) => fallback) as unknown as TFunction;

  const defaultParams: UseTouchInteractionsParams = {
    onDrop: mockOnDrop,
    onCancel: mockOnCancel,
    showToast: mockShowToast,
    t: mockT,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initial State', () => {
    /**
     * Tests initial hook state
     * @critical - Core hook initialization
     */
    it('should initialize with no selected player', () => {
      const { result } = renderHook(() => useTouchInteractions(defaultParams));

      expect(result.current.selectedPlayer).toBeNull();
      expect(result.current.isDragging).toBe(false);
    });

    /**
     * Tests that all handlers are provided
     */
    it('should provide all required handlers', () => {
      const { result } = renderHook(() => useTouchInteractions(defaultParams));

      expect(result.current.handleDragStart).toBeDefined();
      expect(result.current.handleTap).toBeDefined();
      expect(result.current.handleDrop).toBeDefined();
      expect(result.current.handleCancel).toBeDefined();
      expect(result.current.handleDeselect).toBeDefined();
    });
  });

  describe('Drag Start Behavior', () => {
    /**
     * Tests drag start from player bar
     * @critical - Desktop drag-and-drop initiation
     */
    it('should set selected player on drag start', () => {
      const { result } = renderHook(() => useTouchInteractions(defaultParams));
      const goalkeeper = TestFixtures.players.goalkeeper();

      act(() => {
        result.current.handleDragStart(goalkeeper);
      });

      expect(result.current.selectedPlayer).toEqual(goalkeeper);
      expect(result.current.isDragging).toBe(true);
      expect(logger.debug).toHaveBeenCalledWith(
        '[useTouchInteractions] Drag start:',
        goalkeeper.name
      );
    });

    /**
     * Tests multiple drag starts replace selection
     */
    it('should replace selected player on subsequent drag start', () => {
      const { result } = renderHook(() => useTouchInteractions(defaultParams));
      const goalkeeper = TestFixtures.players.goalkeeper();
      const defender = TestFixtures.players.defender();

      act(() => {
        result.current.handleDragStart(goalkeeper);
      });
      expect(result.current.selectedPlayer).toEqual(goalkeeper);

      act(() => {
        result.current.handleDragStart(defender);
      });
      expect(result.current.selectedPlayer).toEqual(defender);
    });
  });

  describe('Tap Behavior', () => {
    /**
     * Tests tap-to-select on mobile
     * @critical - Mobile player selection
     */
    it('should select player on tap', () => {
      const { result } = renderHook(() => useTouchInteractions(defaultParams));
      const goalkeeper = TestFixtures.players.goalkeeper();

      act(() => {
        result.current.handleTap(goalkeeper);
      });

      expect(result.current.selectedPlayer).toEqual(goalkeeper);
      expect(result.current.isDragging).toBe(true);
    });

    /**
     * Tests tap-to-deselect (toggle behavior)
     * @critical - Mobile deselection
     */
    it('should deselect player when tapping same player again', () => {
      const { result } = renderHook(() => useTouchInteractions(defaultParams));
      const goalkeeper = TestFixtures.players.goalkeeper();

      // First tap - select
      act(() => {
        result.current.handleTap(goalkeeper);
      });
      expect(result.current.selectedPlayer).toEqual(goalkeeper);

      // Second tap - deselect
      act(() => {
        result.current.handleTap(goalkeeper);
      });
      expect(result.current.selectedPlayer).toBeNull();
      expect(result.current.isDragging).toBe(false);
    });

    /**
     * Tests switching selection between players
     */
    it('should switch selection when tapping different player', () => {
      const { result } = renderHook(() => useTouchInteractions(defaultParams));
      const goalkeeper = TestFixtures.players.goalkeeper();
      const defender = TestFixtures.players.defender();

      act(() => {
        result.current.handleTap(goalkeeper);
      });
      expect(result.current.selectedPlayer).toEqual(goalkeeper);

      act(() => {
        result.current.handleTap(defender);
      });
      expect(result.current.selectedPlayer).toEqual(defender);
    });

    /**
     * Tests tap with null (deselect)
     */
    it('should handle tap with null player', () => {
      const { result } = renderHook(() => useTouchInteractions(defaultParams));
      const goalkeeper = TestFixtures.players.goalkeeper();

      act(() => {
        result.current.handleTap(goalkeeper);
      });
      expect(result.current.selectedPlayer).toEqual(goalkeeper);

      act(() => {
        result.current.handleTap(null);
      });
      expect(result.current.selectedPlayer).toBeNull();
    });
  });

  describe('Drop Behavior', () => {
    /**
     * Tests successful drop on field
     * @critical - Player placement
     */
    it('should call onDrop and clear selection on successful drop', () => {
      const { result } = renderHook(() => useTouchInteractions(defaultParams));
      const goalkeeper = TestFixtures.players.goalkeeper();

      act(() => {
        result.current.handleDragStart(goalkeeper);
      });

      act(() => {
        result.current.handleDrop(0.5, 0.9);
      });

      expect(mockOnDrop).toHaveBeenCalledWith(goalkeeper.id, 0.5, 0.9);
      expect(result.current.selectedPlayer).toBeNull();
      expect(result.current.isDragging).toBe(false);
    });

    /**
     * Tests drop with no selected player
     * @edge-case - Defensive programming
     */
    it('should handle drop with no selected player gracefully', () => {
      const { result } = renderHook(() => useTouchInteractions(defaultParams));

      act(() => {
        result.current.handleDrop(0.5, 0.5);
      });

      expect(mockOnDrop).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        '[useTouchInteractions] Drop called with no selected player'
      );
    });

    /**
     * Tests error handling during drop
     * @critical - Error resilience
     */
    it('should show error toast and keep player selected on drop failure', () => {
      const mockOnDropError = jest.fn(() => {
        throw new Error('Drop failed');
      });

      const { result } = renderHook(() =>
        useTouchInteractions({
          ...defaultParams,
          onDrop: mockOnDropError,
        })
      );
      const goalkeeper = TestFixtures.players.goalkeeper();

      act(() => {
        result.current.handleDragStart(goalkeeper);
      });

      act(() => {
        result.current.handleDrop(0.5, 0.9);
      });

      expect(mockShowToast).toHaveBeenCalledWith(
        'Failed to place player on field',
        'error'
      );
      // Player should remain selected so user can try again
      expect(result.current.selectedPlayer).toEqual(goalkeeper);
      expect(logger.error).toHaveBeenCalled();
    });

    /**
     * Tests drop with various field positions
     */
    it('should handle drop at various field positions', () => {
      const { result } = renderHook(() => useTouchInteractions(defaultParams));
      const goalkeeper = TestFixtures.players.goalkeeper();

      const positions = [
        { relX: 0, relY: 0 }, // Top-left
        { relX: 1, relY: 1 }, // Bottom-right
        { relX: 0.5, relY: 0.5 }, // Center
        { relX: 0.25, relY: 0.75 }, // Mid-left lower
      ];

      positions.forEach((pos) => {
        mockOnDrop.mockClear();

        act(() => {
          result.current.handleDragStart(goalkeeper);
        });

        act(() => {
          result.current.handleDrop(pos.relX, pos.relY);
        });

        expect(mockOnDrop).toHaveBeenCalledWith(goalkeeper.id, pos.relX, pos.relY);
      });
    });
  });

  describe('Cancel Behavior', () => {
    /**
     * Tests drag cancellation
     * @critical - User experience
     */
    it('should clear selection and call onCancel when cancelling', () => {
      const { result } = renderHook(() => useTouchInteractions(defaultParams));
      const goalkeeper = TestFixtures.players.goalkeeper();

      act(() => {
        result.current.handleDragStart(goalkeeper);
      });
      expect(result.current.selectedPlayer).toEqual(goalkeeper);

      act(() => {
        result.current.handleCancel();
      });

      expect(result.current.selectedPlayer).toBeNull();
      expect(result.current.isDragging).toBe(false);
      expect(mockOnCancel).toHaveBeenCalled();
    });

    /**
     * Tests cancel without onCancel callback
     */
    it('should work without onCancel callback', () => {
      const { result } = renderHook(() =>
        useTouchInteractions({
          ...defaultParams,
          onCancel: undefined,
        })
      );
      const goalkeeper = TestFixtures.players.goalkeeper();

      act(() => {
        result.current.handleDragStart(goalkeeper);
      });

      act(() => {
        result.current.handleCancel();
      });

      expect(result.current.selectedPlayer).toBeNull();
      // Should not throw error
    });

    /**
     * Tests cancel with no selected player
     */
    it('should handle cancel with no selected player', () => {
      const { result } = renderHook(() => useTouchInteractions(defaultParams));

      act(() => {
        result.current.handleCancel();
      });

      expect(result.current.selectedPlayer).toBeNull();
      expect(mockOnCancel).toHaveBeenCalled();
    });
  });

  describe('Deselect Behavior', () => {
    /**
     * Tests deselection (e.g., tap on background)
     * @critical - User experience
     */
    it('should clear selection on deselect', () => {
      const { result } = renderHook(() => useTouchInteractions(defaultParams));
      const goalkeeper = TestFixtures.players.goalkeeper();

      act(() => {
        result.current.handleDragStart(goalkeeper);
      });
      expect(result.current.selectedPlayer).toEqual(goalkeeper);

      act(() => {
        result.current.handleDeselect();
      });

      expect(result.current.selectedPlayer).toBeNull();
      expect(result.current.isDragging).toBe(false);
    });

    /**
     * Tests deselect with no selected player
     */
    it('should handle deselect with no selected player', () => {
      const { result } = renderHook(() => useTouchInteractions(defaultParams));

      act(() => {
        result.current.handleDeselect();
      });

      expect(result.current.selectedPlayer).toBeNull();
      // Should not log anything if no player was selected
    });
  });

  describe('Handler Stability', () => {
    /**
     * Tests that handlers maintain referential equality
     * @performance - Prevent unnecessary re-renders
     */
    it('should maintain stable handler references', () => {
      const { result, rerender } = renderHook(() =>
        useTouchInteractions(defaultParams)
      );

      const initialHandlers = {
        handleDragStart: result.current.handleDragStart,
        handleTap: result.current.handleTap,
        handleDrop: result.current.handleDrop,
        handleCancel: result.current.handleCancel,
        handleDeselect: result.current.handleDeselect,
      };

      // Trigger re-render
      rerender();

      expect(result.current.handleDragStart).toBe(initialHandlers.handleDragStart);
      expect(result.current.handleTap).toBe(initialHandlers.handleTap);
      expect(result.current.handleDrop).toBe(initialHandlers.handleDrop);
      expect(result.current.handleCancel).toBe(initialHandlers.handleCancel);
      expect(result.current.handleDeselect).toBe(initialHandlers.handleDeselect);
    });

    /**
     * Tests that handleDrop updates when dependencies change
     */
    it('should update handleDrop when dependencies change', () => {
      const { result, rerender } = renderHook(
        (props) => useTouchInteractions(props),
        { initialProps: defaultParams }
      );

      const initialHandleDrop = result.current.handleDrop;

      // Change onDrop callback
      const newOnDrop = jest.fn();
      rerender({
        ...defaultParams,
        onDrop: newOnDrop,
      });

      expect(result.current.handleDrop).not.toBe(initialHandleDrop);
    });
  });

  describe('Integration Scenarios', () => {
    /**
     * Tests complete drag-drop workflow
     * @integration - End-to-end flow
     */
    it('should handle complete drag-drop workflow', () => {
      const { result } = renderHook(() => useTouchInteractions(defaultParams));
      const goalkeeper = TestFixtures.players.goalkeeper();

      // Start drag
      act(() => {
        result.current.handleDragStart(goalkeeper);
      });
      expect(result.current.isDragging).toBe(true);

      // Drop on field
      act(() => {
        result.current.handleDrop(0.5, 0.9);
      });
      expect(mockOnDrop).toHaveBeenCalledWith(goalkeeper.id, 0.5, 0.9);
      expect(result.current.isDragging).toBe(false);
    });

    /**
     * Tests complete tap-select-drop workflow
     * @integration - Mobile workflow
     */
    it('should handle complete tap-drop workflow', () => {
      const { result } = renderHook(() => useTouchInteractions(defaultParams));
      const defender = TestFixtures.players.defender();

      // Tap to select
      act(() => {
        result.current.handleTap(defender);
      });
      expect(result.current.selectedPlayer).toEqual(defender);

      // Drop on field
      act(() => {
        result.current.handleDrop(0.3, 0.5);
      });
      expect(mockOnDrop).toHaveBeenCalledWith(defender.id, 0.3, 0.5);
      expect(result.current.selectedPlayer).toBeNull();
    });

    /**
     * Tests drag-cancel workflow
     * @integration - Cancel flow
     */
    it('should handle drag-cancel workflow', () => {
      const { result } = renderHook(() => useTouchInteractions(defaultParams));
      const midfielder = TestFixtures.players.midfielder();

      act(() => {
        result.current.handleDragStart(midfielder);
      });
      expect(result.current.isDragging).toBe(true);

      act(() => {
        result.current.handleCancel();
      });
      expect(result.current.isDragging).toBe(false);
      expect(mockOnCancel).toHaveBeenCalled();
    });
  });
});
