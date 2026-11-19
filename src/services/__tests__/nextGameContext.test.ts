/**
 * Basic Home's "Uusi ottelu" (review R1) builds the next game from what the
 * coach already set: the team, its players, the last game's length and the
 * plan's format. A wrong guess here means a plan for the wrong game size.
 * @critical
 */
import { resolveNextGameContext, type NextGameContextSources } from '../nextGameContext';
import { createPlan } from '@/utils/playtimePlanner/storage';
import { getDefaultPresetIdForSize } from '@/config/formationPresets';
import type { AppState, Player, Team } from '@/types';

jest.mock('@/datastore/factory', () => ({ getDataStore: jest.fn() }));

const team = (id: string, over: Partial<Team> = {}): Team => ({
  id,
  name: `Team ${id}`,
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
  ...over,
});
const players: Player[] = [
  { id: 'p1', name: 'Onni' },
  { id: 'p2', name: 'Toivo' },
  { id: 'p3', name: 'Aatos', archived: true },
];
const game = (over: Partial<AppState>): AppState =>
  ({
    teamName: 'Team t1',
    opponentName: 'HJK',
    gameDate: '2026-11-15',
    numberOfPeriods: 2,
    periodDurationMinutes: 20,
    ...over,
  }) as AppState;

const base = (over: Partial<NextGameContextSources> = {}): NextGameContextSources => ({
  teams: [team('t1', { ageGroup: 'U10', gameType: 'futsal' })],
  roster: players,
  games: {},
  plans: [],
  fallbackTeamName: 'My team',
  ...over,
});

describe('resolveNextGameContext', () => {
  it('is null with nobody to plan for', () => {
    expect(resolveNextGameContext(base({ roster: [] }))).toBeNull();
    expect(resolveNextGameContext(base({ roster: [{ id: 'x', name: 'Gone', archived: true }] }))).toBeNull();
  });

  it('a fresh account: the team, its active players and the age-group table', () => {
    const ctx = resolveNextGameContext(base())!;
    expect(ctx.team).toEqual({ id: 't1', name: 'Team t1' });
    expect(ctx.players.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(ctx.gameType).toBe('futsal');
    expect(ctx.ageGroup).toBe('U10');
    // Futsal U10: 4v4 (owner's table, D10).
    expect(ctx.fieldSize).toBe('4v4');
  });

  it("the wizard's own format answer wins over the table", () => {
    expect(resolveNextGameContext(base({ storedFormat: '5v5' }))!.fieldSize).toBe('5v5');
  });

  it("the team's latest game sets the length; its latest plan sets the format", () => {
    const plan = createPlan({
      name: 'p',
      players: [],
      gameCount: 1,
      formationId: getDefaultPresetIdForSize('8v8'),
      numberOfPeriods: 2,
      periodMinutes: 25,
      teamId: 't1',
    });
    const ctx = resolveNextGameContext(
      base({
        storedFormat: '5v5',
        plans: [plan],
        games: {
          old: game({ teamId: 't1', gameDate: '2026-10-01', numberOfPeriods: 1, periodDurationMinutes: 40 }),
          recent: game({ teamId: 't1', gameDate: '2026-11-15', numberOfPeriods: 2, periodDurationMinutes: 20 }),
        },
      }),
    )!;
    expect(ctx.numberOfPeriods).toBe(2);
    expect(ctx.periodMinutes).toBe(20);
    expect(ctx.fieldSize).toBe('8v8');
  });

  it("with several teams: the latest game's team and that team's own roster", () => {
    const ctx = resolveNextGameContext(
      base({
        teams: [team('t1'), team('t2')],
        teamRosters: { t2: [{ id: 'p2', name: 'Toivo' }] },
        games: { g: game({ teamId: 't2', teamName: 'Team t2' }) },
      }),
    )!;
    expect(ctx.team.id).toBe('t2');
    expect(ctx.players.map((p) => p.id)).toEqual(['p2']);
  });

  it('with no team: no team id and a name that passes validation', () => {
    const ctx = resolveNextGameContext(base({ teams: [] }))!;
    expect(ctx.team).toEqual({ id: '', name: 'My team' });
    expect(ctx.gameType).toBe('soccer');
  });
});
