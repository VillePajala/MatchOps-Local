/**
 * Tests for tournaments.ts - Tournament management utilities
 *
 * These tests verify the tournaments utility functions work correctly
 * when routed through DataStore abstraction.
 *
 * Test Strategy:
 * - Mock DataStore using standard jest.mock() (works because getDataStore()
 *   is called within async functions, not at module load time)
 * - Tests verify utility functions correctly delegate to DataStore
 * - Edge cases and error handling are tested at utility layer
 */

import { TOURNAMENTS_LIST_KEY } from '@/config/storageKeys';
import type { Tournament } from '@/types';
import type { SavedGamesCollection } from '@/types/game';

// Mock DataStore state (module-level for mock factory access)
let mockTournaments: Tournament[] = [];
let mockGames: SavedGamesCollection = {};
let mockCreateTournamentResult: Tournament | null = null;
let mockUpdateTournamentResult: Tournament | null = null;
let mockDeleteTournamentResult = true;
let mockShouldThrow = false;
let mockValidationError = false;
let mockAlreadyExistsError = false;
let tournamentIdCounter = 0; // Deterministic ID counter per CLAUDE.md testing rules

// Mock DataStore implementation
const mockDataStore = {
  getTournaments: jest.fn(async () => {
    if (mockShouldThrow) throw new Error('DataStore error');
    return [...mockTournaments];
  }),
  createTournament: jest.fn(async (name: string, extra?: Partial<Omit<Tournament, 'id' | 'name'>>) => {
    if (mockShouldThrow) throw new Error('DataStore error');
    if (mockValidationError) {
      const error = new Error('Validation error');
      (error as Error & { code: string }).code = 'VALIDATION_ERROR';
      throw error;
    }
    if (mockAlreadyExistsError) {
      const error = new Error('Tournament already exists');
      (error as Error & { code: string }).code = 'ALREADY_EXISTS';
      throw error;
    }
    tournamentIdCounter++;
    const newTournament: Tournament = {
      id: `tournament_test_${tournamentIdCounter}`,
      name,
      ...extra,
    };
    mockTournaments.push(newTournament);
    return mockCreateTournamentResult ?? newTournament;
  }),
  updateTournament: jest.fn(async (tournament: Tournament) => {
    if (mockShouldThrow) throw new Error('DataStore error');
    if (mockValidationError) {
      const error = new Error('Name conflict');
      (error as Error & { code: string }).code = 'VALIDATION_ERROR';
      throw error;
    }
    const index = mockTournaments.findIndex(t => t.id === tournament.id);
    if (index === -1) return null;
    mockTournaments[index] = { ...tournament };
    return mockUpdateTournamentResult ?? mockTournaments[index];
  }),
  deleteTournament: jest.fn(async (id: string) => {
    if (mockShouldThrow) throw new Error('DataStore error');
    const index = mockTournaments.findIndex(t => t.id === id);
    if (index === -1) return false;
    mockTournaments.splice(index, 1);
    return mockDeleteTournamentResult;
  }),
  getGames: jest.fn(async () => {
    if (mockShouldThrow) throw new Error('DataStore error');
    return { ...mockGames };
  }),
};

// Mock DataStore - standard jest.mock works because getDataStore() is called
// within async functions, not at module load time
jest.mock('@/datastore', () => ({
  getDataStore: jest.fn(async () => mockDataStore),
}));

// Mock storage for deprecated saveTournaments
jest.mock('./storage');

import { setStorageItem } from './storage';
import {
  getTournaments,
  saveTournaments,
  addTournament,
  updateTournament,
  deleteTournament,
  countGamesForTournament,
  updateTeamPlacement,
  getTeamPlacement,
} from './tournaments';

const mockSetStorageItem = setStorageItem as jest.MockedFunction<typeof setStorageItem>;

// Mock console methods
let consoleErrorSpy: jest.SpyInstance;
let consoleWarnSpy: jest.SpyInstance;

beforeEach(() => {
  // Reset mock state
  mockTournaments = [];
  mockGames = {};
  mockCreateTournamentResult = null;
  mockUpdateTournamentResult = null;
  mockDeleteTournamentResult = true;
  mockShouldThrow = false;
  mockValidationError = false;
  mockAlreadyExistsError = false;
  tournamentIdCounter = 0; // Reset deterministic ID counter

  // Clear all mock call history
  jest.clearAllMocks();

  // Mock console methods
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
  consoleWarnSpy.mockRestore();
});

describe('Tournament Management Utilities (DataStore)', () => {
  const sampleTournaments: Tournament[] = [
    { id: 't1', name: 'Regional Cup Q1' },
    { id: 't2', name: 'Champions League Pre-Season' },
    { id: 't3', name: 'Local Charity Shield' },
  ];

  describe('getTournaments', () => {
    it('should return an empty array if no tournaments are stored', async () => {
      expect(await getTournaments()).toEqual([]);
      expect(mockDataStore.getTournaments).toHaveBeenCalled();
    });

    it('should return tournaments from DataStore', async () => {
      mockTournaments = [...sampleTournaments];
      expect(await getTournaments()).toEqual(sampleTournaments);
    });

    it('should return an empty array and log error if DataStore fails', async () => {
      mockShouldThrow = true;
      expect(await getTournaments()).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[getTournaments]'),
        expect.any(Error)
      );
    });
  });

  describe('saveTournaments (deprecated)', () => {
    it('should save tournaments to storage and return true', async () => {
      const testData: Tournament[] = [{ id: 'test_save', name: 'Test Save Tournament' }];
      const result = await saveTournaments(testData);
      expect(result).toBe(true);
      expect(mockSetStorageItem).toHaveBeenCalledWith(TOURNAMENTS_LIST_KEY, JSON.stringify(testData));
    });

    it('should return false and log error if storage throws', async () => {
      mockSetStorageItem.mockRejectedValueOnce(new Error('Storage error'));
      const result = await saveTournaments([{ id: 'test', name: 'Test' }]);
      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('addTournament', () => {
    it('should add a new tournament and return the tournament object', async () => {
      const newTournamentName = 'Winter Championship';
      const result = await addTournament(newTournamentName);

      expect(result).not.toBeNull();
      expect(result?.name).toBe(newTournamentName);
      expect(mockDataStore.createTournament).toHaveBeenCalledWith(newTournamentName, {});
    });

    it('should pass extra fields to DataStore', async () => {
      const extra = { level: 'competitive' };
      await addTournament('Test Tournament', extra);

      expect(mockDataStore.createTournament).toHaveBeenCalledWith('Test Tournament', extra);
    });

    it('should trim whitespace from the tournament name', async () => {
      await addTournament('  Spaced Out Cup   ');

      expect(mockDataStore.createTournament).toHaveBeenCalledWith('Spaced Out Cup', {});
    });

    it('should return null and log warning if tournament name is empty', async () => {
      expect(await addTournament('')).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Tournament name cannot be empty')
      );
      expect(mockDataStore.createTournament).not.toHaveBeenCalled();
    });

    it('should return null and log warning if tournament name is whitespace only', async () => {
      expect(await addTournament('   ')).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Tournament name cannot be empty')
      );
    });

    it('should return null if DataStore throws validation error', async () => {
      mockValidationError = true;
      expect(await addTournament('Invalid Tournament')).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[addTournament] Operation failed'),
        expect.any(Object)
      );
    });

    it('should return null if DataStore throws already exists error (duplicate name)', async () => {
      mockAlreadyExistsError = true;
      expect(await addTournament('Duplicate Tournament')).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[addTournament] Operation failed'),
        expect.any(Object)
      );
    });

    it('should return null and log error if DataStore fails', async () => {
      mockShouldThrow = true;
      expect(await addTournament('New Tournament')).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[addTournament] Unexpected error'),
        expect.any(Object)
      );
    });
  });

  describe('updateTournament', () => {
    beforeEach(() => {
      mockTournaments = [...sampleTournaments];
    });

    it('should update an existing tournament and return the updated object', async () => {
      const tournamentToUpdate: Tournament = { ...sampleTournaments[0], name: 'Regional Cup Updated' };
      const result = await updateTournament(tournamentToUpdate);

      expect(result).not.toBeNull();
      expect(result?.name).toBe('Regional Cup Updated');
      expect(mockDataStore.updateTournament).toHaveBeenCalledWith(tournamentToUpdate);
    });

    it('should return null and log error if tournament not found', async () => {
      mockTournaments = []; // Empty so tournament won't be found
      const nonExistentTournament: Tournament = { id: 't99', name: 'Ghost Tournament' };

      expect(await updateTournament(nonExistentTournament)).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Tournament with ID t99 not found')
      );
    });

    it('should return null and log error for invalid update data (empty name)', async () => {
      const invalidTournament: Tournament = { ...sampleTournaments[0], name: '   ' };
      expect(await updateTournament(invalidTournament)).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid tournament data provided')
      );
    });

    it('should return null and log error for invalid update data (missing id)', async () => {
      const invalidTournament = { name: 'Valid Name' } as Tournament;
      expect(await updateTournament(invalidTournament)).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid tournament data provided')
      );
    });

    it('should return null if DataStore throws validation error', async () => {
      mockValidationError = true;
      const tournamentToUpdate: Tournament = { ...sampleTournaments[0], name: 'Conflict Name' };

      expect(await updateTournament(tournamentToUpdate)).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[updateTournament] Operation failed'),
        expect.any(Object)
      );
    });

    it('should return null and log error if DataStore fails', async () => {
      mockShouldThrow = true;
      const tournamentToUpdate: Tournament = { ...sampleTournaments[0], name: 'Updated' };

      expect(await updateTournament(tournamentToUpdate)).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[updateTournament] Unexpected error'),
        expect.any(Object)
      );
    });
  });

  describe('deleteTournament', () => {
    beforeEach(() => {
      mockTournaments = [...sampleTournaments];
    });

    it('should delete an existing tournament and return true', async () => {
      const result = await deleteTournament('t1');

      expect(result).toBe(true);
      expect(mockDataStore.deleteTournament).toHaveBeenCalledWith('t1');
    });

    it('should return false and log error if tournament not found', async () => {
      mockTournaments = [];
      expect(await deleteTournament('t99')).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Tournament with id t99 not found')
      );
    });

    it('should return false and log error for invalid tournament ID', async () => {
      expect(await deleteTournament('')).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid tournament ID provided')
      );
    });

    it('should return false and log error if DataStore fails', async () => {
      mockShouldThrow = true;
      expect(await deleteTournament('t1')).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[deleteTournament] Unexpected error'),
        expect.any(Object)
      );
    });
  });

  describe('countGamesForTournament', () => {
    it('should return 0 when no games exist', async () => {
      expect(await countGamesForTournament('t1')).toBe(0);
    });

    it('should count games matching the tournament ID', async () => {
      mockGames = {
        game1: { tournamentId: 't1' } as never,
        game2: { tournamentId: 't1' } as never,
        game3: { tournamentId: 't2' } as never,
      };

      expect(await countGamesForTournament('t1')).toBe(2);
      expect(await countGamesForTournament('t2')).toBe(1);
      expect(await countGamesForTournament('t3')).toBe(0);
    });

    it('should return 0 and log warning if DataStore fails', async () => {
      mockShouldThrow = true;
      expect(await countGamesForTournament('t1')).toBe(0);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[countGamesForTournament]'),
        expect.any(Object)
      );
    });
  });

  describe('updateTeamPlacement', () => {
    beforeEach(() => {
      mockTournaments = [{ id: 't1', name: 'Test Tournament' }];
    });

    it('should add a new team placement to a tournament', async () => {
      const result = await updateTeamPlacement('t1', 'team1', 1, 'Champion', 'Excellent tournament');

      expect(result).toBe(true);
      expect(mockDataStore.updateTournament).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 't1',
          teamPlacements: {
            team1: {
              placement: 1,
              award: 'Champion',
              note: 'Excellent tournament',
            },
          },
        })
      );
    });

    it('should update an existing team placement', async () => {
      mockTournaments = [{
        id: 't1',
        name: 'Test Tournament',
        teamPlacements: { team1: { placement: 2, award: 'Runner-up' } },
      }];

      const result = await updateTeamPlacement('t1', 'team1', 1, 'Champion');

      expect(result).toBe(true);
      expect(mockDataStore.updateTournament).toHaveBeenCalledWith(
        expect.objectContaining({
          teamPlacements: {
            team1: { placement: 1, award: 'Champion' },
          },
        })
      );
    });

    it('should remove a team placement when placement is null', async () => {
      mockTournaments = [{
        id: 't1',
        name: 'Test Tournament',
        teamPlacements: {
          team1: { placement: 1 },
          team2: { placement: 2 },
        },
      }];

      const result = await updateTeamPlacement('t1', 'team1', null);

      expect(result).toBe(true);
      expect(mockDataStore.updateTournament).toHaveBeenCalledWith(
        expect.objectContaining({
          teamPlacements: { team2: { placement: 2 } },
        })
      );
    });

    it('should remove teamPlacements object when last placement is removed', async () => {
      mockTournaments = [{
        id: 't1',
        name: 'Test Tournament',
        teamPlacements: { team1: { placement: 1 } },
      }];

      const result = await updateTeamPlacement('t1', 'team1', null);

      expect(result).toBe(true);
      const updateCall = mockDataStore.updateTournament.mock.calls[0][0];
      expect(updateCall.teamPlacements).toBeUndefined();
    });

    it('should return false when tournament ID is invalid', async () => {
      expect(await updateTeamPlacement('', 'team1', 1)).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid tournament ID or team ID')
      );
    });

    it('should return false when team ID is invalid', async () => {
      expect(await updateTeamPlacement('t1', '', 1)).toBe(false);
    });

    it('should return false when tournament is not found', async () => {
      mockTournaments = [];
      expect(await updateTeamPlacement('nonexistent', 'team1', 1)).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Tournament with ID nonexistent not found')
      );
    });

    it('should return false and log error if DataStore fails', async () => {
      mockShouldThrow = true;
      expect(await updateTeamPlacement('t1', 'team1', 1)).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[updateTeamPlacement] Unexpected error'),
        expect.any(Object)
      );
    });
  });

  describe('getTeamPlacement', () => {
    it('should return team placement when it exists', async () => {
      mockTournaments = [{
        id: 't1',
        name: 'Test Tournament',
        teamPlacements: { team1: { placement: 1, award: 'Champion' } },
      }];

      const result = await getTeamPlacement('t1', 'team1');

      expect(result).toEqual({ placement: 1, award: 'Champion' });
    });

    it('should return null when tournament is not found', async () => {
      mockTournaments = [{ id: 't1', name: 'Test' }];
      expect(await getTeamPlacement('nonexistent', 'team1')).toBeNull();
    });

    it('should return null when tournament has no placements', async () => {
      mockTournaments = [{ id: 't1', name: 'Test Tournament' }];
      expect(await getTeamPlacement('t1', 'team1')).toBeNull();
    });

    it('should return null when team has no placement in tournament', async () => {
      mockTournaments = [{
        id: 't1',
        name: 'Test Tournament',
        teamPlacements: { team2: { placement: 1 } },
      }];
      expect(await getTeamPlacement('t1', 'team1')).toBeNull();
    });

    it('should return null and log error if DataStore fails', async () => {
      mockShouldThrow = true;
      expect(await getTeamPlacement('t1', 'team1')).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[getTeamPlacement]'),
        expect.any(Object)
      );
    });
  });
});
