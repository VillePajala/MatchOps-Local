'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import {
  HiOutlineXMark,
  HiOutlineLockClosed,
  HiOutlineExclamationTriangle,
  HiOutlineArrowPath,
  HiOutlineTrash,
  HiOutlineCheckCircle,
} from 'react-icons/hi2';
import { primaryButtonStyle, secondaryButtonStyle, dangerButtonStyle } from '@/styles/modalStyles';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { SupabaseAuthService } from '@/auth/SupabaseAuthService';
import { SupabaseDataStore } from '@/datastore/SupabaseDataStore';
import { clearCloudAccountInfo } from '@/config/backendConfig';
import logger from '@/utils/logger';

type ModalStep = 'auth' | 'confirm' | 'deleting' | 'success' | 'error';

export interface CloudAuthModalProps {
  /** The email address of the cloud account (pre-filled) */
  email: string;
  /** Called when deletion completes successfully */
  onComplete: () => void;
  /** Called when user cancels or closes the modal */
  onCancel: () => void;
}

/**
 * Cloud Authentication Modal for Re-Authentication
 *
 * Used when user wants to delete cloud data from local mode.
 * Since the session may have expired, we need to re-authenticate first.
 *
 * Steps:
 * 1. Auth - Enter password to re-authenticate
 * 2. Confirm - Type DELETE to confirm deletion
 * 3. Deleting - Progress while deleting
 * 4. Success - Deletion complete
 * 5. Error - Handle deletion failures with retry option
 *
 * @see docs/03-active-plans/pr11-reverse-migration-plan.md
 */
const CloudAuthModal: React.FC<CloudAuthModalProps> = ({
  email,
  onComplete,
  onCancel,
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const modalRef = useRef<HTMLDivElement>(null);

  // SECURITY: Password input ref (uncontrolled) - prevents password from appearing in React DevTools/state snapshots
  const passwordInputRef = useRef<HTMLInputElement>(null);

  // Modal state
  const [step, setStep] = useState<ModalStep>('auth');
  const [hasPassword, setHasPassword] = useState(false); // Track if password has value, not the value itself
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Focus trap
  useFocusTrap(modalRef, true);

  // SECURITY: Clear password input when modal unmounts
  useEffect(() => {
    // Capture ref value at effect setup time for cleanup
    const passwordInput = passwordInputRef.current;
    return () => {
      // Clear password on unmount
      if (passwordInput) {
        passwordInput.value = '';
      }
    };
  }, []);

  /**
   * Handle cancel - clear sensitive data before closing
   */
  const handleCancel = useCallback(() => {
    // SECURITY: Clear password input before closing
    if (passwordInputRef.current) {
      passwordInputRef.current.value = '';
    }
    setHasPassword(false);
    onCancel();
  }, [onCancel]);

  // Handle Escape key to close modal (when not busy)
  useEffect(() => {
    const handleEscapeKey = (e: KeyboardEvent) => {
      // Don't allow closing during deleting or authenticating
      if (e.key === 'Escape' && step !== 'deleting' && !isAuthenticating) {
        handleCancel();
      }
    };

    document.addEventListener('keydown', handleEscapeKey);
    return () => document.removeEventListener('keydown', handleEscapeKey);
  }, [step, isAuthenticating, handleCancel]);

  /**
   * Handle sign in attempt
   */
  const handleSignIn = useCallback(async () => {
    const password = passwordInputRef.current?.value || '';
    if (!password.trim()) {
      setError(t('cloudAuth.errors.passwordRequired', 'Password is required'));
      return;
    }

    setIsAuthenticating(true);
    setError(null);

    try {
      // Use SupabaseAuthService directly since this modal is specifically for
      // re-authenticating against cloud (Supabase), even when in local mode.
      // Using getAuthService() would return LocalAuthService which throws NotSupportedError.
      const authService = new SupabaseAuthService();
      await authService.initialize();
      await authService.signIn(email, password);

      // Authentication successful, proceed to confirm step
      setStep('confirm');
    } catch (err) {
      logger.error('[CloudAuthModal] Sign in failed:', err);
      // SECURITY: Clear password on failed attempt
      if (passwordInputRef.current) {
        passwordInputRef.current.value = '';
      }
      setHasPassword(false);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(t('cloudAuth.errors.signInFailed', 'Sign in failed. Please try again.'));
      }
    } finally {
      setIsAuthenticating(false);
    }
  }, [email, t]);

  /**
   * Handle delete confirmation
   */
  const handleDelete = useCallback(async () => {
    // Prevent double-submission during the brief moment before state updates
    if (isDeleting) {
      return;
    }
    if (confirmText.toUpperCase() !== 'DELETE') {
      return;
    }

    setIsDeleting(true);
    setStep('deleting');
    setError(null);

    let cloudStore: SupabaseDataStore | null = null;
    try {
      // Create SupabaseDataStore directly since we're in local mode
      // but need to delete cloud data after re-authentication
      cloudStore = new SupabaseDataStore();
      await cloudStore.initialize();

      // Verify we're connected to cloud backend
      const backendName = cloudStore.getBackendName();
      if (backendName !== 'supabase') {
        throw new Error(`Expected supabase backend but got ${backendName}`);
      }

      // Delete all cloud data
      await cloudStore.clearAllUserData();

      // Clear stored cloud account info
      clearCloudAccountInfo();

      // SECURITY: Invalidate the Supabase session to prevent session hijacking
      // The session was created for deletion only - don't leave it active
      // This is non-critical cleanup - if it fails, deletion still succeeded
      try {
        const authService = new SupabaseAuthService();
        await authService.initialize();
        await authService.signOut();
      } catch (signOutErr) {
        // Non-critical: data is already deleted, session will expire naturally
        logger.warn('[CloudAuthModal] Sign out after deletion failed (non-critical):', signOutErr);
      }

      // SECURITY: Clear sensitive data
      if (passwordInputRef.current) {
        passwordInputRef.current.value = '';
      }
      setHasPassword(false);

      // Invalidate React Query cache (non-critical - don't fail deletion for this)
      try {
        await queryClient.invalidateQueries();
      } catch (cacheErr) {
        logger.warn('[CloudAuthModal] Failed to invalidate query cache (non-critical):', cacheErr);
      }

      // Show success step
      setStep('success');
    } catch (err) {
      logger.error('[CloudAuthModal] Delete failed:', err);
      setError(err instanceof Error ? err.message : t('cloudAuth.errors.deleteFailed', 'Delete failed'));
      setStep('error');
    } finally {
      if (cloudStore) {
        try {
          await cloudStore.close();
        } catch (closeErr) {
          logger.warn('[CloudAuthModal] Failed to close cloud store (non-critical):', closeErr);
        }
      }
      setIsDeleting(false);
    }
  }, [confirmText, isDeleting, queryClient, t]);

  /**
   * Handle key press for form submission
   */
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (step === 'auth' && hasPassword && !isAuthenticating) {
        handleSignIn();
      } else if (step === 'confirm' && confirmText.toUpperCase() === 'DELETE' && !isDeleting) {
        handleDelete();
      }
    }
  }, [step, hasPassword, isAuthenticating, confirmText, isDeleting, handleSignIn, handleDelete]);

  /**
   * Render step content
   */
  const renderContent = () => {
    switch (step) {
      case 'auth':
        return (
          <>
            {/* Icon and description */}
            <div className="text-center mb-6">
              <HiOutlineLockClosed className="h-12 w-12 text-sky-400 mx-auto mb-3" />
              <p className="text-slate-300">
                {t('cloudAuth.description', 'Sign in to delete your cloud data.')}
              </p>
            </div>

            {/* Email (read-only) */}
            <div className="mb-4">
              <label className="block text-sm text-slate-400 mb-1">
                {t('cloudAuth.email', 'Email')}
              </label>
              <input
                type="email"
                value={email}
                readOnly
                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-300 cursor-not-allowed"
              />
            </div>

            {/* Password - SECURITY: Using uncontrolled input to keep password out of React state/DevTools */}
            <div className="mb-4">
              <label className="block text-sm text-slate-400 mb-1">
                {t('cloudAuth.password', 'Password')}
              </label>
              <input
                ref={passwordInputRef}
                type="password"
                defaultValue=""
                onChange={(e) => setHasPassword(!!e.target.value.trim())}
                onKeyDown={handleKeyDown}
                placeholder={t('cloudAuth.passwordPlaceholder', 'Enter your password')}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                autoComplete="current-password"
                autoFocus
              />
            </div>

            {/* Error message */}
            {error && (
              <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-red-900/30 border border-red-700">
                <HiOutlineExclamationTriangle className="h-5 w-5 text-red-400 flex-shrink-0" />
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={handleCancel}
                className={secondaryButtonStyle}
                disabled={isAuthenticating}
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                onClick={handleSignIn}
                className={primaryButtonStyle}
                disabled={!hasPassword || isAuthenticating}
              >
                {isAuthenticating ? (
                  <>
                    <HiOutlineArrowPath className="h-5 w-5 mr-2 animate-spin" />
                    {t('cloudAuth.signingIn', 'Signing in...')}
                  </>
                ) : (
                  t('cloudAuth.signIn', 'Sign In')
                )}
              </button>
            </div>
          </>
        );

      case 'confirm':
        return (
          <>
            {/* Warning icon */}
            <div className="text-center mb-6">
              <HiOutlineExclamationTriangle className="h-12 w-12 text-amber-400 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-slate-100 mb-2">
                {t('cloudAuth.confirm.title', 'Confirm Deletion')}
              </h3>
            </div>

            {/* Warning message */}
            <div className="bg-amber-900/30 border border-amber-700 rounded-lg p-4 mb-6">
              <p className="text-amber-200 mb-2">
                {t('cloudAuth.confirm.warning', 'This will permanently delete ALL your data from our servers:')}
              </p>
              <ul className="text-sm text-amber-300 space-y-1 ml-4">
                <li>&bull; {t('cloudAuth.confirm.allGames', 'All games and game data')}</li>
                <li>&bull; {t('cloudAuth.confirm.allPlayers', 'All players and rosters')}</li>
                <li>&bull; {t('cloudAuth.confirm.allOther', 'All seasons, tournaments, and settings')}</li>
              </ul>
              <p className="text-amber-200 mt-3 font-medium">
                {t('cloudAuth.confirm.cannotUndo', 'This action cannot be undone.')}
              </p>
            </div>

            {/* Confirmation input */}
            <div className="mb-6">
              <label className="block text-sm text-slate-400 mb-2">
                {t('cloudAuth.confirm.typeDelete', 'Type DELETE to confirm:')}
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="DELETE"
                className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                autoComplete="off"
                autoFocus
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setConfirmText('');
                  setStep('auth');
                }}
                className={secondaryButtonStyle}
              >
                {t('common.back', 'Back')}
              </button>
              <button
                onClick={handleDelete}
                className={dangerButtonStyle}
                disabled={confirmText.toUpperCase() !== 'DELETE'}
              >
                <HiOutlineTrash className="h-5 w-5 mr-2" />
                {t('cloudAuth.confirm.deleteAll', 'Delete All Cloud Data')}
              </button>
            </div>
          </>
        );

      case 'deleting':
        return (
          <div className="text-center py-8">
            <HiOutlineArrowPath className="h-12 w-12 text-red-400 mx-auto animate-spin mb-4" />
            <p className="text-slate-300">
              {t('cloudAuth.deleting', 'Deleting your cloud data...')}
            </p>
            <p className="text-sm text-slate-500 mt-2">
              {t('cloudAuth.deletingNote', 'This may take a moment.')}
            </p>
          </div>
        );

      case 'success':
        return (
          <>
            <div className="text-center mb-6">
              <HiOutlineCheckCircle className="h-12 w-12 text-green-400 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-slate-100 mb-2">
                {t('cloudAuth.success.title', 'Cloud Data Deleted')}
              </h3>
              <p className="text-slate-400">
                {t('cloudAuth.success.description', 'All your data has been permanently removed from our servers.')}
              </p>
            </div>

            <div className="flex justify-center">
              <button
                onClick={onComplete}
                className={primaryButtonStyle}
              >
                {t('common.done', 'Done')}
              </button>
            </div>
          </>
        );

      case 'error':
        return (
          <>
            <div className="text-center mb-6">
              <HiOutlineXMark className="h-12 w-12 text-red-400 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-slate-100 mb-2">
                {t('cloudAuth.error.title', 'Deletion Failed')}
              </h3>
            </div>

            {/* Error message */}
            {error && (
              <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-6">
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 justify-center">
              <button
                onClick={handleCancel}
                className={secondaryButtonStyle}
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                onClick={() => {
                  setError(null);
                  setStep('confirm');
                }}
                className={primaryButtonStyle}
              >
                {t('common.retry', 'Retry')}
              </button>
            </div>
          </>
        );

      default:
        return null;
    }
  };

  /**
   * Get step title
   */
  const getStepTitle = () => {
    switch (step) {
      case 'auth':
        return t('cloudAuth.title.auth', 'Sign In');
      case 'confirm':
        return t('cloudAuth.title.confirm', 'Confirm Deletion');
      case 'deleting':
        return t('cloudAuth.title.deleting', 'Deleting...');
      case 'success':
        return t('cloudAuth.title.success', 'Complete');
      case 'error':
        return t('cloudAuth.title.error', 'Error');
      default:
        return '';
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cloud-auth-modal-title"
        className="relative w-full max-w-md mx-4 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 id="cloud-auth-modal-title" className="text-lg font-semibold text-slate-100">
            {getStepTitle()}
          </h2>
          {step !== 'deleting' && (
            <button
              onClick={handleCancel}
              className="text-slate-400 hover:text-slate-200 transition-colors"
              aria-label={t('common.close', 'Close')}
            >
              <HiOutlineXMark className="h-6 w-6" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default CloudAuthModal;
