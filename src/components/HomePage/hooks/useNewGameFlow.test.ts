/**
 * @unit
 * @regression
 * Validates that the grouped gameState/ui/orchestration/dependencies contexts pass through to handlers after the parameter grouping refactor.
 */
import { renderHook, act } from '@testing-library/react';
import type { SetStateAction } from 'react';
import type { QueryClient } from '@tanstack/react-query';
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
  const t = (_key: string, fallback?: string) => fallback ?? _key;
  type UseNewGameFlowArgs = Parameters<typeof useNewGameFlow>[0];

  const buildOptions = (
    overrides: {
      gameState?: Partial<UseNewGameFlowArgs['gameState']>;
      ui?: Partial<UseNewGameFlowArgs['ui']>;
      orchestration?: Partial<UseNewGameFlowArgs['orchestration']>;
      dependencies?: Partial<UseNewGameFlowArgs['dependencies']>;
    } = {},
  ): { options: UseNewGameFlowArgs; savedGamesState: ReturnType<typeof createSetState<SavedGamesCollection>> } => {
    const savedGames: SavedGamesCollection = overrides.gameState?.savedGames ?? { current: createAppState() };
    const savedGamesState = createSetState(savedGames);

    const options: UseNewGameFlowArgs = {
      gameState: {
        availablePlayers: overrides.gameState?.availablePlayers ?? players,
        savedGames,
        currentGameId: overrides.gameState?.currentGameId ?? 'current',
        ...overrides.gameState,
      },
      ui: {
        openNewGameSetupModal: jest.fn(),
        closeNewGameSetupModal: jest.fn(),
        openRosterModal: jest.fn(),
        setHasSkippedInitialSetup: jest.fn(),
        setHighlightRosterButton: jest.fn(),
        setIsPlayed: jest.fn(),
        ...overrides.ui,
      },
      orchestration: {
        setSavedGames: overrides.orchestration?.setSavedGames ?? savedGamesState.setter,
        resetHistory: jest.fn(),
        dispatchGameSession: jest.fn(),
        setCurrentGameId: jest.fn(),
        ...overrides.orchestration,
      },
      dependencies: {
        queryClient: overrides.dependencies?.queryClient ?? ({ invalidateQueries: jest.fn() } as unknown as QueryClient),
        showToast: overrides.dependencies?.showToast ?? jest.fn(),
        t: overrides.dependencies?.t ?? (t as UseNewGameFlowArgs['dependencies']['t']),
        defaultSubIntervalMinutes: overrides.dependencies?.defaultSubIntervalMinutes ?? 5,
      },
    };

    return { options, savedGamesState };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSavedGames.mockReset();
  });

  it('prefers fresh storage snapshot when prompting to save current game', async () => {
    const { options } = buildOptions();
    mockGetSavedGames.mockResolvedValue({
      current: createAppState({ teamName: 'Fresh Team', opponentName: 'Fresh Opponent' }),
    });

    const { result } = renderHook(() =>
      useNewGameFlow(options),
    );

    await act(async () => {
      await result.current.handleStartNewGame();
    });

    expect(result.current.showSaveBeforeNewConfirm).toBe(true);
    expect(result.current.gameIdentifierForSave).toBe('Fresh Team vs Fresh Opponent');
  });

  it('surfaces roster modal when no players are available', async () => {
    mockGetSavedGames.mockResolvedValue({});

    const { options } = buildOptions({
      gameState: { availablePlayers: [], savedGames: {}, currentGameId: null },
    });

    const { result } = renderHook(() =>
      useNewGameFlow(options),
    );

    await act(async () => {
      await result.current.handleStartNewGame();
    });

    expect(result.current.showNoPlayersConfirm).toBe(true);
  });
});
