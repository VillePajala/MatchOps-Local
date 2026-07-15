/**
 * The planner field's canvas backdrop: paints the LIVE field's exact pitch
 * (shared painters), repaints on resize coalesced through rAF, skips
 * identical sizes, and cleans up its observer on unmount.
 */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import PlanFieldBackdrop from './PlanFieldBackdrop';
import { drawFieldBackground, drawFieldMarkings } from '@/utils/fieldDrawing';

jest.mock('@/utils/fieldDrawing', () => ({
  drawFieldBackground: jest.fn(),
  drawFieldMarkings: jest.fn(),
}));

const mockedBackground = drawFieldBackground as jest.MockedFunction<typeof drawFieldBackground>;
const mockedMarkings = drawFieldMarkings as jest.MockedFunction<typeof drawFieldMarkings>;

// jsdom has no 2D context - stub it so the paint path runs.
const fakeCtx = { scale: jest.fn() } as unknown as CanvasRenderingContext2D;

// One controllable ResizeObserver instance per test.
let observerCallback: (() => void) | null = null;
const observeSpy = jest.fn();
const disconnectSpy = jest.fn();
class FakeResizeObserver {
  constructor(cb: () => void) {
    observerCallback = cb;
  }
  observe = observeSpy;
  disconnect = disconnectSpy;
}

describe('PlanFieldBackdrop', () => {
  let parentRect: { width: number; height: number };
  let rafQueue: FrameRequestCallback[] = [];
  // Real rAF is async: queue callbacks and flush them like a frame boundary.
  const flushFrame = () => {
    const queue = rafQueue;
    rafQueue = [];
    queue.forEach((cb) => cb(0));
  };

  beforeEach(() => {
    jest.clearAllMocks();
    observerCallback = null;
    parentRect = { width: 300, height: 400 };
    (globalThis as Record<string, unknown>).ResizeObserver = FakeResizeObserver;
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeCtx);
    jest
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        return { ...parentRect, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
      });
    rafQueue = [];
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (globalThis as Record<string, unknown>).ResizeObserver;
  });

  const renderBackdrop = () =>
    render(
      <div style={{ width: 300, height: 400 }}>
        <PlanFieldBackdrop />
      </div>,
    );

  it('paints the LIVE pitch (both shared painters) at the container size', () => {
    renderBackdrop();
    expect(screen.getByTestId('plan-field-backdrop')).toHaveAttribute('aria-hidden', 'true');
    expect(mockedBackground).toHaveBeenCalledTimes(1);
    expect(mockedMarkings).toHaveBeenCalledTimes(1);
    const [, w, h] = mockedBackground.mock.calls[0];
    expect(w).toBe(300);
    expect(h).toBe(400);
    expect(observeSpy).toHaveBeenCalledTimes(1);
  });

  it('skips repaints for identical sizes; repaints when the size changes', () => {
    renderBackdrop();
    expect(mockedBackground).toHaveBeenCalledTimes(1);

    // Observer fires with an UNCHANGED size: no extra paint work.
    act(() => {
      observerCallback?.();
      flushFrame();
    });
    expect(mockedBackground).toHaveBeenCalledTimes(1);

    // The container actually resized: one repaint at the new size. A burst of
    // observer fires coalesces into ONE scheduled frame.
    parentRect = { width: 320, height: 426 };
    act(() => {
      observerCallback?.();
      observerCallback?.();
      flushFrame();
    });
    expect(mockedBackground).toHaveBeenCalledTimes(2);
    const [, w] = mockedBackground.mock.calls[1];
    expect(w).toBe(320);
  });

  it('disconnects the observer on unmount', () => {
    const { unmount } = renderBackdrop();
    unmount();
    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });

  it('stays inert without a 2D context (jsdom safety)', () => {
    (HTMLCanvasElement.prototype.getContext as jest.Mock).mockReturnValue(null);
    expect(() => renderBackdrop()).not.toThrow();
    expect(mockedBackground).not.toHaveBeenCalled();
  });
});
