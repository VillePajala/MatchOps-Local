/**
 * Migration Control Panel Component
 *
 * Provides UI controls for pause/resume/cancel during migration
 */

import React from 'react';
import { MigrationControl, MigrationEstimation } from '@/types/migrationControl';
import { useTranslation } from 'react-i18next';

interface MigrationControlPanelProps {
  control: MigrationControl;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  estimation?: MigrationEstimation | null;
  isPreviewMode?: boolean;
}

const MigrationControlPanelComponent = React.memo<MigrationControlPanelProps>(({
  control,
  onPause,
  onResume,
  onCancel,
  estimation,
  isPreviewMode = false
}) => {
  const { t } = useTranslation();

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.round((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="migration-control-panel p-4 bg-white dark:bg-gray-800 rounded-lg shadow-md">
      {/* Estimation Display */}
      {estimation && !isPreviewMode && (
        <div className="estimation-info mb-4 p-3 bg-blue-50 dark:bg-blue-900 rounded">
          <h3 className="font-semibold text-sm mb-2 text-blue-900 dark:text-blue-100">
            {t('migration.estimation.title', 'Migration Estimation')}
          </h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-gray-600 dark:text-gray-400">
                {t('migration.estimation.duration', 'Estimated Duration')}:
              </span>
              <span className="ml-2 font-medium text-blue-800 dark:text-blue-200">
                {formatDuration(estimation.estimatedDuration)}
              </span>
            </div>
            <div>
              <span className="text-gray-600 dark:text-gray-400">
                {t('migration.estimation.dataSize', 'Data Size')}:
              </span>
              <span className="ml-2 font-medium text-blue-800 dark:text-blue-200">
                {formatSize(estimation.totalDataSize)}
              </span>
            </div>
            <div>
              <span className="text-gray-600 dark:text-gray-400">
                {t('migration.estimation.confidence', 'Confidence')}:
              </span>
              <span className={`ml-2 font-medium ${
                estimation.confidenceLevel === 'high' ? 'text-green-600' :
                estimation.confidenceLevel === 'medium' ? 'text-yellow-600' :
                'text-orange-600'
              }`}>
                {t(`migration.estimation.confidence.${estimation.confidenceLevel}`,
                  estimation.confidenceLevel)}
              </span>
            </div>
            <div>
              <span className="text-gray-600 dark:text-gray-400">
                {t('migration.estimation.throughput', 'Speed')}:
              </span>
              <span className="ml-2 font-medium text-blue-800 dark:text-blue-200">
                {formatSize(estimation.estimatedThroughput)}/s
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Control Buttons */}
      <div className="control-buttons flex gap-2">
        {/* Pause/Resume Button */}
        {control.canPause && !control.isPaused && (
          <button
            onClick={onPause}
            className="flex-1 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-md transition-colors duration-200 flex items-center justify-center gap-2"
            aria-label={t('migration.controls.pause', 'Pause Migration')}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {t('migration.controls.pause', 'Pause')}
          </button>
        )}

        {control.canResume && control.isPaused && (
          <button
            onClick={onResume}
            className="flex-1 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-md transition-colors duration-200 flex items-center justify-center gap-2"
            aria-label={t('migration.controls.resume', 'Resume Migration')}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
            </svg>
            {t('migration.controls.resume', 'Resume')}
          </button>
        )}

        {/* Cancel Button */}
        {control.canCancel && !control.isCancelling && (
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-md transition-colors duration-200 flex items-center justify-center gap-2"
            aria-label={t('migration.controls.cancel', 'Cancel Migration')}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            {t('migration.controls.cancel', 'Cancel')}
          </button>
        )}

        {control.isCancelling && (
          <div className="flex-1 px-4 py-2 bg-gray-400 text-white rounded-md flex items-center justify-center">
            <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            {t('migration.controls.cancelling', 'Cancelling...')}
          </div>
        )}
      </div>

      {/* Status Messages */}
      {control.isPaused && (
        <div className="mt-3 p-2 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 rounded text-sm">
          {t('migration.status.paused', 'Migration paused. Click Resume to continue.')}
        </div>
      )}

      {control.resumeData && (
        <div className="mt-3 p-2 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded text-sm">
          {(() => {
            const progress = Math.round((control.resumeData!.itemsProcessed / control.resumeData!.totalItems) * 100);
            return t('migration.status.resumable', `Previous migration can be resumed from ${progress}% complete.`);
          })()}
        </div>
      )}
    </div>
  );
});

MigrationControlPanelComponent.displayName = 'MigrationControlPanel';

export const MigrationControlPanel = MigrationControlPanelComponent;