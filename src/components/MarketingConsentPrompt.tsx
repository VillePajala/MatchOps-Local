'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthProvider';
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Delay rendering by 5 seconds after showMarketingPrompt becomes true.
  // This avoids the prompt appearing over auth/start screens during post-login transitions.
  useEffect(() => {
    if (showMarketingPrompt) {
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
  }, [showMarketingPrompt]);

  if (!showMarketingPrompt || !isReady) return null;

  const handleAccept = async () => {
    setIsSubmitting(true);
    try {
      const result = await setMarketingConsent(true);
      if (result.error) {
        logger.warn('[MarketingConsentPrompt] Failed to grant consent:', result.error);
      }
    } finally {
      setIsSubmitting(false);
      dismissMarketingPrompt();
    }
  };

  const handleDecline = () => {
    dismissMarketingPrompt();
  };

  const handleDismiss = () => {
    dismissMarketingPrompt();
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 max-w-md mx-auto animate-in slide-in-from-bottom duration-300">
      <div className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-4">
        {/* Dismiss button */}
        <button
          onClick={handleDismiss}
          className="absolute top-2 right-2 text-slate-400 hover:text-slate-200 p-1 transition-colors"
          aria-label={t('common.close', 'Close')}
          disabled={isSubmitting}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h3 className="text-sm font-semibold text-slate-100 pr-6">
          {t('marketingConsent.promptTitle', 'Stay in the loop?')}
        </h3>
        <p className="text-xs text-slate-400 mt-1 mb-3">
          {t('marketingConsent.promptDescription', 'Get occasional product updates, tips, and new feature announcements via email. You can change this anytime in Settings.')}
        </p>

        <div className="flex gap-2">
          <button
            onClick={handleAccept}
            disabled={isSubmitting}
            className="flex-1 px-3 py-1.5 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >
            {t('marketingConsent.promptYes', 'Yes, keep me updated')}
          </button>
          <button
            onClick={handleDecline}
            disabled={isSubmitting}
            className="flex-1 px-3 py-1.5 text-sm font-medium rounded-md bg-slate-700 text-slate-300 hover:bg-slate-600 disabled:opacity-50 transition-colors"
          >
            {t('marketingConsent.promptNo', 'No thanks')}
          </button>
        </div>
      </div>
    </div>
  );
}
