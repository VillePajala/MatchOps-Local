'use client';

/**
 * Simplified Migration Wizard
 *
 * Shows when cloud mode is enabled and local data needs to be synced.
 * Philosophy: Data is always local, cloud is just a sync mirror.
 *
 * Flow:
 * 1. Preview - Show local data counts, 2 buttons: "Sync to Cloud" / "Not Now"
 * 2. Syncing - Progress bar during migration
 * 3. Complete - Success message with "Done" button
 * 4. Error - Error message with "Retry" / "Cancel" buttons
 *
 * @see docs/03-active-plans/wizard-simplification-plan.md
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineCloudArrowUp,
  HiOutlineCheckCircle,
  HiOutlineExclamationTriangle,
  HiOutlineArrowPath,
  HiOutlineXMark,
} from 'react-icons/hi2';
import {
  primaryButtonStyle,
  secondaryButtonStyle,
  wizardBackdropStyle,
  wizardModalStyle,
  wizardHeaderStyle,
  wizardTitleStyle,
  wizardContentStyle,
  wizardFooterStyle,
  wizardCloseButtonStyle,
  dataSummaryBoxStyle,
  dataSummaryTitleStyle,
  localDataDotStyle,
  progressBarContainerStyle,
  progressBarFillStyle,
} from '@/styles/modalStyles';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import {
  migrateLocalToCloud,
  getLocalDataSummary,
  type MigrationCounts,
  type MigrationProgress,
} from '@/services/migrationService';
import logger from '@/utils/logger';

/**
 * Sanitize error string to prevent information leakage.
 */
function sanitizeErrorString(message: string, t: (key: string, fallback: string) => string): string {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('network') || lowerMessage.includes('fetch') || lowerMessage.includes('offline')) {
    return t('migration.errors.network', 'Network error. Please check your connection and try again.');
  }

  if (lowerMessage.includes('not authenticated') || lowerMessage.includes('session') || lowerMessage.includes('unauthorized')) {
    return t('migration.errors.sessionExpired', 'Session expired. Please sign in again.');
  }

  if (lowerMessage.includes('too many requests') || lowerMessage.includes('rate limit')) {
    return t('migration.errors.rateLimit', 'Too many attempts. Please wait a moment and try again.');
  }

  if (lowerMessage.includes('database') || lowerMessage.includes('storage') || lowerMessage.includes('quota')) {
    return t('migration.errors.storage', 'Storage error. Please try again or contact support.');
  }

  if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out')) {
    return t('migration.errors.timeout', 'Request timed out. Please try again with a stable connection.');
  }

  if (lowerMessage.includes('policy') || lowerMessage.includes('permission') || lowerMessage.includes('denied')) {
    return t('migration.errors.permission', 'Permission error. Please try signing out and back in.');
  }

  if (lowerMessage.includes('validation') || lowerMessage.includes('invalid')) {
    return t('migration.errors.validation', 'Data validation failed. Please check your data and try again.');
  }

  return t('migration.errors.syncFailed', 'Sync failed. Please try again.');
}

/**
 * Sanitize error messages to prevent information leakage.
 */
function sanitizeErrorMessage(error: unknown, t: (key: string, fallback: string) => string): string {
  if (!(error instanceof Error)) {
    return t('migration.errors.unexpected', 'An unexpected error occurred. Please try again.');
  }

  return sanitizeErrorString(error.message, t);
}

type WizardStep = 'preview' | 'syncing' | 'complete' | 'error';

export interface MigrationWizardProps {
  /** Called when migration completes successfully */
  onComplete: () => void;
  /** Called when user cancels (clicks "Not Now") */
  onCancel: () => void;
  /** @deprecated No longer used - cloud counts fetching removed for simplification */
  cloudCounts?: MigrationCounts | null;
  /** @deprecated No longer used - cloud counts fetching removed for simplification */
  isLoadingCloudCounts?: boolean;
}

/**
 * Simplified Migration Wizard Component
 *
 * Two buttons: "Sync to Cloud" and "Not Now"
 * Always uses merge mode (last-write-wins).
 */
const MigrationWizard: React.FC<MigrationWizardProps> = ({
  onComplete,
  onCancel,
}) => {
  const { t } = useTranslation();
  const modalRef = useRef<HTMLDivElement>(null);

  // Ref-based lock for synchronous double-click protection
  // State updates are async, so isSyncing alone can't prevent race conditions
  const syncLockRef = useRef(false);

  // Wizard state
  const [step, setStep] = useState<WizardStep>('preview');
  const [localCounts, setLocalCounts] = useState<MigrationCounts | null>(null);
  const [isLoadingCounts, setIsLoadingCounts] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<MigrationProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [_isSyncing, setIsSyncing] = useState(false);

  // Focus trap
  useFocusTrap(modalRef, true);

  // Load local data summary on mount
  useEffect(() => {
    let isMounted = true;

    const loadSummary = async () => {
      setIsLoadingCounts(true);
      setLoadError(null);
      try {
        const summary = await getLocalDataSummary();
        if (isMounted) {
          setLocalCounts(summary);
        }
      } catch (error) {
        logger.error('[MigrationWizard] Failed to load data summary:', error);
        if (isMounted) {
          // Set a flag instead of translated string - we'll translate when rendering
          setLoadError('LOAD_FAILED');
        }
      } finally {
        if (isMounted) {
          setIsLoadingCounts(false);
        }
      }
    };

    loadSummary();

    return () => {
      isMounted = false;
    };
  }, []);

  // Retry loading data after error
  const handleRetryLoad = useCallback(async () => {
    setLocalCounts(null); // Reset stale data before retry
    setIsLoadingCounts(true);
    setLoadError(null);
    try {
      const summary = await getLocalDataSummary();
      setLocalCounts(summary);
    } catch (error) {
      logger.error('[MigrationWizard] Failed to load data summary (retry):', error);
      setLoadError('LOAD_FAILED');
    } finally {
      setIsLoadingCounts(false);
    }
  }, []);

  // Progress callback
  const handleProgress = useCallback((progressUpdate: MigrationProgress) => {
    setProgress(progressUpdate);
  }, []);

  // Start sync (always merge mode)
  const handleStartSync = useCallback(async () => {
    // Synchronous lock check to prevent double-clicks (state updates are async)
    if (syncLockRef.current) return;
    syncLockRef.current = true;

    setIsSyncing(true);
    setStep('syncing');
    setProgress({ stage: 'preparing', progress: 0, message: t('migration.preparing', 'Preparing...') });
    setErrorMessage(null);

    try {
      const result = await migrateLocalToCloud(handleProgress, 'merge');

      if (result.success) {
        setStep('complete');
      } else {
        // Log the error details for debugging but show sanitized message to user
        if (result.errors.length === 0) {
          logger.warn('[MigrationWizard] Migration returned failure with no error details');
        } else {
          logger.warn('[MigrationWizard] Migration failed:', result.errors);
        }
        // Sanitize error message to prevent information leakage
        const errorMsg = result.errors[0]
          ? sanitizeErrorString(result.errors[0], t)
          : t('migration.syncFailedUnknown', 'Sync failed due to an unknown error. Please try again.');
        setErrorMessage(errorMsg);
        setStep('error');
      }
    } catch (error) {
      logger.error('[MigrationWizard] Sync failed:', error);
      setErrorMessage(sanitizeErrorMessage(error, t));
      setStep('error');
    } finally {
      syncLockRef.current = false;
      setIsSyncing(false);
    }
  }, [handleProgress, t]);

  // Retry after error - always reload data to ensure fresh state
  const handleRetry = useCallback(() => {
    setStep('preview');
    setErrorMessage(null);
    setProgress(null);
    // Always reload data on retry to avoid stale data issues
    handleRetryLoad();
  }, [handleRetryLoad]);

  // Accessibility
  const titleId = 'migration-wizard-title';

  // Translate entity names for display
  const translateEntity = (entity: string): string => {
    const translationMap: Record<string, string> = {
      'players': t('migration.summary.players', 'Players'),
      'teams': t('migration.summary.teams', 'Teams'),
      'teamRosters': t('migration.summary.teamRosters', 'Team Rosters'),
      'seasons': t('migration.summary.seasons', 'Seasons'),
      'tournaments': t('migration.summary.tournaments', 'Tournaments'),
      'games': t('migration.summary.games', 'Games'),
      'personnel': t('migration.summary.personnel', 'Personnel'),
      'warmupPlan': t('migration.summary.warmupPlan', 'Warmup Plans'),
      'settings': t('migration.summary.settings', 'Settings'),
    };
    return translationMap[entity] || entity;
  };

  // Render data summary grid
  const renderDataSummary = (counts: MigrationCounts) => {
    const items = [
      { key: 'games', count: counts.games },
      { key: 'players', count: counts.players },
      { key: 'teams', count: counts.teams },
      { key: 'seasons', count: counts.seasons },
      { key: 'tournaments', count: counts.tournaments },
      { key: 'personnel', count: counts.personnel },
    ].filter(item => item.count > 0);

    if (items.length === 0) {
      return (
        <p className="text-slate-400 text-sm text-center">
          {t('migration.noData', 'No data to sync')}
        </p>
      );
    }

    return (
      <div className="grid grid-cols-2 gap-2 text-sm">
        {items.map(({ key, count }) => (
          <div key={key} className="flex justify-between text-slate-300">
            <span>{translateEntity(key)}</span>
            <span className="text-slate-400">{count}</span>
          </div>
        ))}
      </div>
    );
  };

  // Render progress bar
  const renderProgress = () => {
    if (!progress) return null;

    const { progress: percent, message, currentEntity } = progress;

    return (
      <div className="space-y-4">
        {/* Progress bar */}
        <div className="relative">
          <div className={progressBarContainerStyle}>
            <div
              className={`${progressBarFillStyle} bg-sky-500`}
              style={{ width: `${Math.max(percent, 5)}%` }}
            />
          </div>
          <div className="absolute right-0 top-4 text-xs text-slate-400">
            {percent}%
          </div>
        </div>

        {/* Status message */}
        <div className="text-center">
          <HiOutlineArrowPath className="h-8 w-8 text-sky-400 mx-auto animate-spin mb-2" />
          <p className="text-slate-300">{message}</p>
          {currentEntity && (
            <p className="text-sm text-slate-500 mt-1">
              {t('migration.progress.entity', 'Syncing {{entity}}...', { entity: translateEntity(currentEntity) })}
            </p>
          )}
        </div>
      </div>
    );
  };

  // Render step content
  const renderContent = () => {
    switch (step) {
      case 'preview':
        if (isLoadingCounts) {
          return (
            <div className="flex flex-col items-center justify-center py-8">
              <HiOutlineArrowPath className="h-8 w-8 text-sky-400 animate-spin mb-3" />
              <p className="text-slate-300">
                {t('migration.loadingData', 'Loading data...')}
              </p>
            </div>
          );
        }

        // Show error state if data loading failed
        if (loadError) {
          return (
            <div className="text-center py-4">
              <HiOutlineExclamationTriangle className="h-12 w-12 text-amber-400 mx-auto mb-3" />
              <p className="text-slate-300 mb-3">
                {t('migration.loadDataFailed', 'Failed to load your data. Please try again.')}
              </p>
              <p className="text-sm text-slate-400">
                {t('migration.canRetryOrCancel', 'You can retry or close this dialog.')}
              </p>
            </div>
          );
        }

        return (
          <>
            {/* Icon and description */}
            <div className="text-center mb-5">
              <HiOutlineCloudArrowUp className="h-12 w-12 text-sky-400 mx-auto mb-3" />
              <p className="text-slate-300">
                {t('migration.syncDescription', 'Your local data will be synced to the cloud for backup and access from other devices.')}
              </p>
            </div>

            {/* Local data summary */}
            <div className={dataSummaryBoxStyle}>
              <h4 className={dataSummaryTitleStyle}>
                <span className={localDataDotStyle}></span>
                {t('migration.localData', 'Local Data')}
              </h4>
              {localCounts && renderDataSummary(localCounts)}
            </div>
          </>
        );

      case 'syncing':
        return renderProgress();

      case 'complete':
        return (
          <div className="text-center py-4">
            <HiOutlineCheckCircle className="h-12 w-12 text-green-400 mx-auto mb-3" />
            <p className="text-lg font-medium text-green-400 mb-2">
              {t('migration.success', 'Sync complete!')}
            </p>
            <p className="text-slate-300">
              {t('migration.successDescription', 'Your data is now backed up to the cloud.')}
            </p>
          </div>
        );

      case 'error':
        return (
          <div className="text-center py-4">
            <HiOutlineExclamationTriangle className="h-12 w-12 text-red-400 mx-auto mb-3" />
            <p className="text-lg font-medium text-red-400 mb-2">
              {t('migration.failed', 'Sync Failed')}
            </p>
            <p className="text-slate-300 mb-3">
              {errorMessage || t('migration.errorGeneric', 'Something went wrong. Please try again.')}
            </p>
            <p className="text-sm text-slate-400">
              {t('migration.dataIsSafe', 'Your local data is safe.')}
            </p>
          </div>
        );

      default:
        return null;
    }
  };

  // Render footer actions
  const renderActions = () => {
    switch (step) {
      case 'preview':
        // Show Retry/Cancel if data loading failed
        if (loadError) {
          return (
            <>
              <button
                onClick={onCancel}
                className={secondaryButtonStyle}
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                onClick={handleRetryLoad}
                className={primaryButtonStyle}
              >
                {t('common.retry', 'Retry')}
              </button>
            </>
          );
        }
        return (
          <>
            <button
              onClick={onCancel}
              className={secondaryButtonStyle}
            >
              {t('migration.notNow', 'Not Now')}
            </button>
            <button
              onClick={handleStartSync}
              disabled={isLoadingCounts || !localCounts}
              className={primaryButtonStyle}
            >
              {t('migration.syncToCloud', 'Sync to Cloud')}
            </button>
          </>
        );

      case 'syncing':
        return null; // No actions during sync

      case 'complete':
        return (
          <button
            onClick={onComplete}
            className={primaryButtonStyle}
          >
            {t('common.done', 'Done')}
          </button>
        );

      case 'error':
        return (
          <>
            <button
              onClick={onCancel}
              className={secondaryButtonStyle}
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              onClick={handleRetry}
              className={primaryButtonStyle}
            >
              {t('common.retry', 'Retry')}
            </button>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div className={wizardBackdropStyle}>
      <div
        ref={modalRef}
        className={wizardModalStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {/* Header */}
        <div className={wizardHeaderStyle}>
          <h2 id={titleId} className={wizardTitleStyle}>
            {t('migration.title', 'Sync to Cloud')}
          </h2>
          {step !== 'syncing' && (
            <button
              onClick={step === 'complete' ? onComplete : onCancel}
              className={wizardCloseButtonStyle}
              aria-label={t('common.close', 'Close')}
            >
              <HiOutlineXMark className="h-6 w-6" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className={wizardContentStyle}>
          {renderContent()}
        </div>

        {/* Actions */}
        {(() => {
          const actions = renderActions();
          return actions && (
            <div className={wizardFooterStyle}>
              {actions}
            </div>
          );
        })()}
      </div>
    </div>
  );
};

export default MigrationWizard;
