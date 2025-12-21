import { MASTER_ROSTER_KEY } from '@/config/storageKeys';
import type { Player } from '@/types';
import type { DataStore } from '@/interfaces/DataStore';

// Mock player data
const mockPlayers: Player[] = [
  { id: 'player_1', name: 'John Doe', jerseyNumber: '10', isGoalie: false, receivedFairPlayCard: false },
  { id: 'player_2', name: 'Jane Smith', jerseyNumber: '7', isGoalie: true, receivedFairPlayCard: false }
];

// Mock roster store
let mockRoster: Player[] = [];

// Mock key store for saveMasterRoster (deprecated, uses storage directly)
const mockKeyStore: Record<string, string> = {};

// Helper to clear mock stores
const clearMockStore = () => {
  mockRoster = [];
  Object.keys(mockKeyStore).forEach(key => delete mockKeyStore[key]);
};

// Create mock DataStore for player operations.
// Only mocking methods actually used by masterRoster.ts (standard Jest pattern).
// Trade-off: If code adds new DataStore calls, tests won't catch until runtime.
// Acceptable because: TypeScript ensures method exists, and full mock adds boilerplate.
const mockDataStore: jest.Mocked<Pick<DataStore, 'getPlayers' | 'createPlayer' | 'updatePlayer' | 'deletePlayer'>> = {
  getPlayers: jest.fn(async () => [...mockRoster]),
  createPlayer: jest.fn(async (player: Omit<Player, 'id'>) => {
    const newPlayer: Player = {
      ...player,
      id: `player_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    };
    mockRoster.push(newPlayer);
    return newPlayer;
  }),
  updatePlayer: jest.fn(async (id: string, updates: Partial<Player>) => {
    const index = mockRoster.findIndex(p => p.id === id);
    if (index === -1) return null;
    mockRoster[index] = { ...mockRoster[index], ...updates };
    return mockRoster[index];
  }),
  deletePlayer: jest.fn(async (id: string) => {
    const index = mockRoster.findIndex(p => p.id === id);
    if (index === -1) return false;
    mockRoster.splice(index, 1);
    return true;
  }),
};

// Mock storage for saveMasterRoster (deprecated, still uses storage directly)
const mockGetStorageItem = jest.fn(async (key: string) => mockKeyStore[key] || null);
const mockSetStorageItem = jest.fn(async (key: string, value: string) => { mockKeyStore[key] = value; });

// Mock getDataStore
const mockGetDataStore = jest.fn(() => Promise.resolve(mockDataStore));

// Reset module cache and set up mocks BEFORE loading masterRoster.
// Using jest.doMock + require() pattern because masterRoster.ts imports
// getDataStore at module load time. This is the standard Jest approach;
// dependency injection would simplify testing but adds API complexity.
jest.resetModules();

jest.doMock('@/datastore', () => ({
  __esModule: true,
  getDataStore: mockGetDataStore,
}));

jest.doMock('./storage', () => ({
  __esModule: true,
  getStorageItem: mockGetStorageItem,
  setStorageItem: mockSetStorageItem,
}));

jest.doMock('./storageKeyLock', () => ({
  __esModule: true,
  withKeyLock: jest.fn(async (_key: string, fn: () => Promise<unknown>) => fn()),
}));

// Import the module under test AFTER mocks are set up
const {
  getMasterRoster,
  saveMasterRoster,
  addPlayerToRoster,
  updatePlayerInRoster,
  removePlayerFromRoster,
  setPlayerGoalieStatus,
  setPlayerFairPlayCardStatus
} = require('./masterRoster');

describe('Master Roster Utilities', () => {
  beforeEach(() => {
    clearMockStore();
    jest.clearAllMocks();
  });

  afterEach(() => {
    clearMockStore();
  });

  describe('getMasterRoster', () => {
    it('should return an empty array if no roster is stored', async () => {
      const result = await getMasterRoster();

      expect(mockDataStore.getPlayers).toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('should return the roster from DataStore', async () => {
      mockRoster = [...mockPlayers];

      const result = await getMasterRoster();

      expect(mockDataStore.getPlayers).toHaveBeenCalled();
      expect(result).toEqual(mockPlayers);
    });

    it('should return an empty array and log error if DataStore fails', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockDataStore.getPlayers.mockRejectedValueOnce(new Error('DataStore error'));

      const result = await getMasterRoster();

      expect(consoleSpy).toHaveBeenCalled();
      expect(result).toEqual([]);
      consoleSpy.mockRestore();
    });
  });

  describe('saveMasterRoster (deprecated)', () => {
    it('should save the roster to storage and return true', async () => {
      const result = await saveMasterRoster(mockPlayers);
      expect(result).toBe(true);
      expect(mockSetStorageItem).toHaveBeenCalledWith(
        MASTER_ROSTER_KEY,
        JSON.stringify(mockPlayers)
      );
    });

    it('should return false and log error if storage throws', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('Storage quota exceeded');
      mockSetStorageItem.mockRejectedValueOnce(error);

      const result = await saveMasterRoster(mockPlayers);
      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[saveMasterRoster]'), error);
      consoleSpy.mockRestore();
    });
  });

  describe('addPlayerToRoster', () => {
    it('should add a player to the roster and return the player object', async () => {
      const playerData = { name: 'New Player', jerseyNumber: '23' };
      const result = await addPlayerToRoster(playerData);

      expect(result).not.toBeNull();
      expect(result?.name).toBe(playerData.name);
      expect(result?.jerseyNumber).toBe(playerData.jerseyNumber);
      expect(result?.id).toContain('player_');
      expect(mockDataStore.createPlayer).toHaveBeenCalled();
    });

    it('should trim whitespace from player name', async () => {
      const playerData = { name: '  Trimmed Player  ' };
      const result = await addPlayerToRoster(playerData);
      expect(result).not.toBeNull();
      expect(mockDataStore.createPlayer).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Trimmed Player' })
      );
    });

    it('should return null and log warning if player name is empty', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const playerData = { name: '   ' };
      const result = await addPlayerToRoster(playerData);

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Player name cannot be empty'));
      expect(mockDataStore.createPlayer).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should return null if DataStore fails during add', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const saveError = new Error('Save failed!');
      mockDataStore.createPlayer.mockRejectedValueOnce(saveError);

      const result = await addPlayerToRoster({ name: 'Valid Player' });

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[addPlayerToRoster] Unexpected error'),
        expect.objectContaining({ playerName: 'Valid Player', error: saveError })
      );
      consoleSpy.mockRestore();
    });
  });

  describe('updatePlayerInRoster', () => {
    it('should update an existing player and return the updated object', async () => {
      mockRoster = [...mockPlayers];

      const updateData = { name: 'Updated Name', jerseyNumber: '99' };
      const result = await updatePlayerInRoster('player_1', updateData);

      expect(result).not.toBeNull();
      expect(result?.id).toBe('player_1');
      expect(result?.name).toBe(updateData.name);
      expect(result?.jerseyNumber).toBe(updateData.jerseyNumber);
      expect(mockDataStore.updatePlayer).toHaveBeenCalledWith('player_1', updateData);
    });

    it('should trim whitespace from updated player name', async () => {
      mockRoster = [...mockPlayers];

      const result = await updatePlayerInRoster('player_1', { name: '  Trimmed Update  ' });

      expect(result).not.toBeNull();
      expect(result?.name).toBe('Trimmed Update');
      expect(mockDataStore.updatePlayer).toHaveBeenCalledWith(
        'player_1',
        expect.objectContaining({ name: 'Trimmed Update' })
      );
    });

    it('should return null and log error if player not found', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockDataStore.updatePlayer.mockResolvedValueOnce(null);

      const result = await updatePlayerInRoster('non_existent_id', { name: 'Updated Name' });

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Player with ID non_existent_id not found'));
      consoleSpy.mockRestore();
    });

    it('should return null and log error if player name is empty', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const updateData = { name: '   ' };
      const result = await updatePlayerInRoster('player_1', updateData);

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Player name cannot be empty'));
      expect(mockDataStore.updatePlayer).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should return null if DataStore fails during update', async () => {
      const saveError = new Error('Save failed!');
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockDataStore.updatePlayer.mockRejectedValueOnce(saveError);

      const result = await updatePlayerInRoster('player_1', { name: 'Valid Update' });

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[updatePlayerInRoster] Unexpected error'),
        expect.objectContaining({ playerId: 'player_1', error: saveError })
      );
      consoleSpy.mockRestore();
    });

    it('should return null and log error if playerId is invalid', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const result = await updatePlayerInRoster('', { name: 'Test' });
      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Player ID cannot be empty'));
      expect(mockDataStore.updatePlayer).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('removePlayerFromRoster', () => {
    it('should remove a player and return true if successful', async () => {
      mockRoster = [...mockPlayers];

      const result = await removePlayerFromRoster('player_1');
      expect(result).toBe(true);
      expect(mockDataStore.deletePlayer).toHaveBeenCalledWith('player_1');
    });

    it('should return false if player not found', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockDataStore.deletePlayer.mockResolvedValueOnce(false);

      const result = await removePlayerFromRoster('non_existent_id');
      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Player with ID non_existent_id not found'));
      consoleSpy.mockRestore();
    });

    it('should return false if DataStore fails during remove', async () => {
      const saveError = new Error('Delete failed!');
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockDataStore.deletePlayer.mockRejectedValueOnce(saveError);

      const result = await removePlayerFromRoster('player_1');

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[removePlayerFromRoster] Unexpected error'),
        expect.objectContaining({ playerId: 'player_1', error: saveError })
      );
      consoleSpy.mockRestore();
    });

    it('should return false and log error if playerId is invalid', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const result = await removePlayerFromRoster('');
      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Player ID cannot be empty'));
      expect(mockDataStore.deletePlayer).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('setPlayerGoalieStatus', () => {
    it('should update player goalie status and return the player object', async () => {
      mockRoster = [...mockPlayers];

      const result = await setPlayerGoalieStatus('player_1', true);
      expect(result).not.toBeNull();
      expect(result?.isGoalie).toBe(true);
      expect(result?.id).toBe('player_1');
      expect(mockDataStore.updatePlayer).toHaveBeenCalledWith('player_1', { isGoalie: true });
    });

    it('should clear other goalies when setting a new goalie', async () => {
      mockRoster = [...mockPlayers]; // player_2 is already a goalie

      await setPlayerGoalieStatus('player_1', true);

      // Should have called updatePlayer twice: once to clear player_2, once to set player_1
      expect(mockDataStore.updatePlayer).toHaveBeenCalledWith('player_2', { isGoalie: false });
      expect(mockDataStore.updatePlayer).toHaveBeenCalledWith('player_1', { isGoalie: true });
    });

    it('should return null if player not found', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const result = await setPlayerGoalieStatus('non_existent_id', true);
      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Player with ID non_existent_id not found'));
      consoleSpy.mockRestore();
    });

    it('should return null if DataStore fails', async () => {
      mockRoster = [...mockPlayers];
      const saveError = new Error('Update failed!');
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockDataStore.updatePlayer.mockRejectedValueOnce(saveError);

      const result = await setPlayerGoalieStatus('player_1', true);

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[setPlayerGoalieStatus] Unexpected error'),
        expect.objectContaining({ playerId: 'player_1', isGoalie: true, error: saveError })
      );
      consoleSpy.mockRestore();
    });

    it('should return null and log error if playerId is invalid', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const result = await setPlayerGoalieStatus('', true);
      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Player ID cannot be empty'));
      consoleSpy.mockRestore();
    });

    it('should be idempotent when setting same player as goalie twice', async () => {
      mockRoster = [
        { id: 'player_1', name: 'John', jerseyNumber: '10', isGoalie: true, receivedFairPlayCard: false },
        { id: 'player_2', name: 'Jane', jerseyNumber: '7', isGoalie: false, receivedFairPlayCard: false }
      ];

      const result = await setPlayerGoalieStatus('player_1', true);

      expect(result).not.toBeNull();
      expect(result?.isGoalie).toBe(true);
      // Should not have tried to clear other goalies (player_1 was already the goalie)
      expect(mockDataStore.updatePlayer).toHaveBeenCalledTimes(1);
      expect(mockDataStore.updatePlayer).toHaveBeenCalledWith('player_1', { isGoalie: true });
    });

    it('should clear goalie status when setting isGoalie to false', async () => {
      mockRoster = [
        { id: 'player_1', name: 'John', jerseyNumber: '10', isGoalie: true, receivedFairPlayCard: false },
        { id: 'player_2', name: 'Jane', jerseyNumber: '7', isGoalie: false, receivedFairPlayCard: false }
      ];

      const result = await setPlayerGoalieStatus('player_1', false);

      expect(result).not.toBeNull();
      expect(result?.isGoalie).toBe(false);
      expect(mockDataStore.updatePlayer).toHaveBeenCalledWith('player_1', { isGoalie: false });
    });
  });

  describe('setPlayerFairPlayCardStatus', () => {
    it('should update player fair play status and return the player object', async () => {
      mockRoster = [...mockPlayers];

      const result = await setPlayerFairPlayCardStatus('player_2', true);
      expect(result).not.toBeNull();
      expect(result?.receivedFairPlayCard).toBe(true);
      expect(result?.id).toBe('player_2');
      expect(mockDataStore.updatePlayer).toHaveBeenCalledWith('player_2', { receivedFairPlayCard: true });
    });

    it('should return null if player not found', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockDataStore.updatePlayer.mockResolvedValueOnce(null);

      const result = await setPlayerFairPlayCardStatus('non_existent_id', true);
      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Player with ID non_existent_id not found'));
      consoleSpy.mockRestore();
    });

    it('should return null if DataStore fails', async () => {
      const saveError = new Error('Update failed!');
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockDataStore.updatePlayer.mockRejectedValueOnce(saveError);

      const result = await setPlayerFairPlayCardStatus('player_1', true);

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[updatePlayerInRoster] Unexpected error'),
        expect.objectContaining({ playerId: 'player_1', error: saveError })
      );
      consoleSpy.mockRestore();
    });
  });
});
