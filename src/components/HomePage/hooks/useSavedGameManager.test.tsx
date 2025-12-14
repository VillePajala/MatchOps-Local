import { renderHook, act } from '@testing-library/react';
import type { SetStateAction } from 'react';
import type { AppState, SavedGamesCollection } from '@/types';
import { useSavedGameManager } from './useSavedGameManager';
import { initialGameSessionStatePlaceholder } from '@/hooks/useGameSessionReducer';

jest.mock('@/utils/teams', () => ({
  getTeam: jest.fn().mockResolvedValue(null),
  getTeams: jest.fn().mockResolvedValue([]),
}));

jest.mock('@/utils/storage', () => ({
  removeStorageItem: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/utils/appSettings', () => ({
  saveCurrentGameIdSetting: jest.fn().mockResolvedValue(undefined),
}));

const createAppState = (): AppState => ({
  playersOnField: [],
  opponents: [],
  drawings: [],
  availablePlayers: [],
  showPlayerNames: true,
  teamName: 'Team Alpha',
  gameEvents: [],
  opponentName: 'Team Beta',
  gameDate: '2024-01-01',
  homeScore: 0,
  awayScore: 0,
  gameNotes: '',
  homeOrAway: 'home',
  numberOfPeriods: 2,
  periodDurationMinutes: 10,
  currentPeriod: 1,
  gameStatus: 'notStarted',
  selectedPlayerIds: [],
  seasonId: '',
  tournamentId: '',
  demandFactor: 1,
  gameLocation: '',
  gameTime: '',
  subIntervalMinutes: 5,
  completedIntervalDurations: [],
  lastSubConfirmationTimeSeconds: 0,
  tacticalDiscs: [],
  tacticalDrawings: [],
  tacticalBallPosition: { relX: 0.5, relY: 0.5 },
  gamePersonnel: [],
});

const createStateSetter = <T,>(initial: T) => {
  let state = initial;
  const setter = jest.fn((value: SetStateAction<T>) => {
    state = typeof value === 'function' ? (value as (prev: T) => T)(state) : value;
  });
  return { setter, getState: () => state };
};

const baseOptions = () => {
  const savedGame = createAppState();
  const savedGames: SavedGamesCollection = { 'game-1': savedGame };
  const savedGamesState = createStateSetter<SavedGamesCollection>(savedGames);

  return {
    savedGames,
    savedGamesState,
    savedGame,
  };
};

describe('useSavedGameManager', () => {
  const t = (key: string, fallback?: string) => fallback ?? key;

  const createHook = () => {
    const { savedGames, savedGamesState, savedGame } = baseOptions();
    const setCurrentGameId = jest.fn();
    const onCloseLoadGameModal = jest.fn();
    const props = {
      savedGames,
      setSavedGames: savedGamesState.setter,
      currentGameId: null,
      setCurrentGameId,
      availablePlayers: [],
      setAvailablePlayers: jest.fn(),
      masterRoster: [],
      setPlayersOnField: jest.fn(),
      setOpponents: jest.fn(),
      setDrawings: jest.fn(),
      setTacticalDiscs: jest.fn(),
      setTacticalDrawings: jest.fn(),
      setTacticalBallPosition: jest.fn(),
      setIsPlayed: jest.fn(),
      dispatchGameSession: jest.fn(),
      resetHistory: jest.fn(),
      initialState: savedGame,
      initialGameSessionData: initialGameSessionStatePlaceholder,
      queryClient: { invalidateQueries: jest.fn().mockResolvedValue(undefined) } as unknown as Parameters<typeof useSavedGameManager>[0]['queryClient'],
      t: t as Parameters<typeof useSavedGameManager>[0]['t'],
      onCloseLoadGameModal,
    };

    return { props, hook: renderHook(() => useSavedGameManager(props)), setCurrentGameId, onCloseLoadGameModal };
  };

  it('skips state updates when unmounted during handleLoadGame', async () => {
    const { hook, setCurrentGameId, onCloseLoadGameModal } = createHook();

    await act(async () => {
      const pending = hook.result.current.handleLoadGame('game-1');
      hook.unmount();
      await pending;
    });

    expect(setCurrentGameId).not.toHaveBeenCalled();
    expect(onCloseLoadGameModal).not.toHaveBeenCalled();
  });

  it('updates identifiers when load completes while mounted', async () => {
    const { hook, setCurrentGameId, onCloseLoadGameModal } = createHook();

    await act(async () => {
      await hook.result.current.handleLoadGame('game-1');
    });

    expect(setCurrentGameId).toHaveBeenCalledWith('game-1');
    expect(onCloseLoadGameModal).toHaveBeenCalledTimes(1);
  });
});
