/**
 * Tests for MarketingConsentPrompt component.
 *
 * Covers:
 * - Returns null when showMarketingPrompt is false
 * - Returns null during the 5-second render delay
 * - Renders after the 5-second delay elapses
 * - Accept button calls setMarketingConsent(true) then dismissMarketingPrompt()
 * - Decline button calls setMarketingConsent(false) then dismissMarketingPrompt()
 * - Dismiss (X) button calls dismissMarketingPrompt() only
 * - Buttons are disabled during submission
 *
 * @integration - AuthProvider interaction, timer-based rendering
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import MarketingConsentPrompt from '../MarketingConsentPrompt';
import { useAuth } from '@/contexts/AuthProvider';

// Mock the auth context
jest.mock('@/contexts/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

// Mock logger to suppress warning output in tests
jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

describe('MarketingConsentPrompt', () => {
  const mockSetMarketingConsent = jest.fn().mockResolvedValue({});
  const mockDismissMarketingPrompt = jest.fn();

  const defaultMockAuth = {
    user: null,
    session: null,
    isAuthenticated: true,
    isLoading: false,
    mode: 'cloud' as const,
    needsReConsent: false,
    initTimedOut: false,
    isSigningOut: false,
    signIn: jest.fn(),
    signUp: jest.fn(),
    signOut: jest.fn(),
    resetPassword: jest.fn(),
    recordConsent: jest.fn(),
    acceptReConsent: jest.fn(),
    deleteAccount: jest.fn(),
    retryAuthInit: jest.fn(),
    showMarketingPrompt: false,
    setMarketingConsent: mockSetMarketingConsent,
    dismissMarketingPrompt: mockDismissMarketingPrompt,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockUseAuth.mockReturnValue(defaultMockAuth);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns null when showMarketingPrompt is false', () => {
    mockUseAuth.mockReturnValue({
      ...defaultMockAuth,
      showMarketingPrompt: false,
    });

    const { container } = render(<MarketingConsentPrompt />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null during the 5-second delay even when showMarketingPrompt is true', () => {
    mockUseAuth.mockReturnValue({
      ...defaultMockAuth,
      showMarketingPrompt: true,
    });

    const { container } = render(<MarketingConsentPrompt />);

    // Advance less than 5 seconds
    act(() => {
      jest.advanceTimersByTime(4999);
    });

    expect(container.firstChild).toBeNull();
  });

  it('renders the prompt after the 5-second delay', () => {
    mockUseAuth.mockReturnValue({
      ...defaultMockAuth,
      showMarketingPrompt: true,
    });

    render(<MarketingConsentPrompt />);

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(screen.getByText('Stay in the loop?')).toBeInTheDocument();
    expect(screen.getByText(/Get occasional product updates/)).toBeInTheDocument();
  });

  it('renders accept and decline buttons after delay', () => {
    mockUseAuth.mockReturnValue({
      ...defaultMockAuth,
      showMarketingPrompt: true,
    });

    render(<MarketingConsentPrompt />);

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(screen.getByRole('button', { name: /Yes, keep me updated/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /No thanks/i })).toBeInTheDocument();
  });

  it('calls setMarketingConsent(true) then dismissMarketingPrompt when Accept is clicked', async () => {
    mockSetMarketingConsent.mockResolvedValue({});
    mockUseAuth.mockReturnValue({
      ...defaultMockAuth,
      showMarketingPrompt: true,
      setMarketingConsent: mockSetMarketingConsent,
      dismissMarketingPrompt: mockDismissMarketingPrompt,
    });

    render(<MarketingConsentPrompt />);

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    const acceptButton = screen.getByRole('button', { name: /Yes, keep me updated/i });

    await act(async () => {
      fireEvent.click(acceptButton);
    });

    await waitFor(() => {
      expect(mockSetMarketingConsent).toHaveBeenCalledWith(true);
      expect(mockDismissMarketingPrompt).toHaveBeenCalled();
    });
  });

  it('calls setMarketingConsent(false) then dismissMarketingPrompt when Decline is clicked', async () => {
    mockSetMarketingConsent.mockResolvedValue({});
    mockUseAuth.mockReturnValue({
      ...defaultMockAuth,
      showMarketingPrompt: true,
      setMarketingConsent: mockSetMarketingConsent,
      dismissMarketingPrompt: mockDismissMarketingPrompt,
    });

    render(<MarketingConsentPrompt />);

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    const declineButton = screen.getByRole('button', { name: /No thanks/i });

    await act(async () => {
      fireEvent.click(declineButton);
    });

    await waitFor(() => {
      expect(mockSetMarketingConsent).toHaveBeenCalledWith(false);
      expect(mockDismissMarketingPrompt).toHaveBeenCalled();
    });
  });

  it('calls dismissMarketingPrompt only (no consent recorded) when X button is clicked', async () => {
    mockUseAuth.mockReturnValue({
      ...defaultMockAuth,
      showMarketingPrompt: true,
      setMarketingConsent: mockSetMarketingConsent,
      dismissMarketingPrompt: mockDismissMarketingPrompt,
    });

    render(<MarketingConsentPrompt />);

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    const closeButton = screen.getByRole('button', { name: /Close/i });

    await act(async () => {
      fireEvent.click(closeButton);
    });

    expect(mockDismissMarketingPrompt).toHaveBeenCalled();
    expect(mockSetMarketingConsent).not.toHaveBeenCalled();
  });

  it('disables all buttons during submission', async () => {
    // Create a promise that we can control to keep isSubmitting true
    let resolveConsent: (value: { error?: string }) => void;
    const consentPromise = new Promise<{ error?: string }>((resolve) => {
      resolveConsent = resolve;
    });
    const controlledSetConsent = jest.fn().mockReturnValue(consentPromise);

    mockUseAuth.mockReturnValue({
      ...defaultMockAuth,
      showMarketingPrompt: true,
      setMarketingConsent: controlledSetConsent,
      dismissMarketingPrompt: mockDismissMarketingPrompt,
    });

    render(<MarketingConsentPrompt />);

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    const acceptButton = screen.getByRole('button', { name: /Yes, keep me updated/i });
    const declineButton = screen.getByRole('button', { name: /No thanks/i });
    const closeButton = screen.getByRole('button', { name: /Close/i });

    // Click accept to trigger submission
    await act(async () => {
      fireEvent.click(acceptButton);
    });

    // All buttons should be disabled while submission is in progress
    expect(acceptButton).toBeDisabled();
    expect(declineButton).toBeDisabled();
    expect(closeButton).toBeDisabled();

    // Resolve the promise to complete submission
    await act(async () => {
      resolveConsent!({});
    });
  });

  it('hides the prompt again when showMarketingPrompt becomes false', () => {
    const { rerender } = render(<MarketingConsentPrompt />);

    // Start with prompt enabled
    mockUseAuth.mockReturnValue({
      ...defaultMockAuth,
      showMarketingPrompt: true,
    });

    rerender(<MarketingConsentPrompt />);

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(screen.getByText('Stay in the loop?')).toBeInTheDocument();

    // Now disable the prompt
    mockUseAuth.mockReturnValue({
      ...defaultMockAuth,
      showMarketingPrompt: false,
    });

    rerender(<MarketingConsentPrompt />);

    expect(screen.queryByText('Stay in the loop?')).not.toBeInTheDocument();
  });
});
