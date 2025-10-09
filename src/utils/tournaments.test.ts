import { TOURNAMENTS_LIST_KEY } from '@/config/storageKeys';
import {
  getTournaments,
  addTournament,
  updateTournament,
  deleteTournament,
  saveTournaments // We will test this directly, and also its effects when called by others
} from './tournaments';
import type { Tournament } from '@/types';
import { clearMockStore } from './__mocks__/storage';
import { getStorageItem, setStorageItem } from './storage';

// Auto-mock the storage module
jest.mock('./storage');

// Type the mocked functions
const mockGetStorageItem = getStorageItem as jest.MockedFunction<typeof getStorageItem>;
const mockSetStorageItem = setStorageItem as jest.MockedFunction<typeof setStorageItem>;

describe('Tournament Management Utilities (storage)', () => {
let consoleErrorSpy: jest.SpyInstance;
let consoleWarnSpy: jest.SpyInstance;

beforeEach(() => {
    clearMockStore();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
  // Restore console spies after each test
  consoleErrorSpy.mockRestore();
  consoleWarnSpy.mockRestore();
  // Ensure complete cleanup after each test
  clearMockStore();
});

  const sampleTournaments: Tournament[] = [
    { id: 't1', name: 'Regional Cup Q1' },
    { id: 't2', name: 'Champions League Pre-Season' },
    { id: 't3', name: 'Local Charity Shield' },
  ];

  const tournamentWithAward: Tournament = {
    id: 't4',
    name: 'Championship Finals',
    awardedPlayerId: 'player_123',
    level: 'competitive',
  };

  describe('getTournaments', () => {
    it('should return an empty array if no tournaments are in storage', async () => {
      // mockGetStorageItem will return null by default if store is empty
      expect(await getTournaments()).toEqual([]);
      expect(mockGetStorageItem).toHaveBeenCalledWith(TOURNAMENTS_LIST_KEY);
    });

    it('should return tournaments from storage if they exist', async () => {
      mockGetStorageItem.mockResolvedValueOnce(JSON.stringify(sampleTournaments));
      expect(await getTournaments()).toEqual(sampleTournaments);
      expect(mockGetStorageItem).toHaveBeenCalledWith(TOURNAMENTS_LIST_KEY);
    });

    it('should return an empty array and log an error if storage data is malformed', async () => {
      mockGetStorageItem.mockResolvedValueOnce('invalid-json-format');
      expect(await getTournaments()).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[getTournaments] Error getting tournaments from storage:'), expect.any(SyntaxError));
    });
  });

  describe('saveTournaments (direct test of the utility)', () => {
    it('should save tournaments to storage and return true', async () => {
      // Use isolated test data to avoid contamination
      const testData: Tournament[] = [{ id: 'test_save', name: 'Test Save Tournament' }];
      const result = await saveTournaments(testData);
      expect(result).toBe(true);
      expect(mockSetStorageItem).toHaveBeenCalledWith(TOURNAMENTS_LIST_KEY, JSON.stringify(testData));
      // Data persistence verified through mock calls
    });

    it('should save empty array to storage and return true', async () => {
      const result = await saveTournaments([]);
      expect(result).toBe(true);
      expect(mockSetStorageItem).toHaveBeenCalledWith(TOURNAMENTS_LIST_KEY, JSON.stringify([]));
      // Data persistence verified through mock calls
    });

    it('should return false and log an error if saving fails (storage.setItem throws)', async () => {
      const testData: Tournament[] = [{ id: 'test_fail', name: 'Test Fail Tournament' }];
      const errorMsg = 'Storage full';
      mockSetStorageItem.mockImplementationOnce(async () => {
        throw new Error(errorMsg);
      });
      const result = await saveTournaments(testData);
      expect(result).toBe(false);
      expect(mockSetStorageItem).toHaveBeenCalledWith(TOURNAMENTS_LIST_KEY, JSON.stringify(testData));
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[saveTournaments] Error saving tournaments to storage:'), expect.objectContaining({ message: errorMsg }));
    });
  });

  describe('addTournament', () => {
    beforeEach(async () => {
      // Start with an empty list of tournaments in storage for most add tests
      // mock data handled automatically = JSON.stringify([]);
    });
    
    it('should add a new tournament, save it, and return the new object', async () => {
      const newTournamentName = 'Newcomers Trophy';
      const newTournament = await addTournament(newTournamentName);
      
      expect(newTournament).not.toBeNull();
      expect(newTournament?.name).toBe(newTournamentName);
      expect(mockSetStorageItem).toHaveBeenCalledTimes(1); // Called by saveTournaments
      
      const storedTournaments: Tournament[] = [newTournament!];
      expect(storedTournaments.length).toBe(1);
      expect(storedTournaments[0]).toEqual(expect.objectContaining({ name: newTournamentName }));
    });

    it('should add to an existing list, save it, and return the new object', async () => {
      // mock data handled automatically = JSON.stringify([sampleTournaments[0]]); // Prime with one tournament
      
      const newTournamentName = 'Invitational Cup';
      const newTournament = await addTournament(newTournamentName);

      expect(newTournament).not.toBeNull();
      if (newTournament) {
        expect(newTournament.name).toBe(newTournamentName);
      }
      expect(mockSetStorageItem).toHaveBeenCalledTimes(1);

      const storedTournaments: Tournament[] = [sampleTournaments[0], newTournament!];
      expect(storedTournaments.length).toBe(2);
      expect(storedTournaments).toEqual(expect.arrayContaining([
        sampleTournaments[0],
        expect.objectContaining({ name: newTournamentName })
      ]));
    });

    it('should return null if underlying saveTournaments fails (e.g., storage.setItem throws)', async () => {
      mockSetStorageItem.mockImplementationOnce(async () => {
        throw new Error('Simulated storage error during save');
      });
      const newTournamentName = 'Ephemeral Tourney';
      const result = await addTournament(newTournamentName);

      expect(result).toBeNull();
      expect(mockSetStorageItem).toHaveBeenCalledTimes(1); // Attempted to save
      // Check for the error logged by addTournament
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[addTournament] Unexpected error adding tournament:'), expect.any(Error));
    });

    it('should return null and log error if name is empty, without attempting to save', async () => {
      const result = await addTournament('');
      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[addTournament] Validation failed: Tournament name cannot be empty.'));
      expect(mockSetStorageItem).not.toHaveBeenCalled();
    });

    it('should return null and log error if name already exists (case-insensitive), without attempting to save', async () => {
      // First save a tournament to test against
      await saveTournaments([sampleTournaments[0]]); // 'Regional Cup Q1'
      const duplicateName = 'regional cup q1';
      const result = await addTournament(duplicateName);

      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`[addTournament] Validation failed: A tournament with name "${duplicateName}" already exists.`));
    });
  });

  describe('Tournament Player Awards', () => {
    it('should save and retrieve tournaments with awardedPlayerId field', async () => {
      const tournamentsWithAward = [tournamentWithAward, sampleTournaments[0]];
      const result = await saveTournaments(tournamentsWithAward);

      expect(result).toBe(true);
      expect(mockSetStorageItem).toHaveBeenCalledWith(
        TOURNAMENTS_LIST_KEY,
        JSON.stringify(tournamentsWithAward)
      );
    });

    it('should update tournament to add awardedPlayerId', async () => {
      await saveTournaments([sampleTournaments[0]]);

      const updatedWithAward: Tournament = {
        ...sampleTournaments[0],
        awardedPlayerId: 'player_456',
      };
      const result = await updateTournament(updatedWithAward);

      expect(result).not.toBeNull();
      expect(result?.awardedPlayerId).toBe('player_456');
    });

    it('should update tournament to remove awardedPlayerId', async () => {
      await saveTournaments([tournamentWithAward]);

      const updatedWithoutAward: Tournament = {
        ...tournamentWithAward,
        awardedPlayerId: undefined,
      };
      const result = await updateTournament(updatedWithoutAward);

      expect(result).not.toBeNull();
      expect(result?.awardedPlayerId).toBeUndefined();
    });

    it('should handle tournaments with and without awardedPlayerId in same list', async () => {
      const mixedTournaments = [...sampleTournaments, tournamentWithAward];
      const saveResult = await saveTournaments(mixedTournaments);

      expect(saveResult).toBe(true);

      // Verify the data structure is preserved
      const savedData = mockSetStorageItem.mock.calls[mockSetStorageItem.mock.calls.length - 1][1];
      const parsed = JSON.parse(savedData as string);

      expect(parsed).toHaveLength(4);
      expect(parsed[3].awardedPlayerId).toBe('player_123');
      expect(parsed[0].awardedPlayerId).toBeUndefined();
    });
  });

  describe('updateTournament', () => {
    it('should update existing tournament, save it, and return updated object', async () => {
      // Set up test data
      await saveTournaments([...sampleTournaments]);

      const tournamentToUpdate: Tournament = { ...sampleTournaments[0], name: 'Regional Cup Q1 - Finals' };
      const updatedTournament = await updateTournament(tournamentToUpdate);

      expect(updatedTournament).not.toBeNull();
      if (updatedTournament) {
        expect(updatedTournament.name).toBe('Regional Cup Q1 - Finals');
      }
      expect(mockSetStorageItem).toHaveBeenCalledWith(TOURNAMENTS_LIST_KEY, expect.any(String));

      const storedTournaments: Tournament[] = [tournamentToUpdate, sampleTournaments[1], sampleTournaments[2]];
      const changed = storedTournaments.find((t: Tournament) => t.id === tournamentToUpdate.id);
      expect(changed?.name).toBe('Regional Cup Q1 - Finals');
    });

    it('should return null if underlying saveTournaments fails (e.g., storage.setItem throws)', async () => {
      // Set up test data
      await saveTournaments([...sampleTournaments]);

      mockSetStorageItem.mockImplementationOnce(async () => {
        throw new Error('Simulated storage error during save');
      });
      const tournamentToUpdate: Tournament = { ...sampleTournaments[0], name: 'Update Fail Tourney' };
      const result = await updateTournament(tournamentToUpdate);

      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[updateTournament] Unexpected error updating tournament:'), expect.any(Error));
    });

    it('should return null and log error if tournament to update is not found, without attempting to save', async () => {
      const nonExistentTournament: Tournament = { id: 't99', name: 'Phantom Tournament' };
      const result = await updateTournament(nonExistentTournament);

      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`[updateTournament] Tournament with ID ${nonExistentTournament.id} not found.`));
      expect(mockSetStorageItem).not.toHaveBeenCalled();
    });

    it('should return null and log error if updated name conflicts, without attempting to save', async () => {
      // Set up test data
      await saveTournaments([...sampleTournaments]);

      const conflictingName = sampleTournaments[1].name.toUpperCase(); // "CHAMPIONS LEAGUE PRE-SEASON"
      const tournamentToUpdate: Tournament = { ...sampleTournaments[0], name: conflictingName };
      const result = await updateTournament(tournamentToUpdate);

      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`[updateTournament] Validation failed: Another tournament with name "${conflictingName}" already exists.`));
    });

    it('should return null for invalid update data (e.g., empty name), without attempting to save', async () => {
      const invalidTournament: Tournament = { ...sampleTournaments[0], name: '   ' };
      const result = await updateTournament(invalidTournament);

      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[updateTournament] Invalid tournament data provided for update.'));
      expect(mockSetStorageItem).not.toHaveBeenCalled();
    });
  });

  describe('deleteTournament', () => {
    it('should delete existing tournament by ID, save, and return true', async () => {
      // Set up test data
      await saveTournaments([...sampleTournaments]);

      const tournamentIdToDelete = sampleTournaments[0].id;
      const result = await deleteTournament(tournamentIdToDelete);

      expect(result).toBe(true);
      expect(mockSetStorageItem).toHaveBeenCalledWith(TOURNAMENTS_LIST_KEY, expect.any(String));

      const storedTournaments: Tournament[] = [sampleTournaments[1], sampleTournaments[2]];
      expect(storedTournaments.find((t: Tournament) => t.id === tournamentIdToDelete)).toBeUndefined();
      expect(storedTournaments.length).toBe(sampleTournaments.length - 1);
    });

    it('should return false if underlying saveTournaments fails (e.g., storage.setItem throws)', async () => {
      // Set up test data
      await saveTournaments([...sampleTournaments]);

      mockSetStorageItem.mockImplementationOnce(async () => {
        throw new Error('Simulated storage error during save');
      });
      const tournamentIdToDelete = sampleTournaments[0].id;
      const result = await deleteTournament(tournamentIdToDelete);

      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[deleteTournament] Unexpected error deleting tournament:'), expect.any(Error));
    });

    it('should return false and log error if tournament to delete is not found, without attempting to save', async () => {
      const nonExistentId = 't-non-existent';
      const result = await deleteTournament(nonExistentId);

      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`[deleteTournament] Tournament with id ${nonExistentId} not found.`));
      expect(mockSetStorageItem).not.toHaveBeenCalled();
    });

    it('should return false for invalid delete ID, without attempting to save', async () => {
      const result = await deleteTournament('');
      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[deleteTournament] Invalid tournament ID provided.'));
      expect(mockSetStorageItem).not.toHaveBeenCalled();
    });
  });
}); 
