import { act, renderHook } from '@testing-library/react';
import { useLaunchPullGate, LAUNCH_PULL_MAX_WAIT_MS } from '../useLaunchPullGate';

/**
 * A match opened before the launch-time cloud pull kept the stale copy and its first
 * autosave overwrote the newer version (review 3.5). The match waits while the pull is
 * pending - and never forever.
 * @critical
 */
describe('useLaunchPullGate', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const render = (initial: { wants: boolean; checkDone: boolean }) =>
    renderHook(({ wants, checkDone }) => useLaunchPullGate(wants, checkDone), { initialProps: initial });

  it('holds the match while the launch check runs and while the pull runs, then releases it', () => {
    const { result, rerender } = render({ wants: true, checkDone: false });
    expect(result.current.matchWaits).toBe(true);
    // The pull is marked as started in the same step that releases the check.
    act(() => {
      result.current.pullStarted();
      rerender({ wants: true, checkDone: true });
    });
    expect(result.current.matchWaits).toBe(true);
    act(() => result.current.pullFinished());
    expect(result.current.matchWaits).toBe(false);
  });

  it('releases the match when the launch check ends without starting a pull', () => {
    const { result, rerender } = render({ wants: true, checkDone: false });
    rerender({ wants: true, checkDone: true });
    expect(result.current.matchWaits).toBe(false);
  });

  it('never holds Start/Home - only a match that wants to open', () => {
    const { result } = render({ wants: false, checkDone: false });
    expect(result.current.matchWaits).toBe(false);
  });

  it('gives up after the cap, counted from when the match starts waiting', () => {
    const { result, rerender } = render({ wants: false, checkDone: false });
    act(() => { result.current.pullStarted(); });
    // The coach stays on Start well past the cap while the pull runs...
    act(() => { jest.advanceTimersByTime(LAUNCH_PULL_MAX_WAIT_MS * 3); });
    // ...and is still held on opening a match.
    rerender({ wants: true, checkDone: true });
    expect(result.current.matchWaits).toBe(true);
    act(() => { jest.advanceTimersByTime(LAUNCH_PULL_MAX_WAIT_MS - 1); });
    expect(result.current.matchWaits).toBe(true);
    act(() => { jest.advanceTimersByTime(1); });
    expect(result.current.matchWaits).toBe(false);
  });
  /** The resume-time pull that replaced the 5-minute reload (loading-speed stage 1). */
  describe('rearm', () => {
    it('holds a match opened during a later pull, then releases it when that pull ends', () => {
      const { result, rerender } = render({ wants: false, checkDone: true });
      // Launch finished long ago without a pull.
      expect(result.current.matchWaits).toBe(false);

      act(() => { result.current.rearm(); });
      rerender({ wants: true, checkDone: true });
      expect(result.current.matchWaits).toBe(true);

      act(() => { result.current.pullFinished(); });
      expect(result.current.matchWaits).toBe(false);
    });

    it('also after a launch pull that already ended', () => {
      const { result, rerender } = render({ wants: false, checkDone: true });
      act(() => { result.current.pullStarted(); });
      act(() => { result.current.pullFinished(); });

      act(() => { result.current.rearm(); });
      rerender({ wants: true, checkDone: true });
      expect(result.current.matchWaits).toBe(true);
    });

    it('keeps the cap, counted afresh, even when an earlier wait used it up', () => {
      const { result, rerender } = render({ wants: true, checkDone: false });
      act(() => { result.current.pullStarted(); rerender({ wants: true, checkDone: true }); });
      act(() => { jest.advanceTimersByTime(LAUNCH_PULL_MAX_WAIT_MS); });
      expect(result.current.matchWaits).toBe(false); // the launch wait expired
      rerender({ wants: false, checkDone: true });

      act(() => { result.current.rearm(); });
      rerender({ wants: true, checkDone: true });
      expect(result.current.matchWaits).toBe(true);
      act(() => { jest.advanceTimersByTime(LAUNCH_PULL_MAX_WAIT_MS); });
      expect(result.current.matchWaits).toBe(false);
    });
  });
});
