import { renderHook, act } from '@testing-library/react';
import type { SetStateAction } from 'react';
import type { SavedGamesCollection, Player, AppState } from '@/types';
import { useNewGameFlow } from './useNewGameFlow';

const mockGetSavedGames = jest.fn();

jest.mock('@/utils/savedGames', () => {
  const actual = jest.requireActual('@/utils/savedGames');
  return {
    ...actual,
    getSavedGames: (...args: unknown[]) => mockGetSavedGames(...args),
  };
});

jest.mock('@/utils/appSettings', () => ({
  saveCurrentGameIdSetting: jest.fn(),
}));

jest.mock('../utils/newGameHandlers', () => ({
  startNewGameWithSetup: jest.fn(),
  cancelNewGameSetup: jest.fn(),
}));

const players: Player[] = [{ id: 'p1', name: 'Player 1', isGoalie: false }];

const createAppState = (overrides: Partial<AppState> = {}): AppState => ({
  playersOnField: [],
  opponents: [],
  drawings: [],
  availablePlayers: players,
  showPlayerNames: true,
  teamName: 'Snapshot Team',
  gameEvents: [],
  opponentName: 'Snapshot Opponent',
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
  ...overrides,
});

const createSetState = <T,>(initial: T) => {
  let state = initial;
  const setter = jest.fn((value: SetStateAction<T>) => {
    state = typeof value === 'function' ? (value as (prev: T) => T)(state) : value;
  });
  return { setter, getState: () => state };
};

describe('useNewGameFlow', () => {
  const baseOptions = () => {
    const savedGames: SavedGamesCollection = { current: createAppState() };
    const savedGamesState = createSetState(savedGames);

    return {
      savedGames,
      savedGamesState,
    };
  };

  const t = (_key: string, fallback?: string) => fallback ?? _key;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSavedGames.mockReset();
  });

  it('prefers fresh storage snapshot when prompting to save current game', async () => {
    const { savedGames } = baseOptions();
    mockGetSavedGames.mockResolvedValue({
      current: createAppState({ teamName: 'Fresh Team', opponentName: 'Fresh Opponent' }),
    });

    const { result } = renderHook(() =>
      useNewGameFlow({
        availablePlayers: players,
        savedGames,
        setSavedGames: jest.fn(),
        currentGameId: 'current',
        setIsNewGameSetupModalOpen: jest.fn(),
        setIsRosterModalOpen: jest.fn(),
        setHasSkippedInitialSetup: jest.fn(),
        setHighlightRosterButton: jest.fn(),
        setIsPlayed: jest.fn(),
        resetHistory: jest.fn(),
        dispatchGameSession: jest.fn(),
        setCurrentGameId: jest.fn(),
        queryClient: { invalidateQueries: jest.fn() } as unknown as Parameters<typeof useNewGameFlow>[0]['queryClient'],
        showToast: jest.fn(),
        t: t as Parameters<typeof useNewGameFlow>[0]['t'],
        defaultSubIntervalMinutes: 5,
      }),
    );

    await act(async () => {
      await result.current.handleStartNewGame();
    });

    expect(result.current.showSaveBeforeNewConfirm).toBe(true);
    expect(result.current.gameIdentifierForSave).toBe('Fresh Team vs Fresh Opponent');
  });

  it('surfaces roster modal when no players are available', async () => {
    mockGetSavedGames.mockResolvedValue({});

    const { result } = renderHook(() =>
      useNewGameFlow({
        availablePlayers: [],
        savedGames: {},
        setSavedGames: jest.fn(),
        currentGameId: null,
        setIsNewGameSetupModalOpen: jest.fn(),
        setIsRosterModalOpen: jest.fn(),
        setHasSkippedInitialSetup: jest.fn(),
        setHighlightRosterButton: jest.fn(),
        setIsPlayed: jest.fn(),
        resetHistory: jest.fn(),
        dispatchGameSession: jest.fn(),
        setCurrentGameId: jest.fn(),
        queryClient: { invalidateQueries: jest.fn() } as unknown as Parameters<typeof useNewGameFlow>[0]['queryClient'],
        showToast: jest.fn(),
        t: t as Parameters<typeof useNewGameFlow>[0]['t'],
        defaultSubIntervalMinutes: 5,
      }),
    );

    await act(async () => {
      await result.current.handleStartNewGame();
    });

    expect(result.current.showNoPlayersConfirm).toBe(true);
  });
});
