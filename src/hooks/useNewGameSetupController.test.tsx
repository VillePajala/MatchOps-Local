/**
 * L.3b: the create-side level crossing. Confirming the setup persists the
 * new game as CURRENT (via buildAndPersistNewGame) and hands over to the
 * page's enterMatch contract (fresh match mount); a premium block or a
 * failed save keeps the modal open and never enters the match.
 */
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useNewGameSetupController } from './useNewGameSetupController';
import { queryKeys } from '@/config/queryKeys';

const mockShowToast = jest.fn();
jest.mock('@/contexts/ToastProvider', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));
jest.mock('@/hooks/useDataStore', () => ({
  useDataStore: () => ({ userId: 'user-1' }),
}));
const mockCanCreate = jest.fn();
const mockShowUpgradePrompt = jest.fn();
jest.mock('@/hooks/usePremium', () => ({
  usePremium: () => ({ canCreate: mockCanCreate, showUpgradePrompt: mockShowUpgradePrompt }),
}));
jest.mock('@/utils/savedGames', () => ({
  getSavedGames: jest.fn(),
  saveGame: jest.fn(),
}));
jest.mock('@/utils/appSettings', () => ({
  saveCurrentGameIdSetting: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/utils/masterRosterManager', () => ({
  getMasterRoster: jest.fn(),
}));
jest.mock('@/utils/timerStateManager', () => ({
  clearTimerState: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/utils/timerAnchor', () => ({
  clearTimerAnchor: jest.fn(),
}));
jest.mock('@/utils/playtimePlanner/gameSubs', () => ({
  setGameSubs: jest.fn(async () => true),
}));
jest.mock('@/utils/playtimePlanner/planLinks', () => ({
  setPlanLink: jest.fn(async () => true),
}));
jest.mock('@/utils/logger', () => {
  const makeLogger = () => ({
    debug: jest.fn(), log: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
  });
  return { __esModule: true, default: makeLogger(), createLogger: makeLogger };
});

import { getSavedGames, saveGame } from '@/utils/savedGames';
import { saveCurrentGameIdSetting } from '@/utils/appSettings';
import { getMasterRoster } from '@/utils/masterRosterManager';
import { clearTimerState } from '@/utils/timerStateManager';
import { clearTimerAnchor } from '@/utils/timerAnchor';
import type { Player } from '@/types';

const mockedGetSavedGames = getSavedGames as jest.MockedFunction<typeof getSavedGames>;
const mockedGetMasterRoster = getMasterRoster as jest.MockedFunction<typeof getMasterRoster>;
const mockedSaveGame = saveGame as jest.MockedFunction<typeof saveGame>;

const roster: Player[] = [
  { id: 'p1', name: 'Player 1', isGoalie: false },
  { id: 'p2', name: 'Player 2', isGoalie: true },
];

/** The modal's onStart positional args up to the optional prefill. */
const startArgs = (): Parameters<
  ReturnType<typeof useNewGameSetupController>['handleStartNewGameWithSetup']
> => [
  ['p1'], 'Home', 'Away', '2026-07-15', 'Arena', '18:00',
  null, null, 2, 25, 'home', 1, 'U12', '', null, true, null,
  roster, [], '', '', 'soccer', undefined, undefined,
];

describe('useNewGameSetupController (L.3b level crossing)', () => {
  let queryClient: QueryClient;
  const onGameCreated = jest.fn();

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
      () => useNewGameSetupController({ onGameCreated }),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(utils.result.current.masterRoster).toHaveLength(2));
    return utils;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetSavedGames.mockResolvedValue({});
    mockedGetMasterRoster.mockResolvedValue(roster);
    mockCanCreate.mockReturnValue(true);
    mockedSaveGame.mockImplementation(async (_id, state) => state);
  });

  it('creating a game: clears stale timer state, persists it as current, enters the match', async () => {
    const { result } = await renderController();
    await act(async () => {
      await result.current.handleStartNewGameWithSetup(...startArgs());
    });
    // Same pre-switch hygiene as picking a saved game (L.3a).
    expect(clearTimerState).toHaveBeenCalledWith('user-1');
    expect(clearTimerAnchor).toHaveBeenCalled();
    expect(mockedSaveGame).toHaveBeenCalledWith(expect.stringMatching(/^game_/), expect.any(Object), 'user-1');
    expect(saveCurrentGameIdSetting).toHaveBeenCalledWith(expect.stringMatching(/^game_/), 'user-1');
    expect(onGameCreated).toHaveBeenCalledWith(expect.stringMatching(/^game_/));
  });

  it('resets the demand-factor slider back to neutral after a successful create', async () => {
    const { result } = await renderController();
    act(() => {
      result.current.setNewGameDemandFactor(1.5);
    });
    await waitFor(() => expect(result.current.newGameDemandFactor).toBe(1.5));
    await act(async () => {
      await result.current.handleStartNewGameWithSetup(...startArgs());
    });
    expect(result.current.newGameDemandFactor).toBe(1);
  });

  it('premium limit block: no save, no match entry - the modal stays open', async () => {
    mockCanCreate.mockReturnValue(false);
    mockedGetSavedGames.mockResolvedValue({
      g1: { seasonId: 'season-1' },
    } as unknown as Awaited<ReturnType<typeof getSavedGames>>);
    const { result } = await renderController();
    const args = startArgs();
    args[6] = 'season-1'; // seasonId - limits apply per competition
    await act(async () => {
      await result.current.handleStartNewGameWithSetup(...args);
    });
    expect(mockShowUpgradePrompt).toHaveBeenCalledWith('game', 1);
    expect(mockedSaveGame).not.toHaveBeenCalled();
    expect(onGameCreated).not.toHaveBeenCalled();
  });

  it('save failure: toast shown, no match entry', async () => {
    mockedSaveGame.mockRejectedValue(new Error('io'));
    const { result } = await renderController();
    await act(async () => {
      await result.current.handleStartNewGameWithSetup(...startArgs());
    });
    expect(mockShowToast).toHaveBeenCalledWith(expect.any(String), 'error');
    expect(onGameCreated).not.toHaveBeenCalled();
  });

  it('cancel resets the demand-factor slider', async () => {
    const { result } = await renderController();
    act(() => {
      result.current.setNewGameDemandFactor(0.75);
    });
    await waitFor(() => expect(result.current.newGameDemandFactor).toBe(0.75));
    act(() => {
      result.current.handleCancelNewGameSetup();
    });
    expect(result.current.newGameDemandFactor).toBe(1);
  });

  it('invalidates the shared current-game-id query so the fresh mount boots the NEW game', async () => {
    const { result } = await renderController();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    await act(async () => {
      await result.current.handleStartNewGameWithSetup(...startArgs());
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: [...queryKeys.appSettingsCurrentGameId, 'user-1'],
    });
  });
});
