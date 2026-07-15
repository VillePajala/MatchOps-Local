/**
 * L.3a: the LoadGame level crossing. Picking a game persists it as current
 * and hands over to the page's enterMatch (fresh match mount); deleting the
 * persisted current game falls back to the latest remaining one and asks the
 * page to remount any live match. Ported from useGamePersistence's Load/
 * Delete behavior suites alongside the code move.
 */
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLoadGameController } from './useLoadGameController';
import { queryKeys } from '@/config/queryKeys';
import { DEFAULT_GAME_ID } from '@/config/constants';

const mockShowToast = jest.fn();
jest.mock('@/contexts/ToastProvider', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));
jest.mock('@/hooks/useDataStore', () => ({
  useDataStore: () => ({ userId: 'user-1' }),
}));
jest.mock('@/utils/savedGames', () => ({
  getSavedGames: jest.fn(),
  deleteGame: jest.fn(),
  getLatestGameId: jest.fn(),
}));
jest.mock('@/utils/appSettings', () => ({
  getCurrentGameIdSetting: jest.fn(),
  saveCurrentGameIdSetting: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/utils/timerStateManager', () => ({
  clearTimerState: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/utils/timerAnchor', () => ({
  clearTimerAnchor: jest.fn(),
}));
jest.mock('@/utils/playtimePlanner/gameSubs', () => ({
  deleteGameSubs: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/utils/playtimePlanner/planLinks', () => ({
  deletePlanLink: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/utils/masterRosterManager', () => ({
  getMasterRoster: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/utils/seasons', () => ({ getSeasons: jest.fn().mockResolvedValue([]) }));
jest.mock('@/utils/tournaments', () => ({ getTournaments: jest.fn().mockResolvedValue([]) }));
jest.mock('@/utils/logger', () => {
  const makeLogger = () => ({
    debug: jest.fn(), log: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
  });
  return { __esModule: true, default: makeLogger(), createLogger: makeLogger };
});

import { getSavedGames, deleteGame as utilDeleteGame, getLatestGameId } from '@/utils/savedGames';
import { getCurrentGameIdSetting, saveCurrentGameIdSetting } from '@/utils/appSettings';
import { clearTimerState } from '@/utils/timerStateManager';
import { clearTimerAnchor } from '@/utils/timerAnchor';
import { deleteGameSubs } from '@/utils/playtimePlanner/gameSubs';
import { deletePlanLink } from '@/utils/playtimePlanner/planLinks';

const mockedGetSavedGames = getSavedGames as jest.MockedFunction<typeof getSavedGames>;
const mockedGetCurrentId = getCurrentGameIdSetting as jest.MockedFunction<typeof getCurrentGameIdSetting>;
const mockedDeleteGame = utilDeleteGame as jest.MockedFunction<typeof utilDeleteGame>;
const mockedGetLatestGameId = getLatestGameId as jest.MockedFunction<typeof getLatestGameId>;

const games = {
  g1: { teamName: 'A', opponentName: 'B' },
  g2: { teamName: 'C', opponentName: 'D' },
} as unknown as Awaited<ReturnType<typeof getSavedGames>>;

describe('useLoadGameController (L.3a level crossing)', () => {
  let queryClient: QueryClient;
  const onEnterMatch = jest.fn();
  const onActiveGameDeleted = jest.fn();

  const createWrapper = () => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
    });
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    Wrapper.displayName = 'TestQueryClientWrapper';
    return Wrapper;
  };

  const renderController = async () => {
    const utils = renderHook(
      () => useLoadGameController({ onEnterMatch, onActiveGameDeleted }),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(Object.keys(utils.result.current.savedGames)).toHaveLength(2));
    return utils;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetSavedGames.mockResolvedValue(games);
    mockedGetCurrentId.mockResolvedValue('g1');
  });

  it('picking a game: clears stale timer state, persists the id, enters the match', async () => {
    const { result } = await renderController();
    await act(async () => {
      await result.current.handleLoadGame('g2');
    });
    // Pre-switch hygiene, exactly like the old match-side loader.
    expect(clearTimerState).toHaveBeenCalledWith('user-1');
    expect(clearTimerAnchor).toHaveBeenCalled();
    expect(saveCurrentGameIdSetting).toHaveBeenCalledWith('g2', 'user-1');
    expect(onEnterMatch).toHaveBeenCalledTimes(1);
  });

  it('deleting a NON-current game cleans planner bookkeeping and updates the cache only', async () => {
    mockedDeleteGame.mockResolvedValue('g2');
    const { result } = await renderController();
    await act(async () => {
      await result.current.handleDeleteGame('g2');
    });
    expect(deleteGameSubs).toHaveBeenCalledWith('g2');
    expect(deletePlanLink).toHaveBeenCalledWith('g2');
    expect(queryClient.getQueryData([...queryKeys.savedGames, 'user-1'])).toEqual({ g1: games.g1 });
    expect(saveCurrentGameIdSetting).not.toHaveBeenCalled();
    expect(onActiveGameDeleted).not.toHaveBeenCalled();
  });

  it('deleting the PERSISTED current game falls back to the latest and remounts a live match', async () => {
    mockedDeleteGame.mockResolvedValue('g1');
    mockedGetLatestGameId.mockReturnValue('g2');
    const { result } = await renderController();
    await waitFor(() => expect(result.current.currentGameId).toBe('g1'));
    await act(async () => {
      await result.current.handleDeleteGame('g1');
    });
    expect(saveCurrentGameIdSetting).toHaveBeenCalledWith('g2', 'user-1');
    expect(onActiveGameDeleted).toHaveBeenCalledTimes(1);
  });

  it('deleting the LAST game falls back to the default workspace', async () => {
    mockedGetSavedGames.mockResolvedValue({ g1: games.g1 } as typeof games);
    mockedDeleteGame.mockResolvedValue('g1');
    mockedGetLatestGameId.mockReturnValue(null);
    const { result } = renderHook(
      () => useLoadGameController({ onEnterMatch, onActiveGameDeleted }),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(result.current.currentGameId).toBe('g1'));
    await act(async () => {
      await result.current.handleDeleteGame('g1');
    });
    expect(saveCurrentGameIdSetting).toHaveBeenCalledWith(DEFAULT_GAME_ID, 'user-1');
  });

  it('refuses to delete the default workspace', async () => {
    const { result } = await renderController();
    await act(async () => {
      await result.current.handleDeleteGame(DEFAULT_GAME_ID);
    });
    expect(mockedDeleteGame).not.toHaveBeenCalled();
    expect(result.current.gameDeleteError).toBeTruthy();
  });

  it('load failure surfaces a toast and does not enter the match', async () => {
    (saveCurrentGameIdSetting as jest.Mock).mockRejectedValueOnce(new Error('io'));
    const { result } = await renderController();
    await act(async () => {
      await result.current.handleLoadGame('g2');
    });
    expect(mockShowToast).toHaveBeenCalledWith(expect.any(String), 'error');
    expect(onEnterMatch).not.toHaveBeenCalled();
  });
});
