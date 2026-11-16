/**
 * Tests for LoginScreen
 *
 * Tests the login screen UI component.
 * Part of PR #5: SupabaseAuthService + Auth UI
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import LoginScreen from '../LoginScreen';

// Mock auth context
const mockSignIn = jest.fn();
const mockSignUp = jest.fn();
const mockResetPassword = jest.fn();
const mockSignOut = jest.fn();
const mockVerifySignUpOtp = jest.fn();
const mockResendSignUpConfirmation = jest.fn();
const mockVerifyPasswordResetOtp = jest.fn();
const mockUpdatePassword = jest.fn();

jest.mock('@/contexts/AuthProvider', () => ({
  useAuth: () => ({
    signIn: mockSignIn,
    signUp: mockSignUp,
    resetPassword: mockResetPassword,
    signOut: mockSignOut,
    verifySignUpOtp: mockVerifySignUpOtp,
    resendSignUpConfirmation: mockResendSignUpConfirmation,
    verifyPasswordResetOtp: mockVerifyPasswordResetOtp,
    updatePassword: mockUpdatePassword,
  }),
}));

// Mock i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback: string) => fallback || key,
  }),
}));

// Mock i18n - both default export properties and named exports
jest.mock('@/i18n', () => ({
  language: 'en',
  changeLanguage: jest.fn(),
  saveLanguagePreference: jest.fn(),
}));

// Mock appSettings
jest.mock('@/utils/appSettings', () => ({
  updateAppSettings: jest.fn().mockResolvedValue(undefined),
}));

// Mock logger
jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock next/image
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: React.ImgHTMLAttributes<HTMLImageElement> & { src: string; alt: string }) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={props.src} alt={props.alt} />;
  },
}));

describe('LoginScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    mockSignIn.mockResolvedValue({});
    mockSignUp.mockResolvedValue({ confirmationRequired: false });
    mockResetPassword.mockResolvedValue({});
  });

  // ==========================================================================
  // SIGN IN MODE
  // ==========================================================================

  describe('sign in mode', () => {
    it('should render sign in form by default', () => {
      render(<LoginScreen />);

      expect(screen.getByRole('heading', { name: 'Sign In' })).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
    });

    it('opens directly in Sign Up when initialMode is signUp (new-device default; a device that has signed in before opens on signIn)', () => {
      render(<LoginScreen initialMode="signUp" />);

      expect(screen.getByRole('heading', { name: 'Create Account' })).toBeInTheDocument();
      // Returning users still get a one-tap path back to sign in.
      expect(screen.getByText('Sign in')).toBeInTheDocument();
    });

    it('should call signIn with email and password', async () => {
      render(<LoginScreen />);

      fireEvent.change(screen.getByPlaceholderText('Email'), {
        target: { value: 'test@example.com' },
      });
      fireEvent.change(screen.getByPlaceholderText('Password'), {
        target: { value: 'password123' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

      await waitFor(() => {
        expect(mockSignIn).toHaveBeenCalledWith('test@example.com', 'password123');
      });
    });

    it('should show error message on sign in failure', async () => {
      mockSignIn.mockResolvedValue({ error: 'Invalid credentials' });

      render(<LoginScreen />);

      fireEvent.change(screen.getByPlaceholderText('Email'), {
        target: { value: 'test@example.com' },
      });
      fireEvent.change(screen.getByPlaceholderText('Password'), {
        target: { value: 'wrongpassword' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

      await waitFor(() => {
        expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
      });
    });

    it('should show loading state during sign in', async () => {
      mockSignIn.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<LoginScreen />);

      fireEvent.change(screen.getByPlaceholderText('Email'), {
        target: { value: 'test@example.com' },
      });
      fireEvent.change(screen.getByPlaceholderText('Password'), {
        target: { value: 'password123' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

      await waitFor(() => {
        expect(screen.getByText('Loading...')).toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // SIGN UP MODE
  // ==========================================================================

  describe('sign up mode', () => {
    it('should switch to sign up mode', () => {
      render(<LoginScreen />);

      fireEvent.click(screen.getByText('Sign up'));

      expect(screen.getByRole('heading', { name: 'Create Account' })).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Confirm Password')).toBeInTheDocument();
    });

    it('should call signUp with email and password when terms accepted', async () => {
      render(<LoginScreen />);
      fireEvent.click(screen.getByText('Sign up'));

      fireEvent.change(screen.getByPlaceholderText('Email'), {
        target: { value: 'new@example.com' },
      });
      fireEvent.change(screen.getByPlaceholderText('Password'), {
        target: { value: 'Password123!@#' },
      });
      fireEvent.change(screen.getByPlaceholderText('Confirm Password'), {
        target: { value: 'Password123!@#' },
      });
      // Accept terms and privacy policy
      fireEvent.click(screen.getByRole('checkbox'));
      fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

      await waitFor(() => {
        expect(mockSignUp).toHaveBeenCalledWith('new@example.com', 'Password123!@#');
      });
    });

    it('should show error when terms not accepted', async () => {
      render(<LoginScreen />);
      fireEvent.click(screen.getByText('Sign up'));

      fireEvent.change(screen.getByPlaceholderText('Email'), {
        target: { value: 'new@example.com' },
      });
      fireEvent.change(screen.getByPlaceholderText('Password'), {
        target: { value: 'Password123!@#' },
      });
      fireEvent.change(screen.getByPlaceholderText('Confirm Password'), {
        target: { value: 'Password123!@#' },
      });
      // Don't accept terms
      fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

      await waitFor(() => {
        expect(screen.getByText('You must accept the Terms of Service and Privacy Policy')).toBeInTheDocument();
      });

      // Should not call signUp
      expect(mockSignUp).not.toHaveBeenCalled();
    });

    it('should show error when passwords do not match', async () => {
      render(<LoginScreen />);
      fireEvent.click(screen.getByText('Sign up'));

      fireEvent.change(screen.getByPlaceholderText('Email'), {
        target: { value: 'new@example.com' },
      });
      fireEvent.change(screen.getByPlaceholderText('Password'), {
        target: { value: 'Password123!@#' },
      });
      fireEvent.change(screen.getByPlaceholderText('Confirm Password'), {
        target: { value: 'DifferentPassword' },
      });
      // Accept terms
      fireEvent.click(screen.getByRole('checkbox'));
      fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

      await waitFor(() => {
        expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
      });

      // Should not call signUp
      expect(mockSignUp).not.toHaveBeenCalled();
    });

    it('should show OTP verification screen when email verification required', async () => {
      mockSignUp.mockResolvedValue({ confirmationRequired: true });

      render(<LoginScreen />);
      fireEvent.click(screen.getByText('Sign up'));

      fireEvent.change(screen.getByPlaceholderText('Email'), {
        target: { value: 'new@example.com' },
      });
      fireEvent.change(screen.getByPlaceholderText('Password'), {
        target: { value: 'Password123!@#' },
      });
      fireEvent.change(screen.getByPlaceholderText('Confirm Password'), {
        target: { value: 'Password123!@#' },
      });
      // Accept terms
      fireEvent.click(screen.getByRole('checkbox'));
      fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Enter Verification Code' })).toBeInTheDocument();
      });
    });
  });

  /**
   * Review 7.2: a new coach fetching the code from the mail app came back after a
   * reload to Create Account, and signing in only said "Invalid email or password"
   * - no screen accepted the code they went to get.
   * @critical
   */
  describe('getting back to the sign-up code', () => {
    const signUpToCodeScreen = async () => {
      mockSignUp.mockResolvedValue({ confirmationRequired: true });
      render(<LoginScreen />);
      fireEvent.click(screen.getByText('Sign up'));
      fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'new@example.com' } });
      fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'Password123!@#' } });
      fireEvent.change(screen.getByPlaceholderText('Confirm Password'), { target: { value: 'Password123!@#' } });
      fireEvent.click(screen.getByRole('checkbox'));
      fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
      await waitFor(() => expect(screen.getByRole('heading', { name: 'Enter Verification Code' })).toBeInTheDocument());
    };

    it('signing in to an unconfirmed account opens the code screen', async () => {
      mockSignIn.mockResolvedValue({ error: 'Invalid email or password.', emailNotConfirmed: true });
      render(<LoginScreen />);
      fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'new@example.com' } });
      fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'Password123!@#' } });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
      });
      await waitFor(() => expect(screen.getByRole('heading', { name: 'Enter Verification Code' })).toBeInTheDocument());
      expect(screen.queryByText('Invalid email or password.')).not.toBeInTheDocument();
    });

    it('remembers the sign-up for a reload', async () => {
      await signUpToCodeScreen();
      expect(JSON.parse(sessionStorage.getItem('matchops.pendingSignUp') ?? '{}').email).toBe('new@example.com');
    });

    it('holds the long-background reload while the code screen is up', async () => {
      const { hasUnsavedInput } = jest.requireActual('@/utils/unsavedInputSignal') as typeof import('@/utils/unsavedInputSignal');
      await signUpToCodeScreen();
      expect(hasUnsavedInput()).toBe(true);
      fireEvent.click(screen.getByText('Back to sign in'));
      await waitFor(() => expect(hasUnsavedInput()).toBe(false));
    });

    it('a successful sign-in forgets a remembered sign-up (no stale code screen after sign-out)', async () => {
      sessionStorage.setItem('matchops.pendingSignUp', JSON.stringify({ email: 'other@example.com', at: Date.now() }));
      render(<LoginScreen />);
      await waitFor(() => expect(screen.getByRole('heading', { name: 'Enter Verification Code' })).toBeInTheDocument());
      fireEvent.click(screen.getByText('Back to sign in'));
      // The address carries over to the sign-in field.
      expect(screen.getByPlaceholderText('Email')).toHaveValue('other@example.com');
      sessionStorage.setItem('matchops.pendingSignUp', JSON.stringify({ email: 'other@example.com', at: Date.now() }));
      fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'Password123!@#' } });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
      });
      await waitFor(() => expect(sessionStorage.getItem('matchops.pendingSignUp')).toBeNull());
    });

    it('ignores a malformed stored value', async () => {
      sessionStorage.setItem('matchops.pendingSignUp', '{not json');
      render(<LoginScreen />);
      await act(async () => {});
      expect(screen.queryByRole('heading', { name: 'Enter Verification Code' })).not.toBeInTheDocument();
    });

    it('the code screen comes back after a reload', async () => {
      await signUpToCodeScreen();
      cleanup(); // the page reloads
      render(<LoginScreen />);
      await waitFor(() => expect(screen.getByRole('heading', { name: 'Enter Verification Code' })).toBeInTheDocument());
    });

    it('not once the code has expired (an hour)', async () => {
      sessionStorage.setItem('matchops.pendingSignUp', JSON.stringify({ email: 'new@example.com', at: Date.now() - 61 * 60 * 1000 }));
      render(<LoginScreen />);
      await act(async () => {});
      expect(screen.queryByRole('heading', { name: 'Enter Verification Code' })).not.toBeInTheDocument();
      expect(sessionStorage.getItem('matchops.pendingSignUp')).toBeNull();
    });

    it('not after the coach left it with "Back to sign in"', async () => {
      await signUpToCodeScreen();
      fireEvent.click(screen.getByText('Back to sign in'));
      cleanup();
      render(<LoginScreen />);
      await act(async () => {});
      expect(screen.queryByRole('heading', { name: 'Enter Verification Code' })).not.toBeInTheDocument();
    });
  });

  // ==========================================================================
  // PASSWORD RESET MODE
  // ==========================================================================

  describe('password reset mode', () => {
    it('should switch to password reset mode', () => {
      render(<LoginScreen />);

      fireEvent.click(screen.getByText('Forgot password?'));

      expect(screen.getByRole('heading', { name: 'Reset Password' })).toBeInTheDocument();
      expect(screen.queryByPlaceholderText('Password')).not.toBeInTheDocument();
    });

    it('should call resetPassword with email', async () => {
      render(<LoginScreen />);
      fireEvent.click(screen.getByText('Forgot password?'));

      fireEvent.change(screen.getByPlaceholderText('Email'), {
        target: { value: 'forgot@example.com' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Send Reset Email' }));

      await waitFor(() => {
        expect(mockResetPassword).toHaveBeenCalledWith('forgot@example.com');
      });
    });

    it('should show reset OTP screen after sending reset email', async () => {
      render(<LoginScreen />);
      fireEvent.click(screen.getByText('Forgot password?'));

      fireEvent.change(screen.getByPlaceholderText('Email'), {
        target: { value: 'forgot@example.com' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Send Reset Email' }));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Enter Reset Code' })).toBeInTheDocument();
      });
    });

    it('should navigate back to sign in', () => {
      render(<LoginScreen />);
      fireEvent.click(screen.getByText('Forgot password?'));

      fireEvent.click(screen.getByText('Back to sign in'));

      expect(screen.getByRole('heading', { name: 'Sign In' })).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // MODE SWITCHING
  // ==========================================================================

  describe('mode switching', () => {
    it('should clear passwords when switching modes', () => {
      render(<LoginScreen />);

      // Enter password in sign in mode
      fireEvent.change(screen.getByPlaceholderText('Password'), {
        target: { value: 'secretpassword' },
      });

      // Switch to sign up
      fireEvent.click(screen.getByText('Sign up'));

      // Password should be cleared
      expect(screen.getByPlaceholderText('Password')).toHaveValue('');
    });

    it('should keep email when switching modes', () => {
      render(<LoginScreen />);

      // Enter email in sign in mode
      fireEvent.change(screen.getByPlaceholderText('Email'), {
        target: { value: 'keep@example.com' },
      });

      // Switch to sign up
      fireEvent.click(screen.getByText('Sign up'));

      // Email should be preserved
      expect(screen.getByPlaceholderText('Email')).toHaveValue('keep@example.com');
    });
  });

  // ==========================================================================
  // LANGUAGE SELECTOR
  // ==========================================================================

  describe('language selector', () => {
    it('should render language selector buttons', () => {
      render(<LoginScreen />);

      expect(screen.getByText('EN')).toBeInTheDocument();
      expect(screen.getByText('FI')).toBeInTheDocument();
    });

    it('should switch language when clicking language buttons', async () => {
      const i18n = jest.requireMock('@/i18n');

      render(<LoginScreen />);

      fireEvent.click(screen.getByText('FI'));
      expect(i18n.changeLanguage).toHaveBeenCalledWith('fi');

      fireEvent.click(screen.getByText('EN'));
      expect(i18n.changeLanguage).toHaveBeenCalledWith('en');
    });
  });

  // ==========================================================================
  // REGISTRATION RESTRICTION (Desktop)
  // ==========================================================================

  describe('allowRegistration prop', () => {
    it('should show sign up link when allowRegistration is true', () => {
      render(<LoginScreen allowRegistration={true} />);

      expect(screen.getByText('Sign up')).toBeInTheDocument();
    });

    it('should hide sign up link when allowRegistration is false', () => {
      render(<LoginScreen allowRegistration={false} />);

      expect(screen.queryByText('Sign up')).not.toBeInTheDocument();
    });

    it('should show Play Store link when allowRegistration is false', () => {
      render(<LoginScreen allowRegistration={false} />);

      expect(screen.getByText("Don't have an account? Subscribe via the Android app.")).toBeInTheDocument();
      expect(screen.getByText('Get on Google Play')).toBeInTheDocument();
    });

    it('should not switch to sign up mode when allowRegistration is false', () => {
      render(<LoginScreen allowRegistration={false} />);

      // Verify we're still in sign in mode (there's no sign up button to click)
      expect(screen.getByRole('heading', { name: 'Sign In' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Create Account' })).not.toBeInTheDocument();
    });

    it('should default to allowRegistration=true', () => {
      render(<LoginScreen />);

      // Without prop, sign up should be available
      expect(screen.getByText('Sign up')).toBeInTheDocument();
    });
  });
});
