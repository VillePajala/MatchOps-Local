/**
 * Migration Status Component
 *
 * Displays migration progress and notifications to users
 * Optimized to prevent excessive re-renders during migration
 *
 * Note: This is for localStorage → IndexedDB migration, not cloud migration
 */

'use client';

import React, { useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useMigrationStatus, MigrationProgress } from '@/hooks/useMigrationStatus';
import { HiOutlineExclamationTriangle, HiOutlineCheckCircle, HiOutlineXMark } from 'react-icons/hi2';
import { MODAL_BACKDROP_BLOCKING, Z_LAYER } from '@/styles/modalStyles';

// Throttled progress component to prevent excessive re-renders
const ThrottledProgress = React.memo(({ progress, t }: { progress: MigrationProgress | null; t: TFunction }) => {
  const throttledProgress = useMemo(() => {
    if (!progress) return null;

    // Throttle percentage updates to nearest 0.5% to reduce re-renders
    const throttledPercentage = Math.round(progress.percentage * 2) / 2;

    return {
      ...progress,
      percentage: throttledPercentage
    };
  }, [progress]);

  if (!throttledProgress) return null;

  const percentageText = t('migrationStatus.percentComplete', '{{percent}}% complete', { percent: throttledProgress.percentage.toFixed(1) });

  return (
    <>
      <div className="w-full bg-white/10 rounded-full h-2 mb-2">
        <div
          className="bg-action h-2 rounded-full transition-all duration-300"
          style={{ width: `${throttledProgress.percentage}%` }}
          role="progressbar"
          aria-valuenow={Math.round(throttledProgress.percentage)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t('migrationStatus.progressLabel', 'Migration progress: {{percent}}% complete', { percent: throttledProgress.percentage.toFixed(1) })}
        ></div>
      </div>

      <div className="text-sm text-ink-3 space-y-1" aria-live="polite">
        <div>{percentageText}</div>
        {throttledProgress.estimatedTimeRemainingText && (
          <div>{t('migrationStatus.estimatedTime', 'Estimated time: {{time}}', { time: throttledProgress.estimatedTimeRemainingText })}</div>
        )}
        <div>{t('migrationStatus.itemsProcessed', '{{processed}}/{{total}} items processed', { processed: throttledProgress.processedKeys, total: throttledProgress.totalKeys })}</div>
      </div>
    </>
  );
});

ThrottledProgress.displayName = 'ThrottledProgress';

function MigrationStatusComponent() {
  const { t } = useTranslation();
  const { isRunning, progress, error, showNotification, dismissNotification } = useMigrationStatus();

  // Memoize dismissNotification to prevent re-renders
  const memoizedDismissNotification = useCallback(() => {
    dismissNotification();
  }, [dismissNotification]);

  // Memoize currentStep to prevent unnecessary re-renders
  const currentStep = useMemo(() => {
    return progress?.currentStep || t('migrationStatus.preparingMigration', 'Preparing migration...');
  }, [progress?.currentStep, t]);

  // Don't render anything if no migration activity
  if (!isRunning && !showNotification) {
    return null;
  }

  // Migration in progress
  if (isRunning) {
    return (
      <div className={`${MODAL_BACKDROP_BLOCKING} ${Z_LAYER.screenOverlay}`}>
        <div
          className="s1-list font-ui p-6 max-w-md mx-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="migration-title"
          aria-describedby="migration-description"
        >
          <div className="text-center">
            <div
              className="animate-spin rounded-full h-8 w-8 border-b-2 border-action mx-auto mb-4"
              role="status"
              aria-label={t('migrationStatus.inProgress', 'Migration in progress')}
            ></div>
            <h3 id="migration-title" className="font-display text-2xl font-bold text-ink mb-2">
              {t('migrationStatus.upgradingStorage', 'Upgrading Storage')}
            </h3>
            <p id="migration-description" className="text-ink-2 mb-4">
              {currentStep}
            </p>

            <ThrottledProgress progress={progress} t={t} />

            <p className="text-sm text-ink-3 mt-4">
              {t('migrationStatus.dontCloseApp', "Please don't close the app during this process.")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Show notification (success or error)
  if (showNotification) {
    const notificationType = error ? 'warning' : 'success';
    const notificationTitle = error
      ? t('migrationStatus.warningTitle', 'Storage Upgrade Warning')
      : t('migrationStatus.successTitle', 'Storage Upgraded Successfully');
    const notificationMessage = error || t('migrationStatus.successMessage', 'Your data has been migrated to improved storage for better performance.');

    return (
      <div className="fixed top-4 right-4 z-50">
        <div
          className={`font-ui rounded-2xl p-4 max-w-sm bg-surface-2 shadow-[0_16px_32px_-8px_rgb(12_4_13/0.9),inset_0_0_0_1px_${error ? 'rgb(250_221_21/0.45)' : 'rgb(63_224_140/0.45)'}]`}
          role="alert"
          aria-live="assertive"
          aria-labelledby="notification-title"
          aria-describedby="notification-message"
        >
          <div className="flex">
            <div className="flex-shrink-0">
              {error ? (
                <HiOutlineExclamationTriangle className="h-5 w-5 text-action" aria-hidden="true" />
              ) : (
                <HiOutlineCheckCircle className="h-5 w-5 text-win" aria-hidden="true" />
              )}
            </div>
            <div className="ml-3 flex-1">
              <h3 id="notification-title" className="text-[15px] font-semibold text-ink">
                {notificationTitle}
              </h3>
              <div id="notification-message" className="mt-1 text-sm text-ink-2">
                {notificationMessage}
              </div>
            </div>
            <div className="ml-2 -mr-2 -mt-2 flex-shrink-0">
              <button
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-ink-3 transition-colors hover:text-ink hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
                onClick={memoizedDismissNotification}
                aria-label={t('migrationStatus.dismissNotification', 'Dismiss notification', { type: notificationType })}
              >
                <span className="sr-only">{t('migrationStatus.dismissNotification', 'Dismiss notification')}</span>
                <HiOutlineXMark className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// Export memoized component to prevent unnecessary re-renders
export const MigrationStatus = React.memo(MigrationStatusComponent);
MigrationStatus.displayName = 'MigrationStatus';
