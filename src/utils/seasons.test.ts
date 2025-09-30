import { SEASONS_LIST_KEY } from '@/config/storageKeys';
import { getSeasons, saveSeasons, addSeason, updateSeason, deleteSeason } from './seasons'; // Adjust path as needed
import type { Season } from '@/types'; // Import Season type directly from types
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

describe('Season Management Utilities (storage)', () => {
  const sampleSeasons: Season[] = [
    { id: 's1', name: 'Spring League 2023' },
    { id: 's2', name: 'Summer Tournament' },
    { id: 's3', name: 'Fall Season' },
  ];

  describe('getSeasons', () => {
    it('should return an empty array if no seasons are in storage', async () => {
      expect(await getSeasons()).toEqual([]);
    });

    it('should return seasons from storage if they exist', async () => {
      mockGetStorageItem.mockResolvedValueOnce(JSON.stringify(sampleSeasons));
      expect(await getSeasons()).toEqual(sampleSeasons);
    });

    it('should return an empty array and log an error if storage data is malformed', async () => {
      mockGetStorageItem.mockResolvedValueOnce('invalid-json');
      expect(await getSeasons()).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('saveSeasons', () => {
    it('should save seasons to storage and return true', async () => {
      // Use isolated test data to avoid contamination
      const testData: Season[] = [{ id: 'test_save', name: 'Test Save Season' }];
      const result = await saveSeasons(testData);
      expect(result).toBe(true);
      expect(mockSetStorageItem).toHaveBeenCalledWith(SEASONS_LIST_KEY, JSON.stringify(testData));
      // Data persistence verified through mock calls
    });

    it('should save empty array to storage and return true', async () => {
      const result = await saveSeasons([]);
      expect(result).toBe(true);
      expect(mockSetStorageItem).toHaveBeenCalledWith(SEASONS_LIST_KEY, JSON.stringify([]));
      // Data persistence verified through mock calls
    });

    it('should log an error and return false if saving to storage fails', async () => {
      const testData: Season[] = [{ id: 'test_fail', name: 'Test Fail Season' }];
      mockSetStorageItem.mockImplementationOnce(async () => {
        throw new Error('Quota exceeded');
      });
      const result = await saveSeasons(testData);
      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('addSeason', () => {
    it('should add a new season to an empty list and return the new season object', async () => {
      const newSeasonName = 'Winter Championship';
      const newSeason = await addSeason(newSeasonName);
      expect(newSeason).not.toBeNull();
      expect(newSeason?.name).toBe(newSeasonName);
      const seasonsInStorage = await getSeasons();
      expect(seasonsInStorage).toHaveLength(1);
      expect(seasonsInStorage[0]).toEqual(newSeason);
    });

    it('should add a new season to an existing list and return the new object', async () => {
      await saveSeasons([sampleSeasons[0]]);
      const newSeasonName = 'Annual Gala';
      const newSeason = await addSeason(newSeasonName);
      expect(newSeason).not.toBeNull();
      expect(newSeason?.name).toBe(newSeasonName);
      const seasonsInStorage = await getSeasons();
      expect(seasonsInStorage).toHaveLength(2);
      expect(seasonsInStorage.find(s => s.id === newSeason?.id)).toEqual(newSeason);
    });

    it('should trim whitespace from the new season name', async () => {
      const newSeasonName = '  Spaced Out Cup   ';
      const newSeason = await addSeason(newSeasonName);
      expect(newSeason).not.toBeNull();
      expect(newSeason?.name).toBe('Spaced Out Cup');
    });

    it('should return null and log error if the season name is empty', async () => {
      expect(await addSeason('')).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Season name cannot be empty'));
      expect(await addSeason('   ')).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    });

    it('should return null and log error if a season with the same name already exists', async () => {
      await saveSeasons([sampleSeasons[0]]); // 'Spring League 2023'
      expect(await addSeason('spring league 2023')).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[addSeason] Validation failed: A season with name "spring league 2023" already exists.'));
    });

    it('should return null if saving fails during add', async () => {
      mockSetStorageItem.mockImplementationOnce(async () => { throw new Error('Save failed'); });
      expect(await addSeason('Ephemeral Season')).toBeNull();
      // saveSeasons (which is called by addSeason) will log the error.
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[saveSeasons] Error saving seasons to storage:'), expect.any(Error));
    });
  });

  describe('updateSeason', () => {
    beforeEach(async () => {
      await saveSeasons([...sampleSeasons]); 
    });

    it('should update an existing season\'s name and return the updated object', async () => {
      const seasonToUpdateData: Season = { ...sampleSeasons[0], name: 'Spring League Updated' };
      const updatedSeason = await updateSeason(seasonToUpdateData);
      expect(updatedSeason).not.toBeNull();
      expect(updatedSeason?.name).toBe('Spring League Updated');
      const currentSeasons = await getSeasons();
      expect(currentSeasons.find(s => s.id === sampleSeasons[0].id)?.name).toBe('Spring League Updated');
    });

    it('should trim whitespace from updated name', async () => {
      const seasonToUpdateData: Season = { ...sampleSeasons[0], name: '  Trimmed Update ' };
      const updatedSeason = await updateSeason(seasonToUpdateData);
      expect(updatedSeason).not.toBeNull();
      expect(updatedSeason?.name).toBe('Trimmed Update');
      const currentSeasons = await getSeasons();
      expect(currentSeasons.find(s => s.id === sampleSeasons[0].id)?.name).toBe('Trimmed Update');
    });

    it('should return null and log error if trying to update a non-existent season', async () => {
      const nonExistentSeason: Season = { id: 's99', name: 'Ghost Season' };
      expect(await updateSeason(nonExistentSeason)).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Season with ID s99 not found'));
    });

    it('should return null and log error if updated name conflicts with another season', async () => {
      const seasonToUpdateData: Season = { ...sampleSeasons[0], name: sampleSeasons[1].name.toUpperCase() }; 
      expect(await updateSeason(seasonToUpdateData)).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`[updateSeason] Validation failed: Another season with name "${sampleSeasons[1].name.toUpperCase()}" already exists.`));
    });

    it('should return null if saving fails during update', async () => {
      mockSetStorageItem.mockImplementationOnce(async () => {
        throw new Error('Save failed');
      });
      const seasonToUpdateData: Season = { ...sampleSeasons[0], name: 'Update Fail Season' };
      expect(await updateSeason(seasonToUpdateData)).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[saveSeasons] Error saving seasons to storage:'), expect.any(Error));
    });

    it('should return null and log error for invalid update data (empty name)', async () => {
      const invalidSeason: Season = { ...sampleSeasons[0], name: '   ' };
      expect(await updateSeason(invalidSeason)).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[updateSeason] Invalid season data provided for update.'));
    });

    it('should return null and log error for invalid update data (missing id)', async () => {
      const invalidSeason = { name: 'Valid Name' } as Season;
      expect(await updateSeason(invalidSeason)).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid season data provided for update'));
    });
  });

  describe('deleteSeason', () => {
    beforeEach(async () => {
      await saveSeasons([...sampleSeasons]); 
    });

    it('should delete an existing season by ID and return true', async () => {
      const seasonIdToDelete = sampleSeasons[1].id;
      const result = await deleteSeason(seasonIdToDelete);
      expect(result).toBe(true);
      const currentSeasons = await getSeasons();
      expect(currentSeasons.find(s => s.id === seasonIdToDelete)).toBeUndefined();
    });

    it('should return false and log error if trying to delete a non-existent season ID', async () => {
      const nonExistentId = 's99';
      const result = await deleteSeason(nonExistentId);
      expect(result).toBe(false);
      const currentSeasons = await getSeasons();
      expect(currentSeasons).toHaveLength(sampleSeasons.length);
      expect(consoleErrorSpy).toHaveBeenCalledWith(`[deleteSeason] Season with id ${nonExistentId} not found.`);
    });

    it('should handle deleting the last season and return true', async () => {
      await saveSeasons([sampleSeasons[0]]);
      const result = await deleteSeason(sampleSeasons[0].id);
      expect(result).toBe(true);
      expect(await getSeasons()).toEqual([]);
    });

    it('should return false if saving fails during delete', async () => {
      mockSetStorageItem.mockImplementationOnce(async () => { throw new Error('Save failed'); });
      const seasonIdToDelete = sampleSeasons[1].id;
      expect(await deleteSeason(seasonIdToDelete)).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[saveSeasons] Error saving seasons to storage:'), expect.any(Error));
      const currentSeasons = await getSeasons();
      expect(currentSeasons.find(s => s.id === seasonIdToDelete)).toBeDefined(); // Should still be there if save failed
    });

    it('should return false and log error for invalid delete ID', async () => {
      expect(await deleteSeason('')).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[deleteSeason] Invalid season ID provided'));
    });
  });
}); 
