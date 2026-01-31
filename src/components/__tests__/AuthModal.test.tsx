/**
 * @jest-environment jsdom
 */

/**
 * AuthModal Tests
 *
 * Tests for the authentication modal component.
 * Covers sign-in, sign-up, password reset, and error handling.
 *
 * Issue #336: AuthModal is mode-independent.
 * Auth flows work identically in local and cloud modes when cloud is available.
 * The mode-independence is verified through the useAuth mock which abstracts mode details.
 * AuthModal has no direct dependency on backend mode - it can be shown from any context.
 *
 * @critical - Tests auth flows that are essential for user authentication
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import AuthModal from '../AuthModal';

// Mock useAuth hook
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

// Mock useFocusTrap hook
jest.mock('@/hooks/useFocusTrap', () => ({
  useFocusTrap: jest.fn(),
}));

// Mock platform detection - default to Android for tests that need registration
jest.mock('@/utils/platform', () => ({
  isAndroid: jest.fn(() => true),
  isIOS: jest.fn(() => false),
  isDesktop: jest.fn(() => false),
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

// Mock next/link
jest.mock('next/link', () => {
  const MockLink = ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  );
  MockLink.displayName = 'MockLink';
  return MockLink;
});

// Mock useTranslation
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue: string) => defaultValue,
  }),
}));

describe('AuthModal', () => {
  const mockOnSuccess = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockSignIn.mockResolvedValue({});
    mockSignUp.mockResolvedValue({});
    mockResetPassword.mockResolvedValue({});
  });

  // ==========================================================================
  // RENDERING
  // ==========================================================================

  describe('rendering', () => {
    it('should render sign-in mode by default', () => {
      render(
        <AuthModal onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      // Check for the header title
      expect(screen.getByRole('heading', { name: 'Sign In' })).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
    });

    it('should render sign-up mode when initialMode is signUp', () => {
      render(
        <AuthModal
          initialMode="signUp"
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      // Check for the header title
      expect(screen.getByRole('heading', { name: 'Create Account' })).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Confirm Password')).toBeInTheDocument();
    });

    it('should render reset password mode when initialMode is resetPassword', () => {
      render(
        <AuthModal
          initialMode="resetPassword"
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByText('Reset Password')).toBeInTheDocument();
      expect(screen.queryByPlaceholderText('Password')).not.toBeInTheDocument();
    });

    it('should have proper ARIA attributes for accessibility', () => {
      render(
        <AuthModal onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby', 'auth-modal-title');
    });
  });

  // ==========================================================================
  // SIGN IN FLOW
  // ==========================================================================

  describe('sign in flow', () => {
    it('should call signIn with email and password on submit', async () => {
      render(
        <AuthModal onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      await act(async () => {
        fireEvent.change(screen.getByPlaceholderText('Email'), {
          target: { value: 'test@example.com' },
        });
        fireEvent.change(screen.getByPlaceholderText('Password'), {
          target: { value: 'password123' },
        });
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
      });

      await waitFor(() => {
        expect(mockSignIn).toHaveBeenCalledWith('test@example.com', 'password123');
      });
    });

    it('should trim email before submitting', async () => {
      render(
        <AuthModal onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      await act(async () => {
        fireEvent.change(screen.getByPlaceholderText('Email'), {
          target: { value: '  test@example.com  ' },
        });
        fireEvent.change(screen.getByPlaceholderText('Password'), {
          target: { value: 'password123' },
        });
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
      });

      await waitFor(() => {
        expect(mockSignIn).toHaveBeenCalledWith('test@example.com', 'password123');
      });
    });

    it('should call onSuccess when sign-in succeeds', async () => {
      mockSignIn.mockResolvedValue({});

      render(
        <AuthModal onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      await act(async () => {
        fireEvent.change(screen.getByPlaceholderText('Email'), {
          target: { value: 'test@example.com' },
        });
        fireEvent.change(screen.getByPlaceholderText('Password'), {
          target: { value: 'password123' },
        });
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
      });

      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalled();
      });
    });

    it('should display error when sign-in fails', async () => {
      mockSignIn.mockResolvedValue({ error: 'Invalid credentials' });

      render(
        <AuthModal onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      await act(async () => {
        fireEvent.change(screen.getByPlaceholderText('Email'), {
          target: { value: 'test@example.com' },
        });
        fireEvent.change(screen.getByPlaceholderText('Password'), {
          target: { value: 'wrongpassword' },
        });
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
      });

      await waitFor(() => {
        expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
      });
      expect(mockOnSuccess).not.toHaveBeenCalled();
    });

    it('should display network error hint for network errors', async () => {
      mockSignIn.mockResolvedValue({ error: 'Network connection failed' });

      render(
        <AuthModal onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      await act(async () => {
        fireEvent.change(screen.getByPlaceholderText('Email'), {
          target: { value: 'test@example.com' },
        });
        fireEvent.change(screen.getByPlaceholderText('Password'), {
          target: { value: 'password123' },
        });
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
      });

      await waitFor(() => {
        expect(screen.getByText(/check your internet connection/i)).toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // SIGN UP FLOW
  // ==========================================================================

  describe('sign up flow', () => {
    it('should validate consent checkbox', async () => {
      render(
        <AuthModal
          initialMode="signUp"
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      await act(async () => {
        fireEvent.change(screen.getByPlaceholderText('Email'), {
          target: { value: 'test@example.com' },
        });
        fireEvent.change(screen.getByPlaceholderText('Password'), {
          target: { value: 'password123' },
        });
        fireEvent.change(screen.getByPlaceholderText('Confirm Password'), {
          target: { value: 'password123' },
        });
        // Don't check consent
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
      });

      await waitFor(() => {
        expect(screen.getByText(/must accept the Terms/i)).toBeInTheDocument();
      });
      expect(mockSignUp).not.toHaveBeenCalled();
    });

    it('should validate password confirmation', async () => {
      render(
        <AuthModal
          initialMode="signUp"
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      await act(async () => {
        fireEvent.change(screen.getByPlaceholderText('Email'), {
          target: { value: 'test@example.com' },
        });
        fireEvent.change(screen.getByPlaceholderText('Password'), {
          target: { value: 'password123' },
        });
        fireEvent.change(screen.getByPlaceholderText('Confirm Password'), {
          target: { value: 'differentpassword' },
        });
        fireEvent.click(screen.getByRole('checkbox'));
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
      });

      await waitFor(() => {
        expect(screen.getByText(/Passwords do not match/i)).toBeInTheDocument();
      });
      expect(mockSignUp).not.toHaveBeenCalled();
    });

    it('should call signUp when validation passes', async () => {
      render(
        <AuthModal
          initialMode="signUp"
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      await act(async () => {
        fireEvent.change(screen.getByPlaceholderText('Email'), {
          target: { value: 'test@example.com' },
        });
        fireEvent.change(screen.getByPlaceholderText('Password'), {
          target: { value: 'password123' },
        });
        fireEvent.change(screen.getByPlaceholderText('Confirm Password'), {
          target: { value: 'password123' },
        });
        fireEvent.click(screen.getByRole('checkbox'));
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
      });

      await waitFor(() => {
        expect(mockSignUp).toHaveBeenCalledWith('test@example.com', 'password123');
      });
    });

    it('should handle confirmation required response', async () => {
      mockSignUp.mockResolvedValue({ confirmationRequired: true });

      render(
        <AuthModal
          initialMode="signUp"
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      await act(async () => {
        fireEvent.change(screen.getByPlaceholderText('Email'), {
          target: { value: 'test@example.com' },
        });
        fireEvent.change(screen.getByPlaceholderText('Password'), {
          target: { value: 'password123' },
        });
        fireEvent.change(screen.getByPlaceholderText('Confirm Password'), {
          target: { value: 'password123' },
        });
        fireEvent.click(screen.getByRole('checkbox'));
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
      });

      await waitFor(() => {
        // Should show success message
        expect(screen.getByText(/Check your email/i)).toBeInTheDocument();
        // Should switch to sign-in mode
        expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
      });
      // Should NOT call onSuccess (user needs to confirm email first)
      expect(mockOnSuccess).not.toHaveBeenCalled();
    });

    it('should call onSuccess when sign-up succeeds without confirmation', async () => {
      mockSignUp.mockResolvedValue({ confirmationRequired: false });

      render(
        <AuthModal
          initialMode="signUp"
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      await act(async () => {
        fireEvent.change(screen.getByPlaceholderText('Email'), {
          target: { value: 'test@example.com' },
        });
        fireEvent.change(screen.getByPlaceholderText('Password'), {
          target: { value: 'password123' },
        });
        fireEvent.change(screen.getByPlaceholderText('Confirm Password'), {
          target: { value: 'password123' },
        });
        fireEvent.click(screen.getByRole('checkbox'));
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
      });

      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalled();
      });
    });
  });

  // ==========================================================================
  // PASSWORD RESET FLOW
  // ==========================================================================

  describe('password reset flow', () => {
    it('should call resetPassword on submit', async () => {
      render(
        <AuthModal
          initialMode="resetPassword"
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      await act(async () => {
        fireEvent.change(screen.getByPlaceholderText('Email'), {
          target: { value: 'test@example.com' },
        });
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Send Reset Email' }));
      });

      await waitFor(() => {
        expect(mockResetPassword).toHaveBeenCalledWith('test@example.com');
      });
    });

    it('should show success message and switch to sign-in on success', async () => {
      render(
        <AuthModal
          initialMode="resetPassword"
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      await act(async () => {
        fireEvent.change(screen.getByPlaceholderText('Email'), {
          target: { value: 'test@example.com' },
        });
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Send Reset Email' }));
      });

      await waitFor(() => {
        expect(screen.getByText(/Check your email for reset instructions/i)).toBeInTheDocument();
        // Should switch to sign-in mode
        expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // MODE SWITCHING
  // ==========================================================================

  describe('mode switching', () => {
    it('should switch from sign-in to sign-up when clicking sign up link', async () => {
      render(
        <AuthModal onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      await act(async () => {
        fireEvent.click(screen.getByText('Sign up'));
      });

      // Check for the header title to verify mode switch
      expect(screen.getByRole('heading', { name: 'Create Account' })).toBeInTheDocument();
    });

    it('should switch from sign-in to reset password when clicking forgot password', async () => {
      render(
        <AuthModal onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      await act(async () => {
        fireEvent.click(screen.getByText('Forgot password?'));
      });

      expect(screen.getByText('Reset Password')).toBeInTheDocument();
    });

    it('should switch from sign-up to sign-in when clicking sign in link', async () => {
      render(
        <AuthModal
          initialMode="signUp"
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      await act(async () => {
        fireEvent.click(screen.getByText('Sign in'));
      });

      expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
    });

    it('should hide sign-up option when allowRegistration is false', () => {
      render(
        <AuthModal
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
          allowRegistration={false}
        />
      );

      expect(screen.queryByText('Sign up')).not.toBeInTheDocument();
      expect(screen.getByText(/Subscribe via the Android app/i)).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // CANCEL / CLOSE
  // ==========================================================================

  describe('cancel and close', () => {
    it('should call onCancel when close button is clicked', async () => {
      render(
        <AuthModal onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      await act(async () => {
        fireEvent.click(screen.getByLabelText('Back'));
      });

      expect(mockOnCancel).toHaveBeenCalled();
    });

    it('should call onCancel when Escape key is pressed', async () => {
      render(
        <AuthModal onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      await act(async () => {
        fireEvent.keyDown(document, { key: 'Escape' });
      });

      expect(mockOnCancel).toHaveBeenCalled();
    });

    it('should not call onCancel when Escape is pressed during loading', async () => {
      // Make signIn hang to keep loading state
      mockSignIn.mockImplementation(() => new Promise(() => {}));

      render(
        <AuthModal onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      await act(async () => {
        fireEvent.change(screen.getByPlaceholderText('Email'), {
          target: { value: 'test@example.com' },
        });
        fireEvent.change(screen.getByPlaceholderText('Password'), {
          target: { value: 'password123' },
        });
      });

      // Start submission
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
      });

      // Try to escape while loading
      await act(async () => {
        fireEvent.keyDown(document, { key: 'Escape' });
      });

      // onCancel should NOT be called
      expect(mockOnCancel).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // ERROR HANDLING
  // ==========================================================================

  describe('error handling', () => {
    it('should handle thrown exceptions gracefully', async () => {
      const logger = require('@/utils/logger').default;
      mockSignIn.mockRejectedValue(new Error('Unexpected error'));

      render(
        <AuthModal onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      await act(async () => {
        fireEvent.change(screen.getByPlaceholderText('Email'), {
          target: { value: 'test@example.com' },
        });
        fireEvent.change(screen.getByPlaceholderText('Password'), {
          target: { value: 'password123' },
        });
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
      });

      await waitFor(() => {
        expect(screen.getByText('Unexpected error')).toBeInTheDocument();
      });

      // Should log the error
      expect(logger.error).toHaveBeenCalledWith(
        '[AuthModal] Unexpected error during auth:',
        expect.any(Error)
      );

      // Loading should be reset
      expect(screen.getByRole('button', { name: 'Sign In' })).not.toBeDisabled();
    });

    it('should log network errors for monitoring', async () => {
      const logger = require('@/utils/logger').default;
      mockSignIn.mockResolvedValue({ error: 'Network connection failed' });

      render(
        <AuthModal onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      await act(async () => {
        fireEvent.change(screen.getByPlaceholderText('Email'), {
          target: { value: 'test@example.com' },
        });
        fireEvent.change(screen.getByPlaceholderText('Password'), {
          target: { value: 'password123' },
        });
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
      });

      await waitFor(() => {
        expect(logger.warn).toHaveBeenCalledWith(
          '[AuthModal] Network error during sign in:',
          'Network connection failed'
        );
      });
    });
  });

  // ==========================================================================
  // LOADING STATE
  // ==========================================================================

  describe('loading state', () => {
    it('should disable form during submission', async () => {
      // Make signIn hang to keep loading state
      mockSignIn.mockImplementation(() => new Promise(() => {}));

      render(
        <AuthModal onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      await act(async () => {
        fireEvent.change(screen.getByPlaceholderText('Email'), {
          target: { value: 'test@example.com' },
        });
        fireEvent.change(screen.getByPlaceholderText('Password'), {
          target: { value: 'password123' },
        });
      });

      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
      });

      // Wait for loading state
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Email')).toBeDisabled();
        expect(screen.getByPlaceholderText('Password')).toBeDisabled();
        expect(screen.getByText('Loading...')).toBeInTheDocument();
      });
    });

    it('should disable close button during loading', async () => {
      // Make signIn hang to keep loading state
      mockSignIn.mockImplementation(() => new Promise(() => {}));

      render(
        <AuthModal onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      await act(async () => {
        fireEvent.change(screen.getByPlaceholderText('Email'), {
          target: { value: 'test@example.com' },
        });
        fireEvent.change(screen.getByPlaceholderText('Password'), {
          target: { value: 'password123' },
        });
      });

      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
      });

      await waitFor(() => {
        expect(screen.getByLabelText('Back')).toBeDisabled();
      });
    });
  });
});
