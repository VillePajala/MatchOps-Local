/**
 * AuthModal - Authentication modal for signing in/up from any mode.
 *
 * Issue #336: Allows users to sign in while in local mode.
 * Authentication is independent of data storage mode (auth ≠ sync).
 *
 * Features:
 * - Sign in with email/password
 * - Sign up with email/password (with GDPR consent)
 * - Password reset via email
 * - Can be shown from WelcomeScreen or Settings
 *
 * @see docs/03-active-plans/supabase-implementation-guide.md
 */

'use client';

import React, { useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { isAndroid } from '@/utils/platform';
import AuthForm from './AuthForm';
import type { AuthMode } from './AuthForm';

export interface AuthModalProps {
  /** Initial mode to show */
  initialMode?: AuthMode;
  /** Called when auth is successful (user signed in or signed up) */
  onSuccess: () => void;
  /** Called when user cancels/closes the modal */
  onCancel: () => void;
  /** Whether to allow registration (false on desktop - must subscribe via Android app) */
  allowRegistration?: boolean;
}

/**
 * Authentication modal component.
 *
 * Can be used from WelcomeScreen or Settings to sign in/up
 * without changing the data storage mode.
 */
export default function AuthModal({
  initialMode = 'signIn',
  onSuccess,
  onCancel,
  allowRegistration,
}: AuthModalProps) {
  const { t } = useTranslation();
  const modalRef = useRef<HTMLDivElement>(null);

  // Platform-enforced registration: only allow on Android (Play Billing required)
  // If prop is explicitly set, respect it; otherwise default based on platform
  const effectiveAllowRegistration = useMemo(() => {
    if (allowRegistration !== undefined) {
      return allowRegistration;
    }
    // Default: only allow registration on Android
    return isAndroid();
  }, [allowRegistration]);

  // Focus trap
  useFocusTrap(modalRef, true);

  // Handle Escape key
  useEffect(() => {
    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleEscapeKey);
    return () => document.removeEventListener('keydown', handleEscapeKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-slate-900 text-white overflow-hidden">
      {/* === AMBIENT BACKGROUND GLOWS === */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Blue glow - top right */}
        <div className="absolute -top-[20%] -right-[15%] w-[60%] h-[60%] bg-sky-500/10 rounded-full blur-3xl" />
        {/* Blue glow - bottom left */}
        <div className="absolute -bottom-[15%] -left-[10%] w-[55%] h-[55%] bg-sky-500/15 rounded-full blur-3xl" />
      </div>

      {/* === MAIN CONTENT === */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        className="relative z-10 flex-1 flex flex-col px-6 py-8 pb-safe"
      >
        {/* === TOP: Back Button === */}
        <div className="flex justify-between items-center mb-4">
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors text-sm"
            aria-label={t('common.back', 'Back')}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {t('common.back', 'Back')}
          </button>
          <div /> {/* Spacer for alignment */}
        </div>

        {/* === HERO: App Name === */}
        <div className="flex-1 flex flex-col justify-center">
          <div className="max-w-sm mx-auto w-full">
            {/* App name */}
            <div className="text-center mb-8">
              <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-amber-400">
                MatchOps
              </h1>
            </div>

            <AuthForm
              initialMode={initialMode}
              allowRegistration={effectiveAllowRegistration}
              onSuccess={onSuccess}
              autoFocus
              titleId="auth-modal-title"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
