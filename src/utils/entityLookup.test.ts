import { createEntityMaps, getDisplayNames } from './entityLookup';
import type { AppState } from '@/types/game';
import type { Team, Season, Tournament } from '@/types';

describe('entityLookup', () => {
  // Mock entities
  const mockTeams: Team[] = [
    { id: 'team_1', name: 'FC United', color: '#FF0000', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'team_2', name: 'FC Barcelona', color: '#0000FF', createdAt: '2024-01-02', updatedAt: '2024-01-02' },
  ];

  const mockSeasons: Season[] = [
    { id: 'season_1', name: 'Spring 2024', periodCount: 4, periodDuration: 20, ageGroup: 'U12' },
    { id: 'season_2', name: 'Fall 2024', periodCount: 2, periodDuration: 25, ageGroup: 'U14' },
  ];

  const mockTournaments: Tournament[] = [
    { id: 'tournament_1', name: 'City Cup', location: 'Stadium A', level: 'Regional' },
    { id: 'tournament_2', name: 'National Championship', location: 'Stadium B', level: 'National' },
  ];

  describe('createEntityMaps', () => {
    /**
     * Tests that createEntityMaps generates correct Map structures
     * @critical
     */
    it('should create Maps with correct id->entity mappings', () => {
      const maps = createEntityMaps(mockTeams, mockSeasons, mockTournaments);

      expect(maps.teams).toBeInstanceOf(Map);
      expect(maps.seasons).toBeInstanceOf(Map);
      expect(maps.tournaments).toBeInstanceOf(Map);

      expect(maps.teams.size).toBe(2);
      expect(maps.seasons.size).toBe(2);
      expect(maps.tournaments.size).toBe(2);

      expect(maps.teams.get('team_1')).toEqual(mockTeams[0]);
      expect(maps.seasons.get('season_2')).toEqual(mockSeasons[1]);
      expect(maps.tournaments.get('tournament_1')).toEqual(mockTournaments[0]);
    });

    /**
     * Tests that createEntityMaps handles empty arrays
     * @edge-case
     */
    it('should handle empty arrays', () => {
      const maps = createEntityMaps([], [], []);

      expect(maps.teams.size).toBe(0);
      expect(maps.seasons.size).toBe(0);
      expect(maps.tournaments.size).toBe(0);
    });
  });

  describe('getDisplayNames', () => {
    let maps: ReturnType<typeof createEntityMaps>;

    beforeEach(() => {
      maps = createEntityMaps(mockTeams, mockSeasons, mockTournaments);
    });

    /**
     * Tests live entity name resolution when all IDs are valid
     * @critical
     */
    it('keeps the game\'s own team name; seasons and tournaments resolve live', () => {
      const game: Partial<AppState> = {
        teamId: 'team_1',
        teamName: 'Old Team Name', // The name the game was saved under
        seasonId: 'season_1',
        tournamentId: 'tournament_1',
      };

      const result = getDisplayNames(game as AppState, maps);

      // Review 7.17 (owner): the game keeps its own team name, as the match screen,
      // recap and Taso text show it; the current name comes separately for search.
      expect(result.teamName).toBe('Old Team Name');
      expect(result.currentTeamName).toBe('FC United');
      expect(result.seasonName).toBe('Spring 2024'); // Live name from entity
      expect(result.tournamentName).toBe('City Cup'); // Live name from entity
    });

    /**
     * Tests fallback to snapshot when entity is deleted
     * @critical
     */
    it('should fall back to snapshot when entity ID exists but entity not found (deleted)', () => {
      const game: Partial<AppState> = {
        teamId: 'team_999', // ID that doesn't exist
        teamName: 'Deleted Team',
        seasonId: 'season_999',
        tournamentId: 'tournament_999',
      };

      const result = getDisplayNames(game as AppState, maps);

      expect(result.teamName).toBe('Deleted Team'); // Fallback to snapshot for team
      expect(result.seasonName).toBeUndefined(); // No snapshot for season
      expect(result.tournamentName).toBeUndefined(); // No snapshot for tournament
    });

    /**
     * Tests snapshot usage when no entity IDs are set (legacy games)
     * @edge-case
     */
    it('should use snapshot when no entity IDs are set (legacy games)', () => {
      const game: Partial<AppState> = {
        teamName: 'Custom Team Name',
        seasonId: '',
        tournamentId: '',
      };

      const result = getDisplayNames(game as AppState, maps);

      expect(result.teamName).toBe('Custom Team Name');
      expect(result.seasonName).toBeUndefined(); // No entity, returns undefined
      expect(result.tournamentName).toBeUndefined(); // No entity, returns undefined
    });

    /**
     * Tests snapshot usage when entity IDs are undefined
     * @edge-case
     */
    it('should use snapshot when entity IDs are undefined', () => {
      const game: Partial<AppState> = {
        teamName: 'No Team Game',
        seasonId: '',
        tournamentId: '',
      };

      const result = getDisplayNames(game as AppState, maps);

      expect(result.teamName).toBe('No Team Game');
      expect(result.seasonName).toBeUndefined();
      expect(result.tournamentName).toBeUndefined();
    });

    /**
     * Tests mixed scenario: some entities found, some not
     * @integration
     */
    it('should handle mixed scenarios (some entities found, some not)', () => {
      const game: Partial<AppState> = {
        teamId: 'team_1', // Exists
        teamName: 'Old Team',
        seasonId: 'season_999', // Doesn't exist
        tournamentId: '', // No ID
      };

      const result = getDisplayNames(game as AppState, maps);

      expect(result.teamName).toBe('Old Team'); // The game's own name (review 7.17)
      expect(result.seasonName).toBeUndefined(); // Entity not found, no snapshot
      expect(result.tournamentName).toBeUndefined(); // No ID, no entity
    });

    /**
     * A team rename does not rewrite how past games are shown
     * @critical
     */
    it('a team rename leaves the game\'s name; the new name is there for search (review 7.17)', () => {
      // Initial state
      const game: Partial<AppState> = {
        teamId: 'team_1',
        teamName: 'FC United', // Snapshot at creation time
      };

      let result = getDisplayNames(game as AppState, maps);
      expect(result.teamName).toBe('FC United');

      // Simulate team rename
      const updatedTeams = [...mockTeams];
      updatedTeams[0] = { ...mockTeams[0], name: 'FC United 2025' };
      const updatedMaps = createEntityMaps(updatedTeams, mockSeasons, mockTournaments);

      result = getDisplayNames(game as AppState, updatedMaps);
      expect(result.teamName).toBe('FC United'); // What the game was played under
      expect(result.currentTeamName).toBe('FC United 2025'); // Found by a search for it
    });

    /**
     * Tests with empty entity maps (all lookups should fail)
     * @edge-case
     */
    it('should fall back to snapshots with empty entity maps', () => {
      const emptyMaps = createEntityMaps([], [], []);
      const game: Partial<AppState> = {
        teamId: 'team_1',
        teamName: 'Fallback Team',
        seasonId: 'season_1',
        tournamentId: 'tournament_1',
      };

      const result = getDisplayNames(game as AppState, emptyMaps);

      expect(result.teamName).toBe('Fallback Team'); // Falls back to snapshot for team
      expect(result.seasonName).toBeUndefined(); // No entity, no snapshot
      expect(result.tournamentName).toBeUndefined(); // No entity, no snapshot
    });
  });
});
