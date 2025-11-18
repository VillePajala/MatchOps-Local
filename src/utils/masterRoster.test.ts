import { 
  getMasterRoster,
  saveMasterRoster,
  addPlayerToRoster,
  updatePlayerInRoster,
  removePlayerFromRoster,
  setPlayerGoalieStatus,
  setPlayerFairPlayCardStatus
} from './masterRoster';
import { MASTER_ROSTER_KEY } from '@/config/storageKeys';
import type { Player } from '@/types';
import { clearMockStore } from './__mocks__/storage';
import { getStorageItem, setStorageItem } from './storage';

// Auto-mock the storage module
jest.mock('./storage');

// Type the mocked functions
const mockGetStorageItem = getStorageItem as jest.MockedFunction<typeof getStorageItem>;
const mockSetStorageItem = setStorageItem as jest.MockedFunction<typeof setStorageItem>;

describe('Master Roster Utilities', () => {
  const mockPlayers: Player[] = [
    { id: 'player_1', name: 'John Doe', jerseyNumber: '10', isGoalie: false, receivedFairPlayCard: false },
    { id: 'player_2', name: 'Jane Smith', jerseyNumber: '7', isGoalie: true, receivedFairPlayCard: false }
  ];

  beforeEach(() => {
    clearMockStore();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    // Ensure complete cleanup after each test
    clearMockStore();
  });

  describe('getMasterRoster', () => {
    it('should return an empty array if no roster is stored', async () => {
      mockGetStorageItem.mockResolvedValue(null);
      
      const result = await getMasterRoster();
      
      expect(mockGetStorageItem).toHaveBeenCalledWith(MASTER_ROSTER_KEY);
      expect(result).toEqual([]);
    });

    it('should return the parsed roster if it exists', async () => {
      mockGetStorageItem.mockResolvedValue(JSON.stringify(mockPlayers));
      
      const result = await getMasterRoster();
      
      expect(mockGetStorageItem).toHaveBeenCalledWith(MASTER_ROSTER_KEY);
      expect(result).toEqual(mockPlayers);
    });

    it('should return an empty array and log error if JSON is invalid', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockGetStorageItem.mockResolvedValueOnce('invalid json');

      const result = await getMasterRoster();

      expect(consoleSpy).toHaveBeenCalled();
      expect(result).toEqual([]);
      consoleSpy.mockRestore();
    });
  });

  describe('saveMasterRoster', () => {
    it('should save the roster to localStorage and return true', async () => {
      const result = await saveMasterRoster(mockPlayers); 
      expect(result).toBe(true);
      expect(mockSetStorageItem).toHaveBeenCalledWith(
        MASTER_ROSTER_KEY,
        JSON.stringify(mockPlayers)
      );
    });

    it('should return false and log error if localStorage throws', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('Storage quota exceeded');

      // Preserve the original implementation
      const originalSetImpl = mockSetStorageItem.getMockImplementation();
      mockSetStorageItem.mockImplementationOnce(() => { throw error; });

      const result = await saveMasterRoster(mockPlayers);
      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[saveMasterRoster]'), error);

      // Restore original implementation
      if (originalSetImpl) {
        mockSetStorageItem.mockImplementation(originalSetImpl);
      }
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
      
      expect(mockSetStorageItem).toHaveBeenCalledWith(
        MASTER_ROSTER_KEY,
        expect.stringContaining('New Player')
      );
    });

    it('should trim whitespace from player name', async () => {
      const playerData = { name: '  Trimmed Player  ' };
      const result = await addPlayerToRoster(playerData);
      expect(result).not.toBeNull();
      expect(result?.name).toBe('Trimmed Player');
      expect(mockSetStorageItem).toHaveBeenCalled();
    });

    it('should return null and log error if player name is empty', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const playerData = { name: '   ' };
      const result = await addPlayerToRoster(playerData);

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Player name cannot be empty'));
      expect(mockSetStorageItem).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should return null if saving fails during add', async () => {
      // Set up empty initial state
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const saveError = new Error('Save failed!');

      // Override the setStorageItem for this specific test without breaking the chain
      const originalSetImpl = mockSetStorageItem.getMockImplementation();
      mockSetStorageItem.mockImplementationOnce(() => { throw saveError; });

      const result = await addPlayerToRoster({ name: 'Valid Player' });

      expect(result).toBeNull();
      expect(mockSetStorageItem).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[addPlayerToRoster] Unexpected error adding player:'), saveError);

      // Restore original implementation
      if (originalSetImpl) {
        mockSetStorageItem.mockImplementation(originalSetImpl);
      }
      consoleSpy.mockRestore();
    });
  });

  describe('updatePlayerInRoster', () => {
    it('should update an existing player and return the updated object', async () => {
      // Set up test data
      await saveMasterRoster(mockPlayers);

      const updateData = { name: 'Updated Name', jerseyNumber: '99' };
      const result = await updatePlayerInRoster('player_1', updateData);
      
      expect(result).not.toBeNull();
      expect(result?.id).toBe('player_1');
      expect(result?.name).toBe(updateData.name);
      expect(result?.jerseyNumber).toBe(updateData.jerseyNumber);
      
      expect(mockSetStorageItem).toHaveBeenCalledWith(
        MASTER_ROSTER_KEY,
        expect.stringContaining('Updated Name')
      );
    });

    it('should trim whitespace from updated player name', async () => {
      // Set up test data
      await saveMasterRoster(mockPlayers);

      const updateData = { name: '  Trimmed Update   ' };
      const result = await updatePlayerInRoster('player_1', updateData);
      expect(result).not.toBeNull();
      expect(result?.name).toBe('Trimmed Update');
      expect(mockSetStorageItem).toHaveBeenCalledWith(
        MASTER_ROSTER_KEY,
        expect.stringContaining('Trimmed Update')
      );
    });

    it('should return null and log error if player not found', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const updateData = { name: 'Updated Name' };
      const result = await updatePlayerInRoster('non_existent_id', updateData);
      
      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Player with ID non_existent_id not found'));
      expect(mockSetStorageItem).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should return null and log error if updated player name is empty', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const updateData = { name: '   ' };
      const result = await updatePlayerInRoster('player_1', updateData);
      
      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Player name cannot be empty'));
      expect(mockSetStorageItem).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should return null if saving fails during update', async () => {
      // Set up test data
      await saveMasterRoster(mockPlayers);

      const saveError = new Error('Save failed!');
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      // Override only for the save operation, preserving the get functionality
      const originalSetImpl = mockSetStorageItem.getMockImplementation();
      mockSetStorageItem.mockImplementationOnce(() => { throw saveError; });

      const result = await updatePlayerInRoster('player_1', { name: 'Valid Update' });

      expect(result).toBeNull();
      expect(mockSetStorageItem).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[updatePlayerInRoster] Unexpected error updating player:'), saveError);

      // Restore original implementation
      if (originalSetImpl) {
        mockSetStorageItem.mockImplementation(originalSetImpl);
      }
      consoleSpy.mockRestore();
    });

    it('should return null and log error if playerId is invalid', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const result = await updatePlayerInRoster('', { name: 'Test' });
      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Player ID cannot be empty'));
      expect(mockSetStorageItem).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('removePlayerFromRoster', () => {
    it('should remove a player and return true if successful', async () => {
      // Set up test data
      await saveMasterRoster(mockPlayers);

      const result = await removePlayerFromRoster('player_1');
      expect(result).toBe(true);
      expect(mockSetStorageItem).toHaveBeenCalledWith(
        MASTER_ROSTER_KEY,
        expect.not.stringContaining('player_1')
      );
      expect(mockSetStorageItem).toHaveBeenCalledWith(
        MASTER_ROSTER_KEY,
        expect.stringContaining('player_2') 
      );
    });

    it('should return false if player not found', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const result = await removePlayerFromRoster('non_existent_id');
      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Player with ID non_existent_id not found'));
      expect(mockSetStorageItem).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should return false if saving fails during remove', async () => {
      // Set up test data
      await saveMasterRoster(mockPlayers);

      const saveError = new Error('Save failed!');
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      // Override only for the save operation
      const originalSetImpl = mockSetStorageItem.getMockImplementation();
      mockSetStorageItem.mockImplementationOnce(() => { throw saveError; });

      const result = await removePlayerFromRoster('player_1');

      expect(result).toBe(false);
      expect(mockSetStorageItem).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[removePlayerFromRoster] Unexpected error removing player:'), saveError);

      // Restore original implementation
      if (originalSetImpl) {
        mockSetStorageItem.mockImplementation(originalSetImpl);
      }
      consoleSpy.mockRestore();
    });

    it('should return false and log error if playerId is invalid', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const result = await removePlayerFromRoster('');
      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Player ID cannot be empty'));
      expect(mockSetStorageItem).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('setPlayerGoalieStatus', () => {
    it('should update player goalie status and return the player object', async () => {
      // Set up test data
      await saveMasterRoster(mockPlayers);

      const result = await setPlayerGoalieStatus('player_1', true);
      expect(result).not.toBeNull();
      expect(result?.isGoalie).toBe(true);
      expect(result?.id).toBe('player_1');
      expect(mockSetStorageItem).toHaveBeenCalledWith(
        MASTER_ROSTER_KEY,
        expect.stringContaining('"isGoalie":true')
      );
      expect(mockSetStorageItem).toHaveBeenCalledWith(
        MASTER_ROSTER_KEY,
        expect.stringContaining('player_1')
      );
    });

    it('should return null if player not found', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const result = await setPlayerGoalieStatus('non_existent_id', true);
      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Player with ID non_existent_id not found'));
      expect(mockSetStorageItem).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should return null if saving fails', async () => {
      // Set up test data
      await saveMasterRoster(mockPlayers);

      const saveError = new Error('Save failed!');
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      // Override only for the save operation
      const originalSetImpl = mockSetStorageItem.getMockImplementation();
      mockSetStorageItem.mockImplementationOnce(() => { throw saveError; });

      const result = await setPlayerGoalieStatus('player_1', true);

      expect(result).toBeNull();
      expect(mockSetStorageItem).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[setPlayerGoalieStatus] Unexpected error:'), saveError);

      // Restore original implementation
      if (originalSetImpl) {
        mockSetStorageItem.mockImplementation(originalSetImpl);
      }
      consoleSpy.mockRestore();
    });
  });

  describe('setPlayerFairPlayCardStatus', () => {
    it('should update player fair play status and return the player object', async () => {
      // Set up test data
      await saveMasterRoster(mockPlayers);

      const result = await setPlayerFairPlayCardStatus('player_2', true);
      expect(result).not.toBeNull();
      expect(result?.receivedFairPlayCard).toBe(true);
      expect(result?.id).toBe('player_2');
      expect(mockSetStorageItem).toHaveBeenCalledWith(
        MASTER_ROSTER_KEY,
        expect.stringContaining('"receivedFairPlayCard":true')
      );
       expect(mockSetStorageItem).toHaveBeenCalledWith(
        MASTER_ROSTER_KEY,
        expect.stringContaining('player_2')
      );
    });

    it('should return null if player not found', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const result = await setPlayerFairPlayCardStatus('non_existent_id', true);
      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Player with ID non_existent_id not found'));
      expect(mockSetStorageItem).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should return null if saving fails', async () => {
      // Set up test data
      await saveMasterRoster(mockPlayers);

      const saveError = new Error('Save failed!');
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      // Override only for the save operation
      const originalSetImpl = mockSetStorageItem.getMockImplementation();
      mockSetStorageItem.mockImplementationOnce(() => { throw saveError; });

      const result = await setPlayerFairPlayCardStatus('player_1', true);

      expect(result).toBeNull();
      expect(mockSetStorageItem).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[updatePlayerInRoster] Unexpected error updating player:'), saveError);

      // Restore original implementation
      if (originalSetImpl) {
        mockSetStorageItem.mockImplementation(originalSetImpl);
      }
      consoleSpy.mockRestore();
    });
  });
}); 
