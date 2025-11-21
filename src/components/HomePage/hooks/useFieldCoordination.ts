/**
 * useFieldCoordination Hook
 *
 * **Purpose**: Soccer field interactions and tactical board management
 *
 * **Responsibilities**:
 * - Field state management (players, opponents, drawings)
 * - Player drag/drop interactions (delegates to useTouchInteractions for touch/mobile)
 * - Opponent management
 * - Drawing mode and handlers
 * - Tactical board (separate history stack)
 * - Field reset logic
 * - History/undo for both field and tactical board
 *
 * **Delegation Pattern**:
 * - Touch/mobile interactions → useTouchInteractions hook
 * - Field state management → useGameState hook
 * - Tactical board state → useTacticalBoard hook
 * - Drawing mode toggle → useFieldInteractions hook
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

import { useState, useCallback, useRef, useEffect } from 'react';
import type { Dispatch } from 'react';
import type { TFunction } from 'i18next';
import { useFieldInteractions } from '@/hooks/useFieldInteractions';
import { useGameState } from '@/hooks/useGameState';
import type { UseGameStateReturn } from '@/hooks/useGameState';
import { useTacticalBoard } from '@/hooks/useTacticalBoard';
import { useTouchInteractions } from '@/hooks/useTouchInteractions';
import type { TacticalState } from '@/hooks/useTacticalHistory';
import type { Player, AppState, TacticalDisc, Point } from '@/types';
import logger from '@/utils/logger';
import { calculateFormationPositions } from '@/utils/formations';

/**
 * Parameters for useFieldCoordination hook
 *
 * @property {AppState} initialState - Initial app state
 * @property {function} saveStateToHistory - Save field state to main history stack
 *   **MUST be memoized with useCallback and stable reference** (empty deps or ref pattern)
 *   to prevent infinite re-render loops in useGameState.
 *   Provided by useGameSessionCoordination using ref pattern for stability.
 * @property {function} saveTacticalStateToHistory - Save tactical state to separate history stack
 *   **MUST be memoized with useCallback** to prevent re-renders.
 *   Provided by useGameSessionCoordination with stable dependency (tacticalHistory).
 * @property {Player[]} availablePlayers - All players available for placement
 * @property {string[]} selectedPlayerIds - IDs of players selected for this game
 * @property {boolean} canUndo - Whether main history can undo
 * @property {boolean} canRedo - Whether main history can redo
 * @property {object} tacticalHistory - Tactical board history manager (separate from main history)
 * @property {function} showToast - Toast notification function
 * @property {TFunction} t - i18next translation function
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
 * **IMPORTANT - Memoization Requirements:**
 * This hook requires stable function references to prevent infinite re-render loops:
 * - `saveStateToHistory`: MUST use ref pattern (empty deps) for complete stability
 * - `saveTacticalStateToHistory`: MUST be wrapped in useCallback with stable deps
 *
 * The parent hook (useGameSessionCoordination) provides these functions with proper
 * memoization using the ref pattern, so they are safe to pass through even though
 * the custom ESLint rule may flag them. The eslint-disable comments below document
 * that the parent has already handled memoization correctly.
 *
 * **Why this matters:**
 * - useGameState internally uses these callbacks in useCallback/useEffect dependencies
 * - Unstable references cause infinite loops: state change → re-render → new callback → state change
 * - The ref pattern breaks this cycle by ensuring callbacks never change identity
 *
 * @example
 * ```tsx
 * const fieldCoordination = useFieldCoordination({
 *   initialState: appState,
 *   saveStateToHistory,          // From useGameSessionCoordination (stable via ref)
 *   saveTacticalStateToHistory,  // From useGameSessionCoordination (stable deps)
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
  // selectedPlayerIds is intentionally unused after "Place All Players" fix
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  selectedPlayerIds,
  canUndo,
  canRedo,
  tacticalHistory,
  showToast,
  t,
}: UseFieldCoordinationParams): UseFieldCoordinationReturn {

  // --- State for reset field confirmation modal ---
  const [showResetFieldConfirm, setShowResetFieldConfirm] = useState<boolean>(false);

  // --- Ref to track pending history save after player move end ---
  // This avoids calling saveStateToHistory inside setState (React anti-pattern)
  // Uses a version counter to trigger the effect without changing state
  const [playerMoveEndVersion, setPlayerMoveEndVersion] = useState(0);
  const pendingPlayerMoveEndRef = useRef<Player[] | null>(null);

  // --- Effect: Save to history after player move ends ---
  // This runs AFTER the state update has fully committed, avoiding race conditions
  // with React's batching and ensuring the history sees the final state.
  useEffect(() => {
    if (playerMoveEndVersion > 0 && pendingPlayerMoveEndRef.current) {
      saveStateToHistory({ playersOnField: pendingPlayerMoveEndRef.current });
      pendingPlayerMoveEndRef.current = null;
    }
  }, [playerMoveEndVersion, saveStateToHistory]);

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
    // eslint-disable-next-line custom-hooks/require-memoized-function-props -- Verified stable: useGameSessionCoordination provides this via ref pattern (empty deps)
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
    // eslint-disable-next-line custom-hooks/require-memoized-function-props -- Verified stable: useGameSessionCoordination wraps with useCallback([tacticalHistory])
    saveStateToHistory: saveTacticalStateToHistory,
  });

  // --- Player Movement Handlers ---

  /**
   * Handle player drop from player bar onto field
   *
   * Stable callback that only recreates when roster changes (infrequent).
   * handlePlayerDrop is stable because useGameState uses functional setState
   * pattern, avoiding dependency on playersOnField.
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
   *
   * Uses ref + version counter pattern to trigger history save in a separate effect.
   * This avoids calling saveStateToHistory during setState, which is a React
   * anti-pattern that can cause race conditions with batching and concurrent features.
   *
   * Pattern: Get current state via functional setter, store in ref, increment version.
   * The effect then saves to history after state has fully committed.
   */
  const handlePlayerMoveEnd = useCallback(() => {
    setPlayersOnField(currentPlayers => {
      // Store current state in ref for the effect to use
      pendingPlayerMoveEndRef.current = currentPlayers;
      // Increment version to trigger the save effect
      setPlayerMoveEndVersion(v => v + 1);
      return currentPlayers; // No change to state
    });
  }, [setPlayersOnField]);

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

  // --- Hook: useTouchInteractions (touch/mobile drag-and-drop) ---
  // Delegated to separate hook for better separation and testability
  const touchInteractions = useTouchInteractions({
    onDrop: handleDropOnField, // handleDropOnField handles player validation
    showToast,
    t,
  });

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
   * Place ALL available players on the field in formation
   *
   * Places ALL players from the player bar, not just selected ones.
   * This ensures the "Place All Players" button actually places all players.
   *
   * TODO: Future enhancement - Use configurable formations:
   * - Selected formation (e.g., 4-3-3, 3-4-3) determines positions
   * - Extra players beyond formation size placed neatly on field side
   * - See roadmap.md for detailed implementation plan
   */
  const handlePlaceAllPlayers = useCallback(() => {
    // Get ALL players not currently on field (not just selected ones)
    const playersNotOnField = availablePlayers.filter(player =>
      !playersOnField.some(fieldPlayer => fieldPlayer.id === player.id)
    );

    if (playersNotOnField.length === 0) {
      logger.log('All available players are already on the field');
      return;
    }

    logger.log(`Placing ${playersNotOnField.length} players on the field...`);

    const newFieldPlayers: Player[] = [...playersOnField];

    // Separate goalkeeper from field players (functional approach, no mutation)
    const goalie = playersNotOnField.find(p => p.isGoalie);
    const fieldPlayers = playersNotOnField.filter(p => !p.isGoalie);

    // Place goalkeeper first at goalie position
    if (goalie) {
      newFieldPlayers.push({
        ...goalie,
        relX: 0.5,
        relY: 0.95
      });
    }

    // Calculate formation positions for field players
    const positions = calculateFormationPositions(fieldPlayers.length);

    // Place field players in formation positions
    fieldPlayers.forEach((player, index) => {
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

    logger.log(`Successfully placed ${playersNotOnField.length} players on the field`);
  }, [
    playersOnField,
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
    draggingPlayerFromBarInfo: touchInteractions.selectedPlayer, // Delegated to useTouchInteractions
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
    handlePlayerDragStartFromBar: touchInteractions.handleDragStart, // Delegated to useTouchInteractions
    handlePlayerTapInBar: touchInteractions.handleTap, // Delegated to useTouchInteractions
    handlePlayerDropViaTouch: touchInteractions.handleDrop, // Delegated to useTouchInteractions
    handlePlayerDragCancelViaTouch: touchInteractions.handleCancel, // Delegated to useTouchInteractions
    handleDeselectPlayer: touchInteractions.handleDeselect, // Delegated to useTouchInteractions
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
