import { renderHook } from '@testing-library/react';
import { useRecheckOnLeavingMatch } from '../useRecheckOnLeavingMatch';

/**
 * Leaving a match re-checks the start state in the BACKGROUND: the foreground check
 * raised the full-screen loading screen (and unmounted the app tree) on every exit.
 * @critical
 */
describe('useRecheckOnLeavingMatch', () => {
  const render = (check: jest.Mock) =>
    renderHook(({ screen }: { screen: 'start' | 'home' }) => useRecheckOnLeavingMatch(screen, check), {
      initialProps: { screen: 'start' as 'start' | 'home' },
    });

  it('does nothing on the start screen before any match was opened', () => {
    const check = jest.fn();
    render(check);
    expect(check).not.toHaveBeenCalled();
  });

  it('does nothing while the match is open', () => {
    const check = jest.fn();
    const { rerender } = render(check);
    rerender({ screen: 'home' });
    expect(check).not.toHaveBeenCalled();
  });

  it('re-checks in the background (no loading screen) on leaving the match', () => {
    const check = jest.fn();
    const { rerender } = render(check);
    rerender({ screen: 'home' });
    rerender({ screen: 'start' });
    expect(check).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledWith({ inBackground: true });
  });

  it('re-checks after every match, always in the background', () => {
    const check = jest.fn();
    const { rerender } = render(check);
    for (let i = 0; i < 3; i++) {
      rerender({ screen: 'home' });
      rerender({ screen: 'start' });
    }
    expect(check).toHaveBeenCalledTimes(3);
    for (const call of check.mock.calls) expect(call).toEqual([{ inBackground: true }]);
  });
});
