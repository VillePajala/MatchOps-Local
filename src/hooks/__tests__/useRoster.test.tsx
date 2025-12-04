/**
 * Tests for useRoster.ts - Player roster management hook
 * @critical - Manages player roster CRUD operations with optimistic updates
 *
 * Tests cover:
 * - Adding, updating, removing players
 * - Goalie status management
 * - Optimistic updates with rollback on error
 * - React Query cache invalidation
 * - Error handling and state management
 */

import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRoster } from '../useRoster';
import type { Player } from '@/types';

// Mock masterRosterManager
jest.mock('@/utils/masterRosterManager', () => ({
  addPlayer: jest.fn(),
  updatePlayer: jest.fn(),
  removePlayer: jest.fn(),
  setGoalieStatus: jest.fn(),
}));

// Mock logger
jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Import mocked functions
import {
  addPlayer,
  updatePlayer,
  removePlayer,
  setGoalieStatus,
} from '@/utils/masterRosterManager';

const mockedAddPlayer = addPlayer as jest.MockedFunction<typeof addPlayer>;
const mockedUpdatePlayer = updatePlayer as jest.MockedFunction<typeof updatePlayer>;
const mockedRemovePlayer = removePlayer as jest.MockedFunction<typeof removePlayer>;
const mockedSetGoalieStatus = setGoalieStatus as jest.MockedFunction<typeof setGoalieStatus>;

describe('useRoster', () => {
  let queryClient: QueryClient;

  // Helper to create wrapper with QueryClient
  const createWrapper = () => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    Wrapper.displayName = 'QueryClientWrapper';
    return Wrapper;
  };

  // Helper to create test players
  const createPlayer = (overrides: Partial<Player> = {}): Player => ({
    id: `player-${Date.now()}-${Math.random()}`,
    name: 'Test Player',
    jerseyNumber: '10',
    isGoalie: false,
    receivedFairPlayCard: false,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================
  // Initialization
  // ============================================
  describe('initialization', () => {
    it('should initialize with provided players', () => {
      const players = [createPlayer({ id: 'p1', name: 'Player 1' })];
      const wrapper = createWrapper();

      const { result } = renderHook(
        () => useRoster({ initialPlayers: players, selectedPlayerIds: ['p1'] }),
        { wrapper }
      );

      expect(result.current.availablePlayers).toHaveLength(1);
      expect(result.current.availablePlayers[0].name).toBe('Player 1');
    });

    it('should initialize with empty array', () => {
      const wrapper = createWrapper();

      const { result } = renderHook(
        () => useRoster({ initialPlayers: [], selectedPlayerIds: [] }),
        { wrapper }
      );

      expect(result.current.availablePlayers).toHaveLength(0);
    });

    it('should expose all expected functions and state', () => {
      const wrapper = createWrapper();

      const { result } = renderHook(
        () => useRoster({ initialPlayers: [], selectedPlayerIds: [] }),
        { wrapper }
      );

      expect(typeof result.current.handleAddPlayer).toBe('function');
      expect(typeof result.current.handleUpdatePlayer).toBe('function');
      expect(typeof result.current.handleRemovePlayer).toBe('function');
      expect(typeof result.current.handleSetGoalieStatus).toBe('function');
      expect(typeof result.current.setAvailablePlayers).toBe('function');
      expect(typeof result.current.setHighlightRosterButton).toBe('function');
      expect(typeof result.current.setShowRosterPrompt).toBe('function');
      expect(typeof result.current.setRosterError).toBe('function');
      expect(result.current.highlightRosterButton).toBe(false);
      expect(result.current.showRosterPrompt).toBe(false);
      expect(result.current.rosterError).toBeNull();
      expect(result.current.isRosterUpdating).toBe(false);
    });
  });

  // ============================================
  // playersForCurrentGame
  // ============================================
  describe('playersForCurrentGame', () => {
    it('should filter players based on selectedPlayerIds', () => {
      const players = [
        createPlayer({ id: 'p1', name: 'Player 1' }),
        createPlayer({ id: 'p2', name: 'Player 2' }),
        createPlayer({ id: 'p3', name: 'Player 3' }),
      ];
      const wrapper = createWrapper();

      const { result } = renderHook(
        () => useRoster({ initialPlayers: players, selectedPlayerIds: ['p1', 'p3'] }),
        { wrapper }
      );

      expect(result.current.playersForCurrentGame).toHaveLength(2);
      expect(result.current.playersForCurrentGame.map((p) => p.id)).toEqual(['p1', 'p3']);
    });

    it('should return empty array when no players selected', () => {
      const players = [createPlayer({ id: 'p1' })];
      const wrapper = createWrapper();

      const { result } = renderHook(
        () => useRoster({ initialPlayers: players, selectedPlayerIds: [] }),
        { wrapper }
      );

      expect(result.current.playersForCurrentGame).toHaveLength(0);
    });

    it('should handle non-existent player IDs in selection', () => {
      const players = [createPlayer({ id: 'p1' })];
      const wrapper = createWrapper();

      const { result } = renderHook(
        () =>
          useRoster({
            initialPlayers: players,
            selectedPlayerIds: ['p1', 'non-existent'],
          }),
        { wrapper }
      );

      expect(result.current.playersForCurrentGame).toHaveLength(1);
    });
  });

  // ============================================
  // handleAddPlayer
  // ============================================
  describe('handleAddPlayer', () => {
    it('should add player with optimistic update', async () => {
      const wrapper = createWrapper();
      const newPlayer: Player = {
        id: 'new-player-id',
        name: 'New Player',
        jerseyNumber: '99',
        isGoalie: false,
        receivedFairPlayCard: false,
      };

      mockedAddPlayer.mockResolvedValue(newPlayer);

      const { result } = renderHook(
        () => useRoster({ initialPlayers: [], selectedPlayerIds: [] }),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleAddPlayer({
          name: 'New Player',
          jerseyNumber: '99',
        });
      });

      expect(result.current.availablePlayers).toHaveLength(1);
      expect(result.current.availablePlayers[0].id).toBe('new-player-id');
      expect(result.current.rosterError).toBeNull();
      expect(result.current.isRosterUpdating).toBe(false);
    });

    it('should set isRosterUpdating during operation', async () => {
      const wrapper = createWrapper();
      let resolveAdd: ((value: Player) => void) | undefined;

      mockedAddPlayer.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveAdd = resolve;
          })
      );

      const { result } = renderHook(
        () => useRoster({ initialPlayers: [], selectedPlayerIds: [] }),
        { wrapper }
      );

      // Start add operation
      act(() => {
        result.current.handleAddPlayer({ name: 'Test', jerseyNumber: '1' });
      });

      // Should be updating
      expect(result.current.isRosterUpdating).toBe(true);

      // Resolve the operation
      await act(async () => {
        resolveAdd?.({
          id: 'resolved-id',
          name: 'Test',
          jerseyNumber: '1',
          isGoalie: false,
          receivedFairPlayCard: false,
        });
      });

      expect(result.current.isRosterUpdating).toBe(false);
    });

    it('should rollback on addPlayer failure (null result)', async () => {
      const wrapper = createWrapper();
      mockedAddPlayer.mockResolvedValue(null);

      const { result } = renderHook(
        () => useRoster({ initialPlayers: [], selectedPlayerIds: [] }),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleAddPlayer({
          name: 'Failed Player',
          jerseyNumber: '1',
        });
      });

      expect(result.current.availablePlayers).toHaveLength(0);
      expect(result.current.rosterError).toBe('Failed to add player');
    });

    it('should rollback on addPlayer exception', async () => {
      const wrapper = createWrapper();
      mockedAddPlayer.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(
        () => useRoster({ initialPlayers: [], selectedPlayerIds: [] }),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleAddPlayer({
          name: 'Failed Player',
          jerseyNumber: '1',
        });
      });

      expect(result.current.availablePlayers).toHaveLength(0);
      expect(result.current.rosterError).toBe('Failed to add player');
    });
  });

  // ============================================
  // handleUpdatePlayer
  // ============================================
  describe('handleUpdatePlayer', () => {
    it('should update player with optimistic update', async () => {
      const existingPlayer = createPlayer({ id: 'p1', name: 'Original Name' });
      const wrapper = createWrapper();

      mockedUpdatePlayer.mockResolvedValue({
        ...existingPlayer,
        name: 'Updated Name',
      });

      const { result } = renderHook(
        () =>
          useRoster({ initialPlayers: [existingPlayer], selectedPlayerIds: [] }),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleUpdatePlayer('p1', { name: 'Updated Name' });
      });

      expect(result.current.availablePlayers[0].name).toBe('Updated Name');
      expect(result.current.rosterError).toBeNull();
    });

    it('should rollback on updatePlayer failure (null result)', async () => {
      const existingPlayer = createPlayer({ id: 'p1', name: 'Original Name' });
      const wrapper = createWrapper();
      mockedUpdatePlayer.mockResolvedValue(null);

      const { result } = renderHook(
        () =>
          useRoster({ initialPlayers: [existingPlayer], selectedPlayerIds: [] }),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleUpdatePlayer('p1', { name: 'Updated Name' });
      });

      expect(result.current.availablePlayers[0].name).toBe('Original Name');
      expect(result.current.rosterError).toBe('Failed to update player');
    });

    it('should rollback on updatePlayer exception', async () => {
      const existingPlayer = createPlayer({ id: 'p1', name: 'Original Name' });
      const wrapper = createWrapper();
      mockedUpdatePlayer.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(
        () =>
          useRoster({ initialPlayers: [existingPlayer], selectedPlayerIds: [] }),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleUpdatePlayer('p1', { name: 'Updated Name' });
      });

      expect(result.current.availablePlayers[0].name).toBe('Original Name');
      expect(result.current.rosterError).toBe('Failed to update player');
    });

    it('should only update the targeted player', async () => {
      const players = [
        createPlayer({ id: 'p1', name: 'Player 1' }),
        createPlayer({ id: 'p2', name: 'Player 2' }),
      ];
      const wrapper = createWrapper();

      mockedUpdatePlayer.mockResolvedValue({
        ...players[0],
        name: 'Updated Player 1',
      });

      const { result } = renderHook(
        () => useRoster({ initialPlayers: players, selectedPlayerIds: [] }),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleUpdatePlayer('p1', { name: 'Updated Player 1' });
      });

      expect(result.current.availablePlayers.find((p) => p.id === 'p1')?.name).toBe(
        'Updated Player 1'
      );
      expect(result.current.availablePlayers.find((p) => p.id === 'p2')?.name).toBe(
        'Player 2'
      );
    });
  });

  // ============================================
  // handleRemovePlayer
  // ============================================
  describe('handleRemovePlayer', () => {
    it('should remove player with optimistic update', async () => {
      const players = [
        createPlayer({ id: 'p1', name: 'Player 1' }),
        createPlayer({ id: 'p2', name: 'Player 2' }),
      ];
      const wrapper = createWrapper();
      mockedRemovePlayer.mockResolvedValue(true);

      const { result } = renderHook(
        () => useRoster({ initialPlayers: players, selectedPlayerIds: [] }),
        { wrapper }
      );

      expect(result.current.availablePlayers).toHaveLength(2);

      await act(async () => {
        await result.current.handleRemovePlayer('p1');
      });

      expect(result.current.availablePlayers).toHaveLength(1);
      expect(result.current.availablePlayers[0].id).toBe('p2');
      expect(result.current.rosterError).toBeNull();
    });

    it('should rollback on removePlayer failure', async () => {
      const player = createPlayer({ id: 'p1' });
      const wrapper = createWrapper();
      mockedRemovePlayer.mockResolvedValue(false);

      const { result } = renderHook(
        () => useRoster({ initialPlayers: [player], selectedPlayerIds: [] }),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleRemovePlayer('p1');
      });

      expect(result.current.availablePlayers).toHaveLength(1);
      expect(result.current.rosterError).toBe('Failed to remove player');
    });

    it('should rollback on removePlayer exception', async () => {
      const player = createPlayer({ id: 'p1' });
      const wrapper = createWrapper();
      mockedRemovePlayer.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(
        () => useRoster({ initialPlayers: [player], selectedPlayerIds: [] }),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleRemovePlayer('p1');
      });

      expect(result.current.availablePlayers).toHaveLength(1);
      expect(result.current.rosterError).toBe('Failed to remove player');
    });
  });

  // ============================================
  // handleSetGoalieStatus
  // ============================================
  describe('handleSetGoalieStatus', () => {
    it('should set goalie status with optimistic update', async () => {
      const player = createPlayer({ id: 'p1', isGoalie: false });
      const wrapper = createWrapper();
      mockedSetGoalieStatus.mockResolvedValue({ ...player, isGoalie: true });

      const { result } = renderHook(
        () => useRoster({ initialPlayers: [player], selectedPlayerIds: [] }),
        { wrapper }
      );

      expect(result.current.availablePlayers[0].isGoalie).toBe(false);

      await act(async () => {
        await result.current.handleSetGoalieStatus('p1', true);
      });

      expect(result.current.availablePlayers[0].isGoalie).toBe(true);
      expect(result.current.rosterError).toBeNull();
    });

    it('should unset other goalies when setting new goalie (mutual exclusivity)', async () => {
      const players = [
        createPlayer({ id: 'p1', name: 'Current Goalie', isGoalie: true }),
        createPlayer({ id: 'p2', name: 'New Goalie', isGoalie: false }),
      ];
      const wrapper = createWrapper();
      mockedSetGoalieStatus.mockResolvedValue({ ...players[1], isGoalie: true });

      const { result } = renderHook(
        () => useRoster({ initialPlayers: players, selectedPlayerIds: [] }),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleSetGoalieStatus('p2', true);
      });

      // Optimistic update should have cleared p1's goalie status
      expect(result.current.availablePlayers.find((p) => p.id === 'p1')?.isGoalie).toBe(
        false
      );
      expect(result.current.availablePlayers.find((p) => p.id === 'p2')?.isGoalie).toBe(
        true
      );
    });

    it('should rollback on setGoalieStatus failure', async () => {
      const player = createPlayer({ id: 'p1', isGoalie: false });
      const wrapper = createWrapper();
      mockedSetGoalieStatus.mockResolvedValue(null);

      const { result } = renderHook(
        () => useRoster({ initialPlayers: [player], selectedPlayerIds: [] }),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleSetGoalieStatus('p1', true);
      });

      expect(result.current.availablePlayers[0].isGoalie).toBe(false);
      expect(result.current.rosterError).toBe('Failed to set goalie status');
    });

    it('should rollback on setGoalieStatus exception', async () => {
      const player = createPlayer({ id: 'p1', isGoalie: false });
      const wrapper = createWrapper();
      mockedSetGoalieStatus.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(
        () => useRoster({ initialPlayers: [player], selectedPlayerIds: [] }),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleSetGoalieStatus('p1', true);
      });

      expect(result.current.availablePlayers[0].isGoalie).toBe(false);
      expect(result.current.rosterError).toBe('Failed to set goalie status');
    });
  });

  // ============================================
  // State setters
  // ============================================
  describe('state setters', () => {
    it('should allow setting highlight roster button state', () => {
      const wrapper = createWrapper();

      const { result } = renderHook(
        () => useRoster({ initialPlayers: [], selectedPlayerIds: [] }),
        { wrapper }
      );

      expect(result.current.highlightRosterButton).toBe(false);

      act(() => {
        result.current.setHighlightRosterButton(true);
      });

      expect(result.current.highlightRosterButton).toBe(true);
    });

    it('should allow setting show roster prompt state', () => {
      const wrapper = createWrapper();

      const { result } = renderHook(
        () => useRoster({ initialPlayers: [], selectedPlayerIds: [] }),
        { wrapper }
      );

      expect(result.current.showRosterPrompt).toBe(false);

      act(() => {
        result.current.setShowRosterPrompt(true);
      });

      expect(result.current.showRosterPrompt).toBe(true);
    });

    it('should allow setting roster error state', () => {
      const wrapper = createWrapper();

      const { result } = renderHook(
        () => useRoster({ initialPlayers: [], selectedPlayerIds: [] }),
        { wrapper }
      );

      expect(result.current.rosterError).toBeNull();

      act(() => {
        result.current.setRosterError('Custom error');
      });

      expect(result.current.rosterError).toBe('Custom error');
    });

    it('should allow directly setting available players', () => {
      const wrapper = createWrapper();
      const newPlayers = [createPlayer({ id: 'new-p1', name: 'New Player' })];

      const { result } = renderHook(
        () => useRoster({ initialPlayers: [], selectedPlayerIds: [] }),
        { wrapper }
      );

      expect(result.current.availablePlayers).toHaveLength(0);

      act(() => {
        result.current.setAvailablePlayers(newPlayers);
      });

      expect(result.current.availablePlayers).toHaveLength(1);
      expect(result.current.availablePlayers[0].name).toBe('New Player');
    });
  });

  // ============================================
  // Error clearing
  // ============================================
  describe('error clearing', () => {
    it('should clear error on successful add', async () => {
      const wrapper = createWrapper();
      mockedAddPlayer.mockResolvedValue(
        createPlayer({ id: 'new-id', name: 'New' })
      );

      const { result } = renderHook(
        () => useRoster({ initialPlayers: [], selectedPlayerIds: [] }),
        { wrapper }
      );

      // Set an error first
      act(() => {
        result.current.setRosterError('Previous error');
      });

      expect(result.current.rosterError).toBe('Previous error');

      // Successful add should clear error
      await act(async () => {
        await result.current.handleAddPlayer({ name: 'New', jerseyNumber: '1' });
      });

      expect(result.current.rosterError).toBeNull();
    });

    it('should clear error on successful update', async () => {
      const player = createPlayer({ id: 'p1' });
      const wrapper = createWrapper();
      mockedUpdatePlayer.mockResolvedValue({ ...player, name: 'Updated' });

      const { result } = renderHook(
        () => useRoster({ initialPlayers: [player], selectedPlayerIds: [] }),
        { wrapper }
      );

      act(() => {
        result.current.setRosterError('Previous error');
      });

      await act(async () => {
        await result.current.handleUpdatePlayer('p1', { name: 'Updated' });
      });

      expect(result.current.rosterError).toBeNull();
    });

    it('should clear error on successful remove', async () => {
      const player = createPlayer({ id: 'p1' });
      const wrapper = createWrapper();
      mockedRemovePlayer.mockResolvedValue(true);

      const { result } = renderHook(
        () => useRoster({ initialPlayers: [player], selectedPlayerIds: [] }),
        { wrapper }
      );

      act(() => {
        result.current.setRosterError('Previous error');
      });

      await act(async () => {
        await result.current.handleRemovePlayer('p1');
      });

      expect(result.current.rosterError).toBeNull();
    });

    it('should clear error on successful goalie status change', async () => {
      const player = createPlayer({ id: 'p1' });
      const wrapper = createWrapper();
      mockedSetGoalieStatus.mockResolvedValue({ ...player, isGoalie: true });

      const { result } = renderHook(
        () => useRoster({ initialPlayers: [player], selectedPlayerIds: [] }),
        { wrapper }
      );

      act(() => {
        result.current.setRosterError('Previous error');
      });

      await act(async () => {
        await result.current.handleSetGoalieStatus('p1', true);
      });

      expect(result.current.rosterError).toBeNull();
    });
  });
});
