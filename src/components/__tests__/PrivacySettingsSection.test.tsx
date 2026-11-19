/**
 * Settings -> Data "Error reporting and usage statistics": the one switch the
 * privacy policy points to for objection. On by default, saved per account,
 * applied to Sentry at once. Plus the copyable notice to families.
 * @critical
 */
import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PrivacySettingsSection from '../PrivacySettingsSection';
import type { AppSettings } from '@/types/settings';
import {
  isDiagnosticsEnabled,
  resetDiagnosticsPreferenceForTests,
} from '@/utils/diagnosticsPreference';

const showToast = jest.fn();
let stored: AppSettings;

jest.mock('@/contexts/ToastProvider', () => ({ useToast: () => ({ showToast }) }));
jest.mock('@/hooks/useDataStore', () => ({ useDataStore: () => ({ userId: 'user-1' }) }));
jest.mock('@/utils/appSettings', () => ({
  getAppSettings: jest.fn(async () => ({ ...stored })),
  updateAppSettings: jest.fn(async (patch: Partial<AppSettings>) => {
    stored = { ...stored, ...patch };
    return { ...stored };
  }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

import { updateAppSettings } from '@/utils/appSettings';

function renderSection() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PrivacySettingsSection />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  resetDiagnosticsPreferenceForTests();
  stored = { currentGameId: null };
});

describe('PrivacySettingsSection', () => {
  it('shows the switch on for an account that never chose', async () => {
    renderSection();
    const toggle = screen.getByTestId('diagnostics-enabled-toggle') as HTMLInputElement;
    await waitFor(() => expect(toggle).not.toBeDisabled());
    expect(toggle.checked).toBe(true);
    expect(isDiagnosticsEnabled()).toBe(true);
  });

  it('turning it off saves false to the account and stops Sentry at once', async () => {
    renderSection();
    const toggle = screen.getByTestId('diagnostics-enabled-toggle') as HTMLInputElement;
    await waitFor(() => expect(toggle).not.toBeDisabled());

    await act(async () => {
      fireEvent.click(toggle);
    });

    await waitFor(() => expect(toggle.checked).toBe(false));
    expect(updateAppSettings).toHaveBeenCalledWith({ diagnosticsEnabled: false }, 'user-1');
    expect(stored.diagnosticsEnabled).toBe(false);
    expect(isDiagnosticsEnabled()).toBe(false);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('an account that turned it off loads off and Sentry follows', async () => {
    stored = { currentGameId: null, diagnosticsEnabled: false };
    renderSection();
    const toggle = screen.getByTestId('diagnostics-enabled-toggle') as HTMLInputElement;
    await waitFor(() => expect(toggle.checked).toBe(false));
    expect(isDiagnosticsEnabled()).toBe(false);
  });

  /** @edge-case */
  it('a failed save shows an error and leaves Sentry as it was', async () => {
    (updateAppSettings as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    renderSection();
    const toggle = screen.getByTestId('diagnostics-enabled-toggle') as HTMLInputElement;
    await waitFor(() => expect(toggle).not.toBeDisabled());

    await act(async () => {
      fireEvent.click(toggle);
    });

    await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.any(String), 'error'));
    expect(isDiagnosticsEnabled()).toBe(true);
    expect(toggle.checked).toBe(true);
  });

  it('copies the notice to families', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderSection();

    await act(async () => {
      fireEvent.click(screen.getByTestId('copy-family-notice'));
    });

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Stockholm, Sweden'));
    expect(showToast).toHaveBeenCalledWith('Copied.', 'success');
  });
});
