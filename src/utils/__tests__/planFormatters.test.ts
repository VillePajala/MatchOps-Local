import { formatMMSS, gameDurationSec } from '../planFormatters';
import type { AppState } from '@/types/game';

describe('formatMMSS', () => {
  it.each([
    [0, '0:00'],
    [9, '0:09'],
    [60, '1:00'],
    [125, '2:05'],
    [3599, '59:59'],
    [3600, '60:00'],
  ])('formats %i seconds as "%s"', (sec, expected) => {
    expect(formatMMSS(sec)).toBe(expected);
  });

  it('floors fractional seconds', () => {
    expect(formatMMSS(125.9)).toBe('2:05');
  });

  it('clamps negative inputs to "0:00"', () => {
    expect(formatMMSS(-30)).toBe('0:00');
    expect(formatMMSS(-1)).toBe('0:00');
  });
});

describe('gameDurationSec', () => {
  const game = (overrides: Partial<AppState> = {}): AppState =>
    overrides as AppState;

  it('multiplies periods × minutes × 60', () => {
    expect(
      gameDurationSec(
        game({ numberOfPeriods: 2, periodDurationMinutes: 25 }),
      ),
    ).toBe(3000);
  });

  it('falls back to 2 periods × 10 min when fields are missing', () => {
    // Legacy games saved before periods/minutes were always present.
    expect(gameDurationSec(game())).toBe(1200);
  });

  it('clamps negative results to 0 (not currently reachable but defensive)', () => {
    // Math.max guard. AppState's numberOfPeriods is typed `1 | 2`, so
    // a negative value can't ship from any sane code path; cast
    // around the type to exercise the runtime clamp explicitly.
    const corrupt = {
      numberOfPeriods: -1,
      periodDurationMinutes: 10,
    } as unknown as AppState;
    expect(gameDurationSec(corrupt)).toBe(0);
  });

  it('returns 0 when either field is 0', () => {
    const zeroPeriods = {
      numberOfPeriods: 0,
      periodDurationMinutes: 10,
    } as unknown as AppState;
    const zeroMinutes = {
      numberOfPeriods: 2,
      periodDurationMinutes: 0,
    } as unknown as AppState;
    expect(gameDurationSec(zeroPeriods)).toBe(0);
    expect(gameDurationSec(zeroMinutes)).toBe(0);
  });
});
