'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthProvider';
import { useGuidedTourOptional } from '@/contexts/GuidedTourProvider';
import { useFirstGameExists, useSetupWizardActive } from '@/components/setupWizardActive';
import logger from '@/utils/logger';

/**
 * MarketingConsentPrompt - Non-blocking dismissable banner for existing users.
 *
 * Shown once to cloud users who have never been asked about marketing consent.
 * NOT a blocking modal - user can freely dismiss without answering.
 *
 * Visibility controlled by AuthProvider's `showMarketingPrompt` computed value.
 * Includes a render delay to avoid appearing on auth/start screens during
 * the post-login transition.
 */
export default function MarketingConsentPrompt() {
  const { t } = useTranslation();
  const { showMarketingPrompt, setMarketingConsent, dismissMarketingPrompt } = useAuth();
  // Defer to an active first-run guided tour: the prompt used to appear first
  // and BLOCK the tour, leaving a dead window where a brand-new coach could
  // wander off unguided. Now the tour runs immediately and this prompt waits
  // until it finishes (or is skipped). Optional - no provider means no tour.
  const tourActive = useGuidedTourOptional()?.isActive ?? false;
  // Same deferral for the first-sign-in setup wizard (Onboarding v2): the
  // prompt must never pop over the wizard's two steps.
  const wizardActive = useSetupWizardActive();
  // Re-gate (Onboarding v2 PR 22): never mid-onboarding - the prompt waits
  // until the FIRST GAME exists. Existing users with games see no change.
  const hasFirstGame = useFirstGameExists();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Delay rendering by 5 seconds after showMarketingPrompt becomes true.
  // This avoids the prompt appearing over auth/start screens during post-login transitions.
  useEffect(() => {
    if (showMarketingPrompt && !tourActive && !wizardActive && hasFirstGame) {
      timerRef.current = setTimeout(() => {
        setIsReady(true);
      }, 5000);
    } else {
      setIsReady(false);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [showMarketingPrompt, tourActive, wizardActive, hasFirstGame]);

  if (!showMarketingPrompt || !isReady) return null;

  // Dismiss only once the choice is saved (review 6.7): dismissing sets the per-user
  // "seen" flag, so on a failed save the prompt used to vanish for good - a coach who
  // said yes was not opted in and thought they were. On failure the prompt stays,
  // says so, and the coach can try again or close it.
  const submit = async (granted: boolean) => {
    setIsSubmitting(true);
    setSaveFailed(false);
    let saved = false;
    try {
      const result = await setMarketingConsent(granted);
      if (result.error) {
        logger.warn(`[MarketingConsentPrompt] Failed to ${granted ? 'grant consent' : 'record decline'}:`, result.error);
      } else {
        saved = true;
      }
    } catch (error) {
      logger.warn('[MarketingConsentPrompt] Saving the choice threw:', error);
    } finally {
      setIsSubmitting(false);
    }
    if (saved) {
      dismissMarketingPrompt();
    } else {
      setSaveFailed(true);
    }
  };

  const handleAccept = () => submit(true);
  const handleDecline = () => submit(false);

  const handleDismiss = () => {
    dismissMarketingPrompt();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/50 animate-in fade-in duration-300" role="dialog" aria-modal="true" aria-label={t('marketingConsent.promptTitle', 'Stay in the loop?')}>
      <div className="relative bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-5 max-w-sm w-full">
        {/* Dismiss button */}
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 text-slate-400 hover:text-slate-200 p-1 transition-colors"
          aria-label={t('common.close', 'Close')}
          disabled={isSubmitting}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h3 className="text-base font-semibold text-slate-100 pr-6">
          {t('marketingConsent.promptTitle', 'Stay in the loop?')}
        </h3>
        <p className="text-sm text-slate-400 mt-2 mb-4">
          {t('marketingConsent.promptDescription', 'Get occasional product updates, tips, and new feature announcements via email. You can change this anytime in Settings.')}
        </p>

        {saveFailed && (
          <p role="alert" data-testid="marketing-consent-error" className="text-sm text-red-300 mb-3">
            {t('marketingConsent.updateFailed', 'Failed to update marketing preferences')}
          </p>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleAccept}
            disabled={isSubmitting}
            className="flex-1 px-3 py-2 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >
            {t('marketingConsent.promptYes', 'Yes, keep me updated')}
          </button>
          <button
            onClick={handleDecline}
            disabled={isSubmitting}
            className="flex-1 px-3 py-2 text-sm font-medium rounded-md bg-slate-700 text-slate-300 hover:bg-slate-600 disabled:opacity-50 transition-colors"
          >
            {t('marketingConsent.promptNo', 'No thanks')}
          </button>
        </div>
      </div>
    </div>
  );
}
