/**
 * New-game defaults (Onboarding v3, D6/D7/D26): which team, which players and
 * which settings the New Game form starts with.
 * @critical - runs for every coach on every new game.
 */
import type { Player, Season, Team, Tournament } from '@/types';
import { getPresetById, FORMATION_PRESETS } from '@/config/formationPresets';
import { buildAutoPlacement } from '@/utils/formations';
import { teamMemberIds } from '@/utils/gamePlayerList';
import { DEFAULT_GAME_ID } from '@/config/constants';
import { newGameIsPlayedDefault } from '@/utils/matchPlayedDefault';
import {
  buildNewGameDefaults,
  FALLBACK_PERIODS,
  inferPresetFromSnapPoints,
  periodsForAgeGroup,
  pickDefaultTeamId,
  previousGameOfTeam,
  resolveFormation,
  venueFor,
  type DefaultsSourceGame,
} from './newGameDefaults';

const team = (id: string, extra: Partial<Team> = {}): Team => ({
  id,
  name: `Team ${id}`,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...extra,
});

const game = (createdAt: string, extra: DefaultsSourceGame = {}): DefaultsSourceGame => ({ createdAt, ...extra });

const players = (count: number): Player[] =>
  Array.from({ length: count }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}` }));

/** The snap points a game created with this preset and squad really stores. */
const snapPointsFor = (presetId: string, squad: number) =>
  buildAutoPlacement(players(squad), getPresetById(presetId)!.positions).formationSnapPoints;

describe('pickDefaultTeamId', () => {
  it('opens on the only team when there is one and no games', () => {
    expect(pickDefaultTeamId([team('a')], {})).toBe('a');
  });

  it('opens on no team when there are several and no games', () => {
    expect(pickDefaultTeamId([team('a'), team('b')], {})).toBeNull();
  });

  it('opens on the team of the most recently created game', () => {
    const games = {
      g1: game('2026-10-01T10:00:00.000Z', { teamId: 'a' }),
      g2: game('2026-11-01T10:00:00.000Z', { teamId: 'b' }),
    };
    expect(pickDefaultTeamId([team('a'), team('b')], games)).toBe('b');
  });

  it('opens on no team when the last game had none, even with one team', () => {
    const games = {
      g1: game('2026-10-01T10:00:00.000Z', { teamId: 'a' }),
      g2: game('2026-11-01T10:00:00.000Z', { teamId: '' }),
    };
    expect(pickDefaultTeamId([team('a')], games)).toBeNull();
  });

  it('ignores an archived team and falls back to the only active one', () => {
    const games = { g1: game('2026-11-01T10:00:00.000Z', { teamId: 'old' }) };
    expect(pickDefaultTeamId([team('old', { archived: true }), team('a')], games)).toBe('a');
    expect(pickDefaultTeamId([team('old', { archived: true }), team('a'), team('b')], games)).toBeNull();
  });

  it('ignores a deleted team', () => {
    const games = { g1: game('2026-11-01T10:00:00.000Z', { teamId: 'gone' }) };
    expect(pickDefaultTeamId([team('a')], games)).toBe('a');
  });

  it('never lets the scratch workspace decide', () => {
    const games = {
      [DEFAULT_GAME_ID]: game('2026-12-01T10:00:00.000Z', { teamId: '' }),
      g1: game('2026-11-01T10:00:00.000Z', { teamId: 'a' }),
    };
    expect(pickDefaultTeamId([team('a'), team('b')], games)).toBe('a');
  });
});

describe('previousGameOfTeam', () => {
  const games = {
    a1: game('2026-09-01T10:00:00.000Z', { teamId: 'a', periodDurationMinutes: 20 }),
    b1: game('2026-10-01T10:00:00.000Z', { teamId: 'b', periodDurationMinutes: 25 }),
    a2: game('2026-10-15T10:00:00.000Z', { teamId: 'a', periodDurationMinutes: 30 }),
    n1: game('2026-11-01T10:00:00.000Z', { periodDurationMinutes: 12 }),
  };

  it('finds the newest game of that team, not of another', () => {
    expect(previousGameOfTeam(games, 'a')?.periodDurationMinutes).toBe(30);
    expect(previousGameOfTeam(games, 'b')?.periodDurationMinutes).toBe(25);
  });

  it('treats null as the games played without a team', () => {
    expect(previousGameOfTeam(games, null)?.periodDurationMinutes).toBe(12);
  });

  it('is null for a team that has not played', () => {
    expect(previousGameOfTeam(games, 'c')).toBeNull();
    expect(previousGameOfTeam(undefined, 'a')).toBeNull();
  });
});

describe('team players (id first, per-player name fallback)', () => {
  const club = [
    { id: 'p1', name: 'Aapo Renamed' },
    { id: 'p2', name: 'Eino' },
    { id: 'p3', name: 'Niilo' },
  ];

  it('keeps a renamed player, matched by id', () => {
    expect(teamMemberIds([{ id: 'p1', name: 'Aapo' }], club)).toEqual(['p1']);
  });

  it('falls back to the name per player for a duplicated team with fresh ids', () => {
    const duplicatedTeamRoster = [
      { id: 'p2', name: 'Eino' }, // id still matches
      { id: 'tp_new_9', name: 'Niilo' }, // fresh id, name matches one club player
    ];
    expect(teamMemberIds(duplicatedTeamRoster, club).sort()).toEqual(['p2', 'p3']);
  });
});

describe('inferPresetFromSnapPoints', () => {
  it('recognises every preset exactly from the points it produces', () => {
    for (const preset of FORMATION_PRESETS) {
      const squad = preset.positions.length + 1;
      expect(inferPresetFromSnapPoints(snapPointsFor(preset.id, squad))?.id).toBe(preset.id);
    }
  });

  it('recognises a full preset with extra subs parked on the sideline', () => {
    expect(inferPresetFromSnapPoints(snapPointsFor('8v8-2-1-2-1-1', 14))?.id).toBe('8v8-2-1-2-1-1');
  });

  it('accepts a prefix (short squad) only when one preset fits', () => {
    // Five outfielders in a seven-slot 8v8 2-1-2-1-1 - no other preset starts that way.
    expect(inferPresetFromSnapPoints(snapPointsFor('8v8-2-1-2-1-1', 6))?.id).toBe('8v8-2-1-2-1-1');
  });

  it('refuses an ambiguous prefix', () => {
    // A lone defender at the centre of the back line starts several presets.
    expect(inferPresetFromSnapPoints([{ relX: 0.5, relY: 0.95 }, { relX: 0.5, relY: 0.7 }])).toBeNull();
  });

  it('is null for empty or unrecognised points', () => {
    expect(inferPresetFromSnapPoints(undefined)).toBeNull();
    expect(inferPresetFromSnapPoints([])).toBeNull();
    expect(inferPresetFromSnapPoints([{ relX: 0.5, relY: 0.95 }])).toBeNull();
    expect(inferPresetFromSnapPoints([{ relX: 0.31, relY: 0.27 }, { relX: 0.62, relY: 0.44 }])).toBeNull();
  });
});

describe('resolveFormation', () => {
  const previous8v8 = game('2026-11-01T10:00:00.000Z', { formationSnapPoints: snapPointsFor('8v8-2-1-2-1-1', 12) });

  it('14 pre-ticked, previous game 8v8, no stored format -> 8v8', () => {
    const resolved = resolveFormation({ previousGame: previous8v8, playerCount: 14, playersTouched: false });
    expect(resolved).toMatchObject({ fieldSize: '8v8', presetId: '8v8-2-1-2-1-1', source: 'previousPreset' });
  });

  it('an explicit pick wins over everything', () => {
    const resolved = resolveFormation({
      explicitPresetId: '5v5-2-2',
      previousGame: previous8v8,
      playerCount: 14,
      playersTouched: true,
    });
    expect(resolved).toMatchObject({ presetId: '5v5-2-2', source: 'explicit' });
  });

  it('a plan prefill wins over the previous game', () => {
    const resolved = resolveFormation({
      planSnapPoints: snapPointsFor('5v5-1-2-1', 7),
      previousGame: previous8v8,
      playerCount: 7,
      playersTouched: false,
    });
    expect(resolved).toMatchObject({ presetId: '5v5-1-2-1', source: 'planPrefill' });
  });

  it('falls back to how many stood on the pitch in the previous game', () => {
    const onPitch = players(8).map((p) => ({ ...p, relX: 0.5, relY: 0.5 }));
    const resolved = resolveFormation({
      previousGame: game('2026-11-01T10:00:00.000Z', { playersOnField: onPitch }),
      playerCount: 14,
      playersTouched: false,
    });
    expect(resolved).toMatchObject({ fieldSize: '8v8', source: 'previousOnPitch' });
  });

  it('then the wizard answer, then the official format for the age group', () => {
    expect(resolveFormation({ storedFormat: '5v5', playerCount: 14, playersTouched: false })).toMatchObject({
      fieldSize: '5v5',
      source: 'storedFormat',
    });
    expect(
      resolveFormation({ ageGroup: 'U9', sport: 'futsal', gameDate: '2026-11-19', playerCount: 14, playersTouched: false }),
    ).toMatchObject({ fieldSize: '4v4', source: 'official' });
  });

  it('uses the player count only after the coach has edited the selection', () => {
    expect(resolveFormation({ playerCount: 14, playersTouched: false })).toBeNull();
    expect(resolveFormation({ playerCount: 14, playersTouched: true })).toMatchObject({
      fieldSize: '11v11',
      source: 'playerCount',
    });
  });

  it('is null ("Automatic") at zero players, touched or not', () => {
    expect(resolveFormation({ playerCount: 0, playersTouched: false })).toBeNull();
    expect(resolveFormation({ playerCount: 0, playersTouched: true })).toBeNull();
  });
});

describe('venueFor (only from the same home/away)', () => {
  const games = {
    home: game('2026-10-01T10:00:00.000Z', {
      teamId: 'a', homeOrAway: 'home', gameLocation: 'Kotikenttä', locationLat: 61.8, locationLng: 28.9,
      locationAddress: 'Katu 1',
    }),
    away: game('2026-11-01T10:00:00.000Z', { teamId: 'a', homeOrAway: 'away', gameLocation: 'Vieraskenttä' }),
    other: game('2026-11-05T10:00:00.000Z', { teamId: 'b', homeOrAway: 'home', gameLocation: 'Toinen' }),
  };

  it('takes the venue of the newest game on that side, pin and address with it', () => {
    expect(venueFor(games, 'a', 'home')).toEqual({
      name: 'Kotikenttä', latitude: 61.8, longitude: 28.9, address: 'Katu 1',
    });
    expect(venueFor(games, 'a', 'away')?.name).toBe('Vieraskenttä');
  });

  it('never takes another team\'s venue, and is null without a game on that side', () => {
    expect(venueFor(games, 'b', 'away')).toBeNull();
    expect(venueFor(games, 'c', 'home')).toBeNull();
  });
});

describe('buildNewGameDefaults', () => {
  const season = (id: string, extra: Partial<Season> = {}): Season => ({ id, name: `Season ${id}`, ...extra });
  const tournament = (id: string, extra: Partial<Tournament> = {}): Tournament => ({ id, name: `Cup ${id}`, ...extra });

  const lastHome = game('2026-11-10T10:00:00.000Z', {
    teamId: 'a',
    homeOrAway: 'home',
    numberOfPeriods: 2,
    periodDurationMinutes: 25,
    gameLocation: 'Kimpisen kenttä',
    seasonId: 's1',
    ageGroup: 'U11',
    gameType: 'soccer',
  });

  it('carries the previous game of the team: periods, side, venue, competition, age group, sport', () => {
    const d = buildNewGameDefaults({
      teams: [team('a')],
      games: { g: lastHome },
      seasons: [season('s1')],
      tournaments: [],
    });
    expect(d).toMatchObject({
      teamId: 'a',
      periods: { numberOfPeriods: 2, periodMinutes: 25 },
      homeOrAway: 'home',
      venue: { name: 'Kimpisen kenttä' },
      competition: { kind: 'season', id: 's1' },
      ageGroup: 'U11',
      gameType: 'soccer',
    });
  });

  it('does not carry a deleted or archived competition', () => {
    const deleted = buildNewGameDefaults({ teams: [team('a')], games: { g: lastHome }, seasons: [], tournaments: [] });
    expect(deleted.competition).toBeNull();
    const archived = buildNewGameDefaults({
      teams: [team('a')], games: { g: lastHome }, seasons: [season('s1', { archived: true })], tournaments: [],
    });
    expect(archived.competition).toBeNull();
  });

  it('carries a tournament, and its series only while it still exists', () => {
    const cupGame = game('2026-11-10T10:00:00.000Z', { teamId: 'a', tournamentId: 't1', tournamentSeriesId: 'x' });
    const withSeries = buildNewGameDefaults({
      teams: [team('a')], games: { g: cupGame }, seasons: [],
      tournaments: [tournament('t1', { series: [{ id: 'x', level: 'Kilpa' }] })],
    });
    expect(withSeries.competition).toEqual({ kind: 'tournament', id: 't1', seriesId: 'x' });
    const seriesGone = buildNewGameDefaults({
      teams: [team('a')], games: { g: cupGame }, seasons: [], tournaments: [tournament('t1')],
    });
    expect(seriesGone.competition).toEqual({ kind: 'tournament', id: 't1', seriesId: null });
  });

  it('takes the venue only from a previous game on the same side', () => {
    const awayWithoutVenue = game('2026-11-12T10:00:00.000Z', { teamId: 'a', homeOrAway: 'away' });
    const d = buildNewGameDefaults({
      teams: [team('a')], games: { g1: lastHome, g2: awayWithoutVenue }, seasons: [], tournaments: [],
    });
    expect(d.homeOrAway).toBe('away');
    // The home ground is NOT offered for an away game.
    expect(d.venue).toBeNull();
  });

  it('with no previous game: the age-group periods, no side, no venue', () => {
    const d = buildNewGameDefaults({
      teams: [team('a', { gameType: 'futsal' })], games: {}, seasons: [], tournaments: [], fallbackAgeGroup: 'U12',
    });
    expect(d).toMatchObject({ teamId: 'a', previousGame: null, homeOrAway: null, venue: null, competition: null });
    expect(d.periods).toEqual({ numberOfPeriods: 2, periodMinutes: 10 });
  });

  it('with no previous game, a bound competition that names its length keeps it', () => {
    const d = buildNewGameDefaults({
      teams: [team('a', { boundSeasonId: 's1' })],
      games: {},
      seasons: [season('s1', { periodDuration: 20, periodCount: 2 })],
      tournaments: [],
    });
    expect(d.periods).toBeNull();
  });

  it('never carries the things that differ per match', () => {
    const d = buildNewGameDefaults({ teams: [team('a')], games: { g: lastHome }, seasons: [], tournaments: [] });
    expect(Object.keys(d).sort()).toEqual(
      ['ageGroup', 'competition', 'gameType', 'homeOrAway', 'periods', 'previousGame', 'teamId', 'venue'].sort(),
    );
  });
});

describe('periodsForAgeGroup (D7, the shared age-group table)', () => {
  it('uses the table where it knows the age group', () => {
    // Futsal P/T 12 plays 2 x 10 (Palloliitto 2026-27, config/gameFormats.json).
    expect(periodsForAgeGroup('U12', 'futsal')).toEqual({ numberOfPeriods: 2, periodMinutes: 10 });
  });

  it('uses 2 x 15 for football, whose source names no playing time', () => {
    expect(periodsForAgeGroup('U10', 'soccer')).toEqual(FALLBACK_PERIODS);
  });

  it('falls back to 2 x 15 when the age group is unknown', () => {
    expect(periodsForAgeGroup(undefined, undefined)).toEqual(FALLBACK_PERIODS);
    expect(periodsForAgeGroup('not an age', 'soccer')).toEqual(FALLBACK_PERIODS);
  });
});

describe('"Ei vielä pelattu" in New Game', () => {
  const TODAY = '2026-11-19';

  it('is OFF (played) by default for a game dated today', () => {
    expect(newGameIsPlayedDefault(TODAY, TODAY)).toBe(true);
  });

  it('is OFF for a past date', () => {
    expect(newGameIsPlayedDefault('2026-11-10', TODAY)).toBe(true);
  });

  /** A fixture booked ahead must not sit in the record as a 0-0 draw. */
  it('is ON (not played) for a future date', () => {
    expect(newGameIsPlayedDefault('2026-11-20', TODAY)).toBe(false);
  });
});
