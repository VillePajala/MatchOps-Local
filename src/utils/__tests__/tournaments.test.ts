/**
 * @fileoverview Tests for tournament utilities including series migration
 * Tests DataStore integration for tournament series handling.
 *
 * Note: Series migration is now handled by DataStore (LocalDataStore.ts).
 * These tests verify the utility layer correctly delegates to DataStore.
 */

import type { Tournament, TournamentSeries } from '@/types';

// Mock DataStore state (module-level for mock factory access)
let mockTournaments: Tournament[] = [];
let mockShouldThrow = false;
let tournamentIdCounter = 0;

// Mock DataStore implementation with migration support
const mockDataStore = {
  getTournaments: jest.fn(async () => {
    if (mockShouldThrow) throw new Error('DataStore error');
    // DataStore handles migration - return as-is for testing
    return [...mockTournaments];
  }),
  createTournament: jest.fn(async (name: string, extra?: Partial<Omit<Tournament, 'id' | 'name'>>) => {
    if (mockShouldThrow) throw new Error('DataStore error');
    tournamentIdCounter++;
    const newTournament: Tournament = {
      id: `tournament_test_${tournamentIdCounter}`,
      name,
      ...extra,
    };
    mockTournaments.push(newTournament);
    return newTournament;
  }),
  updateTournament: jest.fn(async (tournament: Tournament) => {
    if (mockShouldThrow) throw new Error('DataStore error');
    const index = mockTournaments.findIndex(t => t.id === tournament.id);
    if (index === -1) return null;
    mockTournaments[index] = { ...tournament };
    return mockTournaments[index];
  }),
  deleteTournament: jest.fn(async (id: string) => {
    if (mockShouldThrow) throw new Error('DataStore error');
    const index = mockTournaments.findIndex(t => t.id === id);
    if (index === -1) return false;
    mockTournaments.splice(index, 1);
    return true;
  }),
  getGames: jest.fn(async () => ({})),
};

// Mock DataStore
jest.mock('@/datastore', () => ({
  getDataStore: jest.fn(async () => mockDataStore),
}));

// Mock storage for deprecated saveTournaments
jest.mock('../storage');

import { getTournaments, addTournament, updateTournament } from '../tournaments';

// Mock console methods
let consoleErrorSpy: jest.SpyInstance;
let consoleWarnSpy: jest.SpyInstance;

beforeEach(() => {
  mockTournaments = [];
  mockShouldThrow = false;
  tournamentIdCounter = 0;
  jest.clearAllMocks();
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
  consoleWarnSpy.mockRestore();
});

describe('Tournament Series Migration', () => {
  describe('getTournaments - legacy migration', () => {
    /**
     * Note: Series migration now happens in DataStore (LocalDataStore.ts).
     * These tests verify that tournaments.ts correctly returns migrated data from DataStore.
     */

    it('should return tournaments with migrated series from DataStore', async () => {
      // Setup: DataStore returns migrated tournament (migration happens in DataStore)
      mockTournaments = [{
        id: 'tournament_123',
        name: 'Summer Cup',
        level: 'Elite',
        series: [{ id: 'series_tournament_123_elite', level: 'Elite' }],
      }];

      // Act
      const tournaments = await getTournaments();

      // Assert: series is present (migrated by DataStore)
      expect(tournaments).toHaveLength(1);
      expect(tournaments[0].series).toBeDefined();
      expect(tournaments[0].series).toHaveLength(1);
      expect(tournaments[0].series![0].level).toBe('Elite');
      expect(tournaments[0].series![0].id).toBe('series_tournament_123_elite');
    });

    it('should preserve existing series array from DataStore', async () => {
      // Setup: tournament with series already defined
      const existingSeries: TournamentSeries[] = [
        { id: 'series_existing_1', level: 'Elite' },
        { id: 'series_existing_2', level: 'Kilpa' },
      ];
      mockTournaments = [{
        id: 'tournament_456',
        name: 'Winter Cup',
        level: 'Elite',
        series: existingSeries,
      }];

      // Act
      const tournaments = await getTournaments();

      // Assert: series unchanged
      expect(tournaments).toHaveLength(1);
      expect(tournaments[0].series).toHaveLength(2);
      expect(tournaments[0].series![0].id).toBe('series_existing_1');
      expect(tournaments[0].series![1].id).toBe('series_existing_2');
    });

    it('should handle tournament without level or series', async () => {
      // Setup: tournament without level or series
      mockTournaments = [{
        id: 'tournament_789',
        name: 'Friendly Tournament',
      }];

      // Act
      const tournaments = await getTournaments();

      // Assert: no series array
      expect(tournaments).toHaveLength(1);
      expect(tournaments[0].series).toBeUndefined();
    });

    it('should return mix of tournaments correctly', async () => {
      // Setup: mix of formats (all migrated by DataStore)
      mockTournaments = [
        { id: 't1', name: 'Tournament 1', level: 'Kilpa', series: [{ id: 's1_t1', level: 'Kilpa' }] },
        { id: 't2', name: 'Tournament 2', series: [{ id: 's1', level: 'Elite' }] },
        { id: 't3', name: 'Tournament 3' },
      ];

      // Act
      const tournaments = await getTournaments();

      // Assert
      expect(tournaments).toHaveLength(3);
      expect(tournaments[0].series).toHaveLength(1);
      expect(tournaments[0].series![0].level).toBe('Kilpa');
      expect(tournaments[1].series).toHaveLength(1);
      expect(tournaments[1].series![0].id).toBe('s1');
      expect(tournaments[2].series).toBeUndefined();
    });
  });

  describe('addTournament with series', () => {
    it('should create tournament with series array', async () => {
      const newSeries: TournamentSeries[] = [
        { id: 'series_new_1', level: 'Elite' },
        { id: 'series_new_2', level: 'Harraste' },
      ];

      const result = await addTournament('New Tournament', { series: newSeries });

      expect(result).not.toBeNull();
      expect(result?.series).toEqual(newSeries);

      // Verify DataStore was called with series
      expect(mockDataStore.createTournament).toHaveBeenCalledWith('New Tournament', { series: newSeries });
    });
  });

  describe('updateTournament with series', () => {
    it('should update tournament series', async () => {
      const existingTournament: Tournament = {
        id: 'tournament_update',
        name: 'Update Test',
        series: [{ id: 's1', level: 'Elite' }],
      };
      mockTournaments = [existingTournament];

      const updatedSeries: TournamentSeries[] = [
        { id: 's1', level: 'Elite' },
        { id: 's2', level: 'Kilpa' },
      ];

      const result = await updateTournament({
        ...existingTournament,
        series: updatedSeries,
      });

      expect(result).not.toBeNull();
      expect(result?.series).toHaveLength(2);
    });

    it('should allow series deletion even when games reference it (orphaned reference)', async () => {
      /**
       * This test documents the expected behavior when a series is deleted
       * while games still reference it via tournamentSeriesId.
       *
       * Expected behavior:
       * - Series can be removed from tournament (no validation against games)
       * - Games with orphaned tournamentSeriesId continue to function
       * - Game still has tournamentLevel string as fallback for display
       */
      const tournamentWithSeries: Tournament = {
        id: 'tournament_orphan_test',
        name: 'Orphan Test Tournament',
        series: [
          { id: 'series_to_delete', level: 'Elite' },
          { id: 'series_to_keep', level: 'Kilpa' },
        ],
      };
      mockTournaments = [tournamentWithSeries];

      // Simulate deleting a series (as done in TournamentDetailsModal)
      const updatedTournament: Tournament = {
        ...tournamentWithSeries,
        series: [{ id: 'series_to_keep', level: 'Kilpa' }], // series_to_delete removed
      };

      const result = await updateTournament(updatedTournament);

      // Assert: update succeeds, series is removed
      expect(result).not.toBeNull();
      expect(result?.series).toHaveLength(1);
      expect(result?.series![0].id).toBe('series_to_keep');

      // Verify: deleted series ID no longer exists
      expect(result?.series?.find(s => s.id === 'series_to_delete')).toBeUndefined();
    });
  });
});
