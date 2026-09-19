/**
 * @jest-environment jsdom
 * @critical - a team's NAME does not identify a team. Teams are bound to a
 * competition, so one squad appears once per season it plays in, and the
 * owner's picker listed "PePo Lila" four times with nothing to choose between
 * them.
 */
import { getTeamDisplayName } from '@/utils/teams';
import type { Team, Season, Tournament } from '@/types';

const team = (id: string, over: Partial<Team> = {}): Team =>
  ({ id, name: 'PePo Lila', createdAt: '2026-01-01', updatedAt: '2026-01-01', ...over }) as Team;

const season = (id: string, name: string): Season => ({ id, name }) as Season;
const tournament = (id: string, name: string): Tournament => ({ id, name }) as Tournament;

const SEASONS = [season('s1', 'Kevät 26'), season('s2', 'Syksy 26')];
const TOURNAMENTS = [tournament('t1', 'Savonlinna Cup')];

describe('telling two teams of the same name apart', () => {
  it('names the season a team is bound to', () => {
    const label = getTeamDisplayName(team('a', { boundSeasonId: 's1' }), SEASONS, TOURNAMENTS);

    expect(label).toContain('PePo Lila');
    expect(label).toContain('Kevät 26');
  });

  /** The whole point: two squads called the same thing must read differently. */
  it('gives two same-named teams different labels', () => {
    const first = getTeamDisplayName(team('a', { boundSeasonId: 's1' }), SEASONS, TOURNAMENTS);
    const second = getTeamDisplayName(team('b', { boundSeasonId: 's2' }), SEASONS, TOURNAMENTS);

    expect(first).not.toBe(second);
  });

  it('names a tournament the same way', () => {
    expect(getTeamDisplayName(team('a', { boundTournamentId: 't1' }), SEASONS, TOURNAMENTS))
      .toContain('Savonlinna Cup');
  });

  /** A team bound to nothing is already unambiguous; do not pad it. */
  it('leaves an unbound team as its plain name', () => {
    expect(getTeamDisplayName(team('a'), SEASONS, TOURNAMENTS)).toBe('PePo Lila');
  });
});

/**
 * BOTH pickers, because there are two: one to add an external game and one to
 * edit it. The first version fixed only the add form, leaving the same
 * ambiguity in the place where a wrong guess gets locked in.
 */
describe('every team picker uses it', () => {
  const source = require('fs').readFileSync(
    require('path').join(process.cwd(), 'src/components/PlayerStatsView.tsx'),
    'utf8',
  );

  const optionsOf = (testId: string) => {
    const from = source.indexOf(`data-testid="${testId}"`);
    expect(from).toBeGreaterThan(-1);
    return source.slice(from, source.indexOf('</select>', from));
  };

  it.each(['adj-team-select', 'edit-team-select'])('%s shows the competition too', (testId) => {
    const options = optionsOf(testId);

    expect(options).toContain('getTeamDisplayName(team, seasons, tournaments)');
    expect(options).not.toMatch(/>\{team\.name\}</);
  });

  /** A bare team.name anywhere in this file is the bug coming back. */
  it('leaves no picker rendering a bare name', () => {
    expect(source).not.toMatch(/<option key=\{team\.id\} value=\{team\.id\}>\{team\.name\}<\/option>/);
  });
});
