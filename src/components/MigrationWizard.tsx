'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineCloudArrowUp,
  HiOutlineCheckCircle,
  HiOutlineExclamationTriangle,
  HiOutlineArrowPath,
  HiOutlineTrash,
  HiOutlineXMark,
} from 'react-icons/hi2';
import { primaryButtonStyle, secondaryButtonStyle, dangerButtonStyle } from '@/styles/modalStyles';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import {
  migrateLocalToCloud,
  getLocalDataSummary,
  type MigrationCounts,
  type MigrationProgress,
} from '@/services/migrationService';
import { clearLocalIndexedDBData } from '@/utils/clearLocalData';
import logger from '@/utils/logger';

type WizardStep = 'preview' | 'confirm' | 'progress' | 'complete' | 'error';

/** Maximum warnings to display before truncating with "...and X more" */
const MAX_DISPLAYED_WARNINGS = 5;

export interface MigrationWizardProps {
  /** Called when migration completes successfully (with or without clearing local data) */
  onComplete: () => void;
  /** Called when user skips migration */
  onSkip: () => void;
}

/**
 * Migration Wizard Component
 *
 * Guides users through migrating their local data to the cloud.
 * Shown post-authentication when:
 * - Cloud mode is enabled
 * - User has local data
 * - Migration hasn't been completed for this user
 *
 * Steps:
 * 1. Preview - Show counts of data to migrate
 * 2. Confirm - User confirms migration
 * 3. Progress - Show upload progress
 * 4. Complete - Success message with option to clear local data
 *
 * @see docs/03-active-plans/supabase-implementation-guide.md Section 10.2.2
 */
const MigrationWizard: React.FC<MigrationWizardProps> = ({
  onComplete,
  onSkip,
}) => {
  const { t } = useTranslation();
  const modalRef = useRef<HTMLDivElement>(null);

  // Wizard state
  const [step, setStep] = useState<WizardStep>('preview');
  const [dataSummary, setDataSummary] = useState<MigrationCounts | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [progress, setProgress] = useState<MigrationProgress | null>(null);
  const [migrationResult, setMigrationResult] = useState<{
    success: boolean;
    errors: string[];
    warnings: string[];
    migrated: MigrationCounts;
  } | null>(null);
  const [isClearingLocal, setIsClearingLocal] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [clearLocalFailed, setClearLocalFailed] = useState(false);
  const [retryCooldown, setRetryCooldown] = useState(0); // Seconds remaining in cooldown

  // Focus trap
  useFocusTrap(modalRef, true);

  // Load data summary on mount
  useEffect(() => {
    let isMounted = true;

    const loadSummary = async () => {
      try {
        const summary = await getLocalDataSummary();
        if (isMounted) {
          setDataSummary(summary);
          setIsLoadingSummary(false);
        }
      } catch (error) {
        logger.error('[MigrationWizard] Failed to load data summary:', error);
        if (isMounted) {
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
  const handleProgress = useCallback((progressUpdate: MigrationProgress) => {
    setProgress(progressUpdate);
  }, []);

  // Start migration
  const handleStartMigration = useCallback(async () => {
    if (isMigrating) return; // Prevent double-click
    setIsMigrating(true);
    setStep('progress');
    setProgress({ stage: 'preparing', progress: 0, message: t('migration.preparing', 'Preparing migration...') });

    try {
      const result = await migrateLocalToCloud(handleProgress);
      setMigrationResult(result);

      if (result.success) {
        setStep('complete');
      } else {
        setStep('error');
      }
    } catch (error) {
      logger.error('[MigrationWizard] Migration failed:', error);
      setMigrationResult({
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        warnings: [],
        migrated: {
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
  }, [isMigrating, handleProgress, t]);

  // Clear local data after migration
  const handleClearLocalData = useCallback(async () => {
    setIsClearingLocal(true);
    setClearLocalFailed(false);
    try {
      await clearLocalIndexedDBData();
      logger.info('[MigrationWizard] Local data cleared successfully');
      onComplete();
    } catch (error) {
      logger.error('[MigrationWizard] Failed to clear local data:', error);
      // Mark clear as failed - user must acknowledge before completing
      setClearLocalFailed(true);
      setMigrationResult(prev => prev ? {
        ...prev,
        warnings: [...prev.warnings, t('migration.clearFailed', 'Failed to clear local data. You can try again later in Settings.')],
      } : prev);
      setIsClearingLocal(false);
    }
  }, [onComplete, t]);

  // Retry migration with cooldown to prevent spam
  const RETRY_COOLDOWN_SECONDS = 3;
  const handleRetry = useCallback(() => {
    if (retryCooldown > 0) return; // Ignore if in cooldown
    setStep('preview');
    setProgress(null);
    setMigrationResult(null);
    setRetryCooldown(RETRY_COOLDOWN_SECONDS);
  }, [retryCooldown]);

  // Render data summary table
  const renderDataSummary = (counts: MigrationCounts) => {
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
      <div className="bg-slate-900/50 rounded-lg p-4 space-y-2">
        <h4 className="text-sm font-medium text-slate-300 mb-3">
          {t('migration.summary.title', 'Data Summary')}
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

  // Render progress bar
  const renderProgress = () => {
    if (!progress) return null;

    const { stage, progress: percent, currentEntity, message } = progress;
    const isError = stage === 'error';

    return (
      <div className="space-y-4">
        {/* Progress bar */}
        <div className="relative">
          <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                isError ? 'bg-red-500' : 'bg-sky-500'
              }`}
              style={{ width: `${Math.max(percent, 5)}%` }}
            />
          </div>
          <div className="absolute right-0 top-4 text-xs text-slate-400">
            {percent}%
          </div>
        </div>

        {/* Status message */}
        <div className="text-center">
          {!isError && (
            <HiOutlineArrowPath className="h-8 w-8 text-sky-400 mx-auto animate-spin mb-2" />
          )}
          <p className="text-slate-300">
            {t(`migration.${stage}`, message || stage)}
          </p>
          {currentEntity && (
            <p className="text-sm text-slate-500 mt-1">
              {t('migration.progress.entity', 'Migrating {{entity}}...', { entity: currentEntity })}
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
              <HiOutlineCloudArrowUp className="h-12 w-12 text-sky-400 mx-auto mb-3" />
              <p className="text-slate-300">
                {t('migration.description', 'Transfer your local data to your cloud account for backup and sync across devices.')}
              </p>
            </div>

            {/* Data summary */}
            {isLoadingSummary ? (
              <div className="flex items-center justify-center py-8">
                <HiOutlineArrowPath className="h-6 w-6 text-slate-400 animate-spin" />
                <span className="ml-2 text-slate-400">
                  {t('common.loading', 'Loading...')}
                </span>
              </div>
            ) : dataSummary ? (
              renderDataSummary(dataSummary)
            ) : (
              <p className="text-center text-slate-400 py-4">
                {t('migration.noData', 'No data found to migrate.')}
              </p>
            )}
          </>
        );

      case 'confirm':
        return (
          <>
            <div className="text-center mb-6">
              <HiOutlineExclamationTriangle className="h-12 w-12 text-amber-400 mx-auto mb-3" />
              <p className="text-slate-300 mb-4">
                {t('migration.confirmMessage', 'Are you sure you want to migrate your data to the cloud?')}
              </p>
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-left">
                <p className="text-sm text-amber-300">
                  {t('migration.confirmWarning', 'Your local data will remain unchanged. You can clear it after verifying the migration was successful.')}
                </p>
              </div>
            </div>
          </>
        );

      case 'progress':
        return renderProgress();

      case 'complete':
        return (
          <>
            <div className="text-center mb-6">
              <HiOutlineCheckCircle className="h-12 w-12 text-green-400 mx-auto mb-3" />
              <p className="text-lg font-medium text-green-400 mb-2">
                {t('migration.success', 'Migration complete!')}
              </p>
              <p className="text-slate-300">
                {t('migration.successDescription', 'Your data is now synced to the cloud.')}
              </p>
            </div>

            {/* Migration summary */}
            {migrationResult && renderDataSummary(migrationResult.migrated)}

            {/* Warnings */}
            {migrationResult?.warnings && migrationResult.warnings.length > 0 && (
              <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <p className="text-sm font-medium text-amber-400 mb-2">
                  {t('common.warnings', 'Warnings')}:
                </p>
                <ul className="text-xs text-amber-300 space-y-1">
                  {migrationResult.warnings.slice(0, MAX_DISPLAYED_WARNINGS).map((warning, i) => (
                    <li key={i}>{warning}</li>
                  ))}
                  {migrationResult.warnings.length > MAX_DISPLAYED_WARNINGS && (
                    <li>...and {migrationResult.warnings.length - MAX_DISPLAYED_WARNINGS} more</li>
                  )}
                </ul>
              </div>
            )}

            {/* Clear local data option */}
            <div className="mt-6 p-4 bg-slate-900/50 rounded-lg">
              {clearLocalFailed ? (
                <>
                  <div className="flex items-start gap-2 mb-3">
                    <HiOutlineExclamationTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-300">
                      {t('migration.clearFailedAcknowledge', 'Failed to clear local data. You can clear it later from Settings, or try again now.')}
                    </p>
                  </div>
                  <button
                    onClick={handleClearLocalData}
                    disabled={isClearingLocal}
                    className={`${dangerButtonStyle} w-full flex items-center justify-center gap-2`}
                  >
                    {isClearingLocal ? (
                      <HiOutlineArrowPath className="h-4 w-4 animate-spin" />
                    ) : (
                      <HiOutlineArrowPath className="h-4 w-4" />
                    )}
                    {isClearingLocal
                      ? t('common.processing', 'Processing...')
                      : t('migration.retryClear', 'Retry Clear')}
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm text-slate-300 mb-3">
                    {t('migration.clearLocalPrompt', 'Would you like to clear local data? (Your cloud data is safe)')}
                  </p>
                  <button
                    onClick={handleClearLocalData}
                    disabled={isClearingLocal}
                    className={`${dangerButtonStyle} w-full flex items-center justify-center gap-2`}
                  >
                    {isClearingLocal ? (
                      <HiOutlineArrowPath className="h-4 w-4 animate-spin" />
                    ) : (
                      <HiOutlineTrash className="h-4 w-4" />
                    )}
                    {isClearingLocal
                      ? t('common.processing', 'Processing...')
                      : t('migration.clearLocalButton', 'Clear Local Data')}
                  </button>
                </>
              )}
            </div>
          </>
        );

      case 'error':
        return (
          <>
            <div className="text-center mb-6">
              <HiOutlineExclamationTriangle className="h-12 w-12 text-red-400 mx-auto mb-3" />
              <p className="text-lg font-medium text-red-400 mb-2">
                {t('migration.failed', 'Migration Failed')}
              </p>
              <p className="text-slate-300">
                {t('migration.partialFailure', 'Migration was interrupted. Your local data is safe. Please try again.')}
              </p>
            </div>

            {/* Error details */}
            {migrationResult?.errors && migrationResult.errors.length > 0 && (
              <div className="p-3 bg-red-900/20 border border-red-600/30 rounded-lg">
                <p className="text-sm font-medium text-red-400 mb-2">
                  {t('common.errors', 'Errors')}:
                </p>
                <ul className="text-xs text-red-300 space-y-1">
                  {migrationResult.errors.map((error, i) => (
                    <li key={i}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        );

      default:
        return null;
    }
  };

  // Render action buttons
  const renderActions = () => {
    switch (step) {
      case 'preview':
        return (
          <>
            <button onClick={onSkip} className={secondaryButtonStyle}>
              {t('migration.skipButton', 'Skip for Now')}
            </button>
            <button
              onClick={() => setStep('confirm')}
              disabled={isLoadingSummary || !dataSummary}
              className={primaryButtonStyle}
            >
              {t('migration.continueButton', 'Continue')}
            </button>
          </>
        );

      case 'confirm':
        return (
          <>
            <button onClick={() => setStep('preview')} className={secondaryButtonStyle}>
              {t('common.back', 'Back')}
            </button>
            <button
              onClick={handleStartMigration}
              disabled={isMigrating}
              className={primaryButtonStyle}
            >
              {isMigrating
                ? t('common.processing', 'Processing...')
                : t('migration.startButton', 'Start Migration')}
            </button>
          </>
        );

      case 'progress':
        return null; // No actions during progress

      case 'complete':
        return (
          <button onClick={onComplete} className={primaryButtonStyle}>
            {clearLocalFailed
              ? t('migration.continueWithoutClear', 'Continue (Clear Later)')
              : t('migration.doneButton', 'Done')}
          </button>
        );

      case 'error':
        return (
          <>
            <button onClick={onSkip} className={secondaryButtonStyle}>
              {t('migration.skipButton', 'Skip for Now')}
            </button>
            <button
              onClick={handleRetry}
              disabled={retryCooldown > 0}
              className={primaryButtonStyle}
            >
              {retryCooldown > 0
                ? t('migration.retryWait', 'Retry ({{seconds}}s)', { seconds: retryCooldown })
                : t('migration.retryButton', 'Retry Migration')}
            </button>
          </>
        );

      default:
        return null;
    }
  };

  const titleId = 'migration-wizard-title';
  const descriptionId = 'migration-wizard-description';

  return (
    <div
      ref={modalRef}
      className="relative flex flex-col items-center justify-center min-h-screen min-h-[100dvh] bg-slate-800 bg-noise-texture text-slate-100 overflow-hidden font-display"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      {/* Background effects matching LoginScreen */}
      <div className="absolute inset-0 bg-grid-squares opacity-[0.35]" />
      <div className="absolute inset-0 bg-indigo-600/10 mix-blend-soft-light" />
      <div className="absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent" />

      <div className="relative z-10 w-full max-w-lg px-6 py-8">
        {/* Screen reader description */}
        <p id={descriptionId} className="sr-only">
          {t('migration.description', 'Transfer your local data to your cloud account for backup and sync across devices.')}
        </p>

        {/* App name */}
        <div className="flex justify-center mb-6">
          <h1 className="text-4xl font-bold text-yellow-400 tracking-tight">
            MatchOps
          </h1>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 id={titleId} className="text-xl font-semibold text-slate-100">
            {t('migration.title', 'Migrate to Cloud')}
          </h2>
          {step !== 'progress' && (
            <button
              onClick={step === 'complete' ? onComplete : onSkip}
              className="text-slate-400 hover:text-slate-200 transition-colors"
              aria-label={t('common.close', 'Close')}
            >
              <HiOutlineXMark className="h-6 w-6" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="min-h-[200px]">
          {renderContent()}
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end mt-6">
          {renderActions()}
        </div>
      </div>
    </div>
  );
};

export default MigrationWizard;
