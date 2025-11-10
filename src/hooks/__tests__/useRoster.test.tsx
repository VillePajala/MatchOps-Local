import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRoster } from '../useRoster';
import React from 'react';

jest.mock('@/utils/masterRosterManager', () => ({
  addPlayer: jest.fn(),
  updatePlayer: jest.fn(),
  removePlayer: jest.fn(),
  setGoalieStatus: jest.fn(),
}));

const { addPlayer, updatePlayer } = jest.requireMock('@/utils/masterRosterManager');

// Test wrapper with QueryClient
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'QueryClientWrapper';
  return Wrapper;
};

describe('useRoster', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('rollback update on error', async () => {
    const player = { id: 'p1', name: 'One', isGoalie: false, jerseyNumber: '', notes: '', receivedFairPlayCard: false };
    updatePlayer.mockRejectedValue(new Error('fail'));
    const { result } = renderHook(
      () => useRoster({ initialPlayers: [player], selectedPlayerIds: [] }),
      { wrapper: createWrapper() }
    );

    await act(async () => {
      await result.current.handleUpdatePlayer('p1', { name: 'Two' });
    });

    expect(result.current.availablePlayers[0].name).toBe('One');
    expect(result.current.isRosterUpdating).toBe(false);
  });

  test('adds player on success', async () => {
    const newPlayer = { id: 'p2', name: 'Two', isGoalie: false, jerseyNumber: '', notes: '', receivedFairPlayCard: false };
    addPlayer.mockResolvedValue(newPlayer);
    const { result } = renderHook(
      () => useRoster({ initialPlayers: [], selectedPlayerIds: [] }),
      { wrapper: createWrapper() }
    );

    await act(async () => {
      await result.current.handleAddPlayer({ name: 'Two', jerseyNumber: '', notes: '', nickname: '' });
    });

    expect(result.current.availablePlayers).toEqual([newPlayer]);
    expect(result.current.isRosterUpdating).toBe(false);
  });
});

