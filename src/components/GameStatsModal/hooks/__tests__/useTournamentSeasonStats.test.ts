import { renderHook } from '@testing-library/react';
import { useTournamentSeasonStats } from '../useTournamentSeasonStats';
import type { AppState, Season, Tournament, SavedGamesCollection } from '@/types';
import type { TournamentSeasonStats } from '../../types';

/**
 * Review 5.1: a level game decided by a logged penalty shootout counts as a win or a
 * loss on the Season and Tournament tabs too - those cards compared raw scores and
 * showed it as a tie, while the Overall tab and the Excel export resolved it.
 * @critical
 */
describe('useTournamentSeasonStats - shootout results', () => {
  const tournament = { id: 't1', name: 'Cup' } as Tournament;
  const season = { id: 's1', name: 'League' } as Season;
  const shootoutWin = (overrides: Partial<AppState>) => ({
    teamName: 'Us', opponentName: 'Them', gameDate: '2026-05-01', homeOrAway: 'home',
    homeScore: 2, awayScore: 2, isPlayed: true, seasonId: '', tournamentId: '',
    shootoutKicks: [
      { id: 'k1', team: 'home', scored: true, order: 0 },
      { id: 'k2', team: 'away', scored: false, order: 1 },
      { id: 'k3', team: 'home', scored: true, order: 2 },
      { id: 'k4', team: 'away', scored: false, order: 3 },
      { id: 'k5', team: 'home', scored: true, order: 4 },
      { id: 'k6', team: 'away', scored: false, order: 5 },
    ],
    ...overrides,
  }) as unknown as AppState;

  const run = (activeTab: 'season' | 'tournament', filter: string, games: SavedGamesCollection) =>
    renderHook(() => useTournamentSeasonStats({
      activeTab,
      savedGames: games,
      seasons: [season],
      tournaments: [tournament],
      selectedSeasonIdFilter: activeTab === 'season' ? filter : 'all',
      selectedTournamentIdFilter: activeTab === 'tournament' ? filter : 'all',
    })).result.current;

  it('tournament card (one tournament) counts the shootout win as a win', () => {
    const stats = run('tournament', 't1', { g1: shootoutWin({ tournamentId: 't1' }) }) as unknown as TournamentSeasonStats[];
    const row = Array.isArray(stats) ? stats[0] : (stats as unknown as TournamentSeasonStats);
    expect(row).toMatchObject({ wins: 1, losses: 0, ties: 0 });
  });

  it('season card (all seasons) counts the shootout win as a win', () => {
    const overall = run('season', 'all', { g1: shootoutWin({ seasonId: 's1' }) }) as unknown as { seasons: TournamentSeasonStats[]; totalWins: number; totalTies: number };
    expect(overall.seasons.find((s) => s.id === 's1')).toMatchObject({ wins: 1, losses: 0, ties: 0 });
    expect(overall).toMatchObject({ totalWins: 1, totalTies: 0 });
  });

  it('season card (one season) and all-tournaments card count it as a win too', () => {
    const one = run('season', 's1', { g1: shootoutWin({ seasonId: 's1' }) }) as unknown as TournamentSeasonStats[] | TournamentSeasonStats;
    const oneRow = Array.isArray(one) ? one[0] : one;
    expect(oneRow).toMatchObject({ wins: 1, ties: 0 });
    const all = run('tournament', 'all', { g1: shootoutWin({ tournamentId: 't1' }) }) as unknown as { tournaments: TournamentSeasonStats[] };
    expect(all.tournaments.find((t) => t.id === 't1')).toMatchObject({ wins: 1, ties: 0 });
  });

  it('a level game without a decided shootout is still a tie', () => {
    const overall = run('tournament', 'all', { g1: shootoutWin({ tournamentId: 't1', shootoutKicks: [] }) }) as unknown as { tournaments: TournamentSeasonStats[] };
    expect(overall.tournaments.find((t) => t.id === 't1')).toMatchObject({ wins: 0, losses: 0, ties: 1 });
  });
});
