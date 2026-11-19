import { useCallback, useMemo, useRef, type TouchEvent } from 'react';

/**
 * A deliberate horizontal swipe on an area: Home's tab content uses it to move
 * to the previous / next tab.
 *
 * WHAT IT REFUSES, on purpose - a swipe that fires when the coach meant
 * something else is worse than no swipe at all:
 * - gestures starting within `edgeGuard` px of either screen edge (Android's
 *   back gesture lives there);
 * - gestures starting inside inputs, dialogs / sheets, tab lists, sliders,
 *   anything marked `data-swipe-ignore`, or an element that scrolls sideways;
 * - a gesture that locks VERTICAL first (the coach is scrolling), or during
 *   which the area scrolled at all;
 * - anything short or diagonal: it needs |dx| > `minDistance` AND
 *   |dx| > `ratio` x |dy|, decided when the finger lifts.
 * Only single-finger touch counts; a mouse drag never swipes.
 */
export interface HorizontalSwipeOptions {
  /** The finger moved LEFT (content pulled towards the next item). */
  onSwipeLeft?: () => void;
  /** The finger moved RIGHT (towards the previous item). */
  onSwipeRight?: () => void;
  enabled?: boolean;
  /** No swipe may start this close to either screen edge (px). */
  edgeGuard?: number;
  /** The horizontal travel a swipe needs (px). */
  minDistance?: number;
  /** How much more horizontal than vertical it must be. */
  ratio?: number;
  /** Travel after which the gesture's axis is locked (px). */
  lockSlop?: number;
}

export const SWIPE_DEFAULTS = { edgeGuard: 24, minDistance: 60, ratio: 1.5, lockSlop: 10 } as const;

/** Where a swipe may not start. */
export const SWIPE_IGNORE_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[role="tablist"]',
  '[role="slider"]',
  '[data-swipe-ignore]',
].join(', ');

function scrollsSideways(el: Element): boolean {
  if (el.scrollWidth <= el.clientWidth + 1) return false;
  const overflowX = window.getComputedStyle(el).overflowX;
  return overflowX === 'auto' || overflowX === 'scroll';
}

/**
 * True when a gesture starting on `target` must not become a swipe. Walks up to
 * (not including) `boundary`, the swipe area itself, looking for sideways scrollers.
 */
export function isSwipeIgnoredTarget(target: EventTarget | null, boundary: Element | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest(SWIPE_IGNORE_SELECTOR)) return true;
  for (let el: Element | null = target; el && el !== boundary; el = el.parentElement) {
    if (scrollsSideways(el)) return true;
  }
  return false;
}

type Axis = 'x' | 'y' | null;

interface Gesture {
  x: number;
  y: number;
  axis: Axis;
  scrolled: boolean;
}

/** The axis a gesture locks to once it has travelled `lockSlop`, else null. */
export function lockAxis(dx: number, dy: number, lockSlop: number): Axis {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < lockSlop) return null;
  return Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
}

/** The swipe a finished gesture makes, or null. */
export function swipeDirection(
  dx: number,
  dy: number,
  opts: { minDistance: number; ratio: number },
): 'left' | 'right' | null {
  if (Math.abs(dx) <= opts.minDistance) return null;
  if (Math.abs(dx) <= opts.ratio * Math.abs(dy)) return null;
  return dx < 0 ? 'left' : 'right';
}

export function useHorizontalSwipe({
  onSwipeLeft,
  onSwipeRight,
  enabled = true,
  edgeGuard = SWIPE_DEFAULTS.edgeGuard,
  minDistance = SWIPE_DEFAULTS.minDistance,
  ratio = SWIPE_DEFAULTS.ratio,
  lockSlop = SWIPE_DEFAULTS.lockSlop,
}: HorizontalSwipeOptions) {
  const gesture = useRef<Gesture | null>(null);

  const onTouchStart = useCallback((e: TouchEvent<HTMLElement>) => {
    gesture.current = null;
    if (!enabled || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const width = window.innerWidth;
    if (touch.clientX < edgeGuard || touch.clientX > width - edgeGuard) return;
    if (isSwipeIgnoredTarget(e.target, e.currentTarget)) return;
    gesture.current = { x: touch.clientX, y: touch.clientY, axis: null, scrolled: false };
  }, [enabled, edgeGuard]);

  const onTouchMove = useCallback((e: TouchEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g) return;
    if (e.touches.length !== 1) {
      gesture.current = null;
      return;
    }
    if (g.axis === null) {
      const touch = e.touches[0];
      g.axis = lockAxis(touch.clientX - g.x, touch.clientY - g.y, lockSlop);
    }
    // Locked vertical: the coach is scrolling. Nothing this gesture does is a swipe.
    if (g.axis === 'y') gesture.current = null;
  }, [lockSlop]);

  const onTouchEnd = useCallback((e: TouchEvent<HTMLElement>) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.scrolled || g.axis === 'y') return;
    const touch = e.changedTouches[0];
    if (!touch) return;
    const dir = swipeDirection(touch.clientX - g.x, touch.clientY - g.y, { minDistance, ratio });
    if (dir === 'left') onSwipeLeft?.();
    else if (dir === 'right') onSwipeRight?.();
  }, [minDistance, ratio, onSwipeLeft, onSwipeRight]);

  const onTouchCancel = useCallback(() => {
    gesture.current = null;
  }, []);

  /** Attach to the swipe area's scroll: a gesture during which it scrolled was a scroll. */
  const onScroll = useCallback(() => {
    if (gesture.current) gesture.current.scrolled = true;
  }, []);

  return useMemo(
    () => ({ onTouchStart, onTouchMove, onTouchEnd, onTouchCancel, onScroll }),
    [onTouchStart, onTouchMove, onTouchEnd, onTouchCancel, onScroll],
  );
}
