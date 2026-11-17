/**
 * Review 8.5 / 8.6: the stored language is applied after hydration (not at module
 * load, which made the client's first render differ from the server's), and
 * <html lang> follows the app language.
 */
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import i18n, { applyStoredLanguage } from '@/i18n';
import I18nInitializer from '../I18nInitializer';

jest.mock('@/i18n', () => ({
  ...jest.requireActual('@/i18n'),
  __esModule: true,
  applyStoredLanguage: jest.fn(),
}));

describe('I18nInitializer', () => {
  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage('en');
    });
    jest.mocked(applyStoredLanguage).mockClear();
  });

  it('applies the stored language from its effect, once', () => {
    render(<I18nInitializer><p>child</p></I18nInitializer>);
    expect(screen.getByText('child')).toBeInTheDocument();
    expect(applyStoredLanguage).toHaveBeenCalledTimes(1);
  });

  it('keeps <html lang> on the app language', async () => {
    render(<I18nInitializer><p>child</p></I18nInitializer>);
    expect(document.documentElement.lang).toBe('en');
    await act(async () => {
      await i18n.changeLanguage('fi');
    });
    expect(document.documentElement.lang).toBe('fi');
  });
});
