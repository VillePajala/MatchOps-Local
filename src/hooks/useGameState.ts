// src/hooks/useGameState.ts
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Player } from '@/types'; // Player type is from @/types
import {
    Opponent,
    Point,
    AppState,
} from '@/types'; // Reverted for Opponent, Point, AppState as they are likely still in page.tsx exports
import {
    updatePlayer as updatePlayerInMasterRoster,
    getMasterRoster as getMasterRosterFromManager,
    // setGoalieStatus as setGoalieStatusInMasterRoster // No longer used - using per-game implementation
} from '@/utils/masterRosterManager';
import logger from '@/utils/logger';

// Define arguments the hook will receive
/**
 * Arguments for the useGameState hook.
 *
 * @property initialState - The global application state
 * @property saveStateToHistory - Callback to save state changes to history
 *
 * @critical saveStateToHistory MUST be memoized with useCallback to prevent
 * infinite re-render loops. The hook depends on this function in a useEffect,
 * so a new reference on every render will cause infinite updates.
 *
 * @example
 * ```tsx
 * const saveStateToHistory = useCallback((newState: Partial<AppState>) => {
 *   pushHistoryState({ ...currentState, ...newState });
 * }, [currentState, pushHistoryState]);
 * ```
 */
interface UseGameStateArgs {
    initialState: AppState; // Pass the global initial state
    saveStateToHistory: (newState: Partial<AppState>) => void; // Callback to save changes
    // masterRosterKey: string; // Removed as no longer used directly in the hook for localStorage
}

/**
 * Structure returned by useGameState.
 *
 * @remarks
 * Consumers **must** provide a `saveStateToHistory` function that is wrapped in
 * `useCallback`. The hook calls that function from effects whenever it flushes
 * staged state updates, so an unstable reference will trigger the runtime
 * safeguard and can lead to infinite render loops.
 */
export interface UseGameStateReturn {
    // State values
    playersOnField: Player[];
    opponents: Opponent[];
    drawings: Point[][];
    availablePlayers: Player[];
    // State setters (maybe expose selectively later)
    setPlayersOnField: React.Dispatch<React.SetStateAction<Player[]>>;
    setOpponents: React.Dispatch<React.SetStateAction<Opponent[]>>;
    setDrawings: React.Dispatch<React.SetStateAction<Point[][]>>;
    setAvailablePlayers: React.Dispatch<React.SetStateAction<Player[]>>;
    // Handlers
    handlePlayerDrop: (player: Player, position: { relX: number; relY: number }) => void;
    handleDrawingStart: (point: Point) => void;
    handleDrawingAddPoint: (point: Point) => void;
    handleDrawingEnd: () => void;
    handleClearDrawings: () => void;
    handleAddOpponent: () => void;
    handleOpponentMove: (opponentId: string, relX: number, relY: number) => void;
    handleOpponentMoveEnd: () => void;
    handleOpponentRemove: (opponentId: string) => void;
    handleRenamePlayer: (playerId: string, playerData: { name: string; nickname: string }) => void;
    handleToggleGoalie: (playerId: string) => void;
}

/**
 * Merge roster metadata into a field player without touching positional data.
 * When the Player type gains additional roster-sourced fields, update this helper
 * so the sync effect stays comprehensive.
 */
function mergeRosterDetails(fieldPlayer: Player, rosterPlayer: Player): Player {
    return {
        ...fieldPlayer,
        name: rosterPlayer.name,
        nickname: rosterPlayer.nickname,
        jerseyNumber: rosterPlayer.jerseyNumber,
        notes: rosterPlayer.notes,
        color: rosterPlayer.color,
        isGoalie: rosterPlayer.isGoalie,
        receivedFairPlayCard: rosterPlayer.receivedFairPlayCard,
    };
}

/**
 * Compare roster metadata fields.
 *
 * Note: As of the current Player type definition (src/types/index.ts), all
 * fields are primitives (string, boolean, number, undefined). The defensive
 * object/array comparison below is future-proofing in case Player evolves.
 *
 * Current Player fields being compared:
 * - name, nickname, jerseyNumber, notes, color: string | undefined
 * - isGoalie, receivedFairPlayCard: boolean | undefined
 */
function playerMetadataChanged(original: Player, updated: Player): boolean {
    // Direct primitive comparison is sufficient for current Player type.
    // The compare helper below handles edge cases if Player type evolves
    // to include arrays or objects.
    const compare = (a: unknown, b: unknown): boolean => {
        const aIsObject = typeof a === 'object' && a !== null;
        const bIsObject = typeof b === 'object' && b !== null;
        if (aIsObject || bIsObject) {
            // For arrays, use structural comparison for better performance
            if (Array.isArray(a) && Array.isArray(b)) {
                return a.length !== b.length || a.some((v, i) => v !== b[i]);
            }
            // Fallback to JSON for complex objects.
            // NOTE: This has limitations (key order, circular refs, functions)
            // but is acceptable for simple data objects. If Player type evolves
            // to include complex nested structures, consider using lodash.isEqual.
            return JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);
        }
        return a !== b;
    };

    return (
        original.name !== updated.name ||
        original.nickname !== updated.nickname ||
        original.jerseyNumber !== updated.jerseyNumber ||
        compare(original.notes, updated.notes) ||
        compare(original.color, updated.color) ||
        original.isGoalie !== updated.isGoalie ||
        original.receivedFairPlayCard !== updated.receivedFairPlayCard
    );
}

export function useGameState({ initialState, saveStateToHistory }: UseGameStateArgs): UseGameStateReturn {
    // --- State Management ---
    const [playersOnField, setPlayersOnField] = useState<Player[]>(initialState.playersOnField);
    const [opponents, setOpponents] = useState<Opponent[]>(initialState.opponents);
    const [drawings, setDrawings] = useState<Point[][]>(initialState.drawings);

    // --- Refs and version counters for race-condition-free history saving ---
    // Avoids calling saveStateToHistory inside setState (React anti-pattern)
    // Pattern: Store state in ref during move end, increment version to trigger effect
    const [opponentMoveEndVersion, setOpponentMoveEndVersion] = useState(0);
    const pendingOpponentMoveEndRef = useRef<Opponent[] | null>(null);

    const [drawingEndVersion, setDrawingEndVersion] = useState(0);
    const pendingDrawingEndRef = useRef<Point[][] | null>(null);

    // Generic ref + version counter for immediate history saves from event handlers.
    // Avoids calling saveStateToHistory inside setState updaters (React anti-pattern
    // that can double-invoke in StrictMode). Used by: handlePlayerDrop, handleDrawingStart,
    // handleAddOpponent, handleOpponentRemove, handleRenamePlayer, handleToggleGoalie.
    const pendingActionHistoryRef = useRef<Record<string, unknown> | null>(null);
    const [actionHistoryVersion, setActionHistoryVersion] = useState(0);
    const [availablePlayers, setAvailablePlayers] = useState<Player[]>(initialState.availablePlayers || []);
    // Ref tracking latest availablePlayers for use in stable callbacks (handleToggleGoalie)
    // that need to read current state without adding it as a dependency
    const availablePlayersRef = useRef<Player[]>(initialState.availablePlayers || []);
    const rosterSyncReadyRef = useRef<boolean>((initialState.availablePlayers?.length ?? 0) > 0);

    // Keep availablePlayersRef in sync with state (via effect, not during render)
    useEffect(() => {
      availablePlayersRef.current = availablePlayers;
    }, [availablePlayers]);

    // --- Development Mode: Runtime Safeguard for saveStateToHistory Memoization ---
    // Detects if saveStateToHistory reference changes between renders, which indicates
    // it's not properly memoized and will cause infinite re-render loops.
    const saveStateToHistoryRef = useRef(saveStateToHistory);
    useEffect(() => {
        if (process.env.NODE_ENV === 'development') {
            if (saveStateToHistoryRef.current !== saveStateToHistory) {
                logger.warn(
                    '[useGameState] saveStateToHistory reference changed! ' +
                    'This function MUST be memoized with useCallback in the parent component ' +
                    'to prevent infinite re-renders. See UseGameStateArgs interface documentation.'
                );
            }
        }
        saveStateToHistoryRef.current = saveStateToHistory;
    }, [saveStateToHistory]);

    // Sync availablePlayers when initialState changes
    React.useLayoutEffect(() => {
        setAvailablePlayers(initialState.availablePlayers || []);
    }, [initialState.availablePlayers]);

    // Track when we've actually received a roster snapshot so we do not
    // prematurely wipe players when the hook was initialized with []
    useEffect(() => {
        if (!rosterSyncReadyRef.current && availablePlayers.length > 0) {
            rosterSyncReadyRef.current = true;
        }
    }, [availablePlayers]);

    const rosterLookup = useMemo(() => {
        return new Map(availablePlayers.map(player => [player.id, player]));
    }, [availablePlayers]);

    const pendingHistoryRef = useRef<Player[] | null>(null);
    const [historyVersion, setHistoryVersion] = useState(0);

    // Ensure players on field reflect latest roster updates (names, goalie flags)
    useEffect(() => {
        setPlayersOnField(currentPlayers => {
            if (currentPlayers.length === 0) {
                return currentPlayers;
            }
            // If we have never received actual roster data, bail so the field
            // doesn't immediately clear when availablePlayers defaults to []
            if (!rosterSyncReadyRef.current && rosterLookup.size === 0) {
                return currentPlayers;
            }

            let mutated = false;
            const nextPlayers: Player[] = [];

            currentPlayers.forEach((fieldPlayer) => {
                const rosterPlayer = rosterLookup.get(fieldPlayer.id);
                if (!rosterPlayer) {
                    mutated = true;
                    return;
                }
                const mergedPlayer = mergeRosterDetails(fieldPlayer, rosterPlayer);
                if (!mutated && playerMetadataChanged(fieldPlayer, mergedPlayer)) {
                    mutated = true;
                }
                nextPlayers.push(mergedPlayer);
            });

            if (!mutated) {
                return currentPlayers;
            }

            pendingHistoryRef.current = nextPlayers;
            setHistoryVersion(version => version + 1);
            return nextPlayers;
        });
    }, [rosterLookup]);

    // Separate effect ensures saveStateToHistory is called AFTER the state
    // update has been committed, preventing potential race conditions with
    // React's batched updates. This two-phase pattern (set pending + increment
    // version, then separate effect) ensures proper sequencing of history saves.
    //
    // IMPORTANT: saveStateToHistory MUST be memoized with useCallback in the parent
    // component to prevent infinite re-render loops. Current implementation in
    // HomePage.tsx properly memoizes it with stable dependencies.
    useEffect(() => {
        if (historyVersion === 0 || !pendingHistoryRef.current) {
            return;
        }
        saveStateToHistory({ playersOnField: pendingHistoryRef.current });
        pendingHistoryRef.current = null;
    }, [historyVersion, saveStateToHistory]);

    // Effect: Save opponent state to history after move end
    // This runs AFTER the state update has fully committed, avoiding race conditions
    useEffect(() => {
        if (opponentMoveEndVersion > 0 && pendingOpponentMoveEndRef.current) {
            saveStateToHistory({ opponents: pendingOpponentMoveEndRef.current });
            pendingOpponentMoveEndRef.current = null;
        }
    }, [opponentMoveEndVersion, saveStateToHistory]);

    // Effect: Save drawing state to history after drawing end
    // This runs AFTER the state update has fully committed, avoiding race conditions
    useEffect(() => {
        if (drawingEndVersion > 0 && pendingDrawingEndRef.current) {
            saveStateToHistory({ drawings: pendingDrawingEndRef.current });
            pendingDrawingEndRef.current = null;
        }
    }, [drawingEndVersion, saveStateToHistory]);

    // Effect: Save to history after immediate state changes from event handlers
    // This runs AFTER state updates have committed, avoiding the anti-pattern of
    // calling saveStateToHistory inside functional setState updaters
    useEffect(() => {
        if (actionHistoryVersion > 0 && pendingActionHistoryRef.current) {
            saveStateToHistory(pendingActionHistoryRef.current);
            pendingActionHistoryRef.current = null;
        }
    }, [actionHistoryVersion, saveStateToHistory]);

    // --- Handlers ---

    /**
     * Handler for dropping a player onto the field
     *
     * Uses functional setState pattern to avoid dependency on playersOnField,
     * keeping this callback stable and preventing cascading re-renders in
     * dependent hooks like useFieldCoordination.
     *
     * @param player - The player to drop on the field
     * @param position - The position where the player is dropped (relX, relY)
     */
    const handlePlayerDrop = useCallback((player: Player, position: { relX: number; relY: number }) => {
        logger.debug(`Player ${player.name} dropped at`, position);
        const newPlayerOnField: Player = {
            ...player,
            relX: position.relX,
            relY: position.relY,
        };

        // Use functional setState to avoid dependency on playersOnField
        // This keeps the callback stable and prevents unnecessary re-creation
        setPlayersOnField(currentPlayersOnField => {
            // Avoid duplicates - update position if player already on field, otherwise add
            const existingPlayerIndex = currentPlayersOnField.findIndex(p => p.id === player.id);
            const updatedPlayersOnField = existingPlayerIndex > -1
                ? currentPlayersOnField.map((p, index) =>
                    index === existingPlayerIndex ? newPlayerOnField : p
                  )
                : [...currentPlayersOnField, newPlayerOnField];

            pendingActionHistoryRef.current = { playersOnField: updatedPlayersOnField };
            setActionHistoryVersion(v => v + 1);
            return updatedPlayersOnField;
        });
    }, []);

    // Drawing Handlers (Moved here)
    const handleDrawingStart = useCallback((point: Point) => {
        // Use functional setState to avoid dependency on drawings (prevents stale closure)
        setDrawings(prevDrawings => {
            const newDrawings = [...prevDrawings, [point]];
            pendingActionHistoryRef.current = { drawings: newDrawings };
            setActionHistoryVersion(v => v + 1);
            return newDrawings;
        });
    }, []);

    const handleDrawingAddPoint = useCallback((point: Point) => {
        // Continuous update for visual feedback - no history save needed here
        setDrawings(prevDrawings => {
            if (prevDrawings.length === 0) return prevDrawings;
            const currentPath = prevDrawings[prevDrawings.length - 1];
            const updatedPath = [...currentPath, point]; 
            return [...prevDrawings.slice(0, -1), updatedPath];
        });
    }, []); // No dependencies needed as it only uses the setter's previous state

    const handleDrawingEnd = useCallback(() => {
        // Use ref + version counter pattern to avoid race conditions
        // Get current state via functional setter, store in ref, increment version
        setDrawings(currentDrawings => {
            pendingDrawingEndRef.current = currentDrawings;
            setDrawingEndVersion(v => v + 1);
            return currentDrawings; // No change to state
        });
    }, []);

    const handleClearDrawings = useCallback(() => {
        setDrawings([]); // Use setter from this hook
        saveStateToHistory({ drawings: [] });
    }, [saveStateToHistory]);

    // Opponent Handlers (Moved here)
    const handleAddOpponent = useCallback(() => {
        const newOpponentId = `opp-${Date.now()}`;
        const newOpponent: Opponent = {
            id: newOpponentId,
            relX: 0.5,
            relY: 0.5, // Center of the field initially
        };
        // Use functional setState to avoid dependency on opponents (prevents stale closure)
        setOpponents(prevOpponents => {
            const updatedOpponents = [...prevOpponents, newOpponent];
            pendingActionHistoryRef.current = { opponents: updatedOpponents };
            setActionHistoryVersion(v => v + 1);
            return updatedOpponents;
        });
    }, []);

    const handleOpponentMove = useCallback((opponentId: string, relX: number, relY: number) => {
        // Continuous update - no history save needed here
        setOpponents(prevOpponents =>
            prevOpponents.map(opp =>
                opp.id === opponentId ? { ...opp, relX, relY } : opp
            )
        );
    }, []); // No dependency on opponents needed for setter callback

    const handleOpponentMoveEnd = useCallback(() => {
        // Use ref + version counter pattern to avoid race conditions
        // Get current state via functional setter, store in ref, increment version
        setOpponents(currentOpponents => {
            pendingOpponentMoveEndRef.current = currentOpponents;
            setOpponentMoveEndVersion(v => v + 1);
            return currentOpponents; // No change to state
        });
    }, []);

    const handleOpponentRemove = useCallback((opponentId: string) => {
        // Use functional setState to avoid dependency on opponents (prevents stale closure)
        setOpponents(prevOpponents => {
            const updatedOpponents = prevOpponents.filter(opp => opp.id !== opponentId);
            pendingActionHistoryRef.current = { opponents: updatedOpponents };
            setActionHistoryVersion(v => v + 1);
            return updatedOpponents;
        });
    }, []);

    // Player Management Handlers (Moved here)
    const handleRenamePlayer = useCallback(async (playerId: string, playerData: { name: string; nickname: string }) => {
        logger.debug(`[useGameState] handleRenamePlayer called for ID: ${playerId}, with data:`, playerData);
        try {
            const updatedPlayerFromManager = await updatePlayerInMasterRoster(playerId, {
                name: playerData.name,
                nickname: playerData.nickname
            });

            if (updatedPlayerFromManager) {
                const latestRoster = await getMasterRosterFromManager();
                setAvailablePlayers(latestRoster);

                // Use functional setState to avoid dependency on playersOnField (prevents stale closure)
                setPlayersOnField(prevPlayersOnField => {
                    const updatedPlayersOnField = prevPlayersOnField.map(p =>
                        p.id === playerId ? { ...p, name: playerData.name, nickname: playerData.nickname } : p
                    );
                    pendingActionHistoryRef.current = {
                        playersOnField: updatedPlayersOnField,
                        availablePlayers: latestRoster,
                    };
                    setActionHistoryVersion(v => v + 1);
                    return updatedPlayersOnField;
                });
                logger.debug(`[useGameState] Player ${playerId} renamed to ${playerData.name}. Roster and field updated.`);
            } else {
                logger.error(`[useGameState] Failed to update player ${playerId} via masterRosterManager.`);
            }
        } catch (error) {
            logger.error(`[useGameState] Error in handleRenamePlayer for ID ${playerId}:`, error);
        }
    }, [setAvailablePlayers, setPlayersOnField]);

    // --- Add Goalie Handler Here ---
    const handleToggleGoalie = useCallback(async (playerId: string) => {
        logger.debug(`[useGameState:handleToggleGoalie] Per-game toggle called for ${playerId}`);
        // Read from ref to get latest availablePlayers without adding it as a dependency
        const currentAvailablePlayers = availablePlayersRef.current;
        const playerToToggle = currentAvailablePlayers.find(p => p.id === playerId);
        if (!playerToToggle) {
            logger.error(`[useGameState:handleToggleGoalie] Player ${playerId} not found.`);
            return;
        }
        const targetGoalieStatus = !(playerToToggle.isGoalie ?? false);

        try {
            // Update goalie status per-game instead of globally
            const updatedAvailablePlayers = currentAvailablePlayers.map(p => {
                if (p.id === playerId) {
                    return { ...p, isGoalie: targetGoalieStatus };
                }
                // If setting this player as goalie, unset any other goalies in this game
                if (targetGoalieStatus && p.isGoalie) {
                    return { ...p, isGoalie: false };
                }
                return p;
            });

            setAvailablePlayers(updatedAvailablePlayers);

            // Use functional setState to avoid dependency on playersOnField (prevents stale closure)
            setPlayersOnField(prevPlayersOnField => {
                const newPlayersOnField = prevPlayersOnField.map(fieldPlayer => {
                    const updatedPlayer = updatedAvailablePlayers.find(p => p.id === fieldPlayer.id);
                    return updatedPlayer ? { ...fieldPlayer, isGoalie: updatedPlayer.isGoalie } : fieldPlayer;
                });
                pendingActionHistoryRef.current = {
                    playersOnField: newPlayersOnField,
                    availablePlayers: updatedAvailablePlayers,
                };
                setActionHistoryVersion(v => v + 1);
                return newPlayersOnField;
            });

            logger.debug(`[useGameState:handleToggleGoalie] Per-game goalie status for ${playerId} to ${targetGoalieStatus}. Local state updated.`);
        } catch (error) {
            logger.error(`[useGameState:handleToggleGoalie] Error toggling goalie for ID ${playerId}:`, error);
        }
    }, [setAvailablePlayers, setPlayersOnField]);

    // ... (more handlers will be moved here later)

    // --- Methods for external interaction ---
    // const setHookState = useCallback((newState: Partial<Pick<AppState, 'playersOnField' | 'opponents' | 'drawings' | 'availablePlayers'>>) => {
    //     if (newState.playersOnField !== undefined) setPlayersOnField(newState.playersOnField);
    //     if (newState.opponents !== undefined) setOpponents(newState.opponents);
    //     if (newState.drawings !== undefined) setDrawings(newState.drawings);
    //     if (newState.availablePlayers !== undefined) setAvailablePlayers(newState.availablePlayers);
    //     // Note: This simple setter might bypass history saving if called directly. Needs refinement.
    // }, []);

    // Return state values and handlers
    return {
        playersOnField,
        opponents,
        drawings,
        availablePlayers,
        setPlayersOnField,
        setOpponents,
        setDrawings,
        setAvailablePlayers,
        handlePlayerDrop,
        handleDrawingStart,
        handleDrawingAddPoint,
        handleDrawingEnd,
        handleClearDrawings,
        handleAddOpponent,
        handleOpponentMove,
        handleOpponentMoveEnd,
        handleOpponentRemove,
        handleRenamePlayer,
        handleToggleGoalie,
        // setHookState,
    };
}
