/**
 * Tests for LoginScreen
 *
 * Tests the login screen UI component.
 * Part of PR #5: SupabaseAuthService + Auth UI
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginScreen from '../LoginScreen';

// Mock auth context
const mockSignIn = jest.fn();
const mockSignUp = jest.fn();
const mockResetPassword = jest.fn();

jest.mock('@/contexts/AuthProvider', () => ({
  useAuth: () => ({
    signIn: mockSignIn,
    signUp: mockSignUp,
    resetPassword: mockResetPassword,
  }),
}));

// Mock i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback: string) => fallback || key,
  }),
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

    it('should call signUp with email and password', async () => {
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
      fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

      await waitFor(() => {
        expect(mockSignUp).toHaveBeenCalledWith('new@example.com', 'Password123!@#');
      });
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
      fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

      await waitFor(() => {
        expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
      });

      // Should not call signUp
      expect(mockSignUp).not.toHaveBeenCalled();
    });

    it('should show confirmation message when email verification required', async () => {
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
      fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

      await waitFor(() => {
        expect(screen.getByText('Check your email to confirm your account')).toBeInTheDocument();
      });
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

    it('should show success message after sending reset email', async () => {
      render(<LoginScreen />);
      fireEvent.click(screen.getByText('Forgot password?'));

      fireEvent.change(screen.getByPlaceholderText('Email'), {
        target: { value: 'forgot@example.com' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Send Reset Email' }));

      await waitFor(() => {
        expect(screen.getByText('Check your email for reset instructions')).toBeInTheDocument();
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
});
