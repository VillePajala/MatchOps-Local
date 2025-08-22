// src/hooks/useGameState.ts
import { useState, useCallback } from 'react';
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
interface UseGameStateArgs {
    initialState: AppState; // Pass the global initial state
    saveStateToHistory: (newState: Partial<AppState>) => void; // Callback to save changes
    // masterRosterKey: string; // Removed as no longer used directly in the hook for localStorage
}

// Define the structure of the object returned by the hook
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

export function useGameState({ initialState, saveStateToHistory }: UseGameStateArgs): UseGameStateReturn {
    // --- State Management ---
    const [playersOnField, setPlayersOnField] = useState<Player[]>(initialState.playersOnField);
    const [opponents, setOpponents] = useState<Opponent[]>(initialState.opponents);
    const [drawings, setDrawings] = useState<Point[][]>(initialState.drawings);
    const [availablePlayers, setAvailablePlayers] = useState<Player[]>([]); // Initialize with empty array
    // ... (more state will be moved here)

    // --- Handlers ---

    // Handler for dropping a player onto the field
    const handlePlayerDrop = useCallback((player: Player, position: { relX: number; relY: number }) => {
        logger.log(`Player ${player.name} dropped at`, position);
        const newPlayerOnField: Player = {
            ...player,
            relX: position.relX,
            relY: position.relY,
        };

        // Avoid duplicates - update position if player already on field, otherwise add
        const existingPlayerIndex = playersOnField.findIndex(p => p.id === player.id);
        let updatedPlayersOnField;
        if (existingPlayerIndex > -1) {
            // Update existing player's position
            updatedPlayersOnField = playersOnField.map((p, index) =>
                index === existingPlayerIndex ? newPlayerOnField : p
            );
        } else {
            // Add new player to the field
            updatedPlayersOnField = [...playersOnField, newPlayerOnField];
        }

        setPlayersOnField(updatedPlayersOnField);
        saveStateToHistory({ playersOnField: updatedPlayersOnField }); // Save history
    }, [playersOnField, saveStateToHistory]);

    // Drawing Handlers (Moved here)
    const handleDrawingStart = useCallback((point: Point) => {
        const newDrawings = [...drawings, [point]];
        setDrawings(newDrawings); // Use setter from this hook
        saveStateToHistory({ drawings: newDrawings }); 
    }, [drawings, saveStateToHistory]);

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
        // Final state is already set by handleDrawingAddPoint, just save to history
        saveStateToHistory({ drawings }); // Save final path state to history
    }, [drawings, saveStateToHistory]);

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
        const updatedOpponents = [...opponents, newOpponent];
        setOpponents(updatedOpponents);
        saveStateToHistory({ opponents: updatedOpponents });
    }, [opponents, saveStateToHistory]);

    const handleOpponentMove = useCallback((opponentId: string, relX: number, relY: number) => {
        // Continuous update - no history save needed here
        setOpponents(prevOpponents =>
            prevOpponents.map(opp =>
                opp.id === opponentId ? { ...opp, relX, relY } : opp
            )
        );
    }, []); // No dependency on opponents needed for setter callback

    const handleOpponentMoveEnd = useCallback(() => {
        saveStateToHistory({ opponents }); // Just save the current opponents state
    }, [opponents, saveStateToHistory]);

    const handleOpponentRemove = useCallback((opponentId: string) => {
        const updatedOpponents = opponents.filter(opp => opp.id !== opponentId);
        setOpponents(updatedOpponents);
        saveStateToHistory({ opponents: updatedOpponents });
    }, [opponents, saveStateToHistory]);

    // Player Management Handlers (Moved here)
    const handleRenamePlayer = useCallback(async (playerId: string, playerData: { name: string; nickname: string }) => {
        logger.log(`[useGameState] handleRenamePlayer called for ID: ${playerId}, with data:`, playerData);
        try {
            const updatedPlayerFromManager = await updatePlayerInMasterRoster(playerId, { 
                name: playerData.name, 
                nickname: playerData.nickname 
            });

            if (updatedPlayerFromManager) {
                const latestRoster = await getMasterRosterFromManager();
                setAvailablePlayers(latestRoster);

                setPlayersOnField(prevPlayersOnField => 
                    prevPlayersOnField.map(p => 
            p.id === playerId ? { ...p, name: playerData.name, nickname: playerData.nickname } : p
                    )
        );

                saveStateToHistory({ 
                    playersOnField: playersOnField.map(p => // This should use the updated playersOnField state for consistency
            p.id === playerId ? { ...p, name: playerData.name, nickname: playerData.nickname } : p
                    )
                });
                logger.log(`[useGameState] Player ${playerId} renamed to ${playerData.name}. Roster and field updated.`);
            } else {
                logger.error(`[useGameState] Failed to update player ${playerId} via masterRosterManager.`);
            }
        } catch (error) {
            logger.error(`[useGameState] Error in handleRenamePlayer for ID ${playerId}:`, error);
        }
    }, [playersOnField, saveStateToHistory, setAvailablePlayers, setPlayersOnField]);

    // --- Add Goalie Handler Here ---
    const handleToggleGoalie = useCallback(async (playerId: string) => {
        logger.log(`[useGameState:handleToggleGoalie] Per-game toggle called for ${playerId}`);
        const playerToToggle = availablePlayers.find(p => p.id === playerId);
        if (!playerToToggle) {
            logger.error(`[useGameState:handleToggleGoalie] Player ${playerId} not found.`);
            return;
        }
        const targetGoalieStatus = !(playerToToggle.isGoalie ?? false);

        try {
            // Update goalie status per-game instead of globally
            const updatedAvailablePlayers = availablePlayers.map(p => {
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

            // Update players on field to match the goalie change
            const newPlayersOnFieldState = playersOnField.map(fieldPlayer => {
                const updatedPlayer = updatedAvailablePlayers.find(p => p.id === fieldPlayer.id);
                return updatedPlayer ? { ...fieldPlayer, isGoalie: updatedPlayer.isGoalie } : fieldPlayer;
            });

            setPlayersOnField(newPlayersOnFieldState);

            // Save history for playersOnField change using the computed state
            saveStateToHistory({ 
                playersOnField: newPlayersOnFieldState,
                availablePlayers: updatedAvailablePlayers 
            });
    
            logger.log(`[useGameState:handleToggleGoalie] Per-game goalie status for ${playerId} to ${targetGoalieStatus}. Local state updated.`);
        } catch (error) {
            logger.error(`[useGameState:handleToggleGoalie] Error toggling goalie for ID ${playerId}:`, error);
        }
    }, [availablePlayers, playersOnField, saveStateToHistory, setAvailablePlayers, setPlayersOnField]);

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