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

describe('the picker uses it', () => {
  const source = require('fs').readFileSync(
    require('path').join(process.cwd(), 'src/components/PlayerStatsView.tsx'),
    'utf8',
  );

  it('renders the contextual label, not the bare name', () => {
    const select = source.slice(source.indexOf('data-testid="adj-team-select"'));
    const options = select.slice(0, select.indexOf('</select>'));

    expect(options).toContain('getTeamDisplayName(team, seasons, tournaments)');
    expect(options).not.toMatch(/>\{team\.name\}</);
  });
});
