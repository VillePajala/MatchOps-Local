import { validateGame } from '../validation';
import { ValidationError } from '@/interfaces/DataStoreErrors';
import type { AppState } from '@/types';

const baseGame = {
  teamName: 'Test Team',
  opponentName: 'Opponent',
  gameDate: '2024-01-15',
  homeOrAway: 'home' as const,
  numberOfPeriods: 2 as const,
  periodDurationMinutes: 10,
  currentPeriod: 1,
  gameStatus: 'inProgress' as const,
  homeScore: 0,
  awayScore: 0,
  gameNotes: '',
  showPlayerNames: true,
  playersOnField: [],
  availablePlayers: [],
  selectedPlayerIds: [],
  gameEvents: [],
} as unknown as AppState;

const note = (text: unknown) => ({ id: 'n1', type: 'note' as const, time: 10, period: 1, text, source: 'dictation' as const });

describe('validateGame - Kirjuri note events (migration 041)', () => {
  it('accepts a note with text', () => {
    expect(() => validateGame({ ...baseGame, gameEvents: [note('hieno syöttö')] } as AppState)).not.toThrow();
  });

  /** @critical - the DB CHECK would otherwise fail the whole game save. */
  it('rejects a note without text', () => {
    expect(() => validateGame({ ...baseGame, gameEvents: [note('   ')] } as AppState)).toThrow(ValidationError);
    expect(() => validateGame({ ...baseGame, gameEvents: [note(undefined)] } as AppState)).toThrow(ValidationError);
  });

  it('rejects an over-long note', () => {
    expect(() => validateGame({ ...baseGame, gameEvents: [note('x'.repeat(1001))] } as AppState)).toThrow(/1000/);
  });

  it('ignores text rules for other event types', () => {
    const goal = { id: 'g1', type: 'goal' as const, time: 10, scorerId: 'p1' };
    expect(() => validateGame({ ...baseGame, gameEvents: [goal] } as AppState)).not.toThrow();
  });
});
