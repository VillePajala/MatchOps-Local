'use client';

import React, { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { HiSparkles, HiCheck } from 'react-icons/hi2';
import { primaryButtonStyle, secondaryButtonStyle } from '@/styles/modalStyles';
import { ResourceType, PREMIUM_PRICE, getLimit } from '@/config/premiumLimits';
import { usePremium } from '@/hooks/usePremium';

export interface UpgradePromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The resource type that triggered the limit */
  resource?: ResourceType;
  /** Current count of the resource (for display) */
  currentCount?: number;
}

/**
 * Modal shown when user hits a free tier limit
 *
 * Explains the limit, shows what premium offers, and provides
 * upgrade/dismiss options.
 *
 * Note: Actual purchase flow will be added in P4C (Play Billing integration).
 * For now, the upgrade button shows a placeholder message.
 */
const UpgradePromptModal: React.FC<UpgradePromptModalProps> = ({
  isOpen,
  onClose,
  resource,
  currentCount,
}) => {
  const { t } = useTranslation();
  const { grantPremiumAccess } = usePremium();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  // Focus management and keyboard handler
  useEffect(() => {
    if (isOpen) {
      previousActiveElementRef.current = document.activeElement as HTMLElement;
      closeButtonRef.current?.focus();

      const handleEscape = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          onClose();
        }
      };

      document.addEventListener('keydown', handleEscape);

      return () => {
        document.removeEventListener('keydown', handleEscape);
        if (previousActiveElementRef.current) {
          previousActiveElementRef.current.focus();
        }
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const limit = resource ? getLimit(resource) : 0;
  // Use translated resource name (singular or plural based on limit)
  const resourceKey = resource ? (limit === 1 ? `premium.resource.${resource}` : `premium.resource.${resource}_plural`) : '';
  const resourceName = resource ? t(resourceKey, resource) : '';

  // For development testing only - will be replaced by Play Billing in P4C
  const handleUpgradeClick = async () => {
    // TODO: P4C will replace this with actual Play Billing flow
    // For now, show alert explaining this is not yet implemented
    const isDev = process.env.NODE_ENV === 'development';

    if (isDev) {
      const confirmGrant = window.confirm(
        'DEV MODE: Grant premium access for testing?\n\n' +
        'In production, this will open the Google Play purchase flow.'
      );
      if (confirmGrant) {
        await grantPremiumAccess('dev-test-token');
        onClose();
      }
    } else {
      // In production without Play Billing, show coming soon message
      window.alert(t('premium.purchaseComingSoon', 'In-app purchase coming soon!'));
    }
  };

  const titleId = 'upgrade-prompt-modal-title';

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[80] font-display"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className="bg-slate-800 p-6 rounded-lg border border-slate-600 w-[min(28rem,calc(100%_-_2.5rem))] sm:w-[min(32rem,calc(100%_-_4rem))] mx-auto shadow-2xl"
      >
        {/* Header with icon */}
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-amber-500/20 rounded-full">
            <HiSparkles className="w-6 h-6 text-amber-400" aria-hidden="true" />
          </div>
          <h3 id={titleId} className="text-lg font-semibold text-slate-100">
            {t('premium.freeVersionLimitReached', 'Free version limit reached')}
          </h3>
        </div>

        {/* Limit explanation - only show specific resource info if triggered by hitting a limit */}
        {resource && (
          <div className="mb-4 p-3 bg-slate-700/50 rounded-md border border-slate-600">
            <p className="text-slate-300 text-sm">
              {t('premium.limitExplanation', {
                defaultValue: "You've reached the free tier limit of {{limit}} {{resource}}.",
                limit,
                resource: resourceName,
              })}
              {currentCount !== undefined && (
                <span className="block mt-1 text-slate-400 text-xs">
                  {t('premium.currentUsage', {
                    defaultValue: 'Current: {{count}}/{{limit}}',
                    count: currentCount,
                    limit,
                  })}
                </span>
              )}
            </p>
          </div>
        )}

        {/* What premium offers */}
        <div className="mb-5">
          <p className="text-slate-200 font-medium mb-2">
            {t('premium.fullVersionIncludes', 'The full version includes:')}
          </p>
          <ul className="space-y-1.5">
            {[
              t('premium.benefit.unlimitedTeams', 'Unlimited teams'),
              t('premium.benefit.unlimitedPlayers', 'Unlimited players'),
              t('premium.benefit.unlimitedSeasons', 'Unlimited seasons & tournaments'),
              t('premium.benefit.unlimitedGames', 'Unlimited games per competition'),
            ].map((benefit, index) => (
              <li key={index} className="flex items-center gap-2 text-sm text-slate-300">
                <HiCheck className="w-4 h-4 text-green-400 flex-shrink-0" aria-hidden="true" />
                {benefit}
              </li>
            ))}
          </ul>
        </div>

        {/* Price */}
        <div className="mb-5 text-center">
          <div className="text-2xl font-bold text-amber-400">{PREMIUM_PRICE}</div>
          <div className="text-slate-400 text-sm">
            {t('premium.oneTimePayment', 'one-time payment')}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2">
          <button
            onClick={handleUpgradeClick}
            className={`${primaryButtonStyle} w-full bg-gradient-to-b from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700`}
          >
            {t('premium.upgradeButton', 'Upgrade to Premium')}
          </button>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className={`${secondaryButtonStyle} w-full`}
          >
            {t('premium.maybeLater', 'Maybe Later')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpgradePromptModal;
