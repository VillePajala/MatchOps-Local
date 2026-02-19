/**
 * Tests for ReConsentModal component.
 *
 * Tests the re-consent flow when policy version changes.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReConsentModal } from '../ReConsentModal';
import { useAuth } from '@/contexts/AuthProvider';

// Mock the auth context
jest.mock('@/contexts/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

// Mock next/link
jest.mock('next/link', () => {
  return function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  };
});

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

describe('ReConsentModal', () => {
  const defaultMockAuth = {
    user: null,
    session: null,
    isAuthenticated: true,
    isLoading: false,
    mode: 'cloud' as const,
    needsReConsent: false,
    initTimedOut: false,
    isSigningOut: false,
    isAuthGracePeriod: false,
    signIn: jest.fn(),
    signUp: jest.fn(),
    signOut: jest.fn(),
    resetPassword: jest.fn(),
    recordConsent: jest.fn(),
    acceptReConsent: jest.fn(),
    deleteAccount: jest.fn(),
    retryAuthInit: jest.fn(),
    marketingConsent: null,
    showMarketingPrompt: false,
    setMarketingConsent: jest.fn(),
    dismissMarketingPrompt: jest.fn(),
    verifySignUpOtp: jest.fn(),
    resendSignUpConfirmation: jest.fn(),
    verifyPasswordResetOtp: jest.fn(),
    updatePassword: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue(defaultMockAuth);
  });

  it('should not render when needsReConsent is false', () => {
    mockUseAuth.mockReturnValue({
      ...defaultMockAuth,
      needsReConsent: false,
    });

    const { container } = render(<ReConsentModal />);
    expect(container.firstChild).toBeNull();
  });

  it('should render when needsReConsent is true', () => {
    mockUseAuth.mockReturnValue({
      ...defaultMockAuth,
      needsReConsent: true,
    });

    render(<ReConsentModal />);
    expect(screen.getByText(/Updated Terms & Privacy Policy/i)).toBeInTheDocument();
  });

  it('should show links to Terms and Privacy Policy', () => {
    mockUseAuth.mockReturnValue({
      ...defaultMockAuth,
      needsReConsent: true,
    });

    render(<ReConsentModal />);
    expect(screen.getByRole('link', { name: /Terms of Service/i })).toHaveAttribute('href', '/terms');
    expect(screen.getByRole('link', { name: /Privacy Policy/i })).toHaveAttribute('href', '/privacy-policy');
  });

  it('should have disabled Accept button until checkbox is checked', () => {
    mockUseAuth.mockReturnValue({
      ...defaultMockAuth,
      needsReConsent: true,
    });

    render(<ReConsentModal />);
    const acceptButton = screen.getByRole('button', { name: /Accept & Continue/i });
    expect(acceptButton).toBeDisabled();

    // Check the checkbox
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    expect(acceptButton).not.toBeDisabled();
  });

  it('should call acceptReConsent when Accept button is clicked', async () => {
    const mockAcceptReConsent = jest.fn().mockResolvedValue({});
    mockUseAuth.mockReturnValue({
      ...defaultMockAuth,
      needsReConsent: true,
      acceptReConsent: mockAcceptReConsent,
    });

    render(<ReConsentModal />);

    // Check the checkbox and click accept
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    const acceptButton = screen.getByRole('button', { name: /Accept & Continue/i });
    fireEvent.click(acceptButton);

    await waitFor(() => {
      expect(mockAcceptReConsent).toHaveBeenCalled();
    });
  });

  it('should call signOut when Decline button is clicked', async () => {
    const mockSignOut = jest.fn().mockResolvedValue(undefined);
    mockUseAuth.mockReturnValue({
      ...defaultMockAuth,
      needsReConsent: true,
      signOut: mockSignOut,
    });

    render(<ReConsentModal />);

    const declineButton = screen.getByRole('button', { name: /Decline & Sign Out/i });
    fireEvent.click(declineButton);

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
    });
  });

  it('should display error message when acceptReConsent fails', async () => {
    const mockAcceptReConsent = jest.fn().mockResolvedValue({ error: 'Network error' });
    mockUseAuth.mockReturnValue({
      ...defaultMockAuth,
      needsReConsent: true,
      acceptReConsent: mockAcceptReConsent,
    });

    render(<ReConsentModal />);

    // Check the checkbox and click accept
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    const acceptButton = screen.getByRole('button', { name: /Accept & Continue/i });
    fireEvent.click(acceptButton);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('should show "Accepting..." while submitting', async () => {
    // Create a promise that we can control
    let resolveAccept: (value: { error?: string }) => void;
    const acceptPromise = new Promise<{ error?: string }>((resolve) => {
      resolveAccept = resolve;
    });
    const mockAcceptReConsent = jest.fn().mockReturnValue(acceptPromise);

    mockUseAuth.mockReturnValue({
      ...defaultMockAuth,
      needsReConsent: true,
      acceptReConsent: mockAcceptReConsent,
    });

    render(<ReConsentModal />);

    // Check the checkbox and click accept
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    const acceptButton = screen.getByRole('button', { name: /Accept & Continue/i });
    fireEvent.click(acceptButton);

    // Should show "Accepting..." while waiting
    expect(screen.getByRole('button', { name: /Accepting.../i })).toBeInTheDocument();

    // Resolve the promise
    resolveAccept!({});

    await waitFor(() => {
      expect(mockAcceptReConsent).toHaveBeenCalled();
    });
  });
});
