import { renderHook, act } from '@testing-library/react';
import { useRememberedListSetting, isBoolean, isOneOf } from '../useRememberedListSetting';

/** Review 7.L10: list settings are remembered on this device between visits. */
describe('useRememberedListSetting', () => {
  beforeEach(() => localStorage.clear());

  it('starts at the default, remembers a change for the next visit', () => {
    const first = renderHook(() => useRememberedListSetting('x.toggle', false, isBoolean));
    expect(first.result.current[0]).toBe(false);
    act(() => first.result.current[1]((v) => !v));
    expect(first.result.current[0]).toBe(true);
    first.unmount();

    const second = renderHook(() => useRememberedListSetting('x.toggle', false, isBoolean));
    expect(second.result.current[0]).toBe(true);
  });

  it('falls back to the default for a stored value that no longer fits', () => {
    localStorage.setItem('matchops_list_x.sort', JSON.stringify('byShoeSize'));
    const { result } = renderHook(() => useRememberedListSetting('x.sort', 'date', isOneOf('date', 'opponent')));
    expect(result.current[0]).toBe('date');
  });

  it('reads the other setting when the key changes', () => {
    localStorage.setItem('matchops_list_comp.season', JSON.stringify(true));
    const { result, rerender } = renderHook(({ k }) => useRememberedListSetting(k, false, isBoolean), {
      initialProps: { k: 'comp.tournament' },
    });
    expect(result.current[0]).toBe(false);
    rerender({ k: 'comp.season' });
    expect(result.current[0]).toBe(true);
  });

  it('two toggles in a row both count', () => {
    const { result } = renderHook(() => useRememberedListSetting('x.twice', false, isBoolean));
    act(() => {
      result.current[1]((v) => !v);
      result.current[1]((v) => !v);
    });
    expect(result.current[0]).toBe(false);
    expect(localStorage.getItem('matchops_list_x.twice')).toBe('false');
  });

  it('survives unreadable storage', () => {
    localStorage.setItem('matchops_list_x.broken', '{not json');
    const { result } = renderHook(() => useRememberedListSetting('x.broken', true, isBoolean));
    expect(result.current[0]).toBe(true);
  });
});
