/**
 * @jest-environment jsdom
 * @critical - this decides whether to reload the app out from under the coach.
 * Getting the guards wrong means either a reload loop or a match interrupted
 * mid-game.
 */
import { claimReloadAttempt, clearReloadOnce } from '../reloadApp';
import { setMatchTimerRunning } from '../matchTimerSignal';
import { setRecordingSessionActive } from '../recordingSessionSignal';

jest.mock('../logger', () => ({
  __esModule: true,
  default: { debug: jest.fn(), log: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

beforeEach(() => {
  sessionStorage.clear();
  setMatchTimerRunning(false);
  setRecordingSessionActive(false);
});

describe('claimReloadAttempt', () => {
  it('grants the attempt the first time a reason is raised', () => {
    expect(claimReloadAttempt('cloudHydration')).toBe(true);
  });

  /** Without this, a failure that survives the reload reloads forever. */
  it('refuses a second attempt for the same reason', () => {
    claimReloadAttempt('cloudHydration');

    expect(claimReloadAttempt('cloudHydration')).toBe(false);
  });

  it('keeps separate reasons independent', () => {
    claimReloadAttempt('cloudHydration');

    expect(claimReloadAttempt('somethingElse')).toBe(true);
  });

  /** A background concern must never throw away the live match view. */
  it('refuses while a match clock is running', () => {
    setMatchTimerRunning(true);

    expect(claimReloadAttempt('cloudHydration')).toBe(false);
  });

  it('refuses while a recording is in progress', () => {
    setRecordingSessionActive(true);

    expect(claimReloadAttempt('cloudHydration')).toBe(false);
  });

  /** A suppressed reload must not silently burn the one attempt. */
  it('still has its attempt once the match ends', () => {
    setMatchTimerRunning(true);
    claimReloadAttempt('cloudHydration');
    setMatchTimerRunning(false);

    expect(claimReloadAttempt('cloudHydration')).toBe(true);
  });

  /**
   * If the attempt cannot be recorded it cannot be limited either, and an
   * unbounded reload loop is worse than the failure being recovered from.
   */
  it('refuses when session storage cannot be written', () => {
    const setItem = jest.spyOn(window.sessionStorage, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });

    expect(claimReloadAttempt('cloudHydration')).toBe(false);

    setItem.mockRestore();
  });
});

describe('clearReloadOnce', () => {
  it('gives the attempt back so a later failure can still recover', () => {
    claimReloadAttempt('cloudHydration');
    clearReloadOnce('cloudHydration');

    expect(claimReloadAttempt('cloudHydration')).toBe(true);
  });

  it('is harmless for a reason that was never raised', () => {
    expect(() => clearReloadOnce('neverHappened')).not.toThrow();
  });
});
