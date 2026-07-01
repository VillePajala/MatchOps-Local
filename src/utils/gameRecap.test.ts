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

const base: RecapGame = {
  teamName: 'Tigers',
  opponentName: 'Lions',
  gameDate: '2026-06-26',
  gameLocation: 'Central Park',
  ageGroup: 'U11',
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
    expect(text).toContain('Tigers 3-2 Lions (W)');
    expect(text).toContain('2026'); // meta line present
    expect(text).toContain('Central Park');
    expect(text).toContain('U11');
    // One name per line, count always shown; Liam (2) before Emma (1) by count.
    expect(text).toContain('Goals\nLiam 2\nEmma 1');
    // Noah assisted twice.
    expect(text).toContain('Assists\nNoah 2');
    expect(text).toContain("Match report:");
    expect(text).toContain('Great pressing in the second half.');
  });

  it('puts our goals first when away, and resolves a loss', () => {
    // Away: we are awayScore=1, opponent homeScore=4.
    const text = buildGameRecap({ ...base, homeOrAway: 'away', homeScore: 4, awayScore: 1 }, players, t);
    expect(text).toContain('Tigers 1-4 Lions (L)');
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
    expect(text).toContain('Tigers 2-2 Lions (W, on penalties)');
  });

  it('renders a plain draw with no shootout', () => {
    const text = buildGameRecap({ ...base, homeScore: 1, awayScore: 1 }, players, t);
    expect(text).toContain('Tigers 1-1 Lions (D)');
    expect(text).not.toContain('on penalties');
  });

  it('omits empty sections (no goals, no assists, no notes, missing venue/age)', () => {
    const text = buildGameRecap(
      { ...base, gameLocation: undefined, ageGroup: undefined, homeScore: 0, awayScore: 0, gameEvents: [] },
      players,
      t,
    );
    expect(text).toContain('Tigers 0-0 Lions (D)');
    expect(text).not.toContain('Goals');
    expect(text).not.toContain('Assists');
    expect(text).not.toContain("Match report:");
    expect(text).not.toContain('Central Park');
  });

  it('falls back to Unknown for a deleted scorer', () => {
    const text = buildGameRecap({ ...base, gameEvents: [goal('ghost')] }, players, t);
    expect(text).toContain('Goals\nUnknown 1');
  });
});
