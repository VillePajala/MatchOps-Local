import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import { useHorizontalSwipe, lockAxis, swipeDirection, isSwipeIgnoredTarget, SWIPE_DEFAULTS } from './useHorizontalSwipe';

/**
 * Home's tab swipe: what it accepts, and - just as important - everything it
 * refuses (edge gestures, scrolls, inputs, dialogs, sideways scrollers).
 */
function Area({ onLeft, onRight, enabled = true }: { onLeft: () => void; onRight: () => void; enabled?: boolean }) {
  const swipe = useHorizontalSwipe({ onSwipeLeft: onLeft, onSwipeRight: onRight, enabled });
  return (
    <div data-testid="area" {...swipe}>
      <p data-testid="text">content</p>
      <input data-testid="input" />
      <div role="dialog" data-testid="dialog"><span data-testid="in-dialog">x</span></div>
      <div role="tablist" data-testid="tablist" />
      <div data-testid="scroller" style={{ overflowX: 'auto' }}><span data-testid="in-scroller">wide</span></div>
      <div data-swipe-ignore="" data-testid="opted-out" />
    </div>
  );
}

const setup = (enabled = true) => {
  const onLeft = jest.fn();
  const onRight = jest.fn();
  render(<Area onLeft={onLeft} onRight={onRight} enabled={enabled} />);
  return { onLeft, onRight };
};

/** A one-finger gesture from (x0, y0) to (x1, y1), with a midway move. */
const gesture = (el: Element, [x0, y0]: [number, number], [x1, y1]: [number, number], opts: { moves?: Array<[number, number]> } = {}) => {
  fireEvent.touchStart(el, { touches: [{ clientX: x0, clientY: y0 }] });
  for (const [x, y] of opts.moves ?? [[(x0 + x1) / 2, (y0 + y1) / 2]]) {
    fireEvent.touchMove(el, { touches: [{ clientX: x, clientY: y }] });
  }
  fireEvent.touchEnd(el, { changedTouches: [{ clientX: x1, clientY: y1 }] });
};

describe('lockAxis', () => {
  it('stays unlocked inside the slop, then locks to the dominant axis', () => {
    expect(lockAxis(5, 3, 10)).toBeNull();
    expect(lockAxis(12, 4, 10)).toBe('x');
    expect(lockAxis(-12, 4, 10)).toBe('x');
    expect(lockAxis(4, 12, 10)).toBe('y');
    // A perfect diagonal is a scroll, not a swipe.
    expect(lockAxis(10, 10, 10)).toBe('y');
  });
});

describe('swipeDirection', () => {
  const opts = { minDistance: SWIPE_DEFAULTS.minDistance, ratio: SWIPE_DEFAULTS.ratio };
  it('needs more than the minimum distance', () => {
    expect(swipeDirection(-60, 0, opts)).toBeNull();
    expect(swipeDirection(-61, 0, opts)).toBe('left');
    expect(swipeDirection(61, 0, opts)).toBe('right');
  });
  it('needs to be clearly horizontal (|dx| > 1.5 x |dy|)', () => {
    expect(swipeDirection(-90, 60, opts)).toBeNull();
    expect(swipeDirection(-91, 60, opts)).toBe('left');
  });
});

describe('isSwipeIgnoredTarget', () => {
  it('ignores inputs, dialogs, tab lists and opted-out elements; not plain content', () => {
    setup();
    const area = screen.getByTestId('area');
    expect(isSwipeIgnoredTarget(screen.getByTestId('text'), area)).toBe(false);
    expect(isSwipeIgnoredTarget(screen.getByTestId('input'), area)).toBe(true);
    expect(isSwipeIgnoredTarget(screen.getByTestId('in-dialog'), area)).toBe(true);
    expect(isSwipeIgnoredTarget(screen.getByTestId('tablist'), area)).toBe(true);
    expect(isSwipeIgnoredTarget(screen.getByTestId('opted-out'), area)).toBe(true);
  });

  it('ignores a gesture inside an element that actually scrolls sideways', () => {
    setup();
    const area = screen.getByTestId('area');
    const scroller = screen.getByTestId('scroller');
    // Not overflowing yet: an overflow-x: auto box with nothing to scroll is plain content.
    expect(isSwipeIgnoredTarget(screen.getByTestId('in-scroller'), area)).toBe(false);
    Object.defineProperty(scroller, 'scrollWidth', { configurable: true, value: 600 });
    Object.defineProperty(scroller, 'clientWidth', { configurable: true, value: 300 });
    expect(isSwipeIgnoredTarget(screen.getByTestId('in-scroller'), area)).toBe(true);
  });
});

describe('useHorizontalSwipe', () => {
  it('a clear swipe left / right calls the matching handler once', () => {
    const { onLeft, onRight } = setup();
    const text = screen.getByTestId('text');
    gesture(text, [300, 300], [200, 310]);
    expect(onLeft).toHaveBeenCalledTimes(1);
    expect(onRight).not.toHaveBeenCalled();
    gesture(text, [200, 300], [300, 290]);
    expect(onRight).toHaveBeenCalledTimes(1);
  });

  it('ignores short or diagonal gestures', () => {
    const { onLeft, onRight } = setup();
    const text = screen.getByTestId('text');
    gesture(text, [300, 300], [250, 300]); // 50px: too short
    gesture(text, [300, 300], [200, 380], { moves: [[290, 302]] }); // 100 x 80: diagonal
    expect(onLeft).not.toHaveBeenCalled();
    expect(onRight).not.toHaveBeenCalled();
  });

  it('a gesture that locked vertical first never becomes a swipe, whatever it does after', () => {
    const { onLeft } = setup();
    // Starts as a scroll, then the finger drifts far sideways.
    gesture(screen.getByTestId('text'), [300, 300], [100, 330], { moves: [[300, 320], [100, 330]] });
    expect(onLeft).not.toHaveBeenCalled();
  });

  it('does nothing when the area scrolled during the gesture', () => {
    const { onLeft } = setup();
    const area = screen.getByTestId('area');
    fireEvent.touchStart(area, { touches: [{ clientX: 300, clientY: 300 }] });
    fireEvent.scroll(area);
    fireEvent.touchEnd(area, { changedTouches: [{ clientX: 150, clientY: 300 }] });
    expect(onLeft).not.toHaveBeenCalled();
  });

  it(`refuses gestures starting within ${SWIPE_DEFAULTS.edgeGuard}px of either screen edge`, () => {
    const { onLeft, onRight } = setup();
    const text = screen.getByTestId('text');
    const width = window.innerWidth;
    gesture(text, [SWIPE_DEFAULTS.edgeGuard - 1, 300], [200, 300]);
    gesture(text, [width - SWIPE_DEFAULTS.edgeGuard + 1, 300], [width - 200, 300]);
    expect(onRight).not.toHaveBeenCalled();
    expect(onLeft).not.toHaveBeenCalled();
    // Just inside the guard is fine.
    gesture(text, [SWIPE_DEFAULTS.edgeGuard, 300], [200, 300]);
    expect(onRight).toHaveBeenCalledTimes(1);
  });

  it.each(['input', 'in-dialog', 'tablist', 'opted-out'])('ignores a swipe starting on %s', (id) => {
    const { onLeft } = setup();
    gesture(screen.getByTestId(id), [300, 300], [100, 300]);
    expect(onLeft).not.toHaveBeenCalled();
  });

  it('ignores multi-finger and cancelled gestures', () => {
    const { onLeft } = setup();
    const text = screen.getByTestId('text');
    fireEvent.touchStart(text, { touches: [{ clientX: 300, clientY: 300 }, { clientX: 350, clientY: 300 }] });
    fireEvent.touchEnd(text, { changedTouches: [{ clientX: 100, clientY: 300 }] });
    fireEvent.touchStart(text, { touches: [{ clientX: 300, clientY: 300 }] });
    fireEvent.touchCancel(text);
    fireEvent.touchEnd(text, { changedTouches: [{ clientX: 100, clientY: 300 }] });
    expect(onLeft).not.toHaveBeenCalled();
  });

  it('is inert when disabled', () => {
    const { onLeft } = setup(false);
    gesture(screen.getByTestId('text'), [300, 300], [100, 300]);
    expect(onLeft).not.toHaveBeenCalled();
  });
});
