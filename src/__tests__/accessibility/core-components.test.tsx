/**
 * @jest-environment jsdom
 */

/**
 * Accessibility tests for static pages and offline content
 * @critical - Ensures WCAG compliance for Play Store release
 *
 * Note: Complex component tests are in tests/accessibility/a11y-simple.test.tsx
 * This file focuses on static pages that can be tested without mocking state
 */

import React from 'react';
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

// Extend Jest matchers
expect.extend(toHaveNoViolations);

describe('Accessibility: Static Pages', () => {
  describe('Privacy Policy Page', () => {
    it('should have no accessibility violations', async () => {
      const PrivacyPolicy = (await import('@/app/privacy-policy/page')).default;

      const { container } = render(<PrivacyPolicy />);

      const results = await axe(container);
      // Type assertion needed because jest-axe extends Jest matchers at runtime
      (expect(results) as jest.JestMatchers<unknown> & { toHaveNoViolations: () => void }).toHaveNoViolations();
    });

    it('should have proper heading hierarchy', async () => {
      const PrivacyPolicy = (await import('@/app/privacy-policy/page')).default;

      const { container } = render(<PrivacyPolicy />);

      const h1 = container.querySelector('h1');
      const h2s = container.querySelectorAll('h2');

      expect(h1).toBeInTheDocument();
      expect(h2s.length).toBeGreaterThan(0);
    });
  });

  describe('Terms of Service Page', () => {
    it('should have no accessibility violations', async () => {
      const Terms = (await import('@/app/terms/page')).default;

      const { container } = render(<Terms />);

      const results = await axe(container);
      // Type assertion needed because jest-axe extends Jest matchers at runtime
      (expect(results) as jest.JestMatchers<unknown> & { toHaveNoViolations: () => void }).toHaveNoViolations();
    });

    it('should have proper heading hierarchy', async () => {
      const Terms = (await import('@/app/terms/page')).default;

      const { container } = render(<Terms />);

      const h1 = container.querySelector('h1');
      const h2s = container.querySelectorAll('h2');

      expect(h1).toBeInTheDocument();
      expect(h2s.length).toBeGreaterThan(0);
    });
  });
});

describe('Accessibility: Offline Page Structure', () => {
  it('offline.html should have essential accessibility attributes', () => {
    const fs = require('fs');
    const path = require('path');

    const offlinePath = path.join(process.cwd(), 'public', 'offline.html');
    const offlineContent = fs.readFileSync(offlinePath, 'utf8');

    // Language attribute (flexible quote matching)
    expect(offlineContent).toMatch(/lang=["']en["']/);

    // Image with alt text
    expect(offlineContent).toMatch(/alt=["']MatchOps["']/);

    // Interactive button element
    expect(offlineContent).toMatch(/<button[^>]*>/);

    // Heading structure
    expect(offlineContent).toMatch(/<h1[^>]*>/);

    // Viewport meta tag for mobile accessibility
    expect(offlineContent).toMatch(/name=["']viewport["']/);
    expect(offlineContent).toMatch(/width=device-width/);
  });
});

describe('Accessibility: Color Contrast', () => {
  // WCAG 2.1 contrast ratio requirements:
  // - AA Normal text (< 18pt): 4.5:1
  // - AAA Normal text: 7:1
  const WCAG_AA_NORMAL = 4.5;
  const WCAG_AAA_NORMAL = 7;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const tinycolor = require('tinycolor2');

  // App color palette - primary text colors on dark backgrounds
  const colors = {
    bgPrimary: '#1e293b', // slate-800
    bgSecondary: '#334155', // slate-700
    textPrimary: '#f8fafc', // slate-50
    textSecondary: '#cbd5e1', // slate-300
    textMuted: '#94a3b8', // slate-400
  };

  it('should meet WCAG AA contrast for text on dark backgrounds', () => {
    // These are the critical text/background combinations
    const ratio1 = tinycolor.readability(colors.bgPrimary, colors.textPrimary);
    const ratio2 = tinycolor.readability(colors.bgPrimary, colors.textSecondary);
    const ratio3 = tinycolor.readability(colors.bgPrimary, colors.textMuted);

    expect(ratio1).toBeGreaterThanOrEqual(WCAG_AA_NORMAL); // ~12.6:1
    expect(ratio2).toBeGreaterThanOrEqual(WCAG_AA_NORMAL); // ~7.5:1
    expect(ratio3).toBeGreaterThanOrEqual(WCAG_AA_NORMAL); // ~4.6:1
  });

  it('should meet WCAG AAA contrast for primary text', () => {
    const ratio = tinycolor.readability(colors.bgPrimary, colors.textPrimary);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AAA_NORMAL); // ~12.6:1
  });
});
