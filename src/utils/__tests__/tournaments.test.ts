/**
 * @fileoverview Tests for tournament utilities including series migration
 * TDD: These tests are written BEFORE the implementation
 */

import { getTournaments, addTournament, updateTournament } from '../tournaments';
import { getStorageItem, setStorageItem } from '../storage';
import type { Tournament, TournamentSeries } from '@/types';

// Mock storage with jest.requireActual for better isolation
jest.mock('../storage', () => ({
  ...jest.requireActual('../storage'),
  getStorageItem: jest.fn(),
  setStorageItem: jest.fn(),
}));

const mockGetStorageItem = getStorageItem as jest.MockedFunction<typeof getStorageItem>;
const mockSetStorageItem = setStorageItem as jest.MockedFunction<typeof setStorageItem>;

describe('Tournament Series Migration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getTournaments - legacy migration', () => {
    it('should migrate legacy level field to series array with deterministic ID', async () => {
      // Setup: tournament with level but no series
      const legacyTournament = {
        id: 'tournament_123',
        name: 'Summer Cup',
        level: 'Elite',
      };
      mockGetStorageItem.mockResolvedValue(JSON.stringify([legacyTournament]));

      // Act
      const tournaments = await getTournaments();

      // Assert: series array should contain one item with matching level
      expect(tournaments).toHaveLength(1);
      expect(tournaments[0].series).toBeDefined();
      expect(tournaments[0].series).toHaveLength(1);
      expect(tournaments[0].series![0].level).toBe('Elite');
      // Deterministic ID: series_{tournamentId}_{level-lowercase}
      expect(tournaments[0].series![0].id).toBe('series_tournament_123_elite');
    });

    it('should generate idempotent series IDs on repeated migration calls', async () => {
      // Setup: same legacy tournament
      const legacyTournament = {
        id: 'tournament_456',
        name: 'Winter Cup',
        level: 'Kilpa',
      };
      mockGetStorageItem.mockResolvedValue(JSON.stringify([legacyTournament]));

      // Act: call twice
      const first = await getTournaments();
      const second = await getTournaments();

      // Assert: IDs are identical (idempotent)
      expect(first[0].series![0].id).toBe(second[0].series![0].id);
      expect(first[0].series![0].id).toBe('series_tournament_456_kilpa');
    });

    it('should preserve existing series array (no duplicate migration)', async () => {
      // Setup: tournament with series already defined
      const existingSeries: TournamentSeries[] = [
        { id: 'series_existing_1', level: 'Elite' },
        { id: 'series_existing_2', level: 'Kilpa' },
      ];
      const tournamentWithSeries = {
        id: 'tournament_456',
        name: 'Winter Cup',
        level: 'Elite', // Legacy field still present
        series: existingSeries,
      };
      mockGetStorageItem.mockResolvedValue(JSON.stringify([tournamentWithSeries]));

      // Act
      const tournaments = await getTournaments();

      // Assert: series unchanged, no duplicate migration
      expect(tournaments).toHaveLength(1);
      expect(tournaments[0].series).toHaveLength(2);
      expect(tournaments[0].series![0].id).toBe('series_existing_1');
      expect(tournaments[0].series![1].id).toBe('series_existing_2');
    });

    it('should handle tournament without level (no series created)', async () => {
      // Setup: tournament without level or series
      const tournamentNoLevel = {
        id: 'tournament_789',
        name: 'Friendly Tournament',
      };
      mockGetStorageItem.mockResolvedValue(JSON.stringify([tournamentNoLevel]));

      // Act
      const tournaments = await getTournaments();

      // Assert: no series array created
      expect(tournaments).toHaveLength(1);
      expect(tournaments[0].series).toBeUndefined();
    });

    it('should migrate multiple tournaments correctly', async () => {
      // Setup: mix of legacy and new format
      const mixedTournaments = [
        { id: 't1', name: 'Tournament 1', level: 'Kilpa' }, // legacy
        { id: 't2', name: 'Tournament 2', series: [{ id: 's1', level: 'Elite' }] }, // new
        { id: 't3', name: 'Tournament 3' }, // no level
      ];
      mockGetStorageItem.mockResolvedValue(JSON.stringify(mixedTournaments));

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
      mockGetStorageItem.mockResolvedValue(JSON.stringify([]));
      mockSetStorageItem.mockResolvedValue(undefined);

      const newSeries: TournamentSeries[] = [
        { id: 'series_new_1', level: 'Elite' },
        { id: 'series_new_2', level: 'Harraste' },
      ];

      const result = await addTournament('New Tournament', { series: newSeries });

      expect(result).not.toBeNull();
      expect(result?.series).toEqual(newSeries);

      // Verify storage was called with series
      const savedData = JSON.parse(mockSetStorageItem.mock.calls[0][1] as string);
      expect(savedData[0].series).toEqual(newSeries);
    });
  });

  describe('updateTournament with series', () => {
    it('should update tournament series', async () => {
      const existingTournament: Tournament = {
        id: 'tournament_update',
        name: 'Update Test',
        series: [{ id: 's1', level: 'Elite' }],
      };
      mockGetStorageItem.mockResolvedValue(JSON.stringify([existingTournament]));
      mockSetStorageItem.mockResolvedValue(undefined);

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
       * - This is acceptable because:
       *   1. Series info is optional/supplementary
       *   2. UI gracefully handles missing series
       *   3. Core game data is unaffected
       */
      const tournamentWithSeries: Tournament = {
        id: 'tournament_orphan_test',
        name: 'Orphan Test Tournament',
        series: [
          { id: 'series_to_delete', level: 'Elite' },
          { id: 'series_to_keep', level: 'Kilpa' },
        ],
      };
      mockGetStorageItem.mockResolvedValue(JSON.stringify([tournamentWithSeries]));
      mockSetStorageItem.mockResolvedValue(undefined);

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

      // Note: Any game with tournamentSeriesId='series_to_delete' now has an orphaned reference.
      // This is acceptable - games store tournamentLevel as string backup for display.
    });
  });
});
