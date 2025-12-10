import type { SavedGamesCollection, Player, AppState } from '@/types';
import type { GameSessionAction } from '@/hooks/useGameSessionReducer';
import type { QueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';

import { startNewGameWithSetup, cancelNewGameSetup } from './newGameHandlers';

const createSetStateMock = <T,>(initial: T) => {
  let state = initial;
  const setter = jest.fn((updater: T | ((prev: T) => T)) => {
    state = typeof updater === 'function' ? (updater as (prev: T) => T)(state) : updater;
  });
  return {
    getState: () => state,
    setter,
  };
};

const mockPlayers: Player[] = [
  { id: 'p1', name: 'Player 1', isGoalie: false },
  { id: 'p2', name: 'Player 2', isGoalie: true },
];

describe('newGameHandlers', () => {
  it('clears playerIdsForNewGame after successful start', async () => {
    const savedGamesState = createSetStateMock<SavedGamesCollection>({});
    const setPlayerIdsForNewGame = jest.fn();
    const dispatchGameSession = jest.fn();
    const setCurrentGameId = jest.fn();
    const closeNewGameSetupModal = jest.fn();
    const setNewGameDemandFactor = jest.fn();
    const setHighlightRosterButton = jest.fn();
    const setIsPlayed = jest.fn();
    const resetHistory = jest.fn();
    const queryClient = {
      invalidateQueries: jest.fn().mockResolvedValue(undefined),
    } as unknown as QueryClient;
    const showToast = jest.fn();
    const deps = {
      availablePlayers: mockPlayers,
      savedGames: savedGamesState.getState(),
      setSavedGames: savedGamesState.setter,
      resetHistory,
      dispatchGameSession: dispatchGameSession as unknown as (action: GameSessionAction) => void,
      setCurrentGameId,
      closeNewGameSetupModal,
      setNewGameDemandFactor,
      setPlayerIdsForNewGame,
      setHighlightRosterButton,
      setIsPlayed,
      queryClient,
      showToast,
      t: ((_key: string, fallback?: string) => fallback ?? _key) as TFunction,
      utilSaveGame: jest.fn().mockImplementation(async (_id: string, state: AppState) => state),
      utilSaveCurrentGameIdSetting: jest.fn().mockResolvedValue(undefined),
      defaultSubIntervalMinutes: 5,
    };

    await startNewGameWithSetup(deps, {
      initialSelectedPlayerIds: [],
      homeTeamName: 'Home Team',
      opponentName: 'Away Team',
      gameDate: '2024-10-01',
      gameLocation: 'Main Arena',
      gameTime: '15:00',
      seasonId: null,
      tournamentId: null,
      numPeriods: 2,
      periodDuration: 25,
      homeOrAway: 'home',
      demandFactor: 1,
      ageGroup: 'U12',
      tournamentLevel: 'regular',
      tournamentSeriesId: null,
      isPlayed: true,
      teamId: null,
      availablePlayersForGame: mockPlayers,
      selectedPersonnelIds: [],
      leagueId: '',
      customLeagueName: '',
    });

    expect(setPlayerIdsForNewGame).toHaveBeenCalledWith(null);
    expect(closeNewGameSetupModal).toHaveBeenCalledTimes(1);
    expect(setHighlightRosterButton).toHaveBeenCalledWith(true);
  });

  it('clears playerIdsForNewGame when setup is cancelled', () => {
    const setPlayerIdsForNewGame = jest.fn();
    const closeNewGameSetupModal = jest.fn();

    cancelNewGameSetup({
      setHasSkippedInitialSetup: jest.fn(),
      closeNewGameSetupModal,
      setNewGameDemandFactor: jest.fn(),
      setPlayerIdsForNewGame,
    });

    expect(setPlayerIdsForNewGame).toHaveBeenCalledWith(null);
    expect(closeNewGameSetupModal).toHaveBeenCalledTimes(1);
  });
});
