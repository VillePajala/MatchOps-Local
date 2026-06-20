import { writeTimerAnchor, readTimerAnchor, clearTimerAnchor } from './timerAnchor';

describe('timerAnchor', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('round-trips a written anchor', () => {
    writeTimerAnchor('game-1', 42);
    const anchor = readTimerAnchor();
    expect(anchor).not.toBeNull();
    expect(anchor!.gameId).toBe('game-1');
    expect(anchor!.elapsedSeconds).toBe(42);
    expect(typeof anchor!.wallClockMs).toBe('number');
  });

  it('returns null when no anchor is set', () => {
    expect(readTimerAnchor()).toBeNull();
  });

  it('clears the anchor', () => {
    writeTimerAnchor('game-1', 10);
    clearTimerAnchor();
    expect(readTimerAnchor()).toBeNull();
  });

  it('ignores an empty gameId (no write)', () => {
    writeTimerAnchor('', 10);
    expect(readTimerAnchor()).toBeNull();
  });

  it('returns null for malformed stored JSON', () => {
    window.localStorage.setItem('matchops_timer_anchor', '{not json');
    expect(readTimerAnchor()).toBeNull();
  });

  it('returns null when stored shape is invalid', () => {
    window.localStorage.setItem('matchops_timer_anchor', JSON.stringify({ gameId: 'g' }));
    expect(readTimerAnchor()).toBeNull();
  });

  it('overwrites a previous anchor', () => {
    writeTimerAnchor('game-1', 5);
    writeTimerAnchor('game-2', 99);
    const anchor = readTimerAnchor();
    expect(anchor!.gameId).toBe('game-2');
    expect(anchor!.elapsedSeconds).toBe(99);
  });
});
