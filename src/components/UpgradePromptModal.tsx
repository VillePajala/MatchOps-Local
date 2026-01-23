'use client';

import React, { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiSparkles, HiCheck } from 'react-icons/hi2';
import { primaryButtonStyle, secondaryButtonStyle } from '@/styles/modalStyles';
import { ResourceType, PREMIUM_PRICE, PREMIUM_IS_SUBSCRIPTION, getLimit } from '@/config/premiumLimits';
import { PREMIUM_ENFORCEMENT_ENABLED } from '@/config/constants';
import { usePremium } from '@/hooks/usePremium';
import { useToast } from '@/contexts/ToastProvider';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { usePlayBilling } from '@/hooks/usePlayBilling';
import ModalPortal from './ModalPortal';
import logger from '@/utils/logger';
import { isAndroid } from '@/utils/platform';
import { isMockBillingEnabled } from '@/utils/playBilling';

export type UpgradePromptVariant = 'resourceLimit' | 'cloudUpgrade';

export interface UpgradePromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The resource type that triggered the limit */
  resource?: ResourceType;
  /** Current count of the resource (for display) */
  currentCount?: number;
  /** Variant determines UI content: 'resourceLimit' for hitting limits, 'cloudUpgrade' for enabling cloud */
  variant?: UpgradePromptVariant;
  /** Callback after successful upgrade (used by cloudUpgrade variant to continue action) */
  onUpgradeSuccess?: () => void;
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
  variant = 'resourceLimit',
  onUpgradeSuccess,
}) => {
  const { t } = useTranslation();
  const { grantPremiumAccess } = usePremium();
  const { showToast } = useToast();
  const { isAvailable: playBillingAvailable, isPurchasing, details, purchase, restore } = usePlayBilling();
  const [isProcessing, setIsProcessing] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  // Focus trap: keeps Tab cycling within modal
  useFocusTrap(modalRef, isOpen);

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
          previousActiveElementRef.current = null; // Clear ref to prevent stale references
        }
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const limit = resource ? getLimit(resource) : 0;
  // Use translated resource name (singular or plural based on limit)
  const resourceKey = resource ? (limit === 1 ? `premium.resource.${resource}` : `premium.resource.${resource}Plural`) : '';
  const resourceName = resource ? t(resourceKey, resource) : '';

  // Check if purchase is available
  // Conditions:
  // 1. Must be on Android (Play Billing only works there)
  // 2. When PREMIUM_ENFORCEMENT_ENABLED is false, allow "purchase" bypass for testing
  // 3. In dev/internal testing, allow purchase for testing
  const isDev = process.env.NODE_ENV === 'development';
  const isInternalTesting = process.env.NEXT_PUBLIC_INTERNAL_TESTING === 'true';
  const isProduction = process.env.NODE_ENV === 'production';
  const onAndroid = isAndroid();
  const mockBillingEnabled = isMockBillingEnabled();
  // For production: must be on Android AND enforcement enabled (or testing mode)
  // For dev/testing: always allow (for easier testing)
  const canPurchase = mockBillingEnabled || (onAndroid && (!isProduction || !PREMIUM_ENFORCEMENT_ENABLED || isDev || isInternalTesting));

  // Handle restore click - restores existing Play Store purchases
  const handleRestoreClick = async () => {
    if (!playBillingAvailable) return;

    setIsProcessing(true);

    try {
      const result = await restore();

      if (!result.success) {
        if (result.error === 'No purchases to restore') {
          showToast(t('playBilling.noPurchases', 'No purchases found to restore.'), 'info');
        } else {
          showToast(t('playBilling.restoreFailed', 'Failed to restore purchases. Please try again.'), 'error');
          logger.error('[UpgradePromptModal] Restore failed:', result.error);
        }
        return;
      }

      // Grant local premium with the restored purchase token
      await grantPremiumAccess(result.purchaseToken);
      showToast(t('playBilling.restoreSuccess', 'Purchases restored successfully!'), 'success');
      onClose();
      onUpgradeSuccess?.();
    } catch (error) {
      logger.error('[UpgradePromptModal] Restore error:', error);
      showToast(t('playBilling.restoreFailed', 'Failed to restore purchases. Please try again.'), 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle upgrade click - uses Play Billing in production, test tokens in dev
  const handleUpgradeClick = async () => {
    if (!canPurchase) return;

    setIsProcessing(true);

    try {
      // In mock billing mode, use the Play Billing flow which returns test tokens.
      if (mockBillingEnabled) {
        const result = await purchase();

        if (!result.success) {
          if (result.error === 'cancelled') {
            logger.info('[UpgradePromptModal] Purchase cancelled by user');
            return;
          }
          showToast(t('premium.purchaseFailed', 'Purchase failed. Please try again.'), 'error');
          logger.error('[UpgradePromptModal] Purchase failed:', result.error);
          return;
        }

        await grantPremiumAccess(result.purchaseToken);
        showToast(t('premium.grantSuccess', 'Premium activated! You can reset in Settings.'), 'success');
        onClose();
        onUpgradeSuccess?.();
        return;
      }

      // In dev/testing without mock billing, use local tokens for easier development.
      if (isDev || isInternalTesting) {
        const token = isInternalTesting ? 'internal-test-token' : 'dev-test-token';
        await grantPremiumAccess(token);
        showToast(t('premium.grantSuccess', 'Premium activated! You can reset in Settings.'), 'success');
        onClose();
        onUpgradeSuccess?.();
        return;
      }

      // Production: Use real Play Billing
      if (!playBillingAvailable) {
        showToast(t('premium.billingNotAvailable', 'Play Billing not available. Please try again.'), 'error');
        return;
      }

      const result = await purchase();

      if (!result.success) {
        if (result.error === 'cancelled') {
          // User cancelled - no error message needed
          logger.info('[UpgradePromptModal] Purchase cancelled by user');
          return;
        }
        showToast(t('premium.purchaseFailed', 'Purchase failed. Please try again.'), 'error');
        logger.error('[UpgradePromptModal] Purchase failed:', result.error);
        return;
      }

      // Grant local premium with the purchase token
      await grantPremiumAccess(result.purchaseToken);
      showToast(t('premium.grantSuccess', 'Premium activated! You can reset in Settings.'), 'success');
      onClose();
      onUpgradeSuccess?.();
    } catch (error) {
      logger.error('[UpgradePromptModal] Failed to complete upgrade:', error);
      showToast(t('premium.grantError', 'Failed to activate premium. Please try again.'), 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const titleId = 'upgrade-prompt-modal-title';

  return (
    <ModalPortal>
      <div
        ref={modalRef}
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
            {variant === 'cloudUpgrade'
              ? t('premium.cloudUpgradeTitle', 'Cloud Sync Requires Premium')
              : t('premium.freeVersionLimitReached', 'Free version limit reached')}
          </h3>
        </div>

        {/* Cloud upgrade description (cloudUpgrade variant only) */}
        {variant === 'cloudUpgrade' && (
          <div className="mb-4 p-3 bg-slate-700/50 rounded-md border border-slate-600">
            <p className="text-slate-300 text-sm">
              {t('premium.cloudUpgradeDescription', 'Cloud sync lets you backup and access your data from any device. Upgrade to premium to unlock this feature.')}
            </p>
          </div>
        )}

        {/* Limit explanation - only show for resourceLimit variant */}
        {variant === 'resourceLimit' && resource && (
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

        {/* What subscription offers - cloud benefits only (no resource limits in app) */}
        <div className="mb-5">
          <p className="text-slate-200 font-medium mb-2">
            {t('premium.subscriptionIncludes', 'Your subscription includes:')}
          </p>
          <ul className="space-y-1.5">
            {[
              t('premium.cloudBenefit.sync', 'Sync across all your devices'),
              t('premium.cloudBenefit.backup', 'Automatic cloud backup'),
              t('premium.cloudBenefit.security', 'Secure cloud storage'),
            ].map((benefit, index) => (
              <li key={index} className="flex items-center gap-2 text-sm text-slate-300">
                <HiCheck className="w-4 h-4 text-green-400 flex-shrink-0" aria-hidden="true" />
                {benefit}
              </li>
            ))}
          </ul>
        </div>

        {/* Price - use Play Billing price if available, otherwise fallback */}
        <div className="mb-5 text-center">
          <div className="text-2xl font-bold text-amber-400">
            {details?.price ? `${details.currencyCode} ${details.price}` : PREMIUM_PRICE}
          </div>
          <div className="text-slate-400 text-sm">
            {PREMIUM_IS_SUBSCRIPTION
              ? t('premium.monthlySubscription', 'monthly subscription')
              : t('premium.oneTimePayment', 'one-time payment')}
          </div>
          {PREMIUM_IS_SUBSCRIPTION && (
            <div className="text-slate-500 text-xs mt-1">
              {t('premium.cancelAnytime', 'Cancel anytime')}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2">
          {canPurchase ? (
            <>
              <button
                onClick={handleUpgradeClick}
                disabled={isPurchasing || isProcessing}
                aria-busy={isPurchasing || isProcessing}
                className={`${primaryButtonStyle} w-full bg-gradient-to-b from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isPurchasing || isProcessing
                  ? t('premium.processing', 'Processing...')
                  : t('premium.upgradeButton', 'Upgrade to Premium')}
              </button>
              {/* Restore button - for users who already purchased on another device */}
              {playBillingAvailable && (
                <button
                  onClick={handleRestoreClick}
                  disabled={isPurchasing || isProcessing}
                  className={`${secondaryButtonStyle} w-full text-sm`}
                >
                  {t('playBilling.restorePurchases', 'Restore Purchases')}
                </button>
              )}
              <button
                ref={closeButtonRef}
                onClick={onClose}
                className={`${secondaryButtonStyle} w-full`}
              >
                {t('premium.maybeLater', 'Maybe Later')}
              </button>
            </>
          ) : !onAndroid ? (
            <>
              {/* Not on Android - subscriptions require Android app */}
              <div className="text-center py-3 px-4 bg-slate-700/50 rounded-md border border-slate-600">
                <p className="text-slate-300 text-sm mb-2">
                  {t('premium.androidOnly', 'Subscriptions are available on the Android app.')}
                </p>
                <a
                  href="https://play.google.com/store/apps/details?id=com.matchops"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-400 text-sm hover:text-amber-300 inline-flex items-center gap-1"
                >
                  {t('premium.getAndroidApp', 'Get on Google Play')}
                  <span aria-hidden="true">→</span>
                </a>
              </div>
              <button
                ref={closeButtonRef}
                onClick={onClose}
                className={`${primaryButtonStyle} w-full`}
              >
                {t('common.ok', 'OK')}
              </button>
            </>
          ) : (
            <>
              {/* On Android but Play Billing not yet available */}
              <div className="text-center py-3 px-4 bg-slate-700/50 rounded-md border border-slate-600">
                <p className="text-slate-300 text-sm">
                  {t('premium.availableSoon', 'Premium upgrade will be available soon via Google Play!')}
                </p>
              </div>
              <button
                ref={closeButtonRef}
                onClick={onClose}
                className={`${primaryButtonStyle} w-full`}
              >
                {t('common.ok', 'OK')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
    </ModalPortal>
  );
};

export default UpgradePromptModal;
