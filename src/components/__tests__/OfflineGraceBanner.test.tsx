/**
 * Tests for OfflineGraceBanner (auth grace period banner).
 *
 * jsdom does not load globals.css, so these tests cannot measure the real height.
 * They guard the inline style that defeats the global `body > div { height: 100% }`
 * rule; without it the banner was full-screen and blocked every tap offline. It must
 * be inline: a Tailwind class (layered) loses to the unlayered global rule.
 *
 * @module components/__tests__/OfflineGraceBanner
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import OfflineGraceBanner from '../OfflineGraceBanner';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

describe('OfflineGraceBanner', () => {
  it('shows the offline message', () => {
    render(<OfflineGraceBanner />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Offline — changes saved locally, will sync when connected',
    );
  });

  /**
   * Regression: the banner is a direct child of <body>, so without an explicit
   * height the global `body > div { height: 100% }` rule made it cover the whole
   * screen and swallow every tap (review 2026-11, item 1.1).
   * @critical
   */
  it('has an inline auto height so the global body > div rule cannot make it full-screen', () => {
    render(<OfflineGraceBanner />);
    const banner = screen.getByTestId('offline-grace-banner');
    expect(banner).toHaveClass('fixed', 'top-0');
    expect(banner.style.height).toBe('auto');
    expect(banner).not.toHaveClass('h-full');
    expect(banner).not.toHaveClass('h-screen');
    expect(banner).not.toHaveClass('inset-0');
    expect(banner).not.toHaveClass('bottom-0');
  });
});
