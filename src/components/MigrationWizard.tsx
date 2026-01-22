'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  type MigrationMode,
} from '@/services/migrationService';
import { clearLocalIndexedDBData } from '@/utils/clearLocalData';
import { disableCloudMode } from '@/config/backendConfig';
import logger from '@/utils/logger';

type WizardStep = 'loading' | 'select-action' | 'confirm' | 'progress' | 'complete' | 'error';

/** Maximum warnings to display before truncating with "...and X more" */
const MAX_DISPLAYED_WARNINGS = 5;

export interface MigrationWizardProps {
  /** Called when migration completes successfully (with or without clearing local data) */
  onComplete: () => void;
  /** Called when user cancels and wants to return to local mode */
  onCancel: () => void;
  /** Cloud data counts (if cloud has data) */
  cloudCounts?: MigrationCounts | null;
  /** Whether cloud counts are still loading */
  isLoadingCloudCounts?: boolean;
}

/**
 * Migration scenario based on data presence in local and cloud.
 */
type MigrationScenario =
  | 'local-only'      // Local has data, cloud is empty
  | 'both-have-data'; // Both local and cloud have data

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
  onCancel,
  cloudCounts,
  isLoadingCloudCounts = false,
}) => {
  const { t } = useTranslation();
  const modalRef = useRef<HTMLDivElement>(null);

  // Wizard state
  const [step, setStep] = useState<WizardStep>('loading');
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
  const [migrationMode, setMigrationMode] = useState<MigrationMode>('merge'); // Migration mode selection
  const [replaceConfirmText, setReplaceConfirmText] = useState(''); // Confirmation text for replace mode
  const [isSwitchingToLocal, setIsSwitchingToLocal] = useState(false);
  const [switchToLocalError, setSwitchToLocalError] = useState<string | null>(null);

  // Determine scenario based on data presence
  const scenario: MigrationScenario | null = useMemo(() => {
    if (!dataSummary) return null;

    const cloudHasData = cloudCounts && (
      cloudCounts.players > 0 ||
      cloudCounts.teams > 0 ||
      cloudCounts.games > 0 ||
      cloudCounts.seasons > 0 ||
      cloudCounts.tournaments > 0
    );

    return cloudHasData ? 'both-have-data' : 'local-only';
  }, [dataSummary, cloudCounts]);

  // Move to select-action step when data is loaded
  useEffect(() => {
    if (!isLoadingSummary && !isLoadingCloudCounts && dataSummary && step === 'loading') {
      setStep('select-action');
    }
  }, [isLoadingSummary, isLoadingCloudCounts, dataSummary, step]);

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
      const result = await migrateLocalToCloud(handleProgress, migrationMode);
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
  }, [isMigrating, handleProgress, t, migrationMode]);

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
    setStep('select-action');
    setProgress(null);
    setMigrationResult(null);
    setRetryCooldown(RETRY_COOLDOWN_SECONDS);
  }, [retryCooldown]);

  // Handle "Keep Cloud" option - clear local data and use cloud data
  const handleKeepCloud = useCallback(async () => {
    setIsClearingLocal(true);
    try {
      await clearLocalIndexedDBData();
      logger.info('[MigrationWizard] Local data cleared (Keep Cloud option)');
      onComplete();
    } catch (error) {
      logger.error('[MigrationWizard] Failed to clear local data:', error);
      setIsClearingLocal(false);
      // Show error but don't block - user can still proceed
      setSwitchToLocalError(t('migration.clearLocalFailed', 'Failed to clear local data. You can clear it later in Settings.'));
    }
  }, [onComplete, t]);

  // Handle "Start Fresh" option - clear local data and use empty cloud
  const handleStartFresh = useCallback(async () => {
    setIsClearingLocal(true);
    try {
      await clearLocalIndexedDBData();
      logger.info('[MigrationWizard] Local data cleared (Start Fresh option)');
      onComplete();
    } catch (error) {
      logger.error('[MigrationWizard] Failed to clear local data:', error);
      setIsClearingLocal(false);
      // Show error but don't block - user can still proceed
      setSwitchToLocalError(t('migration.clearLocalFailed', 'Failed to clear local data. You can clear it later in Settings.'));
    }
  }, [onComplete, t]);

  const handleSwitchToLocal = useCallback(() => {
    if (isSwitchingToLocal) return;
    setIsSwitchingToLocal(true);
    setSwitchToLocalError(null);

    const result = disableCloudMode();
    if (result.success) {
      window.location.reload();
      return;
    }

    setSwitchToLocalError(result.message || t('migration.switchToLocalFailed', 'Failed to switch to local mode.'));
    setIsSwitchingToLocal(false);
  }, [isSwitchingToLocal, t]);

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

  // Translate entity name for progress display
  // Maps migration service entity keys to translation keys in migration.summary.*
  const translateEntity = (entity: string): string => {
    // Extract base entity name (before any parentheses like "games (1/5)")
    const match = entity.match(/^([a-z ]+)(?:\s*\((.+)\))?$/i);
    if (!match) return entity;

    const [, baseName, suffix] = match;
    const key = baseName.trim().replace(/\s+/g, ''); // "team rosters" -> "teamrosters"

    // Map to translation keys (migration.summary.*)
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

  // Translate warning messages
  // Maps warning markers to translation keys in migration.warnings.*
  const translateWarning = (warning: string): string => {
    // Known warning markers that need translation
    const warningKeyMap: Record<string, string> = {
      'CLOUD_CLEARED': 'cloudCleared',
    };

    const translationKey = warningKeyMap[warning];
    if (translationKey) {
      return t(`migration.warnings.${translationKey}`, warning);
    }

    // Check if warning contains a game ID pattern (orphaned reference warnings)
    // These are dynamically generated and include game IDs
    if (warning.includes('references non-existent') || warning.includes('Cleared invalid')) {
      // These are technical warnings, keep as-is for debugging
      return warning;
    }

    return warning;
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
              {t('migration.progress.entity', 'Migrating {{entity}}...', { entity: translateEntity(currentEntity) })}
            </p>
          )}
        </div>
      </div>
    );
  };

  // Render step content
  const renderContent = () => {
    switch (step) {
      case 'loading':
        return (
          <div className="flex flex-col items-center justify-center py-12">
            <HiOutlineArrowPath className="h-10 w-10 text-sky-400 animate-spin mb-4" />
            <p className="text-slate-300">
              {t('migration.loadingData', 'Loading data...')}
            </p>
          </div>
        );

      case 'select-action':
        return (
          <>
            {/* Icon and description */}
            <div className="text-center mb-6">
              <HiOutlineCloudArrowUp className="h-12 w-12 text-sky-400 mx-auto mb-3" />
              <p className="text-slate-300">
                {scenario === 'both-have-data'
                  ? t('migration.bothHaveDataDesc', 'You have data in both your local device and the cloud. Choose how to proceed.')
                  : t('migration.localOnlyDesc', 'You have local data to migrate to the cloud.')}
              </p>
            </div>

            {/* Data comparison */}
            <div className="space-y-3 mb-6">
              {/* Local data summary */}
              <div className="bg-slate-900/50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                  {t('migration.localData', 'Local Data')}
                </h4>
                {dataSummary && (
                  <div className="text-sm text-slate-400">
                    {dataSummary.games} {t('migration.summary.games', 'Games')}, {dataSummary.players} {t('migration.summary.players', 'Players')}, {dataSummary.teams} {t('migration.summary.teams', 'Teams')}
                  </div>
                )}
              </div>

              {/* Cloud data summary (only if both have data) */}
              {scenario === 'both-have-data' && cloudCounts && (
                <div className="bg-slate-900/50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-sky-400"></span>
                    {t('migration.cloudData', 'Cloud Data')}
                  </h4>
                  <div className="text-sm text-slate-400">
                    {cloudCounts.games} {t('migration.summary.games', 'Games')}, {cloudCounts.players} {t('migration.summary.players', 'Players')}, {cloudCounts.teams} {t('migration.summary.teams', 'Teams')}
                  </div>
                </div>
              )}
            </div>

            {/* Action options - different based on scenario */}
            <div className="space-y-3">
              {scenario === 'both-have-data' ? (
                <>
                  {/* MERGE option */}
                  <button
                    onClick={() => { setMigrationMode('merge'); setStep('confirm'); }}
                    className="w-full p-4 rounded-lg bg-sky-600/20 border border-sky-500/50 hover:bg-sky-600/30 transition-colors text-left"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 w-5 h-5 rounded-full border-2 border-sky-400 flex items-center justify-center">
                        <span className="text-sky-400 text-xs">★</span>
                      </div>
                      <div>
                        <div className="text-slate-100 font-medium">
                          {t('migration.action.merge', 'Merge (Recommended)')}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          {t('migration.action.mergeDesc', 'Combine both - keeps all your data from local and cloud')}
                        </div>
                      </div>
                    </div>
                  </button>

                  {/* REPLACE CLOUD option */}
                  <button
                    onClick={() => { setMigrationMode('replace'); setStep('confirm'); }}
                    className="w-full p-4 rounded-lg bg-slate-700/50 border border-slate-600/50 hover:bg-slate-700/70 transition-colors text-left"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 w-5 h-5 rounded-full border-2 border-slate-400"></div>
                      <div>
                        <div className="text-slate-100 font-medium">
                          {t('migration.action.replaceCloud', 'Replace Cloud with Local')}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          {t('migration.action.replaceCloudDesc', 'Upload local data, overwrite existing cloud data')}
                        </div>
                      </div>
                    </div>
                  </button>

                  {/* KEEP CLOUD option */}
                  <button
                    onClick={handleKeepCloud}
                    className="w-full p-4 rounded-lg bg-slate-700/50 border border-slate-600/50 hover:bg-slate-700/70 transition-colors text-left"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 w-5 h-5 rounded-full border-2 border-slate-400"></div>
                      <div>
                        <div className="text-slate-100 font-medium">
                          {t('migration.action.keepCloud', 'Keep Cloud (Delete Local)')}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          {t('migration.action.keepCloudDesc', 'Use your cloud data, discard local data')}
                        </div>
                      </div>
                    </div>
                  </button>
                </>
              ) : (
                <>
                  {/* MIGRATE option (local-only scenario) */}
                  <button
                    onClick={() => { setMigrationMode('merge'); setStep('confirm'); }}
                    className="w-full p-4 rounded-lg bg-sky-600/20 border border-sky-500/50 hover:bg-sky-600/30 transition-colors text-left"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 w-5 h-5 rounded-full border-2 border-sky-400 flex items-center justify-center">
                        <span className="text-sky-400 text-xs">★</span>
                      </div>
                      <div>
                        <div className="text-slate-100 font-medium">
                          {t('migration.action.migrate', 'Migrate to Cloud (Recommended)')}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          {t('migration.action.migrateDesc', 'Upload your data to the cloud for backup and sync')}
                        </div>
                      </div>
                    </div>
                  </button>

                  {/* START FRESH option */}
                  <button
                    onClick={handleStartFresh}
                    className="w-full p-4 rounded-lg bg-slate-700/50 border border-slate-600/50 hover:bg-slate-700/70 transition-colors text-left"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 w-5 h-5 rounded-full border-2 border-slate-400"></div>
                      <div>
                        <div className="text-slate-100 font-medium">
                          {t('migration.action.startFresh', 'Start Fresh')}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          {t('migration.action.startFreshDesc', 'Begin with empty cloud account')}
                        </div>
                        <div className="text-xs text-amber-400 mt-1">
                          {t('migration.action.startFreshWarning', '⚠️ Local data will be deleted')}
                        </div>
                      </div>
                    </div>
                  </button>
                </>
              )}

              {/* CANCEL option - always available */}
              <button
                onClick={onCancel}
                className="w-full p-4 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:bg-slate-800/70 transition-colors text-left"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 w-5 h-5 rounded-full border-2 border-slate-500"></div>
                  <div>
                    <div className="text-slate-300 font-medium">
                      {t('migration.action.cancel', 'Cancel')}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {t('migration.action.cancelDesc', 'Return to local mode')}
                    </div>
                  </div>
                </div>
              </button>
            </div>
          </>
        );

      case 'confirm':
        return (
          <>
            <div className="text-center mb-6">
              <HiOutlineExclamationTriangle className={`h-12 w-12 mx-auto mb-3 ${migrationMode === 'replace' ? 'text-red-400' : 'text-amber-400'}`} />
              <p className="text-slate-300 mb-4">
                {t('migration.confirmMessage', 'Are you sure you want to migrate your data to the cloud?')}
              </p>
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-left">
                <p className="text-sm text-amber-300">
                  {t('migration.confirmWarning', 'Your local data will remain unchanged. You can clear it after verifying the migration was successful.')}
                </p>
              </div>
            </div>

            {/* Extra warning and confirmation for replace mode */}
            {migrationMode === 'replace' && (
              <div className="mt-4 p-4 bg-red-900/30 border border-red-500/50 rounded-lg">
                <div className="flex items-start gap-2 mb-3">
                  <HiOutlineTrash className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-300">
                      {t('migration.replaceWarningTitle', 'Replace mode will DELETE all existing cloud data!')}
                    </p>
                    <p className="text-xs text-red-300/80 mt-1">
                      {t('migration.replaceWarningDesc', 'All your games, players, teams, seasons, and other data currently in the cloud will be permanently deleted before uploading your local data.')}
                    </p>
                    <p className="text-xs text-red-300/80 mt-2 font-medium">
                      {t('migration.replaceNoRollback', 'Warning: If migration fails after clearing, your cloud data cannot be recovered. Your local data will remain safe.')}
                    </p>
                  </div>
                </div>
                {/* Note: "REPLACE" is kept as English constant across all languages for:
                    1. Consistency with industry practice (e.g., GitHub "delete")
                    2. Preventing accidental confirmation via autocomplete
                    3. Clear intent regardless of UI language */}
                <div>
                  <label className="block text-sm text-slate-300 mb-1">
                    {t('migration.replaceConfirmLabel', 'Type REPLACE to confirm:')}
                  </label>
                  <input
                    type="text"
                    value={replaceConfirmText}
                    onChange={(e) => setReplaceConfirmText(e.target.value)}
                    placeholder="REPLACE"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
              </div>
            )}
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
                    <li key={i}>{translateWarning(warning)}</li>
                  ))}
                  {migrationResult.warnings.length > MAX_DISPLAYED_WARNINGS && (
                    <li>{t('migration.warnings.andMore', '...and {{count}} more', { count: migrationResult.warnings.length - MAX_DISPLAYED_WARNINGS })}</li>
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

            {switchToLocalError && (
              <div className="mt-3 p-2 bg-amber-500/10 border border-amber-500/30 rounded text-xs text-amber-300">
                {switchToLocalError}
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
      case 'loading':
        return null; // No actions while loading

      case 'select-action':
        // Actions are embedded in the step content as buttons
        return null;

      case 'confirm': {
        // For replace mode, require confirmation text
        const isReplaceConfirmed = migrationMode !== 'replace' || replaceConfirmText === 'REPLACE';
        const buttonStyle = migrationMode === 'replace' ? dangerButtonStyle : primaryButtonStyle;
        return (
          <>
            <button onClick={() => { setStep('select-action'); setReplaceConfirmText(''); }} className={secondaryButtonStyle}>
              {t('common.back', 'Back')}
            </button>
            <button
              onClick={handleStartMigration}
              disabled={isMigrating || !isReplaceConfirmed}
              className={buttonStyle}
            >
              {isMigrating
                ? t('common.processing', 'Processing...')
                : migrationMode === 'replace'
                  ? t('migration.startReplaceButton', 'Replace & Upload')
                  : t('migration.startButton', 'Start Migration')}
            </button>
          </>
        );
      }

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
            <button
              onClick={handleSwitchToLocal}
              disabled={isSwitchingToLocal}
              className={secondaryButtonStyle}
            >
              {isSwitchingToLocal
                ? t('migration.switchingToLocal', 'Switching...')
                : t('migration.switchToLocal', 'Switch to Local Mode')}
            </button>
            <button onClick={onComplete} className={secondaryButtonStyle}>
              {t('migration.continueInCloud', 'Continue in Cloud')}
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
      className="relative flex flex-col min-h-screen min-h-[100dvh] bg-slate-800 bg-noise-texture text-slate-100 overflow-y-auto font-display"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      {/* Background effects matching LoginScreen */}
      <div className="absolute inset-0 bg-grid-squares opacity-[0.35] pointer-events-none" />
      <div className="absolute inset-0 bg-indigo-600/10 mix-blend-soft-light pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent pointer-events-none" />

      <div className="relative z-10 w-full max-w-lg mx-auto px-6 py-8 pb-safe flex-1 flex flex-col">
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
          {step !== 'progress' && step !== 'loading' && (
            <button
              onClick={step === 'complete' ? onComplete : onCancel}
              className="text-slate-400 hover:text-slate-200 transition-colors"
              aria-label={t('common.close', 'Close')}
            >
              <HiOutlineXMark className="h-6 w-6" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1">
          {renderContent()}
        </div>

        {/* Actions - sticky at bottom with background */}
        <div className="sticky bottom-0 pt-4 pb-6 mt-6 bg-gradient-to-t from-slate-800 via-slate-800 to-transparent -mx-6 px-6">
          <div className="flex gap-3 justify-end">
            {renderActions()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MigrationWizard;
