'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthProvider';
import { primaryButtonStyle, DialogBackdrop, secondaryButtonStyle } from '@/styles/modalStyles';
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
      <div className="bg-slate-800 rounded-lg shadow-2xl max-w-md w-full border border-slate-600 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900/50 border-b border-slate-600">
          <h2 className="text-xl font-bold text-yellow-400">
            {t('reConsent.title', 'Updated Terms & Privacy Policy')}
          </h2>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          <p className="text-slate-300 text-sm">
            {t(
              'reConsent.description',
              'We have updated our Terms of Service and Privacy Policy. Please review and accept the new terms to continue using MatchOps.'
            )}
          </p>

          <p className="text-slate-400 text-xs">
            {t('reConsent.version', 'Policy Version')}: {POLICY_VERSION}
          </p>

          {/* Links to policies */}
          <div className="flex gap-4 text-sm">
            <Link
              href="/terms"
              target="_blank"
              className="text-indigo-400 hover:text-indigo-300 underline"
            >
              {t('reConsent.termsLink', 'Terms of Service')}
            </Link>
            <Link
              href="/privacy-policy"
              target="_blank"
              className="text-indigo-400 hover:text-indigo-300 underline"
            >
              {t('reConsent.privacyLink', 'Privacy Policy')}
            </Link>
          </div>

          {/* Consent checkbox */}
          <div className="flex items-start gap-3 mt-4">
            <input
              type="checkbox"
              id="re-consent-checkbox"
              checked={hasAccepted}
              onChange={(e) => setHasAccepted(e.target.checked)}
              disabled={isSubmitting}
              className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-slate-900 cursor-pointer"
            />
            <label
              htmlFor="re-consent-checkbox"
              className="text-slate-300 text-sm leading-relaxed hover:text-slate-200 transition-colors cursor-pointer"
            >
              {t(
                'reConsent.acceptCheckbox',
                'I have read and agree to the updated Terms of Service and Privacy Policy'
              )}
            </label>
          </div>

          {/* Error message */}
          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-900/30 border-t border-slate-600 flex gap-3">
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
