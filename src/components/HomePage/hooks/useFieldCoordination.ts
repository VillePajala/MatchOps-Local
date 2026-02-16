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
import {
  calculateFormationPositions,
  applyFormationPreset,
  generateSidelinePositions,
  generateSubSlots,
  type SubSlot,
} from '@/utils/formations';
import { getPresetById } from '@/config/formationPresets';

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
  formationSnapPoints: Point[];
  setFormationSnapPoints: React.Dispatch<React.SetStateAction<Point[]>>;
  /** Sub slots for substitution planning on sideline */
  subSlots: SubSlot[];
  setSubSlots: React.Dispatch<React.SetStateAction<SubSlot[]>>;
  tacticalDiscs: TacticalDisc[];
  tacticalDrawings: Point[][];
  tacticalBallPosition: Point | null;
  showResetFieldConfirm: boolean;

  // Player interaction handlers
  handlePlayerMove: (playerId: string, relX: number, relY: number) => void;
  handlePlayerMoveEnd: () => void;
  handlePlayerRemove: (playerId: string) => void;
  handleDropOnField: (playerId: string, relX: number, relY: number) => void;
  handlePlayersSwap: (playerAId: string, playerBId: string) => void;
  handlePlayerDragStartFromBar: (playerInfo: Player) => void;
  handlePlayerTapInBar: (playerInfo: Player | null) => void;
  handlePlayerDropViaTouch: (relX: number, relY: number) => void;
  handlePlayerDragCancelViaTouch: () => void;
  handleDeselectPlayer: () => void;
  handlePlaceAllPlayers: (presetId: string | null) => void;
  updateGoalieStatusByPosition: (players: Player[]) => Player[];

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
  handleTacticalDiscMoveEnd: () => void;
  handleTacticalDiscRemove: (discId: string) => void;
  handleToggleTacticalDiscType: (discId: string) => void;
  handleTacticalBallMove: (point: { relX: number; relY: number }) => void;
  handleTacticalBallMoveEnd: () => void;
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
  selectedPlayerIds,
  canUndo,
  canRedo,
  tacticalHistory,
  showToast,
  t,
}: UseFieldCoordinationParams): UseFieldCoordinationReturn {

  // --- State for reset field confirmation modal ---
  const [showResetFieldConfirm, setShowResetFieldConfirm] = useState<boolean>(false);
  const [formationSnapPoints, setFormationSnapPoints] = useState<Point[]>([]);
  const [subSlots, setSubSlots] = useState<SubSlot[]>([]);

  // --- Ref to always access latest availablePlayers (fixes goalie toggle race condition) ---
  // When user toggles goalie and immediately places player, the callback closure might
  // have stale availablePlayers. This ref ensures we always read the current value.
  const availablePlayersRef = useRef<Player[]>(availablePlayers);
  useEffect(() => {
    availablePlayersRef.current = availablePlayers;
  }, [availablePlayers]);

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
    handleTacticalDiscMoveEnd,
    handleTacticalDiscRemove,
    handleToggleTacticalDiscType,
    handleTacticalBallMove,
    handleTacticalBallMoveEnd,
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
   * Uses ref to access latest availablePlayers to avoid race conditions when
   * user toggles goalie status and immediately places player on field.
   * handlePlayerDrop is stable because useGameState uses functional setState
   * pattern, avoiding dependency on playersOnField.
   */
  const handleDropOnField = useCallback((playerId: string, relX: number, relY: number) => {
    // Use ref to get the most current availablePlayers (fixes goalie toggle race condition)
    const droppedPlayer = availablePlayersRef.current.find(p => p.id === playerId);
    if (droppedPlayer) {
      handlePlayerDrop(droppedPlayer, { relX, relY });
    } else {
      logger.error(`Dropped player with ID ${playerId} not found in availablePlayers.`);
    }
  }, [handlePlayerDrop]); // availablePlayers removed - using ref instead

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

  // Helper to check if a position is the goalkeeper position
  const isGoalkeeperPosition = useCallback((relX: number, relY: number): boolean => {
    const GOALIE_X = 0.5;
    const GOALIE_Y = 0.95;
    const THRESHOLD = 0.05; // 5% tolerance
    return Math.abs(relX - GOALIE_X) < THRESHOLD && Math.abs(relY - GOALIE_Y) < THRESHOLD;
  }, []);

  // Update isGoalie status based on position for all players on field
  const updateGoalieStatusByPosition = useCallback((players: Player[]): Player[] => {
    return players.map(p => {
      if (typeof p.relX !== 'number' || typeof p.relY !== 'number') return p;
      const shouldBeGoalie = isGoalkeeperPosition(p.relX, p.relY);
      if (p.isGoalie !== shouldBeGoalie) {
        logger.log(`[Goalie] Player ${p.name} isGoalie changed: ${p.isGoalie} -> ${shouldBeGoalie}`);
        return { ...p, isGoalie: shouldBeGoalie };
      }
      return p;
    });
  }, [isGoalkeeperPosition]);

  /**
   * Handle player movement end (save to history)
   *
   * Uses ref + version counter pattern to trigger history save in a separate effect.
   * This avoids calling saveStateToHistory during setState, which is a React
   * anti-pattern that can cause race conditions with batching and concurrent features.
   *
   * Pattern: Get current state via functional setter, store in ref, increment version.
   * The effect then saves to history after state has fully committed.
   *
   * Also updates goalie status based on final position.
   */
  const handlePlayerMoveEnd = useCallback(() => {
    setPlayersOnField(currentPlayers => {
      // Update goalie status based on positions
      const updatedPlayers = updateGoalieStatusByPosition(currentPlayers);
      // Store current state in ref for the effect to use
      pendingPlayerMoveEndRef.current = updatedPlayers;
      // Increment version to trigger the save effect
      setPlayerMoveEndVersion(v => v + 1);
      return updatedPlayers;
    });
  }, [setPlayersOnField, updateGoalieStatusByPosition]);

  const handlePlayersSwap = useCallback((playerAId: string, playerBId: string) => {
    if (!playerAId || !playerBId || playerAId === playerBId) return;

    setPlayersOnField(prevPlayers => {
      const playerA = prevPlayers.find(p => p.id === playerAId);
      const playerB = prevPlayers.find(p => p.id === playerBId);

      if (!playerA || !playerB) return prevPlayers;
      if (typeof playerA.relX !== 'number' || typeof playerA.relY !== 'number') return prevPlayers;
      if (typeof playerB.relX !== 'number' || typeof playerB.relY !== 'number') return prevPlayers;

      // Swap positions
      const swapped = prevPlayers.map(p => {
        if (p.id === playerAId) return { ...p, relX: playerB.relX, relY: playerB.relY };
        if (p.id === playerBId) return { ...p, relX: playerA.relX, relY: playerA.relY };
        return p;
      });

      // Update goalie status based on new positions
      return updateGoalieStatusByPosition(swapped);
    });

    // Record swap as a single history entry
    handlePlayerMoveEnd();
  }, [handlePlayerMoveEnd, setPlayersOnField, updateGoalieStatusByPosition]);

  /**
   * Handle player removal from field
   */
  const handlePlayerRemove = useCallback((playerId: string) => {
    logger.log(`Removing player ${playerId} from field`);
    setPlayersOnField(prevPlayers => {
      const updatedPlayersOnField = prevPlayers.filter(p => p.id !== playerId);
      // Use ref+version pattern to defer history save to effect (same as handlePlayerMoveEnd).
      // Calling saveStateToHistory inside setState updater is a React anti-pattern.
      pendingPlayerMoveEndRef.current = updatedPlayersOnField;
      setPlayerMoveEndVersion(v => v + 1);
      return updatedPlayersOnField;
    });
  }, [setPlayersOnField]);

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
      setFormationSnapPoints([]);
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
   * Places players from the player bar that are selected for this game.
   * Supports both auto mode (based on player count) and preset formations.
   *
   * When called, clears existing players and re-places all selected players
   * according to the specified formation. This allows switching formations
   * without manually clearing the field first.
   *
   * @param presetId - Formation preset ID to use, or null for auto mode
   */
  const handlePlaceAllPlayers = useCallback((presetId: string | null) => {
    // Get ALL players selected for this game (clear field and place all)
    const playersToPlace = availablePlayers.filter(player =>
      selectedPlayerIds.includes(player.id)
    );

    if (playersToPlace.length === 0) {
      logger.log('No players selected for this game');
      return;
    }

    logger.log(`Placing ${playersToPlace.length} players on the field (preset: ${presetId ?? 'auto'})...`);

    // Start with empty field - we're placing a new formation
    const newFieldPlayers: Player[] = [];

    // Find designated goalie or use first player as goalkeeper
    const designatedGoalie = playersToPlace.find(p => p.isGoalie);
    const goalie = designatedGoalie || playersToPlace[0];

    // Get remaining field players (exclude whoever is being placed as goalie)
    const fieldPlayers = playersToPlace.filter(p => p.id !== goalie.id);

    // Always place a goalkeeper at the goal position
    newFieldPlayers.push({
      ...goalie,
      relX: 0.5,
      relY: 0.95
    });

    // Determine positions based on preset or auto mode
    let positions: Array<{ relX: number; relY: number }>;
    let overflow = 0;

    if (presetId) {
      // Use specified formation preset
      const preset = getPresetById(presetId);
      if (preset) {
        const result = applyFormationPreset(preset.positions, fieldPlayers.length);
        positions = result.positions;
        overflow = result.overflow;
        logger.log(`Using preset ${preset.name}: ${positions.length} positions, ${overflow} overflow`);
      } else {
        logger.warn(`Preset ${presetId} not found, falling back to auto`);
        positions = calculateFormationPositions(fieldPlayers.length);
      }
    } else {
      // Auto mode: calculate based on player count
      positions = calculateFormationPositions(fieldPlayers.length);
    }

    // Calculate overflow for any mode (handles edge cases where positions < players)
    overflow = Math.max(0, fieldPlayers.length - positions.length);

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

    // Generate sub slots for substitution planning (right sideline, aligned with field positions)
    // Do this BEFORE placing overflow players so we can use sub slot positions
    const newSubSlots = generateSubSlots(positions);
    logger.debug('[Formation] Setting sub slots:', newSubSlots);
    setSubSlots(newSubSlots);

    // Handle overflow players (place at sub slot positions)
    if (overflow > 0) {
      const overflowPlayers = fieldPlayers.slice(positions.length);
      // Pre-compute fallback positions outside the loop (optimization)
      const fallbackCount = Math.max(0, overflow - newSubSlots.length);
      const fallbackPositions = fallbackCount > 0 ? generateSidelinePositions(fallbackCount) : [];

      overflowPlayers.forEach((player, index) => {
        if (index < newSubSlots.length) {
          // Place at corresponding sub slot position
          newFieldPlayers.push({
            ...player,
            relX: newSubSlots[index].relX,
            relY: newSubSlots[index].relY
          });
        } else {
          // Fallback: if more overflow than sub slots, use generic sideline positions
          const fallbackIndex = index - newSubSlots.length;
          if (fallbackIndex < fallbackPositions.length) {
            newFieldPlayers.push({
              ...player,
              relX: fallbackPositions[fallbackIndex].relX,
              relY: fallbackPositions[fallbackIndex].relY
            });
          }
        }
      });

      logger.log(`Placed ${overflow} overflow players at sub slot positions`);
    }

    // Apply position-based goalie status detection
    const playersWithGoalieStatus = updateGoalieStatusByPosition(newFieldPlayers);

    setPlayersOnField(playersWithGoalieStatus);
    saveStateToHistory({ playersOnField: playersWithGoalieStatus });

    // Snap points include: GK position + field positions + sub slot positions
    const snapPoints = [
      { relX: 0.5, relY: 0.95 },
      ...positions.map(pos => ({ relX: pos.relX, relY: pos.relY })),
      ...newSubSlots.map(slot => ({ relX: slot.relX, relY: slot.relY })),
    ];
    logger.debug('[Formation] Setting snap points:', snapPoints);
    setFormationSnapPoints(snapPoints);

    logger.log(`Successfully placed ${playersToPlace.length} players on the field`);
  }, [
    availablePlayers,
    selectedPlayerIds,
    setPlayersOnField,
    saveStateToHistory,
    updateGoalieStatusByPosition,
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
    formationSnapPoints,
    setFormationSnapPoints,
    subSlots,
    setSubSlots,
    tacticalDiscs,
    tacticalDrawings,
    tacticalBallPosition,
    showResetFieldConfirm,

    // Player interaction handlers
    handlePlayerMove,
    handlePlayerMoveEnd,
    handlePlayersSwap,
    handlePlayerRemove,
    handleDropOnField,
    handlePlayerDragStartFromBar: touchInteractions.handleDragStart, // Delegated to useTouchInteractions
    handlePlayerTapInBar: touchInteractions.handleTap, // Delegated to useTouchInteractions
    handlePlayerDropViaTouch: touchInteractions.handleDrop, // Delegated to useTouchInteractions
    handlePlayerDragCancelViaTouch: touchInteractions.handleCancel, // Delegated to useTouchInteractions
    handleDeselectPlayer: touchInteractions.handleDeselect, // Delegated to useTouchInteractions
    handlePlaceAllPlayers,
    updateGoalieStatusByPosition, // For use when loading games

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
    handleTacticalDiscMoveEnd,
    handleTacticalDiscRemove,
    handleToggleTacticalDiscType,
    handleTacticalBallMove,
    handleTacticalBallMoveEnd,
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
