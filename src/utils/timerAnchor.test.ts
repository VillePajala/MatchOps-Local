import { writeTimerAnchor, readTimerAnchor, clearTimerAnchor, STALE_ANCHOR_MS } from './timerAnchor';

describe('timerAnchor', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('round-trips a written anchor', () => {
    writeTimerAnchor('game-1', 42);
    const anchor = readTimerAnchor('game-1');
    expect(anchor).not.toBeNull();
    expect(anchor!.gameId).toBe('game-1');
    expect(anchor!.elapsedSeconds).toBe(42);
    expect(typeof anchor!.wallClockMs).toBe('number');
  });

  it('returns null when no anchor is set', () => {
    expect(readTimerAnchor('game-1')).toBeNull();
  });

  it('reading does not remove the anchor', () => {
    writeTimerAnchor('game-1', 10);
    readTimerAnchor('game-1');
    expect(readTimerAnchor('game-1')).not.toBeNull();
  });

  it('clears the anchor', () => {
    writeTimerAnchor('game-1', 10);
    clearTimerAnchor('game-1');
    expect(readTimerAnchor('game-1')).toBeNull();
    expect(window.localStorage.getItem('matchops_timer_anchor')).toBeNull();
  });

  it('ignores an empty gameId (no write)', () => {
    writeTimerAnchor('', 10);
    expect(readTimerAnchor('')).toBeNull();
    expect(window.localStorage.getItem('matchops_timer_anchor')).toBeNull();
  });

  it('returns null for malformed stored JSON', () => {
    window.localStorage.setItem('matchops_timer_anchor', '{not json');
    expect(readTimerAnchor('g')).toBeNull();
  });

  it('returns null when stored shape is invalid', () => {
    window.localStorage.setItem('matchops_timer_anchor', JSON.stringify({ gameId: 'g' }));
    expect(readTimerAnchor('g')).toBeNull();
  });

  it('overwrites the same game\'s previous anchor', () => {
    writeTimerAnchor('game-1', 5);
    writeTimerAnchor('game-1', 99);
    expect(readTimerAnchor('game-1')!.elapsedSeconds).toBe(99);
  });

  /**
   * Review 4.22: anchors are per game. Writing, reading or clearing one game's
   * anchor never touches another's, and one game's anchor is never returned for
   * another game.
   * @critical
   */
  it('keeps each game\'s anchor separate', () => {
    writeTimerAnchor('game-1', 5);
    writeTimerAnchor('game-2', 99);
    expect(readTimerAnchor('game-1')!.elapsedSeconds).toBe(5);
    expect(readTimerAnchor('game-2')!.elapsedSeconds).toBe(99);
    clearTimerAnchor('game-2');
    expect(readTimerAnchor('game-2')).toBeNull();
    expect(readTimerAnchor('game-1')!.elapsedSeconds).toBe(5);
    expect(readTimerAnchor('game-3')).toBeNull();
  });

  it('reads the pre-4.22 single-anchor format, for its own game only', () => {
    const NOW = Date.now();
    window.localStorage.setItem(
      'matchops_timer_anchor',
      JSON.stringify({ gameId: 'game-1', elapsedSeconds: 300, wallClockMs: NOW })
    );
    expect(readTimerAnchor('game-1')).toEqual({ gameId: 'game-1', elapsedSeconds: 300, wallClockMs: NOW });
    expect(readTimerAnchor('game-2')).toBeNull();
    writeTimerAnchor('game-2', 7); // upgrades the storage to the map, keeping game-1
    expect(readTimerAnchor('game-1')!.elapsedSeconds).toBe(300);
  });

  /**
   * An anchor older than the longest real match belongs to an abandoned game: it is
   * never returned (so it cannot jump that game's clock days later) and is dropped
   * from storage on the next write.
   * @edge-case
   */
  it('never returns an anchor older than the stale limit, and drops it on write', () => {
    const old = Date.now() - STALE_ANCHOR_MS - 1000;
    const recent = Date.now() - STALE_ANCHOR_MS + 60_000;
    window.localStorage.setItem('matchops_timer_anchor', JSON.stringify({
      old: { gameId: 'old', elapsedSeconds: 1, wallClockMs: old },
      recent: { gameId: 'recent', elapsedSeconds: 2, wallClockMs: recent },
    }));
    expect(readTimerAnchor('old')).toBeNull();
    expect(readTimerAnchor('recent')).not.toBeNull();
    writeTimerAnchor('game-1', 10);
    expect(window.localStorage.getItem('matchops_timer_anchor')).not.toContain('"old"');
    expect(readTimerAnchor('game-1')).not.toBeNull();
  });

  it('never returns a stale anchor in the legacy format', () => {
    window.localStorage.setItem('matchops_timer_anchor', JSON.stringify(
      { gameId: 'g', elapsedSeconds: 1, wallClockMs: Date.now() - STALE_ANCHOR_MS - 1000 }
    ));
    expect(readTimerAnchor('g')).toBeNull();
  });

  it('ignores a map entry stored under a different key than its gameId', () => {
    window.localStorage.setItem(
      'matchops_timer_anchor',
      JSON.stringify({ 'game-1': { gameId: 'game-2', elapsedSeconds: 1, wallClockMs: 1 } })
    );
    expect(readTimerAnchor('game-1')).toBeNull();
    expect(readTimerAnchor('game-2')).toBeNull();
  });
});
