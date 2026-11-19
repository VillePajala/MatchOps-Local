'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthProvider';
import { useFirstGameExists, useHomeShowing, useSetupWizardActive } from '@/components/setupWizardActive';
import logger from '@/utils/logger';
import { primaryButtonStyle, secondaryButtonStyle } from '@/styles/modalStyles';

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
  // Defer to the first-sign-in setup wizard (Onboarding v2): the prompt must
  // never pop over the wizard's steps.
  const wizardActive = useSetupWizardActive();
  // Re-gate (Onboarding v2 PR 22): never mid-onboarding - the prompt waits
  // until the FIRST GAME exists. Existing users with games see no change.
  const hasFirstGame = useFirstGameExists();
  // Home only (review 7.5): never over a live match, e.g. after returning to the
  // app mid-match. Leaving Home before the delay runs out cancels it.
  const homeShowing = useHomeShowing();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Delay rendering by 5 seconds after showMarketingPrompt becomes true.
  // This avoids the prompt appearing over auth/start screens during post-login transitions.
  useEffect(() => {
    if (showMarketingPrompt && !wizardActive && hasFirstGame && homeShowing) {
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
  }, [showMarketingPrompt, wizardActive, hasFirstGame, homeShowing]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 animate-in fade-in duration-300" role="dialog" aria-modal="true" aria-label={t('marketingConsent.promptTitle', 'Stay in the loop?')}>
      <div className="relative s1-list font-ui p-5 max-w-sm w-full">
        {/* Dismiss button */}
        <button
          onClick={handleDismiss}
          className="absolute top-1 right-1 inline-flex h-11 w-11 items-center justify-center rounded-full text-ink-3 hover:text-ink hover:bg-white/[0.06] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
          aria-label={t('common.close', 'Close')}
          disabled={isSubmitting}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h3 className="font-display text-2xl font-bold text-ink pr-10">
          {t('marketingConsent.promptTitle', 'Stay in the loop?')}
        </h3>
        <p className="text-[15px] leading-snug text-ink-2 mt-2 mb-4">
          {t('marketingConsent.promptDescription', 'Get occasional product updates, tips, and new feature announcements via email. You can change this anytime in Settings.')}
        </p>

        {saveFailed && (
          <p role="alert" data-testid="marketing-consent-error" className="text-[13px] text-loss mb-3">
            {t('marketingConsent.updateFailed', 'Failed to update marketing preferences')}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <button
            onClick={handleAccept}
            disabled={isSubmitting}
            className={primaryButtonStyle}
          >
            {t('marketingConsent.promptYes', 'Yes, keep me updated')}
          </button>
          <button
            onClick={handleDecline}
            disabled={isSubmitting}
            className={secondaryButtonStyle}
          >
            {t('marketingConsent.promptNo', 'No thanks')}
          </button>
        </div>
      </div>
    </div>
  );
}
