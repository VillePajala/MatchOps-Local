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
});
