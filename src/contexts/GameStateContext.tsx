'use client';

import React, { createContext, useContext, useState, type ReactNode } from 'react';
import { useGameSessionCoordination } from '@/components/HomePage/hooks/useGameSessionCoordination';
import type { GameSessionState } from '@/hooks/useGameSessionReducer';
import type { GameSessionAction } from '@/hooks/useGameSessionReducer';
import type { Player, AppState } from '@/types';
import { DEFAULT_GAME_ID } from '@/config/constants';

// Default initial state (matches useGameOrchestration's initialState)
const defaultInitialState: AppState = {
  playersOnField: [],
  opponents: [],
  drawings: [],
  availablePlayers: [],
  showPlayerNames: true,
  teamName: "My Team",
  gameEvents: [],
  opponentName: "Opponent",
  gameDate: new Date().toISOString().split('T')[0],
  homeScore: 0,
  awayScore: 0,
  gameNotes: '',
  homeOrAway: 'home',
  numberOfPeriods: 2,
  periodDurationMinutes: 15,
  currentPeriod: 1,
  gameStatus: 'notStarted',
  demandFactor: 1,
  selectedPlayerIds: [],
  gamePersonnel: [],
  seasonId: '',
  tournamentId: '',
  ageGroup: '',
  tournamentLevel: '',
  gameLocation: '',
  gameTime: '',
  subIntervalMinutes: 5,
  completedIntervalDurations: [],
  lastSubConfirmationTimeSeconds: 0,
  tacticalDiscs: [],
  tacticalDrawings: [],
  tacticalBallPosition: { relX: 0.5, relY: 0.5 },
};

/**
 * GameStateContext - Week 2-3 PR1
 *
 * Provides shared game state to all components, reducing prop drilling
 * in useGameOrchestration by ~500 lines.
 *
 * This context manages:
 * - Game session state (score, timer, periods, etc.)
 * - Current game ID
 * - Available players roster
 */

export interface GameStateContextValue {
  // Shared state
  gameSessionState: GameSessionState;
  currentGameId: string | null;
  availablePlayers: Player[];

  // Dispatch/setters
  dispatchGameSession: React.Dispatch<GameSessionAction>;
  setCurrentGameId: (id: string | null) => void;
  setAvailablePlayers: (players: Player[]) => void;

  // Session coordination handlers (for backward compatibility)
  sessionCoordination: ReturnType<typeof useGameSessionCoordination>;
}

const GameStateContext = createContext<GameStateContextValue | undefined>(undefined);

export interface GameStateProviderProps {
  children: ReactNode;
  /**
   * Initial state for the game session.
   * If not provided, uses default initial state.
   */
  initialState?: AppState;
}

/**
 * GameStateProvider
 *
 * Wraps the application to provide shared game state via context.
 * This eliminates the need to pass state through multiple levels of props.
 */
export const GameStateProvider: React.FC<GameStateProviderProps> = ({
  children,
  initialState = defaultInitialState
}) => {
  // Game session state managed by coordination hook
  const sessionCoordination = useGameSessionCoordination({
    initialState,
  });

  // Extract session state and dispatcher
  const { gameSessionState, dispatchGameSession } = sessionCoordination;

  // Additional shared state
  const [currentGameId, setCurrentGameId] = useState<string | null>(DEFAULT_GAME_ID);
  const [availablePlayers, setAvailablePlayers] = useState<Player[]>([]);

  const value: GameStateContextValue = {
    // Shared state
    gameSessionState,
    currentGameId,
    availablePlayers,

    // Dispatch/setters
    dispatchGameSession,
    setCurrentGameId,
    setAvailablePlayers,

    // Session coordination (includes handlers)
    sessionCoordination,
  };

  return (
    <GameStateContext.Provider value={value}>
      {children}
    </GameStateContext.Provider>
  );
};

/**
 * useGameState
 *
 * Hook to access shared game state from any component.
 * Must be used within a GameStateProvider.
 *
 * @throws Error if used outside of GameStateProvider
 *
 * @example
 * ```tsx
 * const { gameSessionState, currentGameId, dispatchGameSession } = useGameState();
 * ```
 */
export const useGameState = (): GameStateContextValue => {
  const context = useContext(GameStateContext);

  if (context === undefined) {
    throw new Error('useGameState must be used within a GameStateProvider');
  }

  return context;
};
