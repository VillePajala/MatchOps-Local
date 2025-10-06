/**
 * Migration Status Component
 *
 * Displays migration progress and notifications to users
 * Optimized to prevent excessive re-renders during migration
 */

'use client';

import React, { useMemo, useCallback } from 'react';
import { useMigrationStatus, MigrationProgress } from '@/hooks/useMigrationStatus';

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
      <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
        <div
          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${throttledProgress.percentage}%` }}
          role="progressbar"
          aria-valuenow={Math.round(throttledProgress.percentage)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Migration progress: ${throttledProgress.percentage.toFixed(1)}% complete`}
        ></div>
      </div>

      <div className="text-sm text-gray-500 space-y-1" aria-live="polite">
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
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div
          className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-lg"
          role="dialog"
          aria-modal="true"
          aria-labelledby="migration-title"
          aria-describedby="migration-description"
        >
          <div className="text-center">
            <div
              className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"
              role="status"
              aria-label="Migration in progress"
            ></div>
            <h3 id="migration-title" className="text-lg font-semibold text-gray-900 mb-2">
              Upgrading Storage
            </h3>
            <p id="migration-description" className="text-gray-600 mb-4">
              {currentStep}
            </p>

            <ThrottledProgress progress={progress} />

            <p className="text-xs text-gray-400 mt-4">
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
            rounded-lg p-4 shadow-lg max-w-sm
            ${error ? 'bg-yellow-50 border-l-4 border-yellow-400' : 'bg-green-50 border-l-4 border-green-400'}
          `}
          role="alert"
          aria-live="assertive"
          aria-labelledby="notification-title"
          aria-describedby="notification-message"
        >
          <div className="flex">
            <div className="flex-shrink-0">
              {error ? (
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              )}
            </div>
            <div className="ml-3 flex-1">
              <h3 id="notification-title" className={`text-sm font-medium ${error ? 'text-yellow-800' : 'text-green-800'}`}>
                {notificationTitle}
              </h3>
              <div id="notification-message" className={`mt-1 text-sm ${error ? 'text-yellow-700' : 'text-green-700'}`}>
                {notificationMessage}
              </div>
            </div>
            <div className="ml-4 flex-shrink-0">
              <button
                className={`
                  rounded-md text-sm font-medium
                  ${error ? 'text-yellow-800 hover:text-yellow-600' : 'text-green-800 hover:text-green-600'}
                `}
                onClick={memoizedDismissNotification}
                aria-label={`Dismiss ${notificationType} notification`}
              >
                <span className="sr-only">Dismiss notification</span>
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
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