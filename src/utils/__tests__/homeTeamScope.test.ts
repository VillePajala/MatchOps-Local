import { readHomeTeamScope, writeHomeTeamScope, resolveHomeTeamScope } from '../homeTeamScope';

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
