/**
 * SubscriptionWarningBanner
 *
 * Displays warning banner when subscription is in grace period or expired.
 * Shows days remaining in grace period and provides renew action.
 *
 * @see docs/03-active-plans/billing-implementation-plan.md - Phase 6
 */

'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineExclamationTriangle } from 'react-icons/hi2';
import { useSubscriptionOptional } from '@/contexts/SubscriptionContext';
import { isAndroid } from '@/utils/platform';

interface SubscriptionWarningBannerProps {
  /** Callback when user clicks renew button */
  onRenew?: () => void;
}

/**
 * Calculate days remaining until a date
 */
function daysUntil(date: Date): number {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
}

/**
 * Subscription warning banner component
 */
export function SubscriptionWarningBanner({ onRenew }: SubscriptionWarningBannerProps) {
  const { t } = useTranslation();
  const subscription = useSubscriptionOptional();

  // Don't render if no subscription context or status doesn't warrant warning
  if (!subscription) {
    return null;
  }

  const { status, graceEnd } = subscription;

  // Only show for grace or expired status
  if (status !== 'grace' && status !== 'expired') {
    return null;
  }

  const daysLeft = graceEnd ? daysUntil(graceEnd) : 0;
  const isExpired = status === 'expired';
  const canRenew = isAndroid();

  return (
    <div
      className={`px-4 py-3 ${
        isExpired
          ? 'bg-red-900/50 border-b border-red-800'
          : 'bg-amber-900/50 border-b border-amber-800'
      }`}
      role="alert"
    >
      <div className="flex items-center justify-between gap-4 max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          {/* Warning icon */}
          <HiOutlineExclamationTriangle
            className={`w-5 h-5 flex-shrink-0 ${isExpired ? 'text-red-400' : 'text-amber-400'}`}
            aria-hidden="true"
          />

          {/* Message */}
          <p className="text-sm text-white">
            {isExpired ? (
              t('subscription.expiredWarning', 'Your subscription has expired. Renew to restore cloud access.')
            ) : (
              t('subscription.graceWarning', {
                defaultValue: 'Your subscription has expired. Renew within {{days}} days to keep cloud access.',
                days: daysLeft,
              })
            )}
          </p>
        </div>

        {/* Renew button */}
        {canRenew && onRenew ? (
          <button
            onClick={onRenew}
            className={`px-4 py-2.5 text-sm font-medium rounded-md flex-shrink-0 transition-colors ${
              isExpired
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : 'bg-amber-600 hover:bg-amber-500 text-white'
            }`}
          >
            {t('subscription.renewNow', 'Renew Now')}
          </button>
        ) : !canRenew ? (
          <span className="text-sm text-slate-300">
            {t('subscription.renewOnAndroid', 'Renew via Android app')}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default SubscriptionWarningBanner;
