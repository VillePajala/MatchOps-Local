import { buildHomeSummary } from './homeSummary';
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
    for (let i = 1; i <= 8; i++) games['g' + i] = g({ gameDate: `2024-0${i % 9 || 1}-15` });
    const { recent } = buildHomeSummary(games, { ...opts, recentLimit: 6 });
    expect(recent).toHaveLength(6);
  });
});
