'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineCloudArrowDown,
  HiOutlineCheckCircle,
  HiOutlineExclamationTriangle,
  HiOutlineArrowPath,
  HiOutlineXMark,
  HiOutlineTrash,
  HiOutlineShieldCheck,
} from 'react-icons/hi2';
import {
  primaryButtonStyle,
  secondaryButtonStyle,
  dangerButtonStyle,
  wizardBackdropStyle,
  wizardModalStyle,
  wizardHeaderStyle,
  wizardTitleStyle,
  wizardContentStyle,
  wizardCloseButtonStyle,
  dataSummaryBoxStyle,
  dataSummaryTitleStyle,
  warningBoxStyle,
  errorBoxStyle,
  progressBarContainerStyle,
  progressBarFillStyle,
} from '@/styles/modalStyles';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import {
  migrateCloudToLocal,
  getCloudDataSummary,
  type ReverseMigrationCounts,
  type ReverseMigrationProgress,
  type ReverseMigrationMode,
} from '@/services/reverseMigrationService';
import logger from '@/utils/logger';

/**
 * Sanitize error messages to prevent information leakage.
 * Maps internal error details to user-friendly messages.
 */
function sanitizeErrorMessage(error: unknown, t: (key: string, fallback: string) => string): string {
  if (!(error instanceof Error)) {
    return t('migration.errors.unexpected', 'An unexpected error occurred. Please try again.');
  }

  const message = error.message.toLowerCase();

  // Network/connectivity errors
  if (message.includes('network') || message.includes('fetch') || message.includes('offline')) {
    return t('migration.errors.network', 'Network error. Please check your connection and try again.');
  }

  // Authentication/session errors
  if (message.includes('not authenticated') || message.includes('session') || message.includes('unauthorized')) {
    return t('migration.errors.sessionExpired', 'Session expired. Please sign in again.');
  }

  // Rate limiting
  if (message.includes('too many requests') || message.includes('rate limit')) {
    return t('migration.errors.rateLimit', 'Too many attempts. Please wait a moment and try again.');
  }

  // Database/storage errors
  if (message.includes('database') || message.includes('storage') || message.includes('quota')) {
    return t('migration.errors.storage', 'Storage error. Please try again or contact support.');
  }

  // Generic fallback - don't expose internal details
  return t('migration.errors.downloadFailed', 'Download failed. Please try again.');
}

type WizardStep = 'preview' | 'choose' | 'confirm' | 'progress' | 'complete' | 'error';

/** Maximum warnings to display before truncating with "...and X more" */
const MAX_DISPLAYED_WARNINGS = 5;

export interface ReverseMigrationWizardProps {
  /** Called when reverse migration completes successfully */
  onComplete: () => void;
  /** Called when user cancels the wizard */
  onCancel: () => void;
}

/**
 * Reverse Migration Wizard Component
 *
 * Guides users through downloading their cloud data to local storage.
 * Shown when user clicks "Disable Cloud Sync".
 *
 * Steps:
 * 1. Preview - Show counts of cloud data
 * 2. Choose - Select keep or delete cloud data
 * 3. Confirm - Type DELETE to confirm deletion (if delete mode)
 * 4. Progress - Show download progress
 * 5. Complete - Success message
 * 6. Error - Handle migration failures with retry option
 *
 * @see docs/03-active-plans/pr11-reverse-migration-plan.md
 */
const ReverseMigrationWizard: React.FC<ReverseMigrationWizardProps> = ({
  onComplete,
  onCancel,
}) => {
  const { t } = useTranslation();
  const modalRef = useRef<HTMLDivElement>(null);

  // Wizard state
  const [step, setStep] = useState<WizardStep>('preview');
  const [dataSummary, setDataSummary] = useState<ReverseMigrationCounts | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ReverseMigrationProgress | null>(null);
  const [migrationResult, setMigrationResult] = useState<{
    success: boolean;
    errors: string[];
    warnings: string[];
    downloaded: ReverseMigrationCounts;
  } | null>(null);
  const [isMigrating, setIsMigrating] = useState(false);
  const [retryCooldown, setRetryCooldown] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const [migrationMode, setMigrationMode] = useState<ReverseMigrationMode>('keep-cloud');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // Focus trap
  useFocusTrap(modalRef, true);

  // Handle Escape key to close modal (when not busy)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't allow closing during progress or when migration is starting
      if (e.key === 'Escape' && step !== 'progress' && !isMigrating) {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [step, isMigrating, onCancel]);

  // Load data summary on mount
  useEffect(() => {
    let isMounted = true;

    const loadSummary = async () => {
      try {
        setSummaryError(null);
        const summary = await getCloudDataSummary();
        if (isMounted) {
          setDataSummary(summary);
          setIsLoadingSummary(false);
        }
      } catch (error) {
        logger.error('[ReverseMigrationWizard] Failed to load cloud data summary:', error);
        if (isMounted) {
          // SECURITY: Sanitize error message to prevent information leakage
          setSummaryError(sanitizeErrorMessage(error, t));
          setIsLoadingSummary(false);
        }
      }
    };

    loadSummary();

    return () => {
      isMounted = false;
    };
  }, []);

  // Retry cooldown timer
  useEffect(() => {
    if (retryCooldown <= 0) return;

    const timer = setTimeout(() => {
      setRetryCooldown(prev => Math.max(0, prev - 1));
    }, 1000);

    return () => clearTimeout(timer);
  }, [retryCooldown]);

  // Progress callback
  const handleProgress = useCallback((progressUpdate: ReverseMigrationProgress) => {
    setProgress(progressUpdate);
  }, []);

  // Start reverse migration
  const handleStartMigration = useCallback(async () => {
    if (isMigrating) return;
    setIsMigrating(true);
    setStep('progress');
    setProgress({
      stage: 'preparing',
      progress: 0,
      message: t('reverseMigration.preparing', 'Preparing download...'),
    });

    try {
      const result = await migrateCloudToLocal(handleProgress, migrationMode);
      setMigrationResult(result);

      if (result.success) {
        setStep('complete');
      } else {
        setStep('error');
      }
    } catch (error) {
      logger.error('[ReverseMigrationWizard] Reverse migration failed:', error);
      // SECURITY: Sanitize error message to prevent information leakage
      setMigrationResult({
        success: false,
        errors: [sanitizeErrorMessage(error, t)],
        warnings: [],
        downloaded: {
          players: 0,
          teams: 0,
          teamRosters: 0,
          seasons: 0,
          tournaments: 0,
          games: 0,
          personnel: 0,
          playerAdjustments: 0,
          warmupPlan: false,
          settings: false,
        },
      });
      setStep('error');
    } finally {
      setIsMigrating(false);
    }
  }, [isMigrating, handleProgress, t, migrationMode]);

  // Retry migration with cooldown and limit
  const RETRY_COOLDOWN_SECONDS = 3;
  const MAX_RETRIES = 3;
  const handleRetry = useCallback(() => {
    if (retryCooldown > 0 || retryCount >= MAX_RETRIES) return;
    setStep('preview');
    setProgress(null);
    setMigrationResult(null);
    setRetryCooldown(RETRY_COOLDOWN_SECONDS);
    setRetryCount(prev => prev + 1);
  }, [retryCooldown, retryCount]);

  // Handle continue from preview
  const handleContinueFromPreview = useCallback(() => {
    setStep('choose');
  }, []);

  // Handle continue from choose
  const handleContinueFromChoose = useCallback(() => {
    if (migrationMode === 'delete-cloud') {
      setStep('confirm');
    } else {
      handleStartMigration();
    }
  }, [migrationMode, handleStartMigration]);

  // Handle continue from confirm (delete mode)
  const handleContinueFromConfirm = useCallback(() => {
    if (deleteConfirmText.toUpperCase() === 'DELETE') {
      handleStartMigration();
    }
  }, [deleteConfirmText, handleStartMigration]);

  // Retry loading summary
  const handleRetrySummary = useCallback(async () => {
    setIsLoadingSummary(true);
    setSummaryError(null);
    try {
      const summary = await getCloudDataSummary();
      setDataSummary(summary);
    } catch (error) {
      logger.error('[ReverseMigrationWizard] Failed to load cloud data summary:', error);
      // SECURITY: Sanitize error message to prevent information leakage
      setSummaryError(sanitizeErrorMessage(error, t));
    } finally {
      setIsLoadingSummary(false);
    }
  }, [t]);

  // Render data summary table
  const renderDataSummary = (counts: ReverseMigrationCounts) => {
    const items = [
      { label: t('migration.summary.players', 'Players'), count: counts.players },
      { label: t('migration.summary.teams', 'Teams'), count: counts.teams },
      { label: t('migration.summary.teamRosters', 'Team Roster Assignments'), count: counts.teamRosters },
      { label: t('migration.summary.seasons', 'Seasons'), count: counts.seasons },
      { label: t('migration.summary.tournaments', 'Tournaments'), count: counts.tournaments },
      { label: t('migration.summary.games', 'Games'), count: counts.games },
      { label: t('migration.summary.personnel', 'Personnel'), count: counts.personnel },
      { label: t('migration.summary.playerAdjustments', 'Player Adjustments'), count: counts.playerAdjustments },
    ];

    const booleanItems = [
      { label: t('migration.summary.warmupPlan', 'Warmup Plan'), value: counts.warmupPlan },
      { label: t('migration.summary.settings', 'Settings'), value: counts.settings },
    ];

    return (
      <div className={`${dataSummaryBoxStyle} space-y-2`}>
        <h4 className={dataSummaryTitleStyle}>
          {t('reverseMigration.summary.title', 'Your Cloud Data')}
        </h4>
        <div className="space-y-1">
          {items.map(({ label, count }) => (
            <div key={label} className="flex justify-between text-sm">
              <span className="text-slate-400">{label}</span>
              <span className="text-slate-200 font-medium">{count}</span>
            </div>
          ))}
          {booleanItems.map(({ label, value }) => (
            <div key={label} className="flex justify-between text-sm">
              <span className="text-slate-400">{label}</span>
              <span className={`font-medium ${value ? 'text-green-400' : 'text-slate-500'}`}>
                {value ? t('common.yes', 'Yes') : t('common.no', 'No')}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Translate entity name for progress display
  const translateEntity = (entity: string): string => {
    const match = entity.match(/^([a-z ]+)(?:\s*\((.+)\))?$/i);
    if (!match) return entity;

    const [, baseName, suffix] = match;
    const key = baseName.trim().replace(/\s+/g, '');

    const entityKeyMap: Record<string, string> = {
      'players': 'players',
      'seasons': 'seasons',
      'tournaments': 'tournaments',
      'teams': 'teams',
      'teamrosters': 'teamRosters',
      'personnel': 'personnel',
      'games': 'games',
      'playeradjustments': 'playerAdjustments',
      'warmupplan': 'warmupPlan',
      'settings': 'settings',
    };

    const translationKey = entityKeyMap[key.toLowerCase()];
    if (!translationKey) return entity;

    const translatedName = t(`migration.summary.${translationKey}`, baseName);
    return suffix ? `${translatedName} (${suffix})` : translatedName;
  };

  // Render progress bar
  const renderProgress = () => {
    if (!progress) return null;

    const { stage, progress: percent, currentEntity, message } = progress;
    const isError = stage === 'error';
    const isDeleting = stage === 'deleting';

    return (
      <div className="space-y-4">
        {/* Progress bar */}
        <div className="relative">
          <div className={progressBarContainerStyle}>
            <div
              className={`${progressBarFillStyle} ${
                isError ? 'bg-red-500' : isDeleting ? 'bg-amber-500' : 'bg-sky-500'
              }`}
              style={{ width: `${Math.max(percent, 5)}%` }}
            />
          </div>
          <div className="absolute right-0 top-4 text-xs text-slate-400">
            {percent}%
          </div>
        </div>

        {/* Status message */}
        <div
          className="text-center"
          role={isError ? 'alert' : 'status'}
          aria-live={isError ? 'assertive' : 'polite'}
          aria-atomic="true"
        >
          {!isError && (
            <HiOutlineArrowPath className="h-8 w-8 text-sky-400 mx-auto animate-spin mb-2" />
          )}
          <p className="text-slate-300">
            {message || t(`reverseMigration.${stage}`, stage)}
          </p>
          {currentEntity && (
            <p className="text-sm text-slate-500 mt-1">
              {t('reverseMigration.progress.entity', 'Downloading {{entity}}...', { entity: translateEntity(currentEntity) })}
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
        return (
          <>
            {/* Icon and description */}
            <div className="text-center mb-6">
              <HiOutlineCloudArrowDown className="h-12 w-12 text-sky-400 mx-auto mb-3" />
              <p className="text-slate-300">
                {t('reverseMigration.description', 'Download your cloud data to this device and switch to local mode.')}
              </p>
            </div>

            {/* Data summary - show both cloud and local */}
            {isLoadingSummary ? (
              <div className="flex items-center justify-center py-8">
                <HiOutlineArrowPath className="h-8 w-8 text-slate-400 animate-spin" />
              </div>
            ) : summaryError ? (
              <div className={errorBoxStyle}>
                <div className="flex items-start gap-3">
                  <HiOutlineExclamationTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-red-300 font-medium mb-1">
                      {t('reverseMigration.summaryError', 'Failed to check cloud data')}
                    </p>
                    <p className="text-sm text-red-400">{summaryError}</p>
                    <button
                      onClick={handleRetrySummary}
                      className="mt-3 text-sm text-sky-400 hover:text-sky-300 flex items-center gap-1"
                    >
                      <HiOutlineArrowPath className="h-4 w-4" />
                      {t('common.retry', 'Retry')}
                    </button>
                  </div>
                </div>
              </div>
            ) : dataSummary ? (
              renderDataSummary(dataSummary)
            ) : (
              <div className="text-center py-8 text-slate-400">
                {t('reverseMigration.noData', 'No cloud data found.')}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={onCancel}
                className={secondaryButtonStyle}
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                onClick={handleContinueFromPreview}
                className={primaryButtonStyle}
                disabled={isLoadingSummary || !dataSummary}
              >
                {t('common.continue', 'Continue')}
              </button>
            </div>
          </>
        );

      case 'choose':
        return (
          <>
            {/* Title */}
            <div className="text-center mb-6">
              <h3 className="text-lg font-semibold text-slate-100 mb-2">
                {t('reverseMigration.choose.title', 'What should happen to your cloud data?')}
              </h3>
            </div>

            {/* Options */}
            <div className="space-y-3">
              {/* Keep cloud option */}
              <button
                onClick={() => setMigrationMode('keep-cloud')}
                className={`w-full p-4 rounded-lg border text-left transition-all ${
                  migrationMode === 'keep-cloud'
                    ? 'border-sky-500 bg-sky-900/20'
                    : 'border-slate-700 hover:border-slate-600 bg-slate-800/50'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    migrationMode === 'keep-cloud' ? 'border-sky-500' : 'border-slate-500'
                  }`}>
                    {migrationMode === 'keep-cloud' && (
                      <div className="w-2.5 h-2.5 bg-sky-500 rounded-full" />
                    )}
                  </div>
                  <div>
                    <div className="font-medium text-slate-200">
                      <HiOutlineShieldCheck className="inline h-5 w-5 mr-1.5 text-green-400" />
                      {t('reverseMigration.choose.keepCloud', 'Keep cloud copy')}
                    </div>
                    <p className="text-sm text-slate-400 mt-1">
                      {t('reverseMigration.choose.keepCloudDescription', 'Your data stays in Supabase. You can re-enable cloud sync later without losing anything.')}
                    </p>
                  </div>
                </div>
              </button>

              {/* Delete cloud option */}
              <button
                onClick={() => setMigrationMode('delete-cloud')}
                className={`w-full p-4 rounded-lg border text-left transition-all ${
                  migrationMode === 'delete-cloud'
                    ? 'border-red-500 bg-red-900/20'
                    : 'border-slate-700 hover:border-slate-600 bg-slate-800/50'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    migrationMode === 'delete-cloud' ? 'border-red-500' : 'border-slate-500'
                  }`}>
                    {migrationMode === 'delete-cloud' && (
                      <div className="w-2.5 h-2.5 bg-red-500 rounded-full" />
                    )}
                  </div>
                  <div>
                    <div className="font-medium text-slate-200">
                      <HiOutlineTrash className="inline h-5 w-5 mr-1.5 text-red-400" />
                      {t('reverseMigration.choose.deleteCloud', 'Delete cloud data')}
                    </div>
                    <p className="text-sm text-slate-400 mt-1">
                      {t('reverseMigration.choose.deleteCloudDescription', 'After download, all your data will be removed from our servers. This cannot be undone.')}
                    </p>
                  </div>
                </div>
              </button>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setStep('preview')}
                className={secondaryButtonStyle}
              >
                {t('common.back', 'Back')}
              </button>
              <button
                onClick={handleContinueFromChoose}
                className={migrationMode === 'delete-cloud' ? dangerButtonStyle : primaryButtonStyle}
              >
                {t('common.continue', 'Continue')}
              </button>
            </div>
          </>
        );

      case 'confirm':
        return (
          <>
            {/* Warning icon */}
            <div className="text-center mb-6">
              <HiOutlineExclamationTriangle className="h-12 w-12 text-amber-400 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-slate-100 mb-2">
                {t('reverseMigration.confirm.title', 'Confirm Cloud Deletion')}
              </h3>
            </div>

            {/* Warning message */}
            <div className={`${warningBoxStyle} mb-6`}>
              <p className="text-amber-200 mb-3">
                {t('reverseMigration.confirm.warning', 'After downloading your data, ALL cloud data will be permanently deleted from our servers.')}
              </p>
              {dataSummary && (
                <ul className="text-sm text-amber-300 space-y-1">
                  <li>&bull; {dataSummary.players} {t('migration.summary.players', 'players')}</li>
                  <li>&bull; {dataSummary.games} {t('migration.summary.games', 'games')}</li>
                  <li>&bull; {t('reverseMigration.confirm.allData', 'All associated data')}</li>
                </ul>
              )}
              <p className="text-amber-200 mt-3 font-medium">
                {t('reverseMigration.confirm.cannotUndo', 'This action cannot be undone.')}
              </p>
            </div>

            {/* Confirmation input */}
            <div className="mb-6">
              <label className="block text-sm text-slate-400 mb-2">
                {t('reverseMigration.confirm.typeDelete', 'Type DELETE to confirm:')}
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                autoComplete="off"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setDeleteConfirmText('');
                  setStep('choose');
                }}
                className={secondaryButtonStyle}
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                onClick={handleContinueFromConfirm}
                className={dangerButtonStyle}
                disabled={deleteConfirmText.toUpperCase() !== 'DELETE'}
              >
                {t('reverseMigration.confirm.downloadAndDelete', 'Download & Delete Cloud')}
              </button>
            </div>
          </>
        );

      case 'progress':
        return (
          <>
            <div className="text-center mb-6">
              <h3 className="text-lg font-semibold text-slate-100">
                {migrationMode === 'delete-cloud'
                  ? t('reverseMigration.progress.downloadingAndDeleting', 'Downloading & Deleting...')
                  : t('reverseMigration.progress.downloading', 'Downloading Your Data...')}
              </h3>
            </div>
            {renderProgress()}
          </>
        );

      case 'complete': {
        // Differentiate between clean success and success with warnings
        const hasWarnings = migrationResult && migrationResult.warnings.length > 0;
        return (
          <>
            {/* Status icon - amber warning if there are warnings, green check if clean */}
            <div className="text-center mb-6">
              {hasWarnings ? (
                <HiOutlineExclamationTriangle className="h-12 w-12 text-amber-400 mx-auto mb-3" />
              ) : (
                <HiOutlineCheckCircle className="h-12 w-12 text-green-400 mx-auto mb-3" />
              )}
              <h3 className="text-lg font-semibold text-slate-100 mb-2">
                {hasWarnings
                  ? t('reverseMigration.complete.titleWithWarnings', 'Switch Complete with Warnings')
                  : t('reverseMigration.complete.title', 'Switch Complete!')}
              </h3>
              <p className="text-slate-400">
                {migrationMode === 'delete-cloud'
                  ? t('reverseMigration.complete.deletedDescription', 'Your data has been downloaded and cloud data has been deleted.')
                  : t('reverseMigration.complete.description', 'Your data has been downloaded to this device.')}
              </p>
            </div>

            {/* Summary */}
            {migrationResult && renderDataSummary(migrationResult.downloaded)}

            {/* Warnings */}
            {migrationResult && migrationResult.warnings.length > 0 && (
              <div className={`${warningBoxStyle} mt-4`}>
                <h4 className="text-amber-200 font-medium mb-2 flex items-center gap-2">
                  <HiOutlineExclamationTriangle className="h-5 w-5" />
                  {t('migration.warnings.title', 'Warnings')}
                </h4>
                <ul className="text-sm text-amber-300 space-y-1">
                  {migrationResult.warnings.slice(0, MAX_DISPLAYED_WARNINGS).map((warning, i) => (
                    <li key={i}>&bull; {warning}</li>
                  ))}
                  {migrationResult.warnings.length > MAX_DISPLAYED_WARNINGS && (
                    <li className="text-amber-400">
                      {t('migration.warnings.andMore', '...and {{count}} more', {
                        count: migrationResult.warnings.length - MAX_DISPLAYED_WARNINGS,
                      })}
                    </li>
                  )}
                </ul>
              </div>
            )}

            {/* Action - user must explicitly click to reload */}
            <div className="flex flex-col items-center mt-6 gap-2">
              <button
                onClick={onComplete}
                className={primaryButtonStyle}
              >
                {t('reverseMigration.complete.doneAndReload', 'Done & Reload')}
              </button>
              <p className="text-xs text-slate-500">
                {t('reverseMigration.complete.reloadNote', 'The page will reload to apply changes')}
              </p>
            </div>
          </>
        );
      }

      case 'error':
        return (
          <>
            {/* Error icon */}
            <div className="text-center mb-6">
              <HiOutlineXMark className="h-12 w-12 text-red-400 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-slate-100 mb-2">
                {t('reverseMigration.error.title', 'Download Failed')}
              </h3>
            </div>

            {/* Error messages */}
            {migrationResult && migrationResult.errors.length > 0 && (
              <div className={`${errorBoxStyle} mb-6`}>
                <ul className="text-sm text-red-300 space-y-1">
                  {migrationResult.errors.map((error, i) => (
                    <li key={i}>&bull; {error}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 justify-center">
              <button
                onClick={onCancel}
                className={secondaryButtonStyle}
              >
                {t('common.cancel', 'Cancel')}
              </button>
              {retryCount >= MAX_RETRIES ? (
                <p className="text-sm text-slate-400 py-2">
                  {t('reverseMigration.error.maxRetries', 'Maximum retries reached. Please try again later or contact support.')}
                </p>
              ) : (
                <button
                  onClick={handleRetry}
                  className={primaryButtonStyle}
                  disabled={retryCooldown > 0}
                >
                  {retryCooldown > 0
                    ? t('reverseMigration.error.retryIn', 'Retry ({{seconds}}s)', { seconds: retryCooldown })
                    : t('common.retry', 'Retry')}
                </button>
              )}
            </div>
          </>
        );

      default:
        return null;
    }
  };

  // Get step title
  const getStepTitle = () => {
    switch (step) {
      case 'preview':
        return t('reverseMigration.title.preview', 'Switch to Local Mode');
      case 'choose':
        return t('reverseMigration.title.choose', 'Switch to Local Mode');
      case 'confirm':
        return t('reverseMigration.title.confirm', 'Confirm Cloud Deletion');
      case 'progress':
        return t('reverseMigration.title.progress', 'Switching to Local Mode');
      case 'complete':
        return t('reverseMigration.title.complete', 'Switch Complete');
      case 'error':
        return t('reverseMigration.title.error', 'Download Failed');
      default:
        return '';
    }
  };

  return (
    <div className={wizardBackdropStyle}>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reverse-migration-wizard-title"
        className={wizardModalStyle}
      >
        {/* Header */}
        <div className={wizardHeaderStyle}>
          <h2 id="reverse-migration-wizard-title" className={wizardTitleStyle}>
            {getStepTitle()}
          </h2>
          {step !== 'progress' && (
            <button
              onClick={onCancel}
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
      </div>
    </div>
  );
};

export default ReverseMigrationWizard;
