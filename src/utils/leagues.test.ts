import { SEASONS_LIST_KEY } from '@/config/storageKeys';
import { getLeagues, saveLeagues, addLeague, updateLeague, deleteLeague } from './leagues';
import type { League } from '@/types';
import { clearMockStore } from './__mocks__/storage';
import { getStorageItem, setStorageItem } from './storage';

// Auto-mock the storage module
jest.mock('./storage');

// Type the mocked functions
const mockGetStorageItem = getStorageItem as jest.MockedFunction<typeof getStorageItem>;
const mockSetStorageItem = setStorageItem as jest.MockedFunction<typeof setStorageItem>;

// Mock console.error and console.warn to prevent output during tests and allow assertions
let consoleErrorSpy: jest.SpyInstance;
let consoleWarnSpy: jest.SpyInstance;

beforeEach(() => {
  clearMockStore();
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
  consoleErrorSpy.mockRestore();
  consoleWarnSpy.mockRestore();
  // Ensure complete cleanup after each test
  clearMockStore();
});

describe('League Management Utilities (storage)', () => {
  const sampleLeagues: League[] = [
    { id: 'l1', name: 'Spring League 2023' },
    { id: 'l2', name: 'Summer Tournament' },
    { id: 'l3', name: 'Fall Season' },
  ];

  describe('getLeagues', () => {
    it('should return an empty array if no leagues are in storage', async () => {
      expect(await getLeagues()).toEqual([]);
    });

    it('should return leagues from storage if they exist', async () => {
      mockGetStorageItem.mockResolvedValueOnce(JSON.stringify(sampleLeagues));
      expect(await getLeagues()).toEqual(sampleLeagues);
    });

    it('should return an empty array and log an error if storage data is malformed', async () => {
      mockGetStorageItem.mockResolvedValueOnce('invalid-json');
      expect(await getLeagues()).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('saveLeagues', () => {
    it('should save leagues to storage and return true', async () => {
      // Use isolated test data to avoid contamination
      const testData: League[] = [{ id: 'test_save', name: 'Test Save League' }];
      const result = await saveLeagues(testData);
      expect(result).toBe(true);
      expect(mockSetStorageItem).toHaveBeenCalledWith(SEASONS_LIST_KEY, JSON.stringify(testData));
      // Data persistence verified through mock calls
    });

    it('should save empty array to storage and return true', async () => {
      const result = await saveLeagues([]);
      expect(result).toBe(true);
      expect(mockSetStorageItem).toHaveBeenCalledWith(SEASONS_LIST_KEY, JSON.stringify([]));
      // Data persistence verified through mock calls
    });

    it('should log an error and return false if saving to storage fails', async () => {
      const testData: League[] = [{ id: 'test_fail', name: 'Test Fail League' }];
      mockSetStorageItem.mockImplementationOnce(async () => {
        throw new Error('Quota exceeded');
      });
      const result = await saveLeagues(testData);
      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('addLeague', () => {
    it('should add a new league to an empty list and return the new league object', async () => {
      const newLeagueName = 'Winter Championship';
      const newLeague = await addLeague(newLeagueName);
      expect(newLeague).not.toBeNull();
      expect(newLeague?.name).toBe(newLeagueName);
      const leaguesInStorage = await getLeagues();
      expect(leaguesInStorage).toHaveLength(1);
      expect(leaguesInStorage[0]).toEqual(newLeague);
    });

    it('should add a new league to an existing list and return the new object', async () => {
      await saveLeagues([sampleLeagues[0]]);
      const newLeagueName = 'Annual Gala';
      const newLeague = await addLeague(newLeagueName);
      expect(newLeague).not.toBeNull();
      expect(newLeague?.name).toBe(newLeagueName);
      const leaguesInStorage = await getLeagues();
      expect(leaguesInStorage).toHaveLength(2);
      expect(leaguesInStorage.find(l => l.id === newLeague?.id)).toEqual(newLeague);
    });

    it('should trim whitespace from the new league name', async () => {
      const newLeagueName = '  Spaced Out Cup   ';
      const newLeague = await addLeague(newLeagueName);
      expect(newLeague).not.toBeNull();
      expect(newLeague?.name).toBe('Spaced Out Cup');
    });

    it('should return null and log error if the league name is empty', async () => {
      expect(await addLeague('')).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('League name cannot be empty'));
      expect(await addLeague('   ')).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    });

    it('should return null and log error if a league with the same name already exists', async () => {
      await saveLeagues([sampleLeagues[0]]); // 'Spring League 2023'
      expect(await addLeague('spring league 2023')).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[addLeague] Validation failed: A league with name "spring league 2023" already exists.'));
    });

    it('should return null if saving fails during add', async () => {
      mockSetStorageItem.mockImplementationOnce(async () => { throw new Error('Save failed'); });
      expect(await addLeague('Ephemeral League')).toBeNull();
      // addLeague catches and logs the error at the high-level function
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[addLeague] Unexpected error adding league:'), expect.any(Error));
    });
  });

  describe('updateLeague', () => {
    beforeEach(async () => {
      await saveLeagues([...sampleLeagues]);
    });

    it('should update an existing league\'s name and return the updated object', async () => {
      const leagueToUpdateData: League = { ...sampleLeagues[0], name: 'Spring League Updated' };
      const updatedLeague = await updateLeague(leagueToUpdateData);
      expect(updatedLeague).not.toBeNull();
      expect(updatedLeague?.name).toBe('Spring League Updated');
      const currentLeagues = await getLeagues();
      expect(currentLeagues.find(l => l.id === sampleLeagues[0].id)?.name).toBe('Spring League Updated');
    });

    it('should trim whitespace from updated name', async () => {
      const leagueToUpdateData: League = { ...sampleLeagues[0], name: '  Trimmed Update ' };
      const updatedLeague = await updateLeague(leagueToUpdateData);
      expect(updatedLeague).not.toBeNull();
      expect(updatedLeague?.name).toBe('Trimmed Update');
      const currentLeagues = await getLeagues();
      expect(currentLeagues.find(l => l.id === sampleLeagues[0].id)?.name).toBe('Trimmed Update');
    });

    it('should return null and log error if trying to update a non-existent league', async () => {
      const nonExistentLeague: League = { id: 'l99', name: 'Ghost League' };
      expect(await updateLeague(nonExistentLeague)).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('League with ID l99 not found'));
    });

    it('should return null and log error if updated name conflicts with another league', async () => {
      const leagueToUpdateData: League = { ...sampleLeagues[0], name: sampleLeagues[1].name.toUpperCase() };
      expect(await updateLeague(leagueToUpdateData)).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`[updateLeague] Validation failed: Another league with name "${sampleLeagues[1].name.toUpperCase()}" already exists.`));
    });

    it('should return null if saving fails during update', async () => {
      mockSetStorageItem.mockImplementationOnce(async () => {
        throw new Error('Save failed');
      });
      const leagueToUpdateData: League = { ...sampleLeagues[0], name: 'Update Fail League' };
      expect(await updateLeague(leagueToUpdateData)).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[updateLeague] Unexpected error updating league:'), expect.any(Error));
    });

    it('should return null and log error for invalid update data (empty name)', async () => {
      const invalidLeague: League = { ...sampleLeagues[0], name: '   ' };
      expect(await updateLeague(invalidLeague)).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[updateLeague] Invalid league data provided for update.'));
    });

    it('should return null and log error for invalid update data (missing id)', async () => {
      const invalidLeague = { name: 'Valid Name' } as League;
      expect(await updateLeague(invalidLeague)).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid league data provided for update'));
    });
  });

  describe('deleteLeague', () => {
    beforeEach(async () => {
      await saveLeagues([...sampleLeagues]);
    });

    it('should delete an existing league by ID and return true', async () => {
      const leagueIdToDelete = sampleLeagues[1].id;
      const result = await deleteLeague(leagueIdToDelete);
      expect(result).toBe(true);
      const currentLeagues = await getLeagues();
      expect(currentLeagues.find(l => l.id === leagueIdToDelete)).toBeUndefined();
    });

    it('should return false and log error if trying to delete a non-existent league ID', async () => {
      const nonExistentId = 'l99';
      const result = await deleteLeague(nonExistentId);
      expect(result).toBe(false);
      const currentLeagues = await getLeagues();
      expect(currentLeagues).toHaveLength(sampleLeagues.length);
      expect(consoleErrorSpy).toHaveBeenCalledWith(`[deleteLeague] League with id ${nonExistentId} not found.`);
    });

    it('should handle deleting the last league and return true', async () => {
      await saveLeagues([sampleLeagues[0]]);
      const result = await deleteLeague(sampleLeagues[0].id);
      expect(result).toBe(true);
      expect(await getLeagues()).toEqual([]);
    });

    it('should return false if saving fails during delete', async () => {
      mockSetStorageItem.mockImplementationOnce(async () => { throw new Error('Save failed'); });
      const leagueIdToDelete = sampleLeagues[1].id;
      expect(await deleteLeague(leagueIdToDelete)).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[deleteLeague] Unexpected error deleting league:'), expect.any(Error));
      const currentLeagues = await getLeagues();
      expect(currentLeagues.find(l => l.id === leagueIdToDelete)).toBeDefined(); // Should still be there if save failed
    });

    it('should return false and log error for invalid delete ID', async () => {
      expect(await deleteLeague('')).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[deleteLeague] Invalid league ID provided'));
    });
  });
});
