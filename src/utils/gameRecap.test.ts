import { buildGameRecap, type RecapGame } from './gameRecap';
import type { Player } from '@/types';
import type { GameEvent } from '@/types/game';

// English-fallback translate (mirrors t(key, fallback)).
const t = (_key: string, fallback: string) => fallback;

const players: Player[] = [
  { id: 'p1', name: 'Liam Smith', nickname: 'Liam' },
  { id: 'p2', name: 'Emma Jones' }, // no nickname -> first name
  { id: 'p3', name: 'Noah Brown', nickname: 'Noah' },
];

const goal = (scorerId?: string, assisterId?: string, time = 0): GameEvent => ({
  id: `e${Math.random()}`,
  type: 'goal',
  time,
  scorerId,
  assisterId,
});

const opp = (time: number): GameEvent => ({ id: `o${time}`, type: 'opponentGoal', time });

const base: RecapGame = {
  teamName: 'Tigers',
  opponentName: 'Lions',
  gameDate: '2026-06-26',
  gameLocation: 'Central Park',
  homeScore: 3,
  awayScore: 2,
  homeOrAway: 'home',
  gameEvents: [],
  gameNotes: '',
};

describe('buildGameRecap', () => {
  it('renders header, meta, goals, assists and coach notes', () => {
    const game: RecapGame = {
      ...base,
      gameEvents: [goal('p1', 'p3'), goal('p1'), goal('p2', 'p3')],
      gameNotes: 'Great pressing in the second half.',
    };
    const text = buildGameRecap(game, players, t);
    // Header: score line, then date and location each on their own line (no age group).
    expect(text).toContain('Tigers 3-2 Lions\n26.6.2026\nCentral Park');
    expect(text).not.toContain('U11');
    // One name per line, count always shown; Liam (2) before Emma (1) by count.
    expect(text).toContain('Goals:\nLiam 2\nEmma 1');
    // Noah assisted twice.
    expect(text).toContain('Assists:\nNoah 2');
    expect(text).toContain("Match report:");
    expect(text).toContain('Great pressing in the second half.');
  });

  it('puts our goals first when away, and resolves a loss', () => {
    // Away: we are awayScore=1, opponent homeScore=4.
    const text = buildGameRecap({ ...base, homeOrAway: 'away', homeScore: 4, awayScore: 1 }, players, t);
    expect(text).toContain('Tigers 1-4 Lions');
  });

  it('marks a level score decided by a shootout as a penalty win', () => {
    const text = buildGameRecap(
      {
        ...base,
        homeScore: 2,
        awayScore: 2,
        homeOrAway: 'home',
        shootoutKicks: [
          { id: 'k1', team: 'home', scored: true, order: 1 },
          { id: 'k2', team: 'away', scored: false, order: 2 },
        ],
      },
      players,
      t,
    );
    expect(text).toContain('Tigers 2-2 Lions (Win, on penalties)');
  });

  /** Review 11.1 (owner 2026-11-17): the extra-time score is shown beside the final one. */
  it('shows the extra-time score separately, and with a shootout after it', () => {
    const structure = { numberOfPeriods: 2, periodDurationMinutes: 25, extraTimePeriods: 2, extraTimeMinutes: 15 };
    const won = buildGameRecap({
      ...base, ...structure, homeScore: 3, awayScore: 2,
      gameEvents: [goal('p1', undefined, 600), opp(900), goal('p2', undefined, 2000), opp(2500), goal('p1', undefined, 3300)],
    }, players, t);
    expect(won).toContain('Tigers 3-2 Lions (extra time 1-0)');
    // A score the goal log does not account for gets no extra-time score.
    const typedIn = buildGameRecap({ ...base, ...structure, homeScore: 3, awayScore: 2, gameEvents: [goal('p1', undefined, 3300)] }, players, t);
    expect(typedIn).toContain('Tigers 3-2 Lions');
    expect(typedIn).not.toContain('extra time');
    const shootout = buildGameRecap({
      ...base, ...structure, homeScore: 2, awayScore: 2,
      gameEvents: [goal('p1', undefined, 600), opp(900), goal('p2', undefined, 2000), opp(2500)],
      shootoutKicks: [
        { id: 'k1', team: 'home', scored: true, order: 1 },
        { id: 'k2', team: 'away', scored: false, order: 2 },
      ],
    }, players, t);
    expect(shootout).toContain('Tigers 2-2 Lions (extra time 0-0, Win, on penalties)');
    // No extra time, no extra-time score.
    expect(buildGameRecap({ ...base, numberOfPeriods: 2, periodDurationMinutes: 25 }, players, t)).not.toContain('extra time');
  });

  it('renders a plain draw with no shootout', () => {
    const text = buildGameRecap({ ...base, homeScore: 1, awayScore: 1 }, players, t);
    expect(text).toContain('Tigers 1-1 Lions');
    expect(text).not.toContain('on penalties');
  });

  it('omits empty sections (no goals, no assists, no notes, missing venue/age)', () => {
    const text = buildGameRecap(
      { ...base, gameLocation: undefined, homeScore: 0, awayScore: 0, gameEvents: [] },
      players,
      t,
    );
    expect(text).toContain('Tigers 0-0 Lions');
    expect(text).not.toContain('Goals');
    expect(text).not.toContain('Assists');
    expect(text).not.toContain("Match report:");
    expect(text).not.toContain('Central Park');
  });

  it('falls back to Unknown for a deleted scorer', () => {
    const text = buildGameRecap({ ...base, gameEvents: [goal('ghost')] }, players, t);
    expect(text).toContain('Goals:\nUnknown 1');
  });

  it('renders a position-keyed lineup (back-to-front), multi-position and multi-player', () => {
    // Emma (p2) played CB and RB; Liam (p1) and Noah (p3) both up top at ST.
    const game: RecapGame = { ...base, playerPositions: { p1: ['st'], p2: ['cb', 'rb'], p3: ['st'] } };
    const text = buildGameRecap(game, players, t);
    // Order is back-to-front (RB before CB before ST); Emma appears under both her
    // positions; ST lists both players, sorted by name.
    expect(text).toContain('Lineup:\nRB: Emma\nCB: Emma\nST: Liam, Noah');
  });

  it('omits the lineup block when no positions are assigned', () => {
    expect(buildGameRecap({ ...base, playerPositions: {} }, players, t)).not.toContain('Lineup');
    expect(buildGameRecap({ ...base }, players, t)).not.toContain('Lineup');
  });
});
