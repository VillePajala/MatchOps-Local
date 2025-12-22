/**
 * Tests for seasons.ts - Season management utilities
 *
 * These tests verify the seasons utility functions work correctly
 * when routed through DataStore abstraction.
 *
 * Test Strategy:
 * - Mock DataStore using standard jest.mock() (works because getDataStore()
 *   is called within async functions, not at module load time)
 * - Tests verify utility functions correctly delegate to DataStore
 * - Edge cases and error handling are tested at utility layer
 */

import { SEASONS_LIST_KEY } from '@/config/storageKeys';
import type { Season } from '@/types';
import type { SavedGamesCollection } from '@/types/game';

// Mock DataStore state (module-level for mock factory access)
let mockSeasons: Season[] = [];
let mockGames: SavedGamesCollection = {};
let mockCreateSeasonResult: Season | null = null;
let mockUpdateSeasonResult: Season | null = null;
let mockDeleteSeasonResult = true;
let mockShouldThrow = false;
let mockValidationError = false;
let seasonIdCounter = 0; // Deterministic ID counter per CLAUDE.md testing rules

// Mock DataStore implementation
const mockDataStore = {
  getSeasons: jest.fn(async () => {
    if (mockShouldThrow) throw new Error('DataStore error');
    return [...mockSeasons];
  }),
  createSeason: jest.fn(async (name: string, extra?: Partial<Omit<Season, 'id' | 'name'>>) => {
    if (mockShouldThrow) throw new Error('DataStore error');
    if (mockValidationError) {
      const error = new Error('Season already exists');
      (error as Error & { code: string }).code = 'VALIDATION_ERROR';
      throw error;
    }
    seasonIdCounter++;
    const newSeason: Season = {
      id: `season_test_${seasonIdCounter}`,
      name,
      ...extra,
    };
    mockSeasons.push(newSeason);
    return mockCreateSeasonResult ?? newSeason;
  }),
  updateSeason: jest.fn(async (season: Season) => {
    if (mockShouldThrow) throw new Error('DataStore error');
    if (mockValidationError) {
      const error = new Error('Name conflict');
      (error as Error & { code: string }).code = 'VALIDATION_ERROR';
      throw error;
    }
    const index = mockSeasons.findIndex(s => s.id === season.id);
    if (index === -1) return null;
    mockSeasons[index] = { ...season };
    return mockUpdateSeasonResult ?? mockSeasons[index];
  }),
  deleteSeason: jest.fn(async (id: string) => {
    if (mockShouldThrow) throw new Error('DataStore error');
    const index = mockSeasons.findIndex(s => s.id === id);
    if (index === -1) return false;
    mockSeasons.splice(index, 1);
    return mockDeleteSeasonResult;
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

// Mock storage for deprecated saveSeasons
jest.mock('./storage');

import { setStorageItem } from './storage';
import {
  getSeasons,
  saveSeasons,
  addSeason,
  updateSeason,
  deleteSeason,
  countGamesForSeason,
  updateTeamPlacement,
  getTeamPlacement,
} from './seasons';

const mockSetStorageItem = setStorageItem as jest.MockedFunction<typeof setStorageItem>;

// Mock console methods
let consoleErrorSpy: jest.SpyInstance;
let consoleWarnSpy: jest.SpyInstance;

beforeEach(() => {
  // Reset mock state
  mockSeasons = [];
  mockGames = {};
  mockCreateSeasonResult = null;
  mockUpdateSeasonResult = null;
  mockDeleteSeasonResult = true;
  mockShouldThrow = false;
  mockValidationError = false;
  seasonIdCounter = 0; // Reset deterministic ID counter

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

describe('Season Management Utilities (DataStore)', () => {
  const sampleSeasons: Season[] = [
    { id: 's1', name: 'Spring League 2023' },
    { id: 's2', name: 'Summer Tournament' },
    { id: 's3', name: 'Fall Season' },
  ];

  describe('getSeasons', () => {
    it('should return an empty array if no seasons are stored', async () => {
      expect(await getSeasons()).toEqual([]);
      expect(mockDataStore.getSeasons).toHaveBeenCalled();
    });

    it('should return seasons from DataStore', async () => {
      mockSeasons = [...sampleSeasons];
      expect(await getSeasons()).toEqual(sampleSeasons);
    });

    it('should return an empty array and log error if DataStore fails', async () => {
      mockShouldThrow = true;
      expect(await getSeasons()).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[getSeasons]'),
        expect.any(Error)
      );
    });
  });

  describe('saveSeasons (deprecated)', () => {
    it('should save seasons to storage and return true', async () => {
      const testData: Season[] = [{ id: 'test_save', name: 'Test Save Season' }];
      const result = await saveSeasons(testData);
      expect(result).toBe(true);
      expect(mockSetStorageItem).toHaveBeenCalledWith(SEASONS_LIST_KEY, JSON.stringify(testData));
    });

    it('should return false and log error if storage throws', async () => {
      mockSetStorageItem.mockRejectedValueOnce(new Error('Storage error'));
      const result = await saveSeasons([{ id: 'test', name: 'Test' }]);
      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('addSeason', () => {
    it('should add a new season and return the season object', async () => {
      const newSeasonName = 'Winter Championship';
      const result = await addSeason(newSeasonName);

      expect(result).not.toBeNull();
      expect(result?.name).toBe(newSeasonName);
      expect(mockDataStore.createSeason).toHaveBeenCalledWith(newSeasonName, {});
    });

    it('should pass extra fields to DataStore', async () => {
      const extra = { ageGroup: 'U12' };
      await addSeason('Test Season', extra);

      expect(mockDataStore.createSeason).toHaveBeenCalledWith('Test Season', extra);
    });

    it('should trim whitespace from the season name', async () => {
      await addSeason('  Spaced Out Cup   ');

      expect(mockDataStore.createSeason).toHaveBeenCalledWith('Spaced Out Cup', {});
    });

    it('should return null and log warning if season name is empty', async () => {
      expect(await addSeason('')).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Season name cannot be empty')
      );
      expect(mockDataStore.createSeason).not.toHaveBeenCalled();
    });

    it('should return null and log warning if season name is whitespace only', async () => {
      expect(await addSeason('   ')).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Season name cannot be empty')
      );
    });

    it('should return null if DataStore throws validation error (duplicate name)', async () => {
      mockValidationError = true;
      expect(await addSeason('Duplicate Season')).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[addSeason] Validation failed'),
        expect.any(Object)
      );
    });

    it('should return null and log error if DataStore fails', async () => {
      mockShouldThrow = true;
      expect(await addSeason('New Season')).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[addSeason] Unexpected error'),
        expect.any(Object)
      );
    });
  });

  describe('updateSeason', () => {
    beforeEach(() => {
      mockSeasons = [...sampleSeasons];
    });

    it('should update an existing season and return the updated object', async () => {
      const seasonToUpdate: Season = { ...sampleSeasons[0], name: 'Spring League Updated' };
      const result = await updateSeason(seasonToUpdate);

      expect(result).not.toBeNull();
      expect(result?.name).toBe('Spring League Updated');
      expect(mockDataStore.updateSeason).toHaveBeenCalledWith(seasonToUpdate);
    });

    it('should return null and log error if season not found', async () => {
      mockSeasons = []; // Empty so season won't be found
      const nonExistentSeason: Season = { id: 's99', name: 'Ghost Season' };

      expect(await updateSeason(nonExistentSeason)).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Season with ID s99 not found')
      );
    });

    it('should return null and log error for invalid update data (empty name)', async () => {
      const invalidSeason: Season = { ...sampleSeasons[0], name: '   ' };
      expect(await updateSeason(invalidSeason)).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid season data provided')
      );
    });

    it('should return null and log error for invalid update data (missing id)', async () => {
      const invalidSeason = { name: 'Valid Name' } as Season;
      expect(await updateSeason(invalidSeason)).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid season data provided')
      );
    });

    it('should return null if DataStore throws validation error', async () => {
      mockValidationError = true;
      const seasonToUpdate: Season = { ...sampleSeasons[0], name: 'Conflict Name' };

      expect(await updateSeason(seasonToUpdate)).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[updateSeason] Validation failed'),
        expect.any(Object)
      );
    });

    it('should return null and log error if DataStore fails', async () => {
      mockShouldThrow = true;
      const seasonToUpdate: Season = { ...sampleSeasons[0], name: 'Updated' };

      expect(await updateSeason(seasonToUpdate)).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[updateSeason] Unexpected error'),
        expect.any(Object)
      );
    });
  });

  describe('deleteSeason', () => {
    beforeEach(() => {
      mockSeasons = [...sampleSeasons];
    });

    it('should delete an existing season and return true', async () => {
      const result = await deleteSeason('s1');

      expect(result).toBe(true);
      expect(mockDataStore.deleteSeason).toHaveBeenCalledWith('s1');
    });

    it('should return false and log error if season not found', async () => {
      mockSeasons = [];
      expect(await deleteSeason('s99')).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Season with id s99 not found')
      );
    });

    it('should return false and log error for invalid season ID', async () => {
      expect(await deleteSeason('')).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid season ID provided')
      );
    });

    it('should return false and log error if DataStore fails', async () => {
      mockShouldThrow = true;
      expect(await deleteSeason('s1')).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[deleteSeason] Unexpected error'),
        expect.any(Object)
      );
    });
  });

  describe('countGamesForSeason', () => {
    it('should return 0 when no games exist', async () => {
      expect(await countGamesForSeason('s1')).toBe(0);
    });

    it('should count games matching the season ID', async () => {
      mockGames = {
        game1: { seasonId: 's1' } as never,
        game2: { seasonId: 's1' } as never,
        game3: { seasonId: 's2' } as never,
      };

      expect(await countGamesForSeason('s1')).toBe(2);
      expect(await countGamesForSeason('s2')).toBe(1);
      expect(await countGamesForSeason('s3')).toBe(0);
    });

    it('should return 0 and log warning if DataStore fails', async () => {
      mockShouldThrow = true;
      expect(await countGamesForSeason('s1')).toBe(0);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[countGamesForSeason]'),
        expect.any(Object)
      );
    });
  });

  describe('updateTeamPlacement', () => {
    beforeEach(() => {
      mockSeasons = [{ id: 's1', name: 'Spring 2025' }];
    });

    it('should add a new team placement to a season', async () => {
      const result = await updateTeamPlacement('s1', 'team1', 1, 'Champion', 'Excellent season');

      expect(result).toBe(true);
      expect(mockDataStore.updateSeason).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 's1',
          teamPlacements: {
            team1: {
              placement: 1,
              award: 'Champion',
              note: 'Excellent season',
            },
          },
        })
      );
    });

    it('should update an existing team placement', async () => {
      mockSeasons = [{
        id: 's1',
        name: 'Spring 2025',
        teamPlacements: { team1: { placement: 2, award: 'Runner-up' } },
      }];

      const result = await updateTeamPlacement('s1', 'team1', 1, 'Champion');

      expect(result).toBe(true);
      expect(mockDataStore.updateSeason).toHaveBeenCalledWith(
        expect.objectContaining({
          teamPlacements: {
            team1: { placement: 1, award: 'Champion' },
          },
        })
      );
    });

    it('should remove a team placement when placement is null', async () => {
      mockSeasons = [{
        id: 's1',
        name: 'Spring 2025',
        teamPlacements: {
          team1: { placement: 1 },
          team2: { placement: 2 },
        },
      }];

      const result = await updateTeamPlacement('s1', 'team1', null);

      expect(result).toBe(true);
      expect(mockDataStore.updateSeason).toHaveBeenCalledWith(
        expect.objectContaining({
          teamPlacements: { team2: { placement: 2 } },
        })
      );
    });

    it('should remove teamPlacements object when last placement is removed', async () => {
      mockSeasons = [{
        id: 's1',
        name: 'Spring 2025',
        teamPlacements: { team1: { placement: 1 } },
      }];

      const result = await updateTeamPlacement('s1', 'team1', null);

      expect(result).toBe(true);
      const updateCall = mockDataStore.updateSeason.mock.calls[0][0];
      expect(updateCall.teamPlacements).toBeUndefined();
    });

    it('should return false when season ID is invalid', async () => {
      expect(await updateTeamPlacement('', 'team1', 1)).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid season ID or team ID')
      );
    });

    it('should return false when team ID is invalid', async () => {
      expect(await updateTeamPlacement('s1', '', 1)).toBe(false);
    });

    it('should return false when season is not found', async () => {
      mockSeasons = [];
      expect(await updateTeamPlacement('nonexistent', 'team1', 1)).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Season with ID nonexistent not found')
      );
    });

    it('should return false and log error if DataStore fails', async () => {
      mockShouldThrow = true;
      expect(await updateTeamPlacement('s1', 'team1', 1)).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[updateTeamPlacement] Unexpected error'),
        expect.any(Object)
      );
    });
  });

  describe('getTeamPlacement', () => {
    it('should return team placement when it exists', async () => {
      mockSeasons = [{
        id: 's1',
        name: 'Spring 2025',
        teamPlacements: { team1: { placement: 1, award: 'Champion' } },
      }];

      const result = await getTeamPlacement('s1', 'team1');

      expect(result).toEqual({ placement: 1, award: 'Champion' });
    });

    it('should return null when season is not found', async () => {
      mockSeasons = [{ id: 's1', name: 'Test' }];
      expect(await getTeamPlacement('nonexistent', 'team1')).toBeNull();
    });

    it('should return null when season has no placements', async () => {
      mockSeasons = [{ id: 's1', name: 'Spring 2025' }];
      expect(await getTeamPlacement('s1', 'team1')).toBeNull();
    });

    it('should return null when team has no placement in season', async () => {
      mockSeasons = [{
        id: 's1',
        name: 'Spring 2025',
        teamPlacements: { team2: { placement: 1 } },
      }];
      expect(await getTeamPlacement('s1', 'team1')).toBeNull();
    });

    it('should return null and log error if DataStore fails', async () => {
      mockShouldThrow = true;
      expect(await getTeamPlacement('s1', 'team1')).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[getTeamPlacement]'),
        expect.any(Object)
      );
    });
  });
});
