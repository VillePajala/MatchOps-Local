/**
 * useFieldCoordination Hook
 *
 * **Purpose**: Soccer field interactions and tactical board management
 *
 * **Responsibilities**:
 * - Field state management (players, opponents, drawings)
 * - Player drag/drop interactions
 * - Opponent management
 * - Drawing mode and handlers
 * - Tactical board (separate history stack)
 * - Field reset logic
 * - History/undo for both field and tactical board
 *
 * **Dependencies**:
 * - saveStateToHistory (from parent)
 * - saveTacticalStateToHistory (from parent)
 * - availablePlayers (from parent)
 * - selectedPlayerIds (from parent)
 *
 * @module useFieldCoordination
 * @category HomePage Hooks
 */

import { useState, useCallback } from 'react';
import type { Dispatch } from 'react';
import type { TFunction } from 'i18next';
import { useFieldInteractions } from '@/hooks/useFieldInteractions';
import { useGameState } from '@/hooks/useGameState';
import type { UseGameStateReturn } from '@/hooks/useGameState';
import { useTacticalBoard } from '@/hooks/useTacticalBoard';
import type { TacticalState } from '@/hooks/useTacticalHistory';
import type { Player, AppState, TacticalDisc, Point } from '@/types';
import logger from '@/utils/logger';
import { calculateFormationPositions } from '@/utils/formations';

/**
 * Parameters for useFieldCoordination hook
 */
export interface UseFieldCoordinationParams {
  initialState: AppState;
  saveStateToHistory: (newState: Partial<AppState>) => void;
  saveTacticalStateToHistory: (newState: Partial<TacticalState>) => void;
  availablePlayers: Player[];
  selectedPlayerIds: string[];
  canUndo: boolean;
  canRedo: boolean;
  tacticalHistory: {
    undo: () => TacticalState | null;
    redo: () => TacticalState | null;
    canUndo: boolean;
    canRedo: boolean;
  };
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  t: TFunction;
}

/**
 * Return type for useFieldCoordination hook
 */
export interface UseFieldCoordinationReturn {
  // Field state
  playersOnField: Player[];
  opponents: Array<{ id: string; relX: number; relY: number }>;
  drawings: Array<Array<{ relX: number; relY: number }>>;
  draggingPlayerFromBarInfo: Player | null;
  isDrawingEnabled: boolean;
  isTacticsBoardView: boolean;
  tacticalDiscs: TacticalDisc[];
  tacticalDrawings: Point[][];
  tacticalBallPosition: Point | null;
  showResetFieldConfirm: boolean;

  // Player interaction handlers
  handlePlayerMove: (playerId: string, relX: number, relY: number) => void;
  handlePlayerMoveEnd: () => void;
  handlePlayerRemove: (playerId: string) => void;
  handleDropOnField: (playerId: string, relX: number, relY: number) => void;
  handlePlayerDragStartFromBar: (playerInfo: Player) => void;
  handlePlayerTapInBar: (playerInfo: Player | null) => void;
  handlePlayerDropViaTouch: (relX: number, relY: number) => void;
  handlePlayerDragCancelViaTouch: () => void;
  handleDeselectPlayer: () => void;
  handlePlaceAllPlayers: () => void;

  // Opponent handlers (from useGameState)
  handleAddOpponent: () => void;
  handleOpponentMove: (opponentId: string, relX: number, relY: number) => void;
  handleOpponentMoveEnd: () => void;
  handleOpponentRemove: (opponentId: string) => void;

  // Drawing handlers (from useGameState)
  handleDrawingStart: (point: { relX: number; relY: number }) => void;
  handleDrawingAddPoint: (point: { relX: number; relY: number }) => void;
  handleDrawingEnd: () => void;
  handleClearDrawings: () => void;
  handleClearDrawingsForView: () => void;
  handleToggleDrawingMode: () => void;

  // Tactical board handlers (from useTacticalBoard)
  handleToggleTacticsBoard: () => void;
  handleAddTacticalDisc: (type: 'home' | 'opponent') => void;
  handleTacticalDiscMove: (discId: string, relX: number, relY: number) => void;
  handleTacticalDiscRemove: (discId: string) => void;
  handleToggleTacticalDiscType: (discId: string) => void;
  handleTacticalBallMove: (point: { relX: number; relY: number }) => void;
  handleTacticalDrawingStart: (point: { relX: number; relY: number }) => void;
  handleTacticalDrawingAddPoint: (point: { relX: number; relY: number }) => void;
  handleTacticalDrawingEnd: () => void;
  clearTacticalElements: () => void;

  // History/undo handlers (tactical board only - field undo/redo handled by orchestrator)
  handleTacticalUndo: () => void;
  handleTacticalRedo: () => void;
  canUndoField: boolean;
  canRedoField: boolean;

  // Reset handlers
  handleResetFieldClick: () => void;
  handleResetFieldConfirmed: () => void;
  setShowResetFieldConfirm: (value: boolean) => void;

  // Internal state setters (needed by parent for special cases)
  setPlayersOnField: Dispatch<React.SetStateAction<Player[]>>;
  setOpponents: Dispatch<React.SetStateAction<Array<{ id: string; relX: number; relY: number }>>>;
  setDrawings: Dispatch<React.SetStateAction<Array<Array<{ relX: number; relY: number }>>>>;
  setTacticalDiscs: Dispatch<React.SetStateAction<TacticalDisc[]>>;
  setTacticalDrawings: Dispatch<React.SetStateAction<Point[][]>>;
  setTacticalBallPosition: Dispatch<React.SetStateAction<Point | null>>;

  // History restoration (needed by parent orchestrator)
  applyFieldHistoryState: (state: AppState) => void;
}

/**
 * Custom hook for managing soccer field interactions and tactical board
 *
 * @example
 * ```tsx
 * const fieldCoordination = useFieldCoordination({
 *   initialState: appState,
 *   saveStateToHistory,
 *   saveTacticalStateToHistory,
 *   availablePlayers,
 *   selectedPlayerIds,
 *   canUndo,
 *   canRedo,
 *   tacticalHistory,
 *   showToast,
 *   t,
 * });
 *
 * // Use field state
 * const { playersOnField, isTacticsBoardView } = fieldCoordination;
 *
 * // Handle player interactions
 * fieldCoordination.handlePlayerMove(playerId, relX, relY);
 * ```
 */
export function useFieldCoordination({
  initialState,
  saveStateToHistory,
  saveTacticalStateToHistory,
  availablePlayers,
  selectedPlayerIds,
  canUndo,
  canRedo,
  tacticalHistory,
  showToast,
  t,
}: UseFieldCoordinationParams): UseFieldCoordinationReturn {

  // --- State for drag from player bar ---
  const [draggingPlayerFromBarInfo, setDraggingPlayerFromBarInfo] = useState<Player | null>(null);

  // --- State for reset field confirmation modal ---
  const [showResetFieldConfirm, setShowResetFieldConfirm] = useState<boolean>(false);

  // --- Hook: useGameState (field state and basic handlers) ---
  const {
    playersOnField,
    opponents,
    drawings,
    setPlayersOnField,
    setOpponents,
    setDrawings,
    handlePlayerDrop,
    handleDrawingStart,
    handleDrawingAddPoint,
    handleDrawingEnd,
    handleClearDrawings,
    handleAddOpponent,
    handleOpponentMove,
    handleOpponentMoveEnd,
    handleOpponentRemove,
  }: UseGameStateReturn = useGameState({
    initialState,
    // eslint-disable-next-line custom-hooks/require-memoized-function-props -- Already memoized in parent
    saveStateToHistory,
  });

  // --- Hook: useFieldInteractions (drawing mode toggle) ---
  const { isDrawingEnabled, toggleDrawingMode: handleToggleDrawingMode } = useFieldInteractions({
    onPersistError: () => {
      showToast(
        t('errors.failedToSaveDrawingMode', 'Failed to save drawing mode setting. Changes may not persist.'),
        'info'
      );
    }
  });

  // --- Hook: useTacticalBoard (tactical board state and handlers) ---
  const {
    isTacticsBoardView,
    tacticalDiscs,
    setTacticalDiscs,
    tacticalDrawings,
    setTacticalDrawings,
    tacticalBallPosition,
    setTacticalBallPosition,
    handleToggleTacticsBoard,
    handleAddTacticalDisc,
    handleTacticalDiscMove,
    handleTacticalDiscRemove,
    handleToggleTacticalDiscType,
    handleTacticalBallMove,
    handleTacticalDrawingStart,
    handleTacticalDrawingAddPoint,
    handleTacticalDrawingEnd,
    clearTacticalElements,
  } = useTacticalBoard({
    initialDiscs: initialState.tacticalDiscs,
    initialDrawings: initialState.tacticalDrawings,
    initialBallPosition: initialState.tacticalBallPosition,
    // eslint-disable-next-line custom-hooks/require-memoized-function-props -- Already memoized in parent
    saveStateToHistory: saveTacticalStateToHistory,
  });

  // --- Player Movement Handlers ---

  /**
   * Handle player drop from player bar onto field
   */
  const handleDropOnField = useCallback((playerId: string, relX: number, relY: number) => {
    const droppedPlayer = availablePlayers.find(p => p.id === playerId);
    if (droppedPlayer) {
      handlePlayerDrop(droppedPlayer, { relX, relY });
    } else {
      logger.error(`Dropped player with ID ${playerId} not found in availablePlayers.`);
    }
  }, [availablePlayers, handlePlayerDrop]);

  /**
   * Handle player movement on field (dragging)
   */
  const handlePlayerMove = useCallback((playerId: string, relX: number, relY: number) => {
    setPlayersOnField(prevPlayers =>
      prevPlayers.map(p =>
        p.id === playerId ? { ...p, relX, relY } : p
      )
    );
  }, [setPlayersOnField]);

  /**
   * Handle player movement end (save to history)
   */
  const handlePlayerMoveEnd = useCallback(() => {
    // Use functional setter to get current state without dependency
    setPlayersOnField(currentPlayers => {
      saveStateToHistory({ playersOnField: currentPlayers });
      return currentPlayers; // No change to state
    });
  }, [setPlayersOnField, saveStateToHistory]);

  /**
   * Handle player removal from field
   */
  const handlePlayerRemove = useCallback((playerId: string) => {
    logger.log(`Removing player ${playerId} from field`);
    setPlayersOnField(prevPlayers => {
      const updatedPlayersOnField = prevPlayers.filter(p => p.id !== playerId);
      saveStateToHistory({ playersOnField: updatedPlayersOnField });
      return updatedPlayersOnField;
    });
  }, [setPlayersOnField, saveStateToHistory]);

  // --- Touch/Drag from Bar Handlers ---

  /**
   * Handle player drag start from player bar
   */
  const handlePlayerDragStartFromBar = useCallback((playerInfo: Player) => {
    setDraggingPlayerFromBarInfo(playerInfo);
    logger.log("Setting draggingPlayerFromBarInfo (Drag Start):", playerInfo);
  }, []);

  /**
   * Handle player tap in player bar (touch devices)
   */
  const handlePlayerTapInBar = useCallback((playerInfo: Player | null) => {
    setDraggingPlayerFromBarInfo(currentDragging => {
      if (currentDragging?.id === playerInfo?.id) {
        logger.log("Tapped already selected player, deselecting:", playerInfo?.id);
        return null;
      } else {
        logger.log("Setting draggingPlayerFromBarInfo (Tap):", playerInfo);
        return playerInfo;
      }
    });
  }, []);

  /**
   * Handle player drop via touch (place on field)
   */
  const handlePlayerDropViaTouch = useCallback((relX: number, relY: number) => {
    setDraggingPlayerFromBarInfo(currentDragging => {
      if (currentDragging) {
        try {
          logger.log("Player Drop Via Touch (field):", { id: currentDragging.id, relX, relY });
          handleDropOnField(currentDragging.id, relX, relY);
        } catch (error) {
          logger.error('Failed to drop player on field:', error);
          showToast(t('errors.playerDropFailed', 'Failed to place player on field'), 'error');
        }
      }
      return null; // Always clear dragging state after drop
    });
  }, [handleDropOnField, showToast, t]);

  /**
   * Handle player drag cancel via touch
   */
  const handlePlayerDragCancelViaTouch = useCallback(() => {
    setDraggingPlayerFromBarInfo(null);
  }, []);

  /**
   * Handle deselect player (click on player bar background)
   */
  const handleDeselectPlayer = useCallback(() => {
    setDraggingPlayerFromBarInfo(currentDragging => {
      if (currentDragging) {
        logger.log("Deselecting player by clicking bar background.");
      }
      return null;
    });
  }, []);

  // --- Field Reset Handlers ---

  /**
   * Handle reset field click (show confirmation)
   */
  const handleResetFieldClick = useCallback(() => {
    setShowResetFieldConfirm(true);
  }, []);

  /**
   * Handle reset field confirmed
   */
  const handleResetFieldConfirmed = useCallback(() => {
    if (isTacticsBoardView) {
      clearTacticalElements();
    } else {
      setPlayersOnField([]);
      setOpponents([]);
      setDrawings([]);
      saveStateToHistory({ playersOnField: [], opponents: [], drawings: [] });
    }
    setShowResetFieldConfirm(false);
  }, [isTacticsBoardView, setPlayersOnField, setOpponents, setDrawings, saveStateToHistory, clearTacticalElements]);

  /**
   * Handle clear drawings for current view (field or tactical)
   */
  const handleClearDrawingsForView = useCallback(() => {
    if (isTacticsBoardView) {
      setTacticalDrawings([]);
      saveTacticalStateToHistory({ tacticalDrawings: [] });
    } else {
      handleClearDrawings();
    }
  }, [isTacticsBoardView, setTacticalDrawings, saveTacticalStateToHistory, handleClearDrawings]);

  // --- History State Restoration Handlers ---

  /**
   * Apply field history state (for undo/redo)
   *
   * Restores only field-related state (players, opponents, drawings, tactical elements).
   * Does NOT restore game session state - that's handled by the parent orchestrator.
   */
  const applyFieldHistoryState = useCallback((state: AppState) => {
    setPlayersOnField(state.playersOnField);
    setOpponents(state.opponents);
    setDrawings(state.drawings);
    setTacticalDiscs(state.tacticalDiscs || []);
    setTacticalDrawings(state.tacticalDrawings || []);
    setTacticalBallPosition(state.tacticalBallPosition || null);
  }, [
    setPlayersOnField,
    setOpponents,
    setDrawings,
    setTacticalDiscs,
    setTacticalDrawings,
    setTacticalBallPosition,
  ]);


  /**
   * Apply tactical history state (for tactical board undo/redo)
   */
  const applyTacticalHistoryState = useCallback((state: TacticalState) => {
    setTacticalDiscs(state.tacticalDiscs || []);
    setTacticalDrawings(state.tacticalDrawings || []);
    setTacticalBallPosition(state.tacticalBallPosition || null);
  }, [setTacticalDiscs, setTacticalDrawings, setTacticalBallPosition]);

  /**
   * Handle undo for tactical board
   */
  const handleTacticalUndo = useCallback(() => {
    const prevState = tacticalHistory.undo();
    if (prevState) {
      logger.log('[TacticalHistory] undo -> state', {
        drawingsLen: (prevState.tacticalDrawings || []).length,
      });
      applyTacticalHistoryState(prevState);
    } else {
      logger.log('Cannot undo: at beginning of tactical history');
    }
  }, [tacticalHistory, applyTacticalHistoryState]);

  /**
   * Handle redo for tactical board
   */
  const handleTacticalRedo = useCallback(() => {
    const nextState = tacticalHistory.redo();
    if (nextState) {
      logger.log('[TacticalHistory] redo -> state', {
        drawingsLen: (nextState.tacticalDrawings || []).length,
      });
      applyTacticalHistoryState(nextState);
    } else {
      logger.log('Cannot redo: at end of tactical history');
    }
  }, [tacticalHistory, applyTacticalHistoryState]);

  // --- Place All Players Handler (Formation Logic) ---

  /**
   * Place all selected players on the field in formation
   */
  const handlePlaceAllPlayers = useCallback(() => {
    const selectedButNotOnField = selectedPlayerIds.filter((id: string) =>
      !playersOnField.some(fieldPlayer => fieldPlayer.id === id)
    );

    if (selectedButNotOnField.length === 0) {
      logger.log('All selected players are already on the field');
      return;
    }

    const playersToPlace = selectedButNotOnField
      .map(id => availablePlayers.find(p => p.id === id))
      .filter((p): p is Player => p !== undefined);

    logger.log(`Placing ${playersToPlace.length} players on the field...`);

    const newFieldPlayers: Player[] = [...playersOnField];

    // Find and place goalie first
    const goalieIndex = playersToPlace.findIndex(p => p.isGoalie);
    let goalie: Player | null = null;

    if (goalieIndex !== -1) {
      goalie = playersToPlace.splice(goalieIndex, 1)[0];
    }

    if (goalie) {
      newFieldPlayers.push({
        ...goalie,
        relX: 0.5,
        relY: 0.95
      });
    }

    // Calculate formation positions using utility function
    const remainingCount = playersToPlace.length;
    const positions = calculateFormationPositions(remainingCount);

    // Place players in positions
    playersToPlace.forEach((player, index) => {
      if (index < positions.length) {
        newFieldPlayers.push({
          ...player,
          relX: positions[index].relX,
          relY: positions[index].relY
        });
      }
    });

    setPlayersOnField(newFieldPlayers);
    saveStateToHistory({ playersOnField: newFieldPlayers });

    logger.log(`Successfully placed ${playersToPlace.length} players on the field`);
  }, [
    playersOnField,
    selectedPlayerIds,
    availablePlayers,
    setPlayersOnField,
    saveStateToHistory,
  ]);

  // --- Return all state and handlers ---
  return {
    // Field state
    playersOnField,
    opponents,
    drawings,
    draggingPlayerFromBarInfo,
    isDrawingEnabled,
    isTacticsBoardView,
    tacticalDiscs,
    tacticalDrawings,
    tacticalBallPosition,
    showResetFieldConfirm,

    // Player interaction handlers
    handlePlayerMove,
    handlePlayerMoveEnd,
    handlePlayerRemove,
    handleDropOnField,
    handlePlayerDragStartFromBar,
    handlePlayerTapInBar,
    handlePlayerDropViaTouch,
    handlePlayerDragCancelViaTouch,
    handleDeselectPlayer,
    handlePlaceAllPlayers,

    // Opponent handlers (from useGameState)
    handleAddOpponent,
    handleOpponentMove,
    handleOpponentMoveEnd,
    handleOpponentRemove,

    // Drawing handlers (from useGameState)
    handleDrawingStart,
    handleDrawingAddPoint,
    handleDrawingEnd,
    handleClearDrawings,
    handleClearDrawingsForView,
    handleToggleDrawingMode,

    // Tactical board handlers (from useTacticalBoard)
    handleToggleTacticsBoard,
    handleAddTacticalDisc,
    handleTacticalDiscMove,
    handleTacticalDiscRemove,
    handleToggleTacticalDiscType,
    handleTacticalBallMove,
    handleTacticalDrawingStart,
    handleTacticalDrawingAddPoint,
    handleTacticalDrawingEnd,
    clearTacticalElements,

    // History/undo handlers (tactical board only - field undo/redo handled by orchestrator)
    handleTacticalUndo,
    handleTacticalRedo,
    canUndoField: canUndo,
    canRedoField: canRedo,

    // Reset handlers
    handleResetFieldClick,
    handleResetFieldConfirmed,
    setShowResetFieldConfirm,

    // Internal state setters (needed by parent for special cases)
    setPlayersOnField,
    setOpponents,
    setDrawings,
    setTacticalDiscs,
    setTacticalDrawings,
    setTacticalBallPosition,

    // History restoration (needed by parent orchestrator)
    applyFieldHistoryState,
  };
}
