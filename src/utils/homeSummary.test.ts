import { buildHomeSummary, featuredCompetition, type HomeCompetition } from './homeSummary';
import { getClubSeasonForDate } from './clubSeason';
import type { SavedGamesCollection, AppState } from '@/types';

// Calendar-year club season so every 2024 date maps to one label.
const CAL = { clubSeasonStartDate: '2000-01-01', clubSeasonEndDate: '2000-12-31' };
const opts = { today: '2024-06-15', ...CAL, hasConfiguredSeasonDates: true };

const g = (o: Partial<AppState> = {}): AppState => ({
  teamName: 'Meidän', opponentName: 'Vastustaja', gameDate: '2024-06-01', homeOrAway: 'home',
  homeScore: 0, awayScore: 0, isPlayed: true, seasonId: '', tournamentId: '', teamId: '',
  selectedPlayerIds: [], assessments: {}, ...o,
} as AppState);

describe('buildHomeSummary — Vuosi record', () => {
  it('counts current club-season played games with W/D/L + goals', () => {
    const games: SavedGamesCollection = {
      win:  g({ gameDate: '2024-03-01', homeOrAway: 'home', homeScore: 3, awayScore: 1 }),
      draw: g({ gameDate: '2024-04-01', homeOrAway: 'away', homeScore: 2, awayScore: 2 }),
      loss: g({ gameDate: '2024-05-01', homeOrAway: 'away', homeScore: 3, awayScore: 1 }),
    };
    const { vuosi } = buildHomeSummary(games, opts);
    expect(vuosi).not.toBeNull();
    expect(vuosi!.label).toBe(getClubSeasonForDate('2024-06-15', CAL.clubSeasonStartDate, CAL.clubSeasonEndDate));
    expect(vuosi!.gamesPlayed).toBe(3);
    expect(vuosi!.wins).toBe(1);
    expect(vuosi!.ties).toBe(1);
    expect(vuosi!.losses).toBe(1);
    expect(vuosi!.goalsFor).toBe(6);
    expect(vuosi!.goalsAgainst).toBe(6);
  });

  it('excludes friendlies from the Vuosi record', () => {
    const games: SavedGamesCollection = {
      comp:     g({ gameDate: '2024-03-01', homeScore: 1, awayScore: 0 }),
      friendly: g({ gameDate: '2024-03-05', isFriendly: true, homeScore: 5, awayScore: 0 }),
    };
    const { vuosi } = buildHomeSummary(games, opts);
    expect(vuosi!.gamesPlayed).toBe(1);
    expect(vuosi!.goalsFor).toBe(1);
  });

  it('excludes out-of-season and unplayed games from the record', () => {
    const games: SavedGamesCollection = {
      inSeason: g({ gameDate: '2024-03-01', homeScore: 1, awayScore: 0 }),
      lastYear: g({ gameDate: '2023-03-01', homeScore: 9, awayScore: 0 }),
      unplayed: g({ gameDate: '2024-04-01', isPlayed: false }),
    };
    const { vuosi } = buildHomeSummary(games, opts);
    expect(vuosi!.gamesPlayed).toBe(1);
  });

  it('hides the Vuosi bar until season dates are configured', () => {
    const { vuosi } = buildHomeSummary({ a: g() }, { ...opts, hasConfiguredSeasonDates: false });
    expect(vuosi).toBeNull();
  });

  it('excludes the unsaved_game scratch entry from vuosi, recent, and resume', () => {
    const games: SavedGamesCollection = {
      real: g({ gameDate: '2024-03-01', homeScore: 1, awayScore: 0 }),
      unsaved_game: g({ gameDate: '2024-04-01', homeScore: 9, awayScore: 0 }),
    };
    const { vuosi, recent, resume } = buildHomeSummary(games, { ...opts, recentLimit: 10, currentGameId: 'unsaved_game' });
    expect(vuosi!.gamesPlayed).toBe(1);            // scratch not counted
    expect(recent.map((r) => r.id)).toEqual(['real']); // scratch not in the strip
    expect(resume).toBeNull();                     // scratch id never becomes a resume card
  });
});

describe('buildHomeSummary — resume card', () => {
  it('builds the resume card from currentGameId (score from our perspective)', () => {
    const games: SavedGamesCollection = {
      cur: g({ opponentName: 'FC Inter', homeOrAway: 'away', homeScore: 1, awayScore: 2, isPlayed: false }),
    };
    const { resume } = buildHomeSummary(games, { ...opts, currentGameId: 'cur' });
    expect(resume).not.toBeNull();
    expect(resume!.opponent).toBe('FC Inter');
    expect(resume!.ourScore).toBe(2);   // away perspective
    expect(resume!.theirScore).toBe(1);
    expect(resume!.isPlayed).toBe(false);
  });

  it('is null when there is no current game', () => {
    expect(buildHomeSummary({ a: g() }, { ...opts, currentGameId: null }).resume).toBeNull();
    expect(buildHomeSummary({ a: g() }, { ...opts, currentGameId: 'missing' }).resume).toBeNull();
  });
});

describe('buildHomeSummary — counts + top scorer (phase 2)', () => {
  it('passes through entity counts', () => {
    const { counts } = buildHomeSummary({ a: g() }, {
      ...opts,
      roster: [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }] as never,
      teamsCount: 3, personnelCount: 2, seasonsCount: 4, tournamentsCount: 1,
    });
    expect(counts).toEqual({ players: 2, teams: 3, personnel: 2, seasons: 4, tournaments: 1 });
  });

  it('counts default to 0 when collections are absent', () => {
    expect(buildHomeSummary({ a: g() }, opts).counts).toEqual({ players: 0, teams: 0, personnel: 0, seasons: 0, tournaments: 0 });
  });

  it('countsReady is false in the fast build (no roster) and true once enriched', () => {
    // Drives the empty-state no-flash guard: hints only render once real counts
    // are loaded, so an existing user never sees "add your players" mid-load.
    expect(buildHomeSummary({ a: g() }, opts).countsReady).toBe(false);
    // Roster supplied (even empty) marks the enriched build - counts are real.
    expect(buildHomeSummary({ a: g() }, { ...opts, roster: [] as never }).countsReady).toBe(true);
  });
});

/** Tilastot's "Joukkueet" card (owner, 2026-11-21): the hero's games per team. */
describe('buildHomeSummary - team records', () => {
  const games: SavedGamesCollection = {
    a1: g({ teamId: 'teamA', teamName: 'Kotkat P12', gameDate: '2024-03-01', homeScore: 3, awayScore: 1 }),
    a2: g({ teamId: 'teamA', teamName: 'Kotkat P12', gameDate: '2024-03-08', homeOrAway: 'away', homeScore: 2, awayScore: 2 }),
    a3: g({ teamId: 'teamA', teamName: 'Kotkat P12', gameDate: '2024-03-15', homeScore: 0, awayScore: 1 }),
    b1: g({ teamId: 'teamB', teamName: 'Kotkat T11', gameDate: '2024-03-02', homeScore: 4, awayScore: 0 }),
    // Not in the record: a friendly, an unplayed fixture, last season.
    bFriendly: g({ teamId: 'teamB', gameDate: '2024-03-03', isFriendly: true, homeScore: 9, awayScore: 0 }),
    bUnplayed: g({ teamId: 'teamB', gameDate: '2024-04-03', isPlayed: false }),
    bOld: g({ teamId: 'teamB', gameDate: '2023-03-03', homeScore: 5, awayScore: 0 }),
  };

  /** @critical */
  it('gives each team its record, goal difference and last results, newest first', () => {
    const { teamRecords } = buildHomeSummary(games, opts);
    expect(teamRecords).toHaveLength(2);
    const [a, b] = teamRecords!;
    expect(a).toMatchObject({
      teamId: 'teamA', fallbackName: 'Kotkat P12',
      gamesPlayed: 3, wins: 1, ties: 1, losses: 1, goalsFor: 5, goalsAgainst: 4, goalDifference: 1,
      form: ['L', 'D', 'W'],
    });
    expect(b).toMatchObject({ teamId: 'teamB', gamesPlayed: 1, wins: 1, goalDifference: 4, form: ['W'] });
  });

  it('adds up to the hero record', () => {
    const { vuosi, teamRecords } = buildHomeSummary(games, opts);
    expect(teamRecords!.reduce((n, r) => n + r.gamesPlayed, 0)).toBe(vuosi!.gamesPlayed);
  });

  it('orders by most games, then name', () => {
    const tied: SavedGamesCollection = {
      z: g({ teamId: 'z', teamName: 'Zeta', gameDate: '2024-03-01' }),
      a: g({ teamId: 'a', teamName: 'Alfa', gameDate: '2024-03-02' }),
      m1: g({ teamId: 'm', teamName: 'Myy', gameDate: '2024-03-03' }),
      m2: g({ teamId: 'm', teamName: 'Myy', gameDate: '2024-03-04' }),
    };
    expect(buildHomeSummary(tied, opts).teamRecords!.map((r) => r.teamId)).toEqual(['m', 'a', 'z']);
  });

  it('keeps only the last five results', () => {
    const many: SavedGamesCollection = Object.fromEntries(
      Array.from({ length: 7 }, (_, i) => [`m${i}`, g({ teamId: 't', gameDate: `2024-03-0${i + 1}`, homeScore: i, awayScore: 0 })]),
    );
    // Newest (i = 6..2) all wins; the oldest (0-0) is cut off.
    expect(buildHomeSummary(many, opts).teamRecords![0].form).toEqual(['W', 'W', 'W', 'W', 'W']);
  });

  it('follows the team scope: one team in scope, with its home / away split', () => {
    const { teamRecords, homeAway } = buildHomeSummary(games, { ...opts, teamFilter: 'teamA' });
    expect(teamRecords!.map((r) => r.teamId)).toEqual(['teamA']);
    expect(homeAway!.home).toMatchObject({ gamesPlayed: 2, wins: 1, losses: 1, goalDifference: 1 });
    expect(homeAway!.away).toMatchObject({ gamesPlayed: 1, ties: 1, goalDifference: 0 });
  });

  it('is empty without season config or games', () => {
    expect(buildHomeSummary(games, { ...opts, hasConfiguredSeasonDates: false }).teamRecords).toEqual([]);
    expect(buildHomeSummary({}, opts).teamRecords).toEqual([]);
    expect(buildHomeSummary({}, opts).homeAway).toBeNull();
  });
});

describe('buildHomeSummary — recent strip', () => {
  it('newest first, played only, excludes undated', () => {
    const games: SavedGamesCollection = {
      old:      g({ gameDate: '2024-01-01' }),
      mid:      g({ gameDate: '2024-05-01' }),
      recent:   g({ gameDate: '2024-06-01' }),
      unplayed: g({ gameDate: '2024-07-01', isPlayed: false }),
      undated:  g({ gameDate: '' }),
    };
    const { recent } = buildHomeSummary(games, { ...opts, recentLimit: 10 });
    expect(recent.map(r => r.id)).toEqual(['recent', 'mid', 'old']);
  });

  it('includes friendlies in recent (history is fine to show in full)', () => {
    const games: SavedGamesCollection = {
      friendly: g({ gameDate: '2024-06-01', isFriendly: true }),
    };
    const { recent } = buildHomeSummary(games, opts);
    expect(recent).toHaveLength(1);
    expect(recent[0].isFriendly).toBe(true);
  });

  it('respects the recent limit', () => {
    const games: SavedGamesCollection = {};
    // Finished matches: a match dated today or later with nothing recorded is
    // still ahead of the coach (R2), not part of the recent strip.
    for (let i = 1; i <= 8; i++) games['g' + i] = g({ gameDate: `2024-0${i % 9 || 1}-15`, gameStatus: 'gameEnd' });
    const { recent } = buildHomeSummary(games, { ...opts, recentLimit: 6 });
    expect(recent).toHaveLength(6);
  });
});

/**
 * @critical - the owner runs one team per competition, so an unscoped Home
 * added several squads together: a goal difference for teams that never played
 * each other, and a top scorer who out-scored teammates he never had.
 */
describe('buildHomeSummary - scoped to one team', () => {
  const games: SavedGamesCollection = {
    a1: g({ teamId: 'teamA', gameDate: '2024-03-01', homeScore: 3, awayScore: 1 }),
    a2: g({ teamId: 'teamA', gameDate: '2024-03-08', homeScore: 2, awayScore: 0 }),
    b1: g({ teamId: 'teamB', gameDate: '2024-04-01', homeScore: 0, awayScore: 5 }),
    old: g({ gameDate: '2024-04-05', homeScore: 1, awayScore: 1 }),
  };

  it('counts only that team when one is chosen', () => {
    const { vuosi } = buildHomeSummary(games, { ...opts, teamFilter: 'teamA' });
    expect(vuosi!.gamesPlayed).toBe(2);
    expect(vuosi!.wins).toBe(2);
    expect(vuosi!.goalsFor).toBe(5);
    expect(vuosi!.goalsAgainst).toBe(1);
  });

  it('counts every team when none is chosen, as before', () => {
    const { vuosi } = buildHomeSummary(games, { ...opts, teamFilter: 'all' });
    expect(vuosi!.gamesPlayed).toBe(4);
  });

  it('defaults to every team when the caller says nothing', () => {
    expect(buildHomeSummary(games, opts).vuosi!.gamesPlayed).toBe(4);
  });

  it('treats legacy as the games that name no team', () => {
    const { vuosi } = buildHomeSummary(games, { ...opts, teamFilter: 'legacy' });
    expect(vuosi!.gamesPlayed).toBe(1);
    expect(vuosi!.ties).toBe(1);
  });

  it('scopes the recent strip to the same team, not just the record', () => {
    const { recent } = buildHomeSummary(games, { ...opts, teamFilter: 'teamA' });
    expect(recent).toHaveLength(2);
    expect(recent.every((r) => ['a1', 'a2'].includes(r.id))).toBe(true);
  });
});

describe('buildHomeSummary — player count', () => {
  it('counts only active players (archived ones have left the squad)', () => {
    const { counts } = buildHomeSummary({}, {
      ...opts,
      roster: [
        { id: 'a', name: 'Aino' },
        { id: 'b', name: 'Eetu' },
        { id: 'c', name: 'Left Club', archived: true },
      ],
    });
    expect(counts.players).toBe(2);
  });
});

describe('buildHomeSummary - record of a season with no games yet', () => {
  // Autumn-to-spring club season starting 1 Aug: "26/27" opens on 2026-08-01.
  const SPAN = { clubSeasonStartDate: '2000-08-01', clubSeasonEndDate: '2000-07-31' };
  const spanOpts = { today: '2026-09-01', ...SPAN, hasConfiguredSeasonDates: true };
  const lastSeason: SavedGamesCollection = {
    w1: g({ gameDate: '2025-10-01', homeScore: 2, awayScore: 0 }),
    w2: g({ gameDate: '2026-03-01', homeScore: 1, awayScore: 0 }),
    d1: g({ gameDate: '2026-04-01', homeScore: 1, awayScore: 1 }),
    l1: g({ gameDate: '2026-05-01', homeScore: 0, awayScore: 3 }),
  };

  it('shows the previous season, under its own label, while the current one has no game', () => {
    const { vuosi } = buildHomeSummary(lastSeason, spanOpts);
    expect(vuosi!.label).toBe('25/26');
    expect(vuosi!.wins).toBe(2);
    expect(vuosi!.ties).toBe(1);
    expect(vuosi!.losses).toBe(1);
  });

  it('switches to the current season as soon as it has a played game', () => {
    const games = { ...lastSeason, now: g({ gameDate: '2026-08-20', homeScore: 4, awayScore: 0 }) };
    const { vuosi } = buildHomeSummary(games, spanOpts);
    expect(vuosi!.label).toBe('26/27');
    expect(vuosi!.gamesPlayed).toBe(1);
  });

  it('does not switch on an unplayed or friendly game only', () => {
    const games = {
      ...lastSeason,
      fixture: g({ gameDate: '2026-08-20', isPlayed: false }),
      friendly: g({ gameDate: '2026-08-22', isFriendly: true, homeScore: 5, awayScore: 0 }),
    };
    expect(buildHomeSummary(games, spanOpts).vuosi!.label).toBe('25/26');
  });

  it('keeps the current season (0-0-0) when the previous one has no games either', () => {
    const { vuosi } = buildHomeSummary({ old: g({ gameDate: '2023-10-01' }) }, spanOpts);
    expect(vuosi!.label).toBe('26/27');
    expect(vuosi!.gamesPlayed).toBe(0);
  });

  it('works for calendar-year seasons too', () => {
    const { vuosi } = buildHomeSummary(
      { a: g({ gameDate: '2023-05-01', homeScore: 1, awayScore: 0 }) },
      { today: '2024-01-10', ...CAL, hasConfiguredSeasonDates: true },
    );
    expect(vuosi!.label).toBe('2023');
    expect(vuosi!.wins).toBe(1);
  });
});

/** Kilpailut's cards (owner, 2026-11-19). */
describe('buildHomeSummary - competitions', () => {
  it('builds the active leagues and tournaments with their matches and goals, newest first', () => {
    const games: SavedGamesCollection = {
      a: g({ seasonId: 's-new', gameEvents: [
        { id: 'e1', type: 'goal', time: 1 },
        { id: 'e2', type: 'opponentGoal', time: 2 },
      ] } as Partial<AppState>),
      b: g({ seasonId: 's-new', isPlayed: false }),
      c: g({ tournamentId: 't1', gameEvents: [{ id: 'e3', type: 'goal', time: 1 }] } as Partial<AppState>),
    };
    const summary = buildHomeSummary(games, {
      ...opts,
      seasons: [
        { id: 's-old', name: 'Old', startDate: '2023-01-01' },
        { id: 's-new', name: 'New', startDate: '2024-01-01', clubSeason: '2024', gender: 'boys' },
        { id: 's-arch', name: 'Archived', archived: true },
      ],
      tournaments: [{ id: 't1', name: 'Cup', series: [{ id: 'x', level: 'Elite' }] }],
    });
    expect(summary.competitions!.seasons.map((c) => [c.id, c.games, c.goals])).toEqual([
      ['s-new', 2, 1],
      ['s-old', 0, 0],
    ]);
    expect(summary.competitions!.seasons[0]).toMatchObject({ name: 'New', clubSeason: '2024', gender: 'boys' });
    expect(summary.competitions!.tournaments).toEqual([
      expect.objectContaining({ id: 't1', name: 'Cup', series: [{ id: 'x', level: 'Elite' }], games: 1, goals: 1 }),
    ]);
  });

  it('leaves competitions unknown until the lists are supplied', () => {
    expect(buildHomeSummary({}, opts).competitions).toBeUndefined();
  });
});

describe('featuredCompetition (Kilpailut row subtitles)', () => {
  const c = (id: string, startDate?: string, endDate?: string): HomeCompetition =>
    ({ id, name: id, startDate, endDate, games: 0, goals: 0 });
  const today = '2026-11-19';

  it('league: the one running today, else the latest started, else the first listed', () => {
    // activeCompetitions order: newest start first, undated last.
    expect(featuredCompetition([c('next', '2027-01-01'), c('now', '2026-08-01', '2027-05-31'), c('old', '2025-08-01', '2026-05-31')], 'season', today)?.id).toBe('now');
    expect(featuredCompetition([c('next', '2027-01-01'), c('old', '2025-08-01', '2026-05-31')], 'season', today)?.id).toBe('old');
    // No end date: a started league is still running.
    expect(featuredCompetition([c('open', '2026-01-01'), c('older', '2025-01-01')], 'season', today)?.id).toBe('open');
    expect(featuredCompetition([c('next', '2027-01-01'), c('undated')], 'season', today)?.id).toBe('next');
    expect(featuredCompetition([], 'season', today)).toBeNull();
  });

  it('tournament: the one on today, else the NEAREST one ahead, else the most recent', () => {
    const later = c('later', '2027-03-15');
    const nearest = c('nearest', '2027-02-28');
    const past = c('past', '2026-10-01');
    expect(featuredCompetition([later, nearest, past], 'tournament', today)?.id).toBe('nearest');
    expect(featuredCompetition([later, nearest, c('on', '2026-11-18', '2026-11-20'), past], 'tournament', today)?.id).toBe('on');
    expect(featuredCompetition([later, nearest, c('oneDay', today), past], 'tournament', today)?.id).toBe('oneDay');
    expect(featuredCompetition([past, c('older', '2026-01-01')], 'tournament', today)?.id).toBe('past');
    expect(featuredCompetition([c('undated')], 'tournament', today)?.id).toBe('undated');
  });

  it('is part of the summary once the lists are supplied', () => {
    const summary = buildHomeSummary({}, {
      today,
      seasons: [{ id: 's1', name: 'Sarja', startDate: '2026-08-01' }],
      tournaments: [{ id: 't1', name: 'Cup', startDate: '2027-02-28' }],
    });
    expect(summary.competitions!.featuredSeason?.id).toBe('s1');
    expect(summary.competitions!.featuredTournament?.id).toBe('t1');
  });
});
