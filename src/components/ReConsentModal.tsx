'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { translateAuthError } from '@/utils/authHelpers';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthProvider';
import {
  primaryButtonStyle,
  DialogBackdrop,
  secondaryButtonStyle,
  dialogTitleStyle,
  linkStyle,
  checkboxStyle,
  fieldErrorStyle,
} from '@/styles/modalStyles';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { POLICY_VERSION } from '@/config/constants';

/**
 * ReConsentModal - Modal shown when user needs to accept updated Terms/Privacy Policy.
 *
 * Displayed when:
 * - User signs in with consent for an older policy version
 * - Policy version has been updated since user last consented
 *
 * User must accept to continue using the app.
 */
export function ReConsentModal() {
  const { t } = useTranslation();
  const { needsReConsent, acceptReConsent, signOut } = useAuth();
  const [hasAccepted, setHasAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useFocusTrap(modalRef, needsReConsent);

  // Escape key handler — decline and sign out
  useEffect(() => {
    if (!needsReConsent) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        signOut();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [needsReConsent, signOut]);

  // Don't render if re-consent not needed
  if (!needsReConsent) {
    return null;
  }

  const handleAccept = async () => {
    if (!hasAccepted) return;

    setIsSubmitting(true);
    setError(null);

    const result = await acceptReConsent();

    if (result.error) {
      setError(result.error);
      setIsSubmitting(false);
    }
    // If successful, needsReConsent will be set to false and modal will unmount
  };

  const handleDecline = async () => {
    // If user declines, sign them out
    await signOut();
  };

  return (
    <DialogBackdrop className="z-[100]">
      <div ref={modalRef} className="s1-list font-ui mx-4 flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="reconsent-title">
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-hairline">
          <h2 id="reconsent-title" className={dialogTitleStyle}>
            {t('reConsent.title', 'Updated Terms & Privacy Policy')}
          </h2>
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <p className="text-ink-2 text-sm">
            {t(
              'reConsent.description',
              'We have updated our Terms of Service and Privacy Policy. Please review and accept the new terms to continue using MatchOps.'
            )}
          </p>

          <p className="text-ink-3 text-sm">
            {t('reConsent.version', 'Policy Version')}: {POLICY_VERSION}
          </p>

          {/* Links to policies */}
          <div className="flex gap-2 text-sm">
            <Link
              href="/terms"
              target="_blank"
              className={`${linkStyle} inline-flex min-h-11 items-center`}
            >
              {t('reConsent.termsLink', 'Terms of Service')}
            </Link>
            <Link
              href="/privacy-policy"
              target="_blank"
              className={`${linkStyle} inline-flex min-h-11 items-center`}
            >
              {t('reConsent.privacyLink', 'Privacy Policy')}
            </Link>
          </div>

          {/* Consent checkbox */}
          <div className="flex items-start gap-3 mt-4 min-h-11">
            <input
              type="checkbox"
              id="re-consent-checkbox"
              checked={hasAccepted}
              onChange={(e) => setHasAccepted(e.target.checked)}
              disabled={isSubmitting}
              className={`${checkboxStyle} mt-0.5 shrink-0 cursor-pointer`}
            />
            <label
              htmlFor="re-consent-checkbox"
              className="text-ink-2 text-sm leading-relaxed cursor-pointer"
            >
              {t(
                'reConsent.acceptCheckbox',
                'I have read and agree to the updated Terms of Service and Privacy Policy'
              )}
            </label>
          </div>

          {/* Error message */}
          {error && (
            <p className={fieldErrorStyle}>{translateAuthError(error, t)}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-hairline flex gap-3">
          <button
            onClick={handleDecline}
            disabled={isSubmitting}
            className={`flex-1 ${secondaryButtonStyle}`}
          >
            {t('reConsent.decline', 'Decline & Sign Out')}
          </button>
          <button
            onClick={handleAccept}
            disabled={!hasAccepted || isSubmitting}
            className={`flex-1 ${primaryButtonStyle}`}
          >
            {isSubmitting
              ? t('reConsent.accepting', 'Accepting...')
              : t('reConsent.accept', 'Accept & Continue')}
          </button>
        </div>
      </div>
    </DialogBackdrop>
  );
}

export default ReConsentModal;
