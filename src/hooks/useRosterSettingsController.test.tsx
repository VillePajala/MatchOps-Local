/**
 * L.2: club-roster editing extracted from useGameOrchestration so
 * RosterSettingsModal works from the page-level ClubModalsHost with no game
 * mounted. Covers the query sync, the add-validation rules (moved verbatim)
 * and the mutation wrappers.
 */
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRosterSettingsController } from './useRosterSettingsController';
import type { Player } from '@/types';

jest.mock('@/utils/logger', () => {
  const makeLogger = () => ({
    debug: jest.fn(), log: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
  });
  return { __esModule: true, default: makeLogger(), createLogger: makeLogger };
});
jest.mock('@/utils/masterRosterManager', () => ({
  getMasterRoster: jest.fn(),
  addPlayer: jest.fn(),
  updatePlayer: jest.fn(),
  removePlayer: jest.fn(),
  setGoalieStatus: jest.fn(),
}));
jest.mock('@/hooks/useDataStore', () => ({
  useDataStore: () => ({ userId: 'user-1' }),
}));

import { getMasterRoster, addPlayer, updatePlayer, removePlayer } from '@/utils/masterRosterManager';

const mockedGetMasterRoster = getMasterRoster as jest.MockedFunction<typeof getMasterRoster>;
const mockedAddPlayer = addPlayer as jest.MockedFunction<typeof addPlayer>;
const mockedUpdatePlayer = updatePlayer as jest.MockedFunction<typeof updatePlayer>;
const mockedRemovePlayer = removePlayer as jest.MockedFunction<typeof removePlayer>;

const player = (overrides: Partial<Player> = {}): Player => ({
  id: 'p1',
  name: 'Testaaja',
  jerseyNumber: '10',
  notes: '',
  nickname: '',
  ...overrides,
});

describe('useRosterSettingsController (L.2)', () => {
  const createWrapper = () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
    });
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    Wrapper.displayName = 'TestQueryClientWrapper';
    return Wrapper;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetMasterRoster.mockResolvedValue([player()]);
  });

  it('adopts the shared masterRoster query as availablePlayers', async () => {
    const { result } = renderHook(() => useRosterSettingsController(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.availablePlayers.map(p => p.name)).toEqual(['Testaaja']));
    expect(mockedGetMasterRoster).toHaveBeenCalledWith('user-1');
  });

  it('update wrapper delegates to the roster mutation', async () => {
    mockedUpdatePlayer.mockResolvedValue(player({ notes: 'left foot' }));
    const { result } = renderHook(() => useRosterSettingsController(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.availablePlayers).toHaveLength(1));

    await act(async () => {
      await result.current.handleUpdatePlayerForModal('p1', { notes: 'left foot' });
    });
    expect(mockedUpdatePlayer).toHaveBeenCalledWith('p1', { notes: 'left foot' }, 'user-1');
  });

  it('remove wrapper delegates to the roster mutation', async () => {
    mockedRemovePlayer.mockResolvedValue(true);
    const { result } = renderHook(() => useRosterSettingsController(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.availablePlayers).toHaveLength(1));

    await act(async () => {
      await result.current.handleRemovePlayerForModal('p1');
    });
    expect(mockedRemovePlayer).toHaveBeenCalledWith('p1', 'user-1');
  });

  it('add validation rejects duplicate names without mutating', async () => {
    const { result } = renderHook(() => useRosterSettingsController(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.availablePlayers).toHaveLength(1));

    await act(async () => {
      await result.current.handleAddPlayerForModal({ name: '  testaaja ', jerseyNumber: '', notes: '', nickname: '' });
    });
    expect(mockedAddPlayer).not.toHaveBeenCalled();
    expect(result.current.rosterError).toBeTruthy();
  });

  it('add validation rejects duplicate jersey numbers without mutating', async () => {
    const { result } = renderHook(() => useRosterSettingsController(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.availablePlayers).toHaveLength(1));

    await act(async () => {
      await result.current.handleAddPlayerForModal({ name: 'Uusi', jerseyNumber: '10', notes: '', nickname: '' });
    });
    expect(mockedAddPlayer).not.toHaveBeenCalled();
    expect(result.current.rosterError).toBeTruthy();
  });

  it('valid add delegates to the roster mutation', async () => {
    mockedAddPlayer.mockResolvedValue(player({ id: 'p2', name: 'Uusi', jerseyNumber: '7' }));
    const { result } = renderHook(() => useRosterSettingsController(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.availablePlayers).toHaveLength(1));

    await act(async () => {
      await result.current.handleAddPlayerForModal({ name: 'Uusi', jerseyNumber: '7', notes: '', nickname: '' });
    });
    expect(mockedAddPlayer).toHaveBeenCalled();
    expect(result.current.rosterError).toBeNull();
  });
});
