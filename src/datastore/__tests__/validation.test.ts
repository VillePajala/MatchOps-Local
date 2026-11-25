import { validateGame, normalizeReportText, withNormalizedReportText } from '../validation';
import { ValidationError } from '@/interfaces/DataStoreErrors';
import { VALIDATION_LIMITS } from '@/config/validationLimits';
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

/**
 * The league / tournament report text (migration 068), shared by both stores.
 * @edge-case
 */
describe('normalizeReportText', () => {
  it('keeps the text exactly as written', () => {
    expect(normalizeReportText('  Yleiskuva:\nHyvä. ', 'Season')).toBe('  Yleiskuva:\nHyvä. ');
  });

  it.each([undefined, null, '', '   \n'])('reads %p as no report', (value) => {
    expect(normalizeReportText(value, 'Tournament')).toBeUndefined();
  });

  it('accepts the cap and rejects one over it', () => {
    const max = VALIDATION_LIMITS.GAME_NOTES_MAX;
    expect(normalizeReportText('x'.repeat(max), 'Season')).toHaveLength(max);
    expect(() => normalizeReportText('x'.repeat(max + 1), 'Season')).toThrow(ValidationError);
  });

  it('drops a blank report as a key, not as reportText: undefined', () => {
    expect(withNormalizedReportText({ id: 's', name: 'S', reportText: ' ' }, 'Season')).toStrictEqual({ id: 's', name: 'S' });
    expect(withNormalizedReportText({ id: 's', name: 'S', reportText: 'T' }, 'Season')).toStrictEqual({ id: 's', name: 'S', reportText: 'T' });
  });
});
