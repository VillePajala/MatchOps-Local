/**
 * Unit tests for game filtering utilities
 * @integration - Tests core filtering logic used across GameStatsModal
 */

import { filterGameIds, getPlayedGamesByTeam, GameFilterOptions } from './gameFilters';
import { SavedGamesCollection, AppState } from '@/types';

// Helper to create minimal game state for testing
const createGame = (overrides: Partial<AppState> = {}): AppState => ({
  teamName: 'Test Team',
  opponentName: 'Opponent',
  gameDate: '2024-01-15',
  homeOrAway: 'home',
  homeScore: 0,
  awayScore: 0,
  isPlayed: true,
  seasonId: '',
  tournamentId: '',
  teamId: '',
  selectedPlayerIds: [],
  assessments: {},
  ...overrides,
} as AppState);

describe('gameFilters', () => {
  describe('filterGameIds', () => {
    describe('basic filtering', () => {
      it('returns empty array when games is null', () => {
        const result = filterGameIds(null);
        expect(result).toEqual([]);
      });

      it('returns empty array when games is empty', () => {
        const result = filterGameIds({});
        expect(result).toEqual([]);
      });

      it('returns all game IDs when no filters applied', () => {
        const games: SavedGamesCollection = {
          'game1': createGame(),
          'game2': createGame(),
          'game3': createGame(),
        };

        const result = filterGameIds(games, { playedOnly: false });
        expect(result).toHaveLength(3);
        expect(result).toContain('game1');
        expect(result).toContain('game2');
        expect(result).toContain('game3');
      });
    });

    describe('playedOnly filter', () => {
      it('excludes unplayed games by default', () => {
        const games: SavedGamesCollection = {
          'played1': createGame({ isPlayed: true }),
          'played2': createGame({ isPlayed: true }),
          'unplayed': createGame({ isPlayed: false }),
        };

        const result = filterGameIds(games);
        expect(result).toHaveLength(2);
        expect(result).toContain('played1');
        expect(result).toContain('played2');
        expect(result).not.toContain('unplayed');
      });

      it('includes unplayed games when playedOnly=false', () => {
        const games: SavedGamesCollection = {
          'played': createGame({ isPlayed: true }),
          'unplayed': createGame({ isPlayed: false }),
        };

        const result = filterGameIds(games, { playedOnly: false });
        expect(result).toHaveLength(2);
        expect(result).toContain('played');
        expect(result).toContain('unplayed');
      });
    });

    describe('teamFilter', () => {
      it('returns all teams when teamFilter=all', () => {
        const games: SavedGamesCollection = {
          'team1_game': createGame({ teamId: 'team1' }),
          'team2_game': createGame({ teamId: 'team2' }),
          'legacy_game': createGame({ teamId: '' }),
        };

        const result = filterGameIds(games, { teamFilter: 'all' });
        expect(result).toHaveLength(3);
      });

      it('filters by specific team ID', () => {
        const games: SavedGamesCollection = {
          'team1_game1': createGame({ teamId: 'team1' }),
          'team1_game2': createGame({ teamId: 'team1' }),
          'team2_game': createGame({ teamId: 'team2' }),
        };

        const result = filterGameIds(games, { teamFilter: 'team1' });
        expect(result).toHaveLength(2);
        expect(result).toContain('team1_game1');
        expect(result).toContain('team1_game2');
        expect(result).not.toContain('team2_game');
      });

      it('filters legacy games (empty teamId)', () => {
        const games: SavedGamesCollection = {
          'team_game': createGame({ teamId: 'team1' }),
          'legacy1': createGame({ teamId: '' }),
          'legacy2': createGame({ teamId: undefined } as Partial<AppState>),
        };

        const result = filterGameIds(games, { teamFilter: 'legacy' });
        expect(result).toHaveLength(2);
        expect(result).toContain('legacy1');
        expect(result).toContain('legacy2');
        expect(result).not.toContain('team_game');
      });
    });

    describe('season tab filtering', () => {
      it('returns games with seasonId and no tournamentId when seasonFilter=all', () => {
        const games: SavedGamesCollection = {
          'season_game': createGame({ seasonId: 'season1', tournamentId: '' }),
          'tournament_game': createGame({ seasonId: '', tournamentId: 'tourn1' }),
          'both': createGame({ seasonId: 'season1', tournamentId: 'tourn1' }),
          'neither': createGame({ seasonId: '', tournamentId: '' }),
        };

        const result = filterGameIds(games, {
          activeTab: 'season',
          seasonFilter: 'all'
        });
        expect(result).toHaveLength(1);
        expect(result).toContain('season_game');
      });

      it('filters by specific season ID', () => {
        const games: SavedGamesCollection = {
          'season1_game1': createGame({ seasonId: 'season1' }),
          'season1_game2': createGame({ seasonId: 'season1' }),
          'season2_game': createGame({ seasonId: 'season2' }),
        };

        const result = filterGameIds(games, {
          activeTab: 'season',
          seasonFilter: 'season1'
        });
        expect(result).toHaveLength(2);
        expect(result).toContain('season1_game1');
        expect(result).toContain('season1_game2');
        expect(result).not.toContain('season2_game');
      });

      it('excludes all games on season tab with no filter', () => {
        const games: SavedGamesCollection = {
          'game1': createGame({ seasonId: 'season1' }),
          'game2': createGame({ seasonId: '' }),
        };

        const result = filterGameIds(games, { activeTab: 'season' });
        expect(result).toHaveLength(0);
      });
    });

    describe('tournament tab filtering', () => {
      it('returns games with tournamentId and no seasonId when tournamentFilter=all', () => {
        const games: SavedGamesCollection = {
          'tournament_game': createGame({ tournamentId: 'tourn1', seasonId: '' }),
          'season_game': createGame({ tournamentId: '', seasonId: 'season1' }),
          'both': createGame({ tournamentId: 'tourn1', seasonId: 'season1' }),
          'neither': createGame({ tournamentId: '', seasonId: '' }),
        };

        const result = filterGameIds(games, {
          activeTab: 'tournament',
          tournamentFilter: 'all'
        });
        expect(result).toHaveLength(1);
        expect(result).toContain('tournament_game');
      });

      it('filters by specific tournament ID', () => {
        const games: SavedGamesCollection = {
          'tourn1_game1': createGame({ tournamentId: 'tourn1' }),
          'tourn1_game2': createGame({ tournamentId: 'tourn1' }),
          'tourn2_game': createGame({ tournamentId: 'tourn2' }),
        };

        const result = filterGameIds(games, {
          activeTab: 'tournament',
          tournamentFilter: 'tourn1'
        });
        expect(result).toHaveLength(2);
        expect(result).toContain('tourn1_game1');
        expect(result).toContain('tourn1_game2');
        expect(result).not.toContain('tourn2_game');
      });
    });

    describe('series filter (within tournament)', () => {
      it('filters by specific series ID when tournament is selected', () => {
        const games: SavedGamesCollection = {
          'elite_game1': createGame({
            tournamentId: 'tourn1',
            tournamentSeriesId: 'series_elite'
          }),
          'elite_game2': createGame({
            tournamentId: 'tourn1',
            tournamentSeriesId: 'series_elite'
          }),
          'kilpa_game': createGame({
            tournamentId: 'tourn1',
            tournamentSeriesId: 'series_kilpa'
          }),
          'no_series_game': createGame({
            tournamentId: 'tourn1',
            tournamentSeriesId: ''
          }),
        };

        const result = filterGameIds(games, {
          activeTab: 'tournament',
          tournamentFilter: 'tourn1',
          seriesFilter: 'series_elite'
        });
        expect(result).toHaveLength(2);
        expect(result).toContain('elite_game1');
        expect(result).toContain('elite_game2');
        expect(result).not.toContain('kilpa_game');
        expect(result).not.toContain('no_series_game');
      });

      it('returns all tournament games when seriesFilter=all', () => {
        const games: SavedGamesCollection = {
          'elite_game': createGame({
            tournamentId: 'tourn1',
            tournamentSeriesId: 'series_elite'
          }),
          'kilpa_game': createGame({
            tournamentId: 'tourn1',
            tournamentSeriesId: 'series_kilpa'
          }),
          'no_series_game': createGame({
            tournamentId: 'tourn1',
            tournamentSeriesId: ''
          }),
        };

        const result = filterGameIds(games, {
          activeTab: 'tournament',
          tournamentFilter: 'tourn1',
          seriesFilter: 'all'
        });
        expect(result).toHaveLength(3);
      });

      it('ignores seriesFilter when tournamentFilter=all', () => {
        const games: SavedGamesCollection = {
          'tourn1_game': createGame({
            tournamentId: 'tourn1',
            seasonId: '',
            tournamentSeriesId: 'series_elite'
          }),
          'tourn2_game': createGame({
            tournamentId: 'tourn2',
            seasonId: '',
            tournamentSeriesId: 'series_kilpa'
          }),
        };

        // seriesFilter should be ignored when showing all tournaments
        const result = filterGameIds(games, {
          activeTab: 'tournament',
          tournamentFilter: 'all',
          seriesFilter: 'series_elite' // This should be ignored
        });
        expect(result).toHaveLength(2);
      });

      it('handles game with orphaned tournamentSeriesId (series deleted from tournament)', () => {
        // Game references a series that no longer exists in tournament definition
        // This is valid - the filter just checks the ID match
        const games: SavedGamesCollection = {
          'orphan_series_game': createGame({
            tournamentId: 'tourn1',
            tournamentSeriesId: 'deleted_series_id'
          }),
          'valid_series_game': createGame({
            tournamentId: 'tourn1',
            tournamentSeriesId: 'existing_series'
          }),
        };

        // Filtering by the orphaned series ID should still return the game
        const result = filterGameIds(games, {
          activeTab: 'tournament',
          tournamentFilter: 'tourn1',
          seriesFilter: 'deleted_series_id'
        });
        expect(result).toHaveLength(1);
        expect(result).toContain('orphan_series_game');
      });

      it('excludes games without matching tournamentSeriesId', () => {
        const games: SavedGamesCollection = {
          'has_series': createGame({
            tournamentId: 'tourn1',
            tournamentSeriesId: 'series_a'
          }),
          'different_series': createGame({
            tournamentId: 'tourn1',
            tournamentSeriesId: 'series_b'
          }),
          'no_series': createGame({
            tournamentId: 'tourn1',
            // No tournamentSeriesId set
          }),
          'empty_series': createGame({
            tournamentId: 'tourn1',
            tournamentSeriesId: ''
          }),
        };

        const result = filterGameIds(games, {
          activeTab: 'tournament',
          tournamentFilter: 'tourn1',
          seriesFilter: 'series_a'
        });
        expect(result).toHaveLength(1);
        expect(result).toContain('has_series');
      });

      it('does not apply series filter on non-tournament tabs', () => {
        const games: SavedGamesCollection = {
          'season_game': createGame({
            seasonId: 'season1',
            tournamentSeriesId: 'should_be_ignored'
          }),
        };

        // On season tab, seriesFilter should be irrelevant
        const result = filterGameIds(games, {
          activeTab: 'season',
          seasonFilter: 'season1',
          seriesFilter: 'some_filter' // Should be ignored
        });
        expect(result).toHaveLength(1);
      });
    });

    describe('combined filters', () => {
      it('combines team and tournament filters', () => {
        const games: SavedGamesCollection = {
          'team1_tourn1': createGame({
            teamId: 'team1',
            tournamentId: 'tourn1'
          }),
          'team1_tourn2': createGame({
            teamId: 'team1',
            tournamentId: 'tourn2'
          }),
          'team2_tourn1': createGame({
            teamId: 'team2',
            tournamentId: 'tourn1'
          }),
        };

        const result = filterGameIds(games, {
          activeTab: 'tournament',
          teamFilter: 'team1',
          tournamentFilter: 'tourn1'
        });
        expect(result).toHaveLength(1);
        expect(result).toContain('team1_tourn1');
      });

      it('combines team, tournament, and series filters', () => {
        const games: SavedGamesCollection = {
          'match': createGame({
            teamId: 'team1',
            tournamentId: 'tourn1',
            tournamentSeriesId: 'series_elite'
          }),
          'wrong_team': createGame({
            teamId: 'team2',
            tournamentId: 'tourn1',
            tournamentSeriesId: 'series_elite'
          }),
          'wrong_series': createGame({
            teamId: 'team1',
            tournamentId: 'tourn1',
            tournamentSeriesId: 'series_kilpa'
          }),
        };

        const result = filterGameIds(games, {
          activeTab: 'tournament',
          teamFilter: 'team1',
          tournamentFilter: 'tourn1',
          seriesFilter: 'series_elite'
        });
        expect(result).toHaveLength(1);
        expect(result).toContain('match');
      });

      it('combines playedOnly with other filters', () => {
        const games: SavedGamesCollection = {
          'played_match': createGame({
            isPlayed: true,
            teamId: 'team1',
            tournamentId: 'tourn1',
            tournamentSeriesId: 'series_elite'
          }),
          'unplayed_match': createGame({
            isPlayed: false,
            teamId: 'team1',
            tournamentId: 'tourn1',
            tournamentSeriesId: 'series_elite'
          }),
        };

        const result = filterGameIds(games, {
          playedOnly: true,
          activeTab: 'tournament',
          teamFilter: 'team1',
          tournamentFilter: 'tourn1',
          seriesFilter: 'series_elite'
        });
        expect(result).toHaveLength(1);
        expect(result).toContain('played_match');
      });
    });

    describe('edge cases', () => {
      it('handles undefined game in collection', () => {
        const games: SavedGamesCollection = {
          'valid': createGame(),
          'undefined': undefined as unknown as AppState,
        };

        const result = filterGameIds(games, { playedOnly: false });
        expect(result).toHaveLength(1);
        expect(result).toContain('valid');
      });

      it('handles null values in game properties', () => {
        const games: SavedGamesCollection = {
          'game': createGame({
            teamId: null as unknown as string,
            seasonId: null as unknown as string,
            tournamentId: null as unknown as string,
          }),
        };

        // Should not throw
        const result = filterGameIds(games, { playedOnly: false });
        expect(result).toHaveLength(1);
      });
    });
  });

  describe('getPlayedGamesByTeam', () => {
    it('is a convenience wrapper for filterGameIds', () => {
      const games: SavedGamesCollection = {
        'played_team1': createGame({ isPlayed: true, teamId: 'team1' }),
        'unplayed_team1': createGame({ isPlayed: false, teamId: 'team1' }),
        'played_team2': createGame({ isPlayed: true, teamId: 'team2' }),
      };

      const result = getPlayedGamesByTeam(games, 'team1');
      expect(result).toHaveLength(1);
      expect(result).toContain('played_team1');
    });

    it('defaults to all teams', () => {
      const games: SavedGamesCollection = {
        'played1': createGame({ isPlayed: true, teamId: 'team1' }),
        'played2': createGame({ isPlayed: true, teamId: 'team2' }),
        'unplayed': createGame({ isPlayed: false }),
      };

      const result = getPlayedGamesByTeam(games);
      expect(result).toHaveLength(2);
    });

    it('handles null games', () => {
      const result = getPlayedGamesByTeam(null);
      expect(result).toEqual([]);
    });
  });
});
