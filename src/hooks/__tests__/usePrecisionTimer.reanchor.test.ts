/**
 * Unit tests for usePrecisionTimer.reanchor — the wall-clock re-anchor used on
 * return-from-background so the match clock keeps running without pausing.
 */
import { renderHook, act } from '@testing-library/react';
import { usePrecisionTimer } from '../usePrecisionTimer';

describe('usePrecisionTimer.reanchor', () => {
  let nowMs: number;

  beforeEach(() => {
    jest.useFakeTimers();
    nowMs = 0;
    jest.spyOn(performance, 'now').mockImplementation(() => nowMs);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('snaps a running timer to the given elapsed and continues from there', () => {
    const onTick = jest.fn();
    const { result } = renderHook(() =>
      usePrecisionTimer({ onTick, isRunning: true, startTime: 0, interval: 100 })
    );

    // 10s of real time elapses → tick reports 10
    act(() => { nowMs = 10_000; jest.advanceTimersByTime(100); });
    expect(onTick).toHaveBeenLastCalledWith(10);

    // Re-anchor to 130 (e.g. wall-clock truth after a background gap)
    act(() => { result.current.reanchor(130); });
    expect(onTick).toHaveBeenLastCalledWith(130);

    // 1 more second of real time → continues from 130, not from 10
    act(() => { nowMs = 11_000; jest.advanceTimersByTime(100); });
    expect(onTick).toHaveBeenLastCalledWith(131);
  });

  it('updates the starting offset when not running', () => {
    const onTick = jest.fn();
    const { result } = renderHook(() =>
      usePrecisionTimer({ onTick, isRunning: false, startTime: 0, interval: 100 })
    );

    act(() => { result.current.reanchor(55); });
    expect(onTick).toHaveBeenLastCalledWith(55);
  });

  /**
   * Review 4.25: performance.now() can stall while the phone sleeps. If the app never
   * saw itself hidden, nothing re-anchored and the clock stayed behind. The timer now
   * checks wall-clock time on every tick and snaps forward when it is > 2 s behind.
   * @critical
   */
  describe('wall-clock stall correction (review 4.25)', () => {
    const WALL0 = new Date('2026-11-16T10:00:00Z').getTime();

    it('snaps forward when the monotonic clock stalled while the wall clock moved on', () => {
      jest.setSystemTime(WALL0);
      const onTick = jest.fn();
      renderHook(() => usePrecisionTimer({ onTick, isRunning: true, startTime: 300, interval: 100 }));
      // The phone slept: 60 s of wall time, but performance.now() only moved 1 s.
      act(() => { nowMs = 1_000; jest.setSystemTime(WALL0 + 60_000); jest.advanceTimersByTime(100); });
      expect(onTick).toHaveBeenLastCalledWith(360);
      // ...and keeps counting normally from there.
      act(() => { nowMs = 2_000; jest.setSystemTime(WALL0 + 61_000); jest.advanceTimersByTime(100); });
      expect(onTick).toHaveBeenLastCalledWith(361);
    });

    it('never rewinds when the wall clock is stepped backwards', () => {
      jest.setSystemTime(WALL0);
      const onTick = jest.fn();
      renderHook(() => usePrecisionTimer({ onTick, isRunning: true, startTime: 300, interval: 100 }));
      act(() => { nowMs = 5_000; jest.setSystemTime(WALL0 - 60_000); jest.advanceTimersByTime(100); });
      expect(onTick).toHaveBeenLastCalledWith(305);
    });

    it('still catches a stall that follows a backward wall-clock step', () => {
      jest.setSystemTime(WALL0);
      const onTick = jest.fn();
      renderHook(() => usePrecisionTimer({ onTick, isRunning: true, startTime: 300, interval: 100 }));
      // Clock set an hour back at 05:05...
      act(() => { nowMs = 5_000; jest.setSystemTime(WALL0 - 3_600_000); jest.advanceTimersByTime(100); });
      expect(onTick).toHaveBeenLastCalledWith(305);
      // ...then the phone sleeps: 60 s of wall time, monotonic clock moves 1 s.
      act(() => { nowMs = 6_000; jest.setSystemTime(WALL0 - 3_600_000 + 60_000); jest.advanceTimersByTime(100); });
      expect(onTick).toHaveBeenLastCalledWith(365);
    });

    it('leaves a small difference alone (under the 2 s threshold)', () => {
      jest.setSystemTime(WALL0);
      const onTick = jest.fn();
      renderHook(() => usePrecisionTimer({ onTick, isRunning: true, startTime: 300, interval: 100 }));
      act(() => { nowMs = 5_000; jest.setSystemTime(WALL0 + 6_500); jest.advanceTimersByTime(100); });
      expect(onTick).toHaveBeenLastCalledWith(305);
    });
  });
});
