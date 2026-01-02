import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '../i18n.test';
import UpdateBanner from './UpdateBanner';

const defaultProps = {
  phase: 'available' as const,
  onInstall: jest.fn(),
  onReload: jest.fn(),
  onDismiss: jest.fn(),
};

describe('UpdateBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders release notes when provided in available phase', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <UpdateBanner {...defaultProps} notes="Some fixes" />
      </I18nextProvider>
    );
    expect(screen.getByText('Some fixes')).toBeInTheDocument();
  });

  it('does not render notes when not provided', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <UpdateBanner {...defaultProps} />
      </I18nextProvider>
    );
    expect(screen.queryByText('Some fixes')).not.toBeInTheDocument();
  });

  it('hides banner when dismissed', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <UpdateBanner {...defaultProps} />
      </I18nextProvider>
    );
    const button = screen.getByRole('button', { name: /dismiss/i });
    fireEvent.click(button);
    expect(defaultProps.onDismiss).toHaveBeenCalled();
  });

  describe('phase states', () => {
    it('shows install button in available phase', () => {
      render(
        <I18nextProvider i18n={i18n}>
          <UpdateBanner {...defaultProps} phase="available" />
        </I18nextProvider>
      );
      // Button text varies by language - "Install Update" (en) or "Asenna päivitys" (fi)
      const button = screen.getByRole('button', { name: /install|asenna/i });
      expect(button).not.toBeDisabled();
      fireEvent.click(button);
      expect(defaultProps.onInstall).toHaveBeenCalled();
    });

    it('shows disabled installing button in installing phase', () => {
      render(
        <I18nextProvider i18n={i18n}>
          <UpdateBanner {...defaultProps} phase="installing" />
        </I18nextProvider>
      );
      const button = screen.getByRole('button', { name: /installing|asennetaan/i });
      expect(button).toBeDisabled();
    });

    it('shows reload button in ready phase', () => {
      render(
        <I18nextProvider i18n={i18n}>
          <UpdateBanner {...defaultProps} phase="ready" />
        </I18nextProvider>
      );
      const button = screen.getByRole('button', { name: /reload|lataa/i });
      expect(button).not.toBeDisabled();
      fireEvent.click(button);
      expect(defaultProps.onReload).toHaveBeenCalled();
    });

    it('does not show release notes in ready phase', () => {
      render(
        <I18nextProvider i18n={i18n}>
          <UpdateBanner {...defaultProps} phase="ready" notes="Some fixes" />
        </I18nextProvider>
      );
      expect(screen.queryByText('Some fixes')).not.toBeInTheDocument();
    });
  });
});
