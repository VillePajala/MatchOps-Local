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
import { useMigrationStatus, MigrationProgress } from '@/hooks/useMigrationStatus';
import { HiOutlineExclamationTriangle, HiOutlineCheckCircle, HiOutlineXMark } from 'react-icons/hi2';

// Throttled progress component to prevent excessive re-renders
const ThrottledProgress = React.memo(({ progress }: { progress: MigrationProgress | null }) => {
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

  const percentageText = `${throttledProgress.percentage.toFixed(1)}% complete`;

  return (
    <>
      <div className="w-full bg-slate-700 rounded-full h-2 mb-2">
        <div
          className="bg-indigo-500 h-2 rounded-full transition-all duration-300"
          style={{ width: `${throttledProgress.percentage}%` }}
          role="progressbar"
          aria-valuenow={Math.round(throttledProgress.percentage)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Migration progress: ${throttledProgress.percentage.toFixed(1)}% complete`}
        ></div>
      </div>

      <div className="text-sm text-slate-400 space-y-1" aria-live="polite">
        <div>{percentageText}</div>
        {throttledProgress.estimatedTimeRemainingText && (
          <div>Estimated time: {throttledProgress.estimatedTimeRemainingText}</div>
        )}
        <div>{throttledProgress.processedKeys}/{throttledProgress.totalKeys} items processed</div>
      </div>
    </>
  );
});

ThrottledProgress.displayName = 'ThrottledProgress';

function MigrationStatusComponent() {
  const { isRunning, progress, error, showNotification, dismissNotification } = useMigrationStatus();

  // Memoize dismissNotification to prevent re-renders
  const memoizedDismissNotification = useCallback(() => {
    dismissNotification();
  }, [dismissNotification]);

  // Memoize currentStep to prevent unnecessary re-renders
  const currentStep = useMemo(() => {
    return progress?.currentStep || 'Preparing migration...';
  }, [progress?.currentStep]);

  // Don't render anything if no migration activity
  if (!isRunning && !showNotification) {
    return null;
  }

  // Migration in progress
  if (isRunning) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
        <div
          className="bg-slate-800 rounded-xl p-6 max-w-md mx-4 shadow-xl border border-slate-700"
          role="dialog"
          aria-modal="true"
          aria-labelledby="migration-title"
          aria-describedby="migration-description"
        >
          <div className="text-center">
            <div
              className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mx-auto mb-4"
              role="status"
              aria-label="Migration in progress"
            ></div>
            <h3 id="migration-title" className="text-lg font-semibold text-slate-100 mb-2">
              Upgrading Storage
            </h3>
            <p id="migration-description" className="text-slate-300 mb-4">
              {currentStep}
            </p>

            <ThrottledProgress progress={progress} />

            <p className="text-xs text-slate-500 mt-4">
              Please don&apos;t close the app during this process.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Show notification (success or error)
  if (showNotification) {
    const notificationType = error ? 'warning' : 'success';
    const notificationTitle = error ? 'Storage Upgrade Warning' : 'Storage Upgraded Successfully';
    const notificationMessage = error || 'Your data has been migrated to improved storage for better performance.';

    return (
      <div className="fixed top-4 right-4 z-50">
        <div
          className={`
            rounded-lg p-4 shadow-xl max-w-sm border
            ${error
              ? 'bg-amber-900/30 border-amber-700'
              : 'bg-green-900/30 border-green-700'}
          `}
          role="alert"
          aria-live="assertive"
          aria-labelledby="notification-title"
          aria-describedby="notification-message"
        >
          <div className="flex">
            <div className="flex-shrink-0">
              {error ? (
                <HiOutlineExclamationTriangle className="h-5 w-5 text-amber-400" aria-hidden="true" />
              ) : (
                <HiOutlineCheckCircle className="h-5 w-5 text-green-400" aria-hidden="true" />
              )}
            </div>
            <div className="ml-3 flex-1">
              <h3 id="notification-title" className={`text-sm font-medium ${error ? 'text-amber-300' : 'text-green-300'}`}>
                {notificationTitle}
              </h3>
              <div id="notification-message" className={`mt-1 text-sm ${error ? 'text-amber-200' : 'text-green-200'}`}>
                {notificationMessage}
              </div>
            </div>
            <div className="ml-4 flex-shrink-0">
              <button
                className={`
                  rounded-md p-1 transition-colors
                  ${error
                    ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-800/50'
                    : 'text-green-400 hover:text-green-300 hover:bg-green-800/50'}
                `}
                onClick={memoizedDismissNotification}
                aria-label={`Dismiss ${notificationType} notification`}
              >
                <span className="sr-only">Dismiss notification</span>
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
