/**
 * Tests for CloudAuthModal
 *
 * Tests the cloud authentication modal for re-authentication before cloud data deletion.
 * Part of PR #11: Reverse Migration & Cloud Account Management
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CloudAuthModal from '../CloudAuthModal';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock SupabaseAuthService
const mockAuthInitialize = jest.fn();
const mockSignIn = jest.fn();
const mockSignOut = jest.fn();
jest.mock('@/auth/SupabaseAuthService', () => ({
  SupabaseAuthService: jest.fn().mockImplementation(() => ({
    initialize: mockAuthInitialize,
    signIn: mockSignIn,
    signOut: mockSignOut,
  })),
}));

// Mock SupabaseDataStore
const mockClearAllUserData = jest.fn();
const mockInitialize = jest.fn();
const mockGetBackendName = jest.fn(() => 'supabase');

jest.mock('@/datastore/SupabaseDataStore', () => ({
  SupabaseDataStore: jest.fn().mockImplementation(() => ({
    initialize: mockInitialize,
    clearAllUserData: mockClearAllUserData,
    getBackendName: mockGetBackendName,
  })),
}));

// Mock backendConfig
jest.mock('@/config/backendConfig', () => ({
  clearCloudAccountInfo: jest.fn(),
}));

import { clearCloudAccountInfo } from '@/config/backendConfig';
const mockClearCloudAccountInfo = clearCloudAccountInfo as jest.Mock;

// Mock i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback: string) => fallback || key,
  }),
}));

// Mock useFocusTrap
jest.mock('@/hooks/useFocusTrap', () => ({
  useFocusTrap: jest.fn(),
}));

// Mock logger
jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('CloudAuthModal', () => {
  let queryClient: QueryClient;
  const mockOnComplete = jest.fn();
  const mockOnCancel = jest.fn();
  const testEmail = 'test@example.com';

  // User event instance for simulating real user interactions
  // This properly handles uncontrolled inputs (using ref instead of state)
  const user = userEvent.setup();

  // Store original console.error to restore after tests
  const originalConsoleError = console.error;

  beforeAll(() => {
    // Suppress controlled/uncontrolled input warnings that appear during tests.
    // This is a false positive caused by how userEvent interacts with uncontrolled inputs.
    // The component works correctly in the browser - the password input uses useRef
    // for security (to keep password out of React DevTools/state snapshots).
    console.error = (...args: unknown[]) => {
      const message = args[0];
      if (
        typeof message === 'string' &&
        (message.includes('A component is changing an uncontrolled input to be controlled') ||
         message.includes('A component is changing a controlled input to be uncontrolled'))
      ) {
        return; // Suppress these specific warnings
      }
      originalConsoleError.apply(console, args);
    };
  });

  afterAll(() => {
    console.error = originalConsoleError;
  });

  const renderModal = (props = {}) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <CloudAuthModal
          email={testEmail}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
          {...props}
        />
      </QueryClientProvider>
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    mockAuthInitialize.mockResolvedValue(undefined);
    mockSignIn.mockResolvedValue({});
    mockSignOut.mockResolvedValue(undefined);
    mockInitialize.mockResolvedValue(undefined);
    mockClearAllUserData.mockResolvedValue(undefined);
    mockGetBackendName.mockReturnValue('supabase');
  });

  afterEach(() => {
    queryClient.clear();
  });

  // ==========================================================================
  // AUTH STEP TESTS
  // ==========================================================================

  describe('auth step', () => {
    it('should render sign in form with email pre-filled', () => {
      renderModal();

      expect(screen.getByRole('heading', { name: 'Sign In' })).toBeInTheDocument();
      expect(screen.getByDisplayValue(testEmail)).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
    });

    it('should show email as read-only', () => {
      renderModal();

      const emailInput = screen.getByDisplayValue(testEmail);
      expect(emailInput).toHaveAttribute('readOnly');
    });

    it('should call cancel when cancel button clicked', () => {
      renderModal();

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(mockOnCancel).toHaveBeenCalled();
    });

    it('should call cancel when close button clicked', () => {
      renderModal();

      // Find close button by aria-label
      const closeButton = screen.getByLabelText('Close');
      fireEvent.click(closeButton);

      expect(mockOnCancel).toHaveBeenCalled();
    });

    it('should disable sign in button when password is empty', () => {
      renderModal();

      const signInButton = screen.getByRole('button', { name: 'Sign In' });
      expect(signInButton).toBeDisabled();
    });

    it('should call signIn and proceed to confirm step on success', async () => {
      renderModal();

      const passwordInput = screen.getByPlaceholderText('Enter your password');
      await user.type(passwordInput, 'testpassword');

      await user.click(screen.getByRole('button', { name: 'Sign In' }));

      await waitFor(() => {
        expect(mockSignIn).toHaveBeenCalledWith(testEmail, 'testpassword');
      });

      await waitFor(() => {
        // Use the h2 header which has the id
        expect(screen.getByRole('heading', { level: 2, name: 'Confirm Deletion' })).toBeInTheDocument();
      });
    });

    it('should show error message on sign in failure', async () => {
      mockSignIn.mockRejectedValue(new Error('Invalid credentials'));

      renderModal();

      const passwordInput = screen.getByPlaceholderText('Enter your password');
      await user.type(passwordInput, 'wrongpassword');

      await user.click(screen.getByRole('button', { name: 'Sign In' }));

      await waitFor(() => {
        expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
      });
    });

    it('should show loading state during sign in', async () => {
      mockSignIn.mockImplementation(() => new Promise(() => {})); // Never resolves

      renderModal();

      const passwordInput = screen.getByPlaceholderText('Enter your password');
      await user.type(passwordInput, 'testpassword');

      await user.click(screen.getByRole('button', { name: 'Sign In' }));

      await waitFor(() => {
        expect(screen.getByText('Signing in...')).toBeInTheDocument();
      });
    });

    it('should submit on Enter key press', async () => {
      renderModal();

      const passwordInput = screen.getByPlaceholderText('Enter your password');
      await user.type(passwordInput, 'testpassword{Enter}');

      await waitFor(() => {
        expect(mockSignIn).toHaveBeenCalled();
      });
    });
  });

  // ==========================================================================
  // CONFIRM STEP TESTS
  // ==========================================================================

  describe('confirm step', () => {
    const goToConfirmStep = async () => {
      renderModal();

      const passwordInput = screen.getByPlaceholderText('Enter your password');
      await user.type(passwordInput, 'testpassword');

      await user.click(screen.getByRole('button', { name: 'Sign In' }));

      await waitFor(() => {
        // Use the h2 header which has the id
        expect(screen.getByRole('heading', { level: 2, name: 'Confirm Deletion' })).toBeInTheDocument();
      });
    };

    it('should show warning about data deletion', async () => {
      await goToConfirmStep();

      expect(screen.getByText(/This will permanently delete ALL your data/)).toBeInTheDocument();
      expect(screen.getByText(/This action cannot be undone/)).toBeInTheDocument();
    });

    it('should show confirmation input', async () => {
      await goToConfirmStep();

      expect(screen.getByPlaceholderText('DELETE')).toBeInTheDocument();
      expect(screen.getByText('Type DELETE to confirm:')).toBeInTheDocument();
    });

    it('should disable delete button when confirmation text is wrong', async () => {
      await goToConfirmStep();

      const deleteButton = screen.getByRole('button', { name: /Delete All Cloud Data/i });
      expect(deleteButton).toBeDisabled();

      const confirmInput = screen.getByPlaceholderText('DELETE');
      await user.type(confirmInput, 'WRONG');
      expect(deleteButton).toBeDisabled();
    });

    it('should enable delete button when DELETE is typed (case insensitive)', async () => {
      await goToConfirmStep();

      const confirmInput = screen.getByPlaceholderText('DELETE');
      await user.type(confirmInput, 'delete');

      const deleteButton = screen.getByRole('button', { name: /Delete All Cloud Data/i });
      expect(deleteButton).not.toBeDisabled();
    });

    it('should go back to auth step when back button clicked', async () => {
      await goToConfirmStep();

      await user.click(screen.getByRole('button', { name: 'Back' }));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Sign In' })).toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // DELETE FLOW TESTS
  // ==========================================================================

  describe('delete flow', () => {
    const triggerDelete = async () => {
      renderModal();

      // Auth step - password input uses useRef for security
      const passwordInput = screen.getByPlaceholderText('Enter your password');
      await user.type(passwordInput, 'testpassword');

      await user.click(screen.getByRole('button', { name: 'Sign In' }));

      await waitFor(() => {
        // Use the h2 header which has the id
        expect(screen.getByRole('heading', { level: 2, name: 'Confirm Deletion' })).toBeInTheDocument();
      });

      // Confirm step - type DELETE to confirm
      const confirmInput = screen.getByPlaceholderText('DELETE');
      await user.type(confirmInput, 'DELETE');

      await user.click(screen.getByRole('button', { name: /Delete All Cloud Data/i }));
    };

    it('should show deleting state', async () => {
      mockClearAllUserData.mockImplementation(() => new Promise(() => {})); // Never resolves

      await triggerDelete();

      await waitFor(() => {
        expect(screen.getByText('Deleting your cloud data...')).toBeInTheDocument();
      });
    });

    it('should call clearAllUserData on SupabaseDataStore', async () => {
      await triggerDelete();

      await waitFor(() => {
        expect(mockInitialize).toHaveBeenCalled();
        expect(mockClearAllUserData).toHaveBeenCalled();
      });
    });

    it('should clear cloud account info on success', async () => {
      await triggerDelete();

      await waitFor(() => {
        expect(mockClearCloudAccountInfo).toHaveBeenCalled();
      });
    });

    it('should sign out after deletion for security', async () => {
      await triggerDelete();

      await waitFor(() => {
        // Verify initialize() is called before signOut() (auth service requires initialization)
        // The auth service is created twice: once for signIn, once for signOut
        expect(mockAuthInitialize).toHaveBeenCalledTimes(2);
        expect(mockSignOut).toHaveBeenCalled();
      });
    });

    it('should still show success even if signOut fails', async () => {
      mockSignOut.mockRejectedValue(new Error('Network error'));

      await triggerDelete();

      // Should still show success - signOut is non-critical cleanup
      await waitFor(() => {
        expect(screen.getByText('Cloud Data Deleted')).toBeInTheDocument();
      });
    });

    it('should show success step after deletion', async () => {
      await triggerDelete();

      await waitFor(() => {
        expect(screen.getByText('Cloud Data Deleted')).toBeInTheDocument();
        expect(screen.getByText(/All your data has been permanently removed/)).toBeInTheDocument();
      });
    });

    it('should call onComplete when done button clicked on success', async () => {
      await triggerDelete();

      await waitFor(() => {
        expect(screen.getByText('Cloud Data Deleted')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Done' }));

      expect(mockOnComplete).toHaveBeenCalled();
    });

    it('should show error step on deletion failure', async () => {
      mockClearAllUserData.mockRejectedValue(new Error('Network error'));

      await triggerDelete();

      await waitFor(() => {
        expect(screen.getByText('Deletion Failed')).toBeInTheDocument();
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('should allow retry from error step', async () => {
      mockClearAllUserData.mockRejectedValueOnce(new Error('Network error'));

      await triggerDelete();

      await waitFor(() => {
        expect(screen.getByText('Deletion Failed')).toBeInTheDocument();
      });

      // Reset mock for retry
      mockClearAllUserData.mockResolvedValue(undefined);
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

      await waitFor(() => {
        // Use the h2 header which has the id
        expect(screen.getByRole('heading', { level: 2, name: 'Confirm Deletion' })).toBeInTheDocument();
      });
    });

    it('should verify backend is supabase before deletion', async () => {
      mockGetBackendName.mockReturnValue('local');

      await triggerDelete();

      await waitFor(() => {
        expect(screen.getByText('Deletion Failed')).toBeInTheDocument();
        expect(screen.getByText(/Expected supabase backend but got local/)).toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // ACCESSIBILITY TESTS
  // ==========================================================================

  describe('accessibility', () => {
    it('should have proper ARIA attributes', () => {
      renderModal();

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby', 'cloud-auth-modal-title');
    });

    it('should have visible labels for inputs', () => {
      renderModal();

      // Labels are visible text, not aria-labelledby
      expect(screen.getByText('Email')).toBeInTheDocument();
      expect(screen.getByText('Password')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // EDGE CASES
  // ==========================================================================

  describe('edge cases', () => {
    it('should handle rapid button clicks without double submission', async () => {
      // Make signIn take time so we can verify deduplication
      mockSignIn.mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 100))
      );

      renderModal();

      const passwordInput = screen.getByPlaceholderText('Enter your password');
      await user.type(passwordInput, 'testpassword');

      const signInButton = screen.getByRole('button', { name: 'Sign In' });

      // First click starts the submission
      await user.click(signInButton);

      // Button should be disabled now, additional clicks won't work
      expect(signInButton).toBeDisabled();

      // Wait for the mock to complete
      await waitFor(() => {
        expect(mockSignIn).toHaveBeenCalledTimes(1);
      });
    });

    it('should handle Enter key during submission without duplicate calls', async () => {
      mockSignIn.mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 100))
      );

      renderModal();

      const passwordInput = screen.getByPlaceholderText('Enter your password');
      // Type password and press Enter in one action
      await user.type(passwordInput, 'testpassword{Enter}');

      // isAuthenticating should be true now, preventing another submission
      await waitFor(() => {
        expect(mockSignIn).toHaveBeenCalledTimes(1);
      });
    });

    it('should close modal when Escape is pressed during auth step', async () => {
      renderModal();

      // Press Escape
      fireEvent.keyDown(document, { key: 'Escape' });

      expect(mockOnCancel).toHaveBeenCalled();
    });

    it('should NOT close modal when Escape is pressed during authentication', async () => {
      // Make signIn take time so we can test Escape during auth
      mockSignIn.mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 200))
      );

      renderModal();

      const passwordInput = screen.getByPlaceholderText('Enter your password');
      await user.type(passwordInput, 'testpassword');

      // Start authentication
      await user.click(screen.getByRole('button', { name: 'Sign In' }));

      // Wait for "Signing in..." to appear (confirms isAuthenticating is true)
      await waitFor(() => {
        expect(screen.getByText('Signing in...')).toBeInTheDocument();
      });

      // Try to close with Escape - should be blocked
      fireEvent.keyDown(document, { key: 'Escape' });

      // onCancel should NOT have been called
      expect(mockOnCancel).not.toHaveBeenCalled();
    });

    it('should NOT close modal when Escape is pressed during deleting step', async () => {
      // Make deletion take time
      mockClearAllUserData.mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 200))
      );

      renderModal();

      // Go through auth -> confirm -> start delete
      const passwordInput = screen.getByPlaceholderText('Enter your password');
      await user.type(passwordInput, 'testpassword');
      await user.click(screen.getByRole('button', { name: 'Sign In' }));

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 2, name: 'Confirm Deletion' })).toBeInTheDocument();
      });

      const confirmInput = screen.getByPlaceholderText('DELETE');
      await user.type(confirmInput, 'DELETE');
      await user.click(screen.getByRole('button', { name: /Delete All Cloud Data/i }));

      // Wait for deleting step
      await waitFor(() => {
        expect(screen.getByText('Deleting your cloud data...')).toBeInTheDocument();
      });

      // Try to close with Escape - should be blocked
      fireEvent.keyDown(document, { key: 'Escape' });

      // onCancel should NOT have been called
      expect(mockOnCancel).not.toHaveBeenCalled();
    });
  });
});
