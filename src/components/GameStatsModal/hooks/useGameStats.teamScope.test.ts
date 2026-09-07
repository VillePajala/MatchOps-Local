/**
 * External games belong to the team they were played for.
 *
 * @critical - a coach selected one team and saw 19 games played for a team
 * that had played 7. The games themselves were filtered correctly; the
 * hand-recorded external games were then added on top without checking
 * anything at all.
 */
import { renderHook } from '@testing-library/react';
import { useGameStats } from './useGameStats';
import type { GameStatsParams } from '../types';
import type { AppState, Player, PlayerStatAdjustment, SavedGamesCollection } from '@/types';

const player: Player = { id: 'p1', name: 'John' } as Player;

const game = (over: Partial<AppState> = {}): AppState =>
  ({
    teamId: 'teamA',
    gameDate: '2024-12-01',
    isPlayed: true,
    selectedPlayerIds: ['p1'],
    availablePlayers: [player],
    gameEvents: [],
    ...over,
  }) as unknown as AppState;

const adj = (over: Partial<PlayerStatAdjustment> = {}): PlayerStatAdjustment =>
  ({
    id: `a${Math.random()}`,
    playerId: 'p1',
    gamesPlayedDelta: 1,
    goalsDelta: 0,
    assistsDelta: 0,
    appliedAt: '2024-11-03T00:00:00Z',
    ...over,
  }) as PlayerStatAdjustment;

const run = (over: Partial<GameStatsParams> = {}) => {
  const savedGames = (over.savedGames ?? { g1: game() }) as unknown as SavedGamesCollection;
  const { result } = renderHook(() =>
    useGameStats({
      activeTab: 'overall',
      savedGames,
      availablePlayers: [player],
      selectedPlayerIds: ['p1'],
      localGameEvents: [],
      currentGameId: null,
      selectedSeasonIdFilter: 'all',
      selectedTournamentIdFilter: 'all',
      selectedTeamIdFilter: 'all',
      selectedSeriesIdFilter: 'all',
      selectedGameTypeFilter: 'all',
      selectedGenderFilter: 'all',
      selectedClubSeason: 'all',
      sortColumn: 'gamesPlayed',
      sortDirection: 'desc',
      filterText: '',
      playerPool: [player],
      ...over,
    } as GameStatsParams),
  );
  return result.current.stats.find((p) => p.id === 'p1')?.gamesPlayed ?? 0;
};

describe('useGameStats - a team filter scopes external games too', () => {
  it('counts an external game recorded against the selected team', () => {
    expect(run({ selectedTeamIdFilter: 'teamA', adjustments: [adj({ teamId: 'teamA' })] })).toBe(2);
  });

  /** The reported bug, in one line. */
  it('leaves out an external game played for another team', () => {
    expect(run({ selectedTeamIdFilter: 'teamA', adjustments: [adj({ teamId: 'teamB' })] })).toBe(1);
  });

  it('leaves out an external game that names no team at all', () => {
    expect(run({ selectedTeamIdFilter: 'teamA', adjustments: [adj({})] })).toBe(1);
  });

  it('counts every external game when no team is selected', () => {
    expect(run({ adjustments: [adj({ teamId: 'teamB' }), adj({})] })).toBe(3);
  });

  /**
   * "Legacy Games" is its own scope: what names no team. New logic here, and
   * leaving it untested is what let the same gap survive in the drill-down.
   */
  it('under Legacy Games, counts the external games that name no team', () => {
    const savedGames = { g1: game({ teamId: undefined }) } as unknown as SavedGamesCollection;
    expect(run({ savedGames, selectedTeamIdFilter: 'legacy', adjustments: [adj({})] })).toBe(2);
  });

  it('under Legacy Games, leaves out an external game recorded against a team', () => {
    const savedGames = { g1: game({ teamId: undefined }) } as unknown as SavedGamesCollection;
    expect(
      run({ savedGames, selectedTeamIdFilter: 'legacy', adjustments: [adj({ teamId: 'teamA' })] }),
    ).toBe(1);
  });

  it('scopes external games to the selected year, by the date they carry', () => {
    // The club year spans a new year, so Dec 2024 and Dec 2023 are different ones.
    expect(
      run({
        selectedClubSeason: '24/25',
        adjustments: [adj({ gameDate: '2024-12-05' }), adj({ gameDate: '2023-12-05' })],
      }),
    ).toBe(2);
  });

  it('leaves out an external game with no date when a year is selected', () => {
    expect(run({ selectedClubSeason: '24/25', adjustments: [adj({})] })).toBe(1);
  });

  it('leaves external games out entirely under a sport or gender filter', () => {
    // An adjustment records neither, so it cannot be shown to belong.
    expect(run({ selectedGameTypeFilter: 'futsal', adjustments: [adj({})] })).toBe(0);
    expect(run({ selectedGenderFilter: 'girls', adjustments: [adj({})] })).toBe(0);
  });

  /** A player who never played for this team must not appear in its table. */
  it('does not add a player to a team on the strength of another team external game', () => {
    const other: Player = { id: 'p2', name: 'Mike' } as Player;
    const savedGames = { g1: game() } as unknown as SavedGamesCollection;
    const { result } = renderHook(() =>
      useGameStats({
        activeTab: 'overall',
        savedGames,
        availablePlayers: [player, other],
        selectedPlayerIds: ['p1'],
        localGameEvents: [],
        currentGameId: null,
        selectedSeasonIdFilter: 'all',
        selectedTournamentIdFilter: 'all',
        selectedTeamIdFilter: 'teamA',
        selectedSeriesIdFilter: 'all',
        selectedGameTypeFilter: 'all',
        selectedGenderFilter: 'all',
        selectedClubSeason: 'all',
        sortColumn: 'gamesPlayed',
        sortDirection: 'desc',
        filterText: '',
        adjustments: [adj({ playerId: 'p2', teamId: 'teamB' })],
        playerPool: [player, other],
      } as GameStatsParams),
    );
    expect(result.current.stats.find((p) => p.id === 'p2')).toBeUndefined();
  });
});
