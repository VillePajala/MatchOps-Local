/**
 * Review 8.1: the language chosen in Settings was not remembered (next launch was
 * back in Finnish), and the language controls disagreed after a change elsewhere.
 * @critical
 */
import { act, renderHook } from '@testing-library/react';
import i18n from '@/i18n';
import { changeAppLanguage, useAppLanguage } from '../useAppLanguage';

const LANGUAGE_PREF_KEY = 'matchops_language';

describe('useAppLanguage / changeAppLanguage', () => {
  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  });

  it('switching remembers the choice on the device', () => {
    act(() => changeAppLanguage('fi'));
    expect(i18n.language).toBe('fi');
    expect(localStorage.getItem(LANGUAGE_PREF_KEY)).toBe('fi');
  });

  it('every control follows a change made by another one', () => {
    const settings = renderHook(() => useAppLanguage());
    const home = renderHook(() => useAppLanguage());
    expect(home.result.current[0]).toBe('en');

    act(() => settings.result.current[1]('fi'));

    expect(settings.result.current[0]).toBe('fi');
    expect(home.result.current[0]).toBe('fi');
  });

  it('choosing the current language does nothing', () => {
    const spy = jest.spyOn(i18n, 'changeLanguage');
    act(() => changeAppLanguage(i18n.language));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
