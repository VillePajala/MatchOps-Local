/**
 * Enhanced Migration Status Component with Control Features
 *
 * Displays migration progress and provides pause/resume/cancel controls
 */

'use client';

import React, { useMemo, useCallback } from 'react';
import { useMigrationStatus } from '@/hooks/useMigrationStatus';
import { useMigrationControl } from '@/hooks/useMigrationControl';
import { MigrationControlPanel } from './MigrationControlPanel';
import { MigrationProgress } from '@/utils/indexedDbMigration';
import logger from '@/utils/logger';

// Throttled progress component to prevent excessive re-renders
const ThrottledProgress = React.memo(function ThrottledProgress({ progress }: { progress: MigrationProgress | null }) {
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
        {throttledProgress.transferSpeedMBps && (
          <div>Transfer speed: {throttledProgress.transferSpeedMBps.toFixed(2)} MB/s</div>
        )}
      </div>
    </>
  );
});

function MigrationStatusEnhancedComponent() {
  const migrationStatusHook = useMigrationStatus();
  const {
    control,
    estimation,
    pauseMigration,
    resumeMigration,
    cancelMigration
  } = useMigrationControl({
    onPause: () => {
      // Migration paused - handled by UI
    },
    onResume: () => {
      // Migration resumed - handled by UI
    },
    onCancel: (cancellation) => {
      // Migration cancelled - log for debugging in development only
      if (process.env.NODE_ENV === 'development') {
        logger.log('Migration cancelled', cancellation);
      }
    }
  });

  // Memoize dismissNotification callback
  const memoizedDismissNotification = useCallback(() => {
    migrationStatusHook.dismissNotification();
  }, [migrationStatusHook]);

  if (!migrationStatusHook) return null;

  const { isRunning: isActive, progress, error, showNotification } = migrationStatusHook;

  // Show modal during active migration with controls
  if (isActive && progress) {
    const isCompleting = progress.state === 'verifying' || progress.state === 'switching';

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-4">
        <div
          className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full"
          role="dialog"
          aria-labelledby="migration-title"
          aria-describedby="migration-description"
        >
          <div className="mb-4">
            <h2 id="migration-title" className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">
              Storage Upgrade in Progress
            </h2>
            <p id="migration-description" className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              We&apos;re upgrading your storage system for better performance. Your data is safe.
            </p>

            {progress.currentStep && (
              <div
                className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-2"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                {progress.currentStep}
              </div>
            )}

            <ThrottledProgress progress={progress} />

            {/* Add control panel for pause/resume/cancel */}
            {!isCompleting && (
              <div className="mt-4">
                <MigrationControlPanel
                  control={control}
                  onPause={pauseMigration}
                  onResume={resumeMigration}
                  onCancel={cancelMigration}
                  estimation={estimation}
                />
              </div>
            )}

            <p className="text-xs text-gray-400 mt-4">
              {control.isPaused
                ? 'Migration paused. You can resume anytime.'
                : 'Please don\'t close the app during this process.'}
            </p>

            {/* Show errors if any */}
            {progress.errors && progress.errors.length > 0 && (
              <div className="mt-4 p-3 bg-red-50 dark:bg-red-900 rounded">
                <p className="text-sm font-medium text-red-800 dark:text-red-200">
                  Errors encountered:
                </p>
                <ul className="mt-1 text-xs text-red-600 dark:text-red-300">
                  {progress.errors.slice(0, 3).map((err: string, idx: number) => (
                    <li key={idx}>• {err}</li>
                  ))}
                </ul>
              </div>
            )}
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

  // Check for resumable migration on mount
  if (control.canResume && control.resumeData) {
    return (
      <div className="fixed bottom-4 right-4 z-40">
        <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded shadow-lg max-w-sm">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <p className="text-sm text-blue-700">
                Previous migration can be resumed
              </p>
              <p className="mt-1 text-xs text-blue-600">
                {Math.round((control.resumeData.itemsProcessed / control.resumeData.totalItems) * 100)}% complete
              </p>
              <button
                onClick={resumeMigration}
                className="mt-2 bg-blue-500 hover:bg-blue-600 text-white text-xs px-3 py-1 rounded"
              >
                Resume Migration
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
export const MigrationStatusEnhanced = React.memo(MigrationStatusEnhancedComponent);
MigrationStatusEnhanced.displayName = 'MigrationStatusEnhanced';