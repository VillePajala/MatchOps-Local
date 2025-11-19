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
 * - gameSessionState (from parent)
 *
 * @module useFieldCoordination
 * @category HomePage Hooks
 */

import { useState, useCallback } from 'react';
import type { Dispatch } from 'react';
import { useFieldInteractions } from '@/hooks/useFieldInteractions';
import { useGameState } from '@/hooks/useGameState';
import type { UseGameStateReturn } from '@/hooks/useGameState';
import { useTacticalBoard } from '@/hooks/useTacticalBoard';
import type { TacticalState } from '@/hooks/useTacticalHistory';
import type { Player, AppState, TacticalDisc, Point } from '@/types';
import type { GameSessionState } from '@/hooks/useGameSessionReducer';
import logger from '@/utils/logger';

/**
 * Parameters for useFieldCoordination hook
 */
export interface UseFieldCoordinationParams {
  initialState: AppState;
  saveStateToHistory: (newState: Partial<AppState>) => void;
  saveTacticalStateToHistory: (newState: Partial<TacticalState>) => void;
  availablePlayers: Player[];
  gameSessionState: GameSessionState;
  undoHistory: () => AppState | null;
  redoHistory: () => AppState | null;
  canUndo: boolean;
  canRedo: boolean;
  tacticalHistory: {
    undo: () => TacticalState | null;
    redo: () => TacticalState | null;
    canUndo: boolean;
    canRedo: boolean;
  };
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Translation function from i18next has complex overloaded signature
  t: any;
  sessionCoordinationApplyHistoryState: (state: AppState) => void;
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

  // History/undo handlers
  handleUndo: () => void;
  handleRedo: () => void;
  handleTacticalUndo: () => void;
  handleTacticalRedo: () => void;
  canUndoField: boolean;
  canRedoField: boolean;

  // Reset handlers
  handleResetFieldClick: () => void;
  handleResetFieldConfirmed: () => void;
  setShowResetFieldConfirm: (value: boolean) => void;

  // Internal state setters (needed by parent for history restoration)
  setPlayersOnField: Dispatch<React.SetStateAction<Player[]>>;
  setOpponents: Dispatch<React.SetStateAction<Array<{ id: string; relX: number; relY: number }>>>;
  setDrawings: Dispatch<React.SetStateAction<Array<Array<{ relX: number; relY: number }>>>>;
  setTacticalDiscs: Dispatch<React.SetStateAction<TacticalDisc[]>>;
  setTacticalDrawings: Dispatch<React.SetStateAction<Point[][]>>;
  setTacticalBallPosition: Dispatch<React.SetStateAction<Point | null>>;
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
 *   gameSessionState,
 *   undoHistory,
 *   redoHistory,
 *   canUndo,
 *   canRedo,
 *   tacticalHistory,
 *   showToast,
 *   t,
 *   sessionCoordinationApplyHistoryState,
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
  gameSessionState,
  undoHistory,
  redoHistory,
  canUndo,
  canRedo,
  tacticalHistory,
  showToast,
  t,
  sessionCoordinationApplyHistoryState,
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
    saveStateToHistory({ playersOnField });
  }, [playersOnField, saveStateToHistory]);

  /**
   * Handle player removal from field
   */
  const handlePlayerRemove = useCallback((playerId: string) => {
    logger.log(`Removing player ${playerId} from field`);
    const updatedPlayersOnField = playersOnField.filter(p => p.id !== playerId);
    setPlayersOnField(updatedPlayersOnField);
    saveStateToHistory({ playersOnField: updatedPlayersOnField });
  }, [playersOnField, setPlayersOnField, saveStateToHistory]);

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
    if (draggingPlayerFromBarInfo?.id === playerInfo?.id) {
      logger.log("Tapped already selected player, deselecting:", playerInfo?.id);
      setDraggingPlayerFromBarInfo(null);
    } else {
      logger.log("Setting draggingPlayerFromBarInfo (Tap):", playerInfo);
      setDraggingPlayerFromBarInfo(playerInfo);
    }
  }, [draggingPlayerFromBarInfo]);

  /**
   * Handle player drop via touch (place on field)
   */
  const handlePlayerDropViaTouch = useCallback((relX: number, relY: number) => {
    if (draggingPlayerFromBarInfo) {
      logger.log("Player Drop Via Touch (field):", { id: draggingPlayerFromBarInfo.id, relX, relY });
      handleDropOnField(draggingPlayerFromBarInfo.id, relX, relY);
      setDraggingPlayerFromBarInfo(null);
    }
  }, [draggingPlayerFromBarInfo, handleDropOnField]);

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
    if (draggingPlayerFromBarInfo) {
      logger.log("Deselecting player by clicking bar background.");
      setDraggingPlayerFromBarInfo(null);
    }
  }, [draggingPlayerFromBarInfo]);

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
   * Apply history state to field (for undo/redo)
   *
   * Note: This also calls sessionCoordination.applyHistoryState to restore
   * game session state. In future, this could be refactored to separate concerns.
   */
  const applyHistoryState = useCallback((state: AppState) => {
    setPlayersOnField(state.playersOnField);
    setOpponents(state.opponents);
    setDrawings(state.drawings);
    setTacticalDiscs(state.tacticalDiscs || []);
    setTacticalDrawings(state.tacticalDrawings || []);
    setTacticalBallPosition(state.tacticalBallPosition || null);
    // Also apply game session state
    sessionCoordinationApplyHistoryState(state);
  }, [
    setPlayersOnField,
    setOpponents,
    setDrawings,
    setTacticalDiscs,
    setTacticalDrawings,
    setTacticalBallPosition,
    sessionCoordinationApplyHistoryState,
  ]);

  /**
   * Handle undo for field state
   */
  const handleUndo = useCallback(() => {
    const prevState = undoHistory();
    if (prevState) {
      logger.log('Undoing...');
      applyHistoryState(prevState);
    } else {
      logger.log('Cannot undo: at beginning of history');
    }
  }, [undoHistory, applyHistoryState]);

  /**
   * Handle redo for field state
   */
  const handleRedo = useCallback(() => {
    const nextState = redoHistory();
    if (nextState) {
      logger.log('Redoing...');
      applyHistoryState(nextState);
    } else {
      logger.log('Cannot redo: at end of history');
    }
  }, [redoHistory, applyHistoryState]);

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
    const selectedButNotOnField = gameSessionState.selectedPlayerIds.filter((id: string) =>
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

    const remainingCount = playersToPlace.length;
    let positions: { relX: number, relY: number }[] = [];

    // Formation logic based on number of players
    if (remainingCount === 1) {
      positions = [{ relX: 0.5, relY: 0.5 }];
    } else if (remainingCount === 2) {
      positions = [
        { relX: 0.35, relY: 0.5 },
        { relX: 0.65, relY: 0.5 }
      ];
    } else if (remainingCount === 3) {
      positions = [
        { relX: 0.25, relY: 0.5 },
        { relX: 0.5, relY: 0.4 },
        { relX: 0.75, relY: 0.5 }
      ];
    } else if (remainingCount === 4) {
      positions = [
        { relX: 0.25, relY: 0.6 },
        { relX: 0.75, relY: 0.6 },
        { relX: 0.35, relY: 0.35 },
        { relX: 0.65, relY: 0.35 }
      ];
    } else if (remainingCount === 5) {
      positions = [
        { relX: 0.2, relY: 0.65 },
        { relX: 0.8, relY: 0.65 },
        { relX: 0.3, relY: 0.45 },
        { relX: 0.7, relY: 0.45 },
        { relX: 0.5, relY: 0.25 }
      ];
    } else if (remainingCount === 6) {
      positions = [
        { relX: 0.2, relY: 0.7 },
        { relX: 0.8, relY: 0.7 },
        { relX: 0.3, relY: 0.5 },
        { relX: 0.7, relY: 0.5 },
        { relX: 0.35, relY: 0.3 },
        { relX: 0.65, relY: 0.3 }
      ];
    } else if (remainingCount === 7) {
      positions = [
        { relX: 0.15, relY: 0.75 },
        { relX: 0.5, relY: 0.75 },
        { relX: 0.85, relY: 0.75 },
        { relX: 0.25, relY: 0.5 },
        { relX: 0.75, relY: 0.5 },
        { relX: 0.35, relY: 0.25 },
        { relX: 0.65, relY: 0.25 }
      ];
    } else if (remainingCount === 8) {
      positions = [
        { relX: 0.15, relY: 0.75 },
        { relX: 0.85, relY: 0.75 },
        { relX: 0.25, relY: 0.55 },
        { relX: 0.75, relY: 0.55 },
        { relX: 0.35, relY: 0.35 },
        { relX: 0.65, relY: 0.35 },
        { relX: 0.4, relY: 0.15 },
        { relX: 0.6, relY: 0.15 }
      ];
    } else if (remainingCount === 9) {
      positions = [
        { relX: 0.1, relY: 0.75 },
        { relX: 0.5, relY: 0.75 },
        { relX: 0.9, relY: 0.75 },
        { relX: 0.25, relY: 0.5 },
        { relX: 0.75, relY: 0.5 },
        { relX: 0.15, relY: 0.3 },
        { relX: 0.5, relY: 0.3 },
        { relX: 0.85, relY: 0.3 },
        { relX: 0.5, relY: 0.1 }
      ];
    } else {
      // 10 or more players - 4-3-3 formation
      positions = [
        { relX: 0.1, relY: 0.75 },
        { relX: 0.35, relY: 0.75 },
        { relX: 0.65, relY: 0.75 },
        { relX: 0.9, relY: 0.75 },
        { relX: 0.25, relY: 0.5 },
        { relX: 0.5, relY: 0.5 },
        { relX: 0.75, relY: 0.5 },
        { relX: 0.2, relY: 0.25 },
        { relX: 0.5, relY: 0.25 },
        { relX: 0.8, relY: 0.25 }
      ];
    }

    // Limit positions to number of players
    positions = positions.slice(0, remainingCount);

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
    gameSessionState.selectedPlayerIds,
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

    // History/undo handlers
    handleUndo,
    handleRedo,
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
  };
}
