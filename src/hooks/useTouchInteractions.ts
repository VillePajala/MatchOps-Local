/**
 * useTouchInteractions Hook
 *
 * **Purpose**: Handle touch/mobile drag-and-drop interactions for player placement
 *
 * **Responsibilities**:
 * - Touch drag state management (selected player tracking)
 * - Player selection via tap (toggle selection)
 * - Touch-based drop handling with validation
 * - Drag cancellation
 * - Background deselection (tap outside player bar)
 *
 * **Usage Context**:
 * Primarily used by useFieldCoordination for mobile/touch player placement.
 * Separates touch interaction logic from field coordination logic.
 *
 * @module useTouchInteractions
 * @category Hooks
 */

import { useState, useCallback } from 'react';
import type { TFunction } from 'i18next';
import type { Player } from '@/types';
import logger from '@/utils/logger';

/**
 * Parameters for useTouchInteractions hook
 *
 * @property {function} onDrop - Callback when player is dropped on field
 *   Called with (playerId, relX, relY). Should handle actual placement logic and validation.
 * @property {function} [onCancel] - Optional callback when drag is cancelled
 * @property {function} showToast - Toast notification function for error messages
 * @property {TFunction} t - i18next translation function for error messages
 */
export interface UseTouchInteractionsParams {
  onDrop: (playerId: string, relX: number, relY: number) => void;
  onCancel?: () => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  t: TFunction;
}

/**
 * Return type for useTouchInteractions hook
 *
 * @property {Player | null} selectedPlayer - Currently selected/dragging player (null if none)
 * @property {boolean} isDragging - Whether a drag operation is in progress
 * @property {function} handleDragStart - Start drag from player bar (desktop drag)
 * @property {function} handleTap - Handle tap on player in bar (mobile tap-to-select)
 * @property {function} handleDrop - Handle drop on field (place player)
 * @property {function} handleCancel - Cancel current drag operation
 * @property {function} handleDeselect - Deselect player (tap on bar background)
 */
export interface UseTouchInteractionsReturn {
  // State
  selectedPlayer: Player | null;
  isDragging: boolean;

  // Handlers
  handleDragStart: (playerInfo: Player) => void;
  handleTap: (playerInfo: Player | null) => void;
  handleDrop: (relX: number, relY: number) => void;
  handleCancel: () => void;
  handleDeselect: () => void;
}

/**
 * Custom hook for managing touch/mobile drag-and-drop interactions
 *
 * Handles the state and logic for selecting players via touch/tap and
 * placing them on the field. Provides clear separation between touch
 * interaction logic and field coordination logic.
 *
 * **Touch Interaction Flow**:
 * 1. User taps/drags player in player bar
 * 2. Player becomes selected (stored in state)
 * 3. User taps field location or drags to position
 * 4. Drop handler validates and calls onDrop callback
 * 5. Selection state clears
 *
 * @example
 * ```tsx
 * const touchInteractions = useTouchInteractions({
 *   onDrop: handleDropOnField, // Callback handles validation
 *   showToast,
 *   t,
 * });
 *
 * // In component
 * <PlayerBar
 *   onDragStart={touchInteractions.handleDragStart}
 *   onTap={touchInteractions.handleTap}
 *   selectedPlayer={touchInteractions.selectedPlayer}
 * />
 * ```
 */
export function useTouchInteractions({
  onDrop,
  onCancel,
  showToast,
  t,
}: UseTouchInteractionsParams): UseTouchInteractionsReturn {
  // --- State ---
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  // Derived state
  const isDragging = selectedPlayer !== null;

  // --- Handlers ---

  /**
   * Handle drag start from player bar (desktop drag-and-drop)
   *
   * @param playerInfo - Player being dragged
   */
  const handleDragStart = useCallback((playerInfo: Player) => {
    setSelectedPlayer(playerInfo);
    logger.log('[useTouchInteractions] Drag start:', playerInfo.name);
  }, []);

  /**
   * Handle tap on player in bar (mobile tap-to-select)
   *
   * Toggle behavior: tapping the same player deselects, tapping different player selects new one.
   *
   * @param playerInfo - Player tapped, or null to deselect
   */
  const handleTap = useCallback((playerInfo: Player | null) => {
    setSelectedPlayer((currentSelected) => {
      // If tapping the already-selected player, deselect
      if (currentSelected?.id === playerInfo?.id) {
        logger.log('[useTouchInteractions] Tap deselect:', playerInfo?.name);
        return null;
      }
      // Otherwise, select the new player
      logger.log('[useTouchInteractions] Tap select:', playerInfo?.name || 'none');
      return playerInfo;
    });
  }, []);

  /**
   * Handle drop on field (place player at position)
   *
   * Validates that a player is selected, then calls onDrop callback.
   * Clears selection state after successful drop.
   *
   * @param relX - Relative X position on field (0-1)
   * @param relY - Relative Y position on field (0-1)
   */
  const handleDrop = useCallback(
    (relX: number, relY: number) => {
      if (!selectedPlayer) {
        logger.warn('[useTouchInteractions] Drop called with no selected player');
        return;
      }

      try {
        logger.log('[useTouchInteractions] Drop player:', {
          name: selectedPlayer.name,
          relX,
          relY,
        });
        onDrop(selectedPlayer.id, relX, relY);
        setSelectedPlayer(null); // Clear selection after successful drop
      } catch (error) {
        logger.error('[useTouchInteractions] Drop failed:', error);
        showToast(
          t('errors.playerDropFailed', 'Failed to place player on field'),
          'error'
        );
        // Keep player selected so user can try again
      }
    },
    [selectedPlayer, onDrop, showToast, t]
  );

  /**
   * Handle drag cancellation
   *
   * Clears selected player and optionally calls onCancel callback.
   */
  const handleCancel = useCallback(() => {
    logger.log('[useTouchInteractions] Drag cancelled');
    setSelectedPlayer(null);
    onCancel?.();
  }, [onCancel]);

  /**
   * Handle deselect (e.g., tap on player bar background)
   *
   * Clears any selected player.
   */
  const handleDeselect = useCallback(() => {
    setSelectedPlayer((currentSelected) => {
      if (currentSelected) {
        logger.log('[useTouchInteractions] Deselecting:', currentSelected.name);
      }
      return null;
    });
  }, []);

  return {
    // State
    selectedPlayer,
    isDragging,

    // Handlers
    handleDragStart,
    handleTap,
    handleDrop,
    handleCancel,
    handleDeselect,
  };
}
