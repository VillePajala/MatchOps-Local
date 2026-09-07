import {
  buildHomeTeamScopeOptions,
  readHomeTeamScope,
  writeHomeTeamScope,
  resolveHomeTeamScope,
  mostRecentTeamId,
} from '../homeTeamScope';
import type { Season, Team, Tournament } from '@/types';

describe('homeTeamScope - remembering it', () => {
  beforeEach(() => localStorage.clear());

  it('gives back what was written', () => {
    writeHomeTeamScope('teamA');
    expect(readHomeTeamScope()).toBe('teamA');
  });

  it('reports nothing when nothing was chosen', () => {
    expect(readHomeTeamScope()).toBeNull();
  });
});

describe('homeTeamScope - which team Home opens on', () => {
  const teams = ['teamA', 'teamB'];

  it('honours the remembered team', () => {
    expect(resolveHomeTeamScope('teamB', teams, 'teamA')).toBe('teamB');
  });

  /**
   * @critical - a deleted team would otherwise leave Home showing an empty
   * record with nothing on screen explaining why.
   */
  it('drops a remembered team that no longer exists', () => {
    expect(resolveHomeTeamScope('gone', teams, 'teamA')).toBe('teamA');
  });

  it('falls back to the team of the most recent match', () => {
    expect(resolveHomeTeamScope(null, teams, 'teamB')).toBe('teamB');
  });

  it('shows everything when there is nothing to go on', () => {
    expect(resolveHomeTeamScope(null, teams, null)).toBe('all');
    expect(resolveHomeTeamScope(null, [], 'teamA')).toBe('all');
  });

  it('keeps the two scopes that are not teams', () => {
    expect(resolveHomeTeamScope('all', teams, 'teamA')).toBe('all');
    expect(resolveHomeTeamScope('legacy', teams, 'teamA')).toBe('legacy');
  });
});

describe('mostRecentTeamId', () => {
  const SCRATCH = 'unsaved_game';
  const game = (o: Record<string, unknown>) => ({ isPlayed: true, ...o });

  it('picks the team of the newest played match', () => {
    const games = {
      old: game({ teamId: 'teamA', gameDate: '2024-03-01' }),
      new: game({ teamId: 'teamB', gameDate: '2024-05-01' }),
    };
    expect(mostRecentTeamId(games, SCRATCH)).toBe('teamB');
  });

  /**
   * @critical - the scratch workspace is a phantom entry every other reader
   * of a saved-games collection excludes. Letting it decide would open Home on
   * whatever team the half-finished game happened to carry.
   */
  it('ignores the scratch workspace even when it looks newest', () => {
    const games = {
      [SCRATCH]: game({ teamId: 'teamScratch', gameDate: '2099-01-01' }),
      real: game({ teamId: 'teamA', gameDate: '2024-03-01' }),
    };
    expect(mostRecentTeamId(games, SCRATCH)).toBe('teamA');
  });

  it('ignores matches that were never played, and dateless ones', () => {
    const games = {
      planned: game({ teamId: 'teamB', gameDate: '2099-01-01', isPlayed: false }),
      undated: game({ teamId: 'teamC' }),
      real: game({ teamId: 'teamA', gameDate: '2024-03-01' }),
    };
    expect(mostRecentTeamId(games, SCRATCH)).toBe('teamA');
  });

  it('reports nothing when no played match names a team', () => {
    expect(mostRecentTeamId({}, SCRATCH)).toBeNull();
    expect(mostRecentTeamId({ a: game({ gameDate: '2024-01-01' }) }, SCRATCH)).toBeNull();
  });
});

describe('buildHomeTeamScopeOptions', () => {
  const labels = { futsal: 'Futsal', level: (level: string) => `L:${level}` };
  const seasons = [{ id: 's1', name: 'Aluesarja U10', clubSeason: '25/26' }] as unknown as Season[];
  const tournaments = [
    { id: 't1', name: 'Kesäcup', clubSeason: '25/26', series: [{ id: 'x1', level: 'Kilpa' }] },
  ] as unknown as Tournament[];

  /**
   * @critical - junior teams are named after colours and reused per
   * competition, so three "PePo Lila" is normal. Bare names left the coach
   * guessing which one the numbers were about.
   */
  it('tells same-named teams apart by what they are bound to', () => {
    const teams = [
      { id: 'a', name: 'PePo Lila', boundSeasonId: 's1' },
      { id: 'b', name: 'PePo Lila', boundTournamentId: 't1', boundTournamentSeriesId: 'x1' },
      { id: 'c', name: 'PePo Lila', gameType: 'futsal' },
    ] as unknown as Team[];
    const labelsOut = buildHomeTeamScopeOptions(teams, seasons, tournaments, labels).map((o) => o.label);
    expect(new Set(labelsOut).size).toBe(3);
    expect(labelsOut[0]).toBe('PePo Lila (Aluesarja U10 25/26)');
    expect(labelsOut[1]).toBe('PePo Lila (Kesäcup 25/26 / L:Kilpa)');
    expect(labelsOut[2]).toBe('PePo Lila (Futsal)');
  });

  it('leaves an unbound team as its plain name', () => {
    const teams = [{ id: 'a', name: 'PePo Lila' }] as unknown as Team[];
    expect(buildHomeTeamScopeOptions(teams, seasons, tournaments, labels)).toEqual([
      { id: 'a', label: 'PePo Lila' },
    ]);
  });
});
