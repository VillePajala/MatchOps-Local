'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { clubSeasonEndFromStart } from '@/utils/clubSeason';
import VenueInput from '@/components/VenueInput';
import type { AppSettings } from '@/types/settings';
import { DEFAULT_ARRIVAL_BUFFER_MINUTES } from '@/utils/travelPlan';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/contexts/ToastProvider';
import { useTranslation } from 'react-i18next';
import { formatBytes } from '@/utils/bytes';
import packageJson from '../../package.json';
import { HiOutlineDocumentArrowDown, HiOutlineDocumentArrowUp, HiOutlineArrowPath, HiOutlineCloudArrowDown, HiOutlineClipboardDocument, HiOutlineShare } from 'react-icons/hi2';
import { importFullBackup, prewarmBackup, downloadFullBackup } from '@/utils/fullBackup';
import type { SnapshotMeta } from '@/utils/backupSnapshots';
import ConfirmationModal from './ConfirmationModal';
import BackupRestoreResultsModal, { type BackupRestoreResult } from './BackupRestoreResultsModal';
// backendConfig import removed — migration flag is now handled entirely by importFullBackup
import { useAuth } from '@/contexts/AuthProvider';
import { CollapsibleModalHeader, useCollapsingHeader, modalContainerStyle, secondaryButtonStyle, dangerButtonStyle } from '@/styles/modalStyles';
import logger from '@/utils/logger';
import { getAppSettings, updateAppSettings, DEFAULT_CLUB_SEASON_START_DATE } from '@/utils/appSettings';
import type { AssessmentRatingStyle, AssessmentTemplate } from '@/types/settings';
import { queryKeys } from '@/config/queryKeys';
import { useDataStore } from '@/hooks/useDataStore';
import AiSettingsCard from '@/components/AiSettingsCard';
import CloudSyncSection from './CloudSyncSection';
import TransitionOverlay from './TransitionOverlay';
import { MODAL_BACKDROP, MODAL_BACKDROP_BLOCKING, Z_LAYER } from '@/styles/modalStyles';

/**
 * MarketingConsentToggle - Toggle for granting/withdrawing marketing consent.
 * Shown in the Account tab for cloud mode users only.
 */
function MarketingConsentToggle() {
  const { t } = useTranslation();
  const { marketingConsent, setMarketingConsent } = useAuth();
  const { showToast } = useToast();
  const [isUpdating, setIsUpdating] = React.useState(false);

  const isGranted = marketingConsent === 'granted';

  const handleToggle = async () => {
    setIsUpdating(true);
    try {
      const result = await setMarketingConsent(!isGranted);
      if (result.error) {
        showToast(t('marketingConsent.updateFailed', 'Failed to update marketing preferences'), 'error');
      }
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-2 bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner">
      <h3 className="text-lg font-semibold text-slate-200">
        {t('marketingConsent.settingsTitle', 'Email Preferences')}
      </h3>
      <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-md">
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-200">
            {t('marketingConsent.settingsLabel', 'Product updates & tips')}
          </p>
          <p className="text-sm text-slate-400">
            {t('marketingConsent.settingsDescription', 'Receive occasional emails about new features, tips, and announcements.')}
          </p>
        </div>
        <button
          onClick={handleToggle}
          disabled={isUpdating}
          role="switch"
          aria-checked={isGranted}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 ${
            isGranted ? 'bg-indigo-600' : 'bg-slate-600'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              isGranted ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    </div>
  );
}

type SettingsTab = 'general' | 'data' | 'account' | 'about';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: string;
  onLanguageChange: (lang: string) => void;
  defaultTeamName: string;
  onDefaultTeamNameChange: (name: string) => void;
  onHardResetApp: () => void;
  onCreateBackup: () => void;
  // onDataImportSuccess prop kept for interface compatibility but not used
  // Backup restore now uses full page reload instead of state refresh
  onDataImportSuccess?: () => void;
  /** Optional tab to open when modal opens */
  initialTab?: SettingsTab;
  /** Handler for downloading cloud data (GDPR data portability) */
  onCloudDataDownload?: () => Promise<void>;
  /** Handler for re-sync from cloud (cloud mode only) - clears local, triggers migration wizard */
  onResyncFromCloud?: () => void;
  /** Handler for factory reset (cloud mode only) - clears both local and cloud data */
  onFactoryReset?: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  language,
  onLanguageChange,
  defaultTeamName,
  onDefaultTeamNameChange,
  onHardResetApp,
  onCreateBackup,
  onCloudDataDownload,
  initialTab,
  onResyncFromCloud,
  onFactoryReset,
  // onDataImportSuccess not destructured - backup restore uses full page reload
}) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { userId } = useDataStore();
  const [teamName, setTeamName] = useState(defaultTeamName);
  const [resetConfirm, setResetConfirm] = useState('');
  const [storageEstimate, setStorageEstimate] = useState<{ usage: number; quota: number } | null>(null);
  const restoreFileInputRef = useRef<HTMLInputElement>(null);
  const [clubSeasonStartDate, setClubSeasonStartDate] = useState<string>(DEFAULT_CLUB_SEASON_START_DATE);
  const [startingPoint, setStartingPoint] = useState<AppSettings['startingPoint']>(undefined);
  const [arrivalBuffer, setArrivalBuffer] = useState<number>(DEFAULT_ARRIVAL_BUFFER_MINUTES);
  const [assessmentsEnabled, setAssessmentsEnabled] = useState(false);
  const [assessmentRatingStyle, setAssessmentRatingStyle] = useState<AssessmentRatingStyle>('words');
  const [assessmentTemplate, setAssessmentTemplate] = useState<AssessmentTemplate>('balanced');
  const [backupRestoreResult, setBackupRestoreResult] = useState<BackupRestoreResult | null>(null);
  const [showRestoreResults, setShowRestoreResults] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const headerCollapse = useCollapsingHeader();
  // Switching tabs reveals the collapsed tab strip again.
  useEffect(() => { headerCollapse.reset(); }, [activeTab, headerCollapse]);
  const [deleteAccountConfirm, setDeleteAccountConfirm] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isDownloadingCloudData, setIsDownloadingCloudData] = useState(false);
  const [resyncConfirm, setResyncConfirm] = useState('');
  const [factoryResetConfirm, setFactoryResetConfirm] = useState('');
  const [transitionMessage, setTransitionMessage] = useState<string | null>(null);
  // Data Safety - Layer 1: automatic restore points (loaded lazily when modal opens).
  // null = still loading (avoids briefly flashing the "no restore points" state).
  const [restorePoints, setRestorePoints] = useState<SnapshotMeta[] | null>(null);
  const { deleteAccount, mode: authMode } = useAuth();

  // Set initial tab when modal opens
  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Data Safety - Layer 1: load the list of automatic restore points when the
  // modal opens. Best-effort and lazy (dynamic import keeps IndexedDB backup code
  // out of the initial bundle); a failure just shows an empty list.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setRestorePoints(null); // show the loading state on each open
    (async () => {
      try {
        const { listSnapshots } = await import('@/utils/backupSnapshots');
        const list = await listSnapshots(userId);
        if (!cancelled) setRestorePoints(list);
      } catch (error) {
        logger.warn('[SettingsModal] Failed to load restore points (non-fatal):', error);
        if (!cancelled) setRestorePoints([]); // degrade to empty rather than spin forever
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, userId]);

  // Helper to get maximum day for a given month

  // Helper to parse month and day from date string with defensive fallback
  const parseMonthDay = (dateStr: string): { month: number; day: number } => {
    try {
      const parts = dateStr.split('-');
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10);

      // Validate parsed values
      if (isNaN(month) || isNaN(day) || month < 1 || month > 12 || day < 1 || day > 31) {
        logger.warn('[parseMonthDay] Invalid date string, using defaults:', dateStr);
        return { month: 10, day: 1 }; // Default to October 1
      }

      return { month, day };
    } catch (error) {
      logger.error('[parseMonthDay] Failed to parse date string, using defaults:', dateStr, error);
      return { month: 10, day: 1 }; // Default to October 1
    }
  };

  // Helper to construct date string from month and day (using year 2000 as template)

  // Helper to calculate end date (day before start date)
  // E.g., if season starts Aug 1, it ends Jul 31
  /**
   * The boundary as a real date the picker can show.
   *
   * Stored as month and day only - a club season recurs every year - but a date
   * input needs a year to render. This lends it the CURRENT season's year, and
   * the preview underneath states the recurrence outright so a borrowed year is
   * never mistaken for a one-off date.
   */
  const clubSeasonPickerValue = React.useMemo(() => {
    const { month, day } = parseMonthDay(clubSeasonStartDate);
    const today = new Date();
    const boundaryThisYear = new Date(today.getFullYear(), month - 1, day);
    const year = today >= boundaryThisYear ? today.getFullYear() : today.getFullYear() - 1;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }, [clubSeasonStartDate]);

  /** This season and the next, spelled out, so the boundary is unambiguous. */
  const clubSeasonPreview = React.useMemo(() => {
    const [yearStr] = clubSeasonPickerValue.split('-');
    const year = parseInt(yearStr, 10);
    const start = parseMonthDay(clubSeasonStartDate);
    const end = parseMonthDay(clubSeasonEndFromStart(clubSeasonStartDate));
    // A season spans two calendar years UNLESS it begins on 1 January, in
    // which case it ends on 31 December of the same one.
    const endsNextYear = !(start.month === 1 && start.day === 1);
    const span = (from: number) =>
      `${start.day}.${start.month}.${from} - ${end.day}.${end.month}.${endsNextYear ? from + 1 : from}`;
    return { current: span(year), next: span(year + 1) };
  }, [clubSeasonPickerValue, clubSeasonStartDate]);

  /**
   * Only the month and day are kept: the year the picker carries is scaffolding
   * for the control, not part of the setting.
   */
  const handleClubSeasonStartDateChange = async (picked: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(picked)) return;
    const [, month, day] = picked.split('-');
    const startDate = `2000-${month}-${day}`;

    setClubSeasonStartDate(startDate);
    try {
      // The end is NOT stored. It is the day before the next start, derived
      // wherever it is needed, so the two can never disagree and leave a gap.
      await updateAppSettings({ clubSeasonStartDate: startDate, hasConfiguredSeasonDates: true }, userId);
      queryClient.invalidateQueries({ queryKey: [...queryKeys.settings.detail(), userId] });
    } catch (error) {
      logger.error('Failed to save the club season boundary:', error);
      showToast(t('settingsModal.seasonSaveFailed', 'Could not save the season start. Please try again.'), 'error');
    }
  };


  // Helper to format date for display (e.g., "July 31")
  const [checkingForUpdates, setCheckingForUpdates] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [pendingRestoreContent, setPendingRestoreContent] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  React.useLayoutEffect(() => {
    setTeamName(defaultTeamName);
  }, [defaultTeamName]);

  // Build the backup ahead of the user's "Create Backup" tap so navigator.share()
  // fires with a fresh user activation (otherwise it throws NotAllowedError and
  // silently falls back to a plain download). Generation is read-only.
  useEffect(() => {
    if (isOpen) {
      prewarmBackup(userId);
    }
  }, [isOpen, userId]);

  useEffect(() => {
    if (isOpen) {
      // Load club season settings (user-scoped)
      getAppSettings(userId).then(settings => {
        setClubSeasonStartDate(settings.clubSeasonStartDate ?? DEFAULT_CLUB_SEASON_START_DATE);
        setStartingPoint(settings.startingPoint);
        setArrivalBuffer(settings.arrivalBufferMinutes ?? DEFAULT_ARRIVAL_BUFFER_MINUTES);
        setAssessmentsEnabled(settings.assessmentsEnabled ?? false);
        setAssessmentRatingStyle(settings.assessmentRatingStyle ?? 'words');
        setAssessmentTemplate(settings.assessmentTemplate ?? 'balanced');
      }).catch((error) => {
        // Use defaults if loading fails
        logger.error('Failed to load club season settings:', error);
        setClubSeasonStartDate(DEFAULT_CLUB_SEASON_START_DATE);
      });

      if (navigator.storage?.estimate) {
        navigator.storage
          .estimate()
          .then(res => {
            // Use the actual quota from the browser, fallback to a reasonable default if not available
            const actualQuota = res.quota || 50 * 1024 * 1024; // 50 MB fallback if quota unavailable
            setStorageEstimate({
              usage: res.usage || 0,
              quota: actualQuota
            });
          })
          .catch(() => setStorageEstimate(null));
      } else {
        setStorageEstimate(null);
      }
    } else {
      // Clear all confirmation inputs when modal closes
      setResetConfirm('');
      setResyncConfirm('');
      setFactoryResetConfirm('');
    }
  }, [isOpen, userId]);

  const handleRestore = () => {
    restoreFileInputRef.current?.click();
  };

  // Restore from an automatic restore point: load its JSON and route it through the
  // SAME confirm + restore pipeline as a file restore (which snapshots the current
  // state first, so this is itself undoable).
  const handleRestoreSnapshot = async (id: string) => {
    try {
      const { getSnapshotJson } = await import('@/utils/backupSnapshots');
      const json = await getSnapshotJson(userId, id);
      if (!json) {
        showToast(t('fullBackup.restoreFailed', 'Failed to restore backup. The file may be corrupted or invalid.'), 'error');
        return;
      }
      setPendingRestoreContent(json);
      setShowRestoreConfirm(true);
    } catch (error) {
      logger.error('[SettingsModal] Failed to load restore point:', error);
      showToast(t('fullBackup.restoreError', 'Error importing backup: {{error}}'), 'error');
    }
  };

  // Localized label for why a snapshot was taken.
  const restorePointReasonLabel = (reason: SnapshotMeta['reason']): string => {
    switch (reason) {
      case 'pre-clear': return t('settingsModal.restorePoints.reasonPreClear', 'Before reset');
      case 'pre-restore': return t('settingsModal.restorePoints.reasonPreRestore', 'Before restore');
      case 'manual': return t('settingsModal.restorePoints.reasonManual', 'Manual');
      case 'auto':
      default: return t('settingsModal.restorePoints.reasonAuto', 'Automatic');
    }
  };

  const handleRestoreFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const jsonContent = e.target?.result as string;
      if (jsonContent) {
        setPendingRestoreContent(jsonContent);
        // Always show the same confirmation dialog - cloud mode will trigger
        // migration wizard after import via the page.tsx migration check
        setShowRestoreConfirm(true);
      } else {
        showToast(t('settingsModal.importReadError', 'Error reading backup file content.'), 'error');
      }
    };
    reader.onerror = () => showToast(t('settingsModal.importReadError', 'Error reading backup file content.'), 'error');
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleRestoreConfirmed = async () => {
    if (pendingRestoreContent) {
      // Start loading state
      setIsRestoring(true);

      try {
        // Data Safety - Layer 1: snapshot the current data BEFORE the restore
        // overwrites it, so the user can roll back to their pre-restore state.
        // (importFullBackup also has its own in-flight rollback; this is a durable,
        // user-visible restore point on top of that.)
        try {
          const { createSnapshot } = await import('@/utils/backupSnapshots');
          await createSnapshot(userId, 'pre-restore');
        } catch (snapshotError) {
          logger.warn('[SettingsModal] Pre-restore snapshot failed (non-fatal):', snapshotError);
        }

        // Pass delayReload=true to prevent automatic reload - we'll reload after showing results modal
        // Pass userId for user-scoped storage
        const result = await importFullBackup(pendingRestoreContent, undefined, showToast, true, true, userId);
        if (result) {
          // Show results modal
          setBackupRestoreResult(result);
          setShowRestoreResults(true);
        } else {
          // importFullBackup returned falsy - show error toast
          showToast(t('fullBackup.restoreFailed', 'Failed to restore backup. The file may be corrupted or invalid.'), 'error');
          logger.warn('[SettingsModal] importFullBackup returned falsy result');
        }
      } catch (error) {
        logger.error('[SettingsModal] Restore backup failed:', error);
        showToast(t('fullBackup.restoreError', 'Error importing backup: {{error}}'), 'error');
      } finally {
        // End loading state
        setIsRestoring(false);
      }
    }
    setShowRestoreConfirm(false);
    setPendingRestoreContent(null);
  };

  const handleRestoreResultsClose = () => {
    setShowRestoreResults(false);
    setBackupRestoreResult(null);
    // Show transition overlay while page reloads
    setTransitionMessage(t('settingsModal.restoringReloading', 'Backup restored. Reloading...'));
    setTimeout(() => {
      window.location.reload();
    }, 100);
  };

  const handleCheckForUpdates = async () => {
    setCheckingForUpdates(true);
    logger.log('[PWA] Manual update check triggered from Settings');

    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          logger.log('[PWA] Manual check - forcing registration.update()');
          await registration.update();

          // Check if update was found. After update(), a new SW may be:
          // - waiting (already installed) → banner will show immediately
          // - installing (still downloading) → banner will show after install completes
          // Only show "up to date" if neither exists.
          if (registration.waiting || registration.installing) {
            logger.log('[PWA] Update found - UpdateBanner will show notification');
          } else {
            logger.log('[PWA] No update available - app is up to date');
            showToast(t('settingsModal.upToDate', 'App is up to date!'), 'success');
          }
        } else {
          logger.error('[PWA] No service worker registration found');
          showToast(t('settingsModal.noServiceWorker', 'Service worker not registered'), 'error');
        }
      }
    } catch (error) {
      logger.error('[PWA] Manual update check failed:', error);
      showToast(t('settingsModal.updateCheckFailed', 'Failed to check for updates'), 'error');
    } finally {
      setCheckingForUpdates(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteAccountConfirm.trim() !== 'DELETE') return;

    setIsDeletingAccount(true);
    logger.log('[SettingsModal] Delete account initiated');

    try {
      const result = await deleteAccount();

      if (result.error) {
        showToast(t('settingsModal.deleteAccountFailed', 'Failed to delete account') + result.error, 'error');
        logger.error('[SettingsModal] Delete account failed:', result.error);
      } else {
        logger.info('[SettingsModal] Account deleted successfully');
        // Close the modal - user will be redirected to login
        onClose();
      }
    } catch (error) {
      showToast(t('settingsModal.deleteAccountFailed', 'Failed to delete account'), 'error');
      logger.error('[SettingsModal] Delete account error:', error);
    } finally {
      setIsDeletingAccount(false);
      setDeleteAccountConfirm('');
    }
  };

  // Handler for season start date changes (auto-calculates end date)

  const handleAssessmentsEnabledChange = async (enabled: boolean) => {
    setAssessmentsEnabled(enabled);
    try {
      await updateAppSettings({ assessmentsEnabled: enabled }, userId);
      queryClient.invalidateQueries({ queryKey: [...queryKeys.settings.detail(), userId] });
    } catch (error) {
      logger.error('Failed to save assessments setting:', error);
      showToast(t('settingsModal.saveSettingError', 'Failed to save setting. Please try again.'), 'error');
    }
  };

  const handleAssessmentRatingStyleChange = async (style: AssessmentRatingStyle) => {
    setAssessmentRatingStyle(style);
    try {
      await updateAppSettings({ assessmentRatingStyle: style }, userId);
      queryClient.invalidateQueries({ queryKey: [...queryKeys.settings.detail(), userId] });
    } catch (error) {
      logger.error('Failed to save assessment rating style:', error);
      showToast(t('settingsModal.saveSettingError', 'Failed to save setting. Please try again.'), 'error');
    }
  };

  const handleAssessmentTemplateChange = async (template: AssessmentTemplate) => {
    setAssessmentTemplate(template);
    try {
      await updateAppSettings({ assessmentTemplate: template }, userId);
      queryClient.invalidateQueries({ queryKey: [...queryKeys.settings.detail(), userId] });
    } catch (error) {
      logger.error('Failed to save assessment template:', error);
      showToast(t('settingsModal.saveSettingError', 'Failed to save setting. Please try again.'), 'error');
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't close if the restore confirmation dialog is open
      if (e.key === 'Escape' && !showRestoreConfirm) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, showRestoreConfirm]);

  /**
   * Where the team sets off from. Stored with its coordinates, because the
   * departure time measures a distance - a name alone is a place a map has to
   * guess at, and a guessed start makes every departure time fiction.
   */
  const handleStartingPointChange = useCallback(async (venue: {
    name: string; latitude?: number; longitude?: number; address?: string;
  }) => {
    // THE WHOLE VENUE IS KEPT, coordinates or not. Storing only pinned points
    // meant a half-typed name had nowhere to live, so the field reverted on
    // every keystroke and could not be typed in at all. Whether it can be
    // measured FROM is a separate question, asked where the measuring happens.
    // Kept while ANY of the three has content. Requiring a name discarded an
    // address typed on its own, which is a perfectly normal order to fill two
    // fields in - and discarding it meant that field could not be typed in
    // either. Only an entirely empty venue means "no starting point".
    const hasAnything =
      Boolean(venue.name.trim()) || Boolean(venue.address?.trim()) || venue.latitude !== undefined;
    const next = hasAnything
      ? { name: venue.name, address: venue.address, latitude: venue.latitude, longitude: venue.longitude }
      : undefined;
    setStartingPoint(next);
    try {
      await updateAppSettings({ startingPoint: next }, userId);
    } catch (error) {
      logger.error('[SettingsModal] Could not save the starting point', error);
    }
  }, [userId]);

  const handleArrivalBufferChange = useCallback(async (minutes: number) => {
    // Clamped rather than validated with a message: a negative or absurd buffer
    // is a slip, and silently sane beats an error for a number this small.
    const clamped = Math.min(240, Math.max(0, Math.round(minutes || 0)));
    setArrivalBuffer(clamped);
    try {
      await updateAppSettings({ arrivalBufferMinutes: clamped }, userId);
    } catch (error) {
      logger.error('[SettingsModal] Could not save the arrival buffer', error);
    }
  }, [userId]);

  if (!isOpen) return null;

  const getTabStyle = (tab: SettingsTab) => {
    const baseStyle = 'px-2 py-1.5 text-sm font-medium rounded-md transition-colors';
    if (activeTab === tab) {
      return `${baseStyle} bg-indigo-600 text-white`;
    }
    return `${baseStyle} bg-slate-700 text-slate-300 hover:bg-slate-600`;
  };


  const labelStyle = 'text-sm font-medium text-slate-300 mb-1';
  const inputStyle =
    'block w-full bg-slate-700 border border-slate-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-indigo-500 sm:text-sm text-white';
  const feedbackSubject = t('settingsModal.feedbackEmailSubject', 'MatchOps feedback');
  const feedbackBody = t(
    'settingsModal.feedbackEmailBody',
    'Hi, I wanted to share feedback about MatchOps:\n\n\n\nApp version: {{version}}',
    { version: packageJson.version },
  );
  const feedbackHref = `mailto:support@match-ops.com?subject=${encodeURIComponent(feedbackSubject)}&body=${encodeURIComponent(feedbackBody)}`;
  const getDisplayMode = () => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return t('settingsModal.appInfoDisplayUnknown', 'Unknown');
    }

    return window.matchMedia('(display-mode: standalone)').matches
      ? t('settingsModal.appInfoDisplayStandalone', 'Standalone')
      : t('settingsModal.appInfoDisplayBrowser', 'Browser');
  };
  const buildAppInfo = () => [
    t('settingsModal.appInfoTitle', 'MatchOps app info'),
    `${t('settingsModal.appInfoVersion', 'Version')}: ${packageJson.version}`,
    `${t('settingsModal.appInfoLanguage', 'Language')}: ${language}`,
    `${t('settingsModal.appInfoMode', 'Mode')}: ${authMode === 'cloud' ? t('settingsModal.appInfoModeCloud', 'Cloud') : t('settingsModal.appInfoModeLocal', 'Local')}`,
    `${t('settingsModal.appInfoDisplayMode', 'Display mode')}: ${getDisplayMode()}`,
    `${t('settingsModal.appInfoPlatform', 'Platform')}: ${navigator.platform || t('settingsModal.appInfoUnknown', 'Unknown')}`,
    `${t('settingsModal.appInfoBrowser', 'Browser')}: ${navigator.userAgent || t('settingsModal.appInfoUnknown', 'Unknown')}`,
  ].join('\n');
  const handleCopyAppInfo = async () => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable');
      }

      await navigator.clipboard.writeText(buildAppInfo());
      showToast(t('settingsModal.copyAppInfoSuccess', 'App info copied'), 'success');
    } catch (error) {
      logger.warn('[SettingsModal] Failed to copy app info:', error);
      showToast(t('settingsModal.copyAppInfoFailed', 'Could not copy app info'), 'error');
    }
  };

  return (
    <div className={`${MODAL_BACKDROP} ${Z_LAYER.modal}`} role="dialog" aria-modal="true" aria-label={t('settingsModal.title', 'Settings')}>
      <div className={`${modalContainerStyle} bg-noise-texture relative overflow-hidden h-full w-full`}>
        <div className="absolute inset-0 bg-indigo-600/10 mix-blend-soft-light" />
        <div className="absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent" />
        <div className="absolute -inset-[50px] bg-sky-400/5 blur-2xl top-0 opacity-50" />
        <div className="absolute -inset-[50px] bg-indigo-600/5 blur-2xl bottom-0 opacity-50" />

        <div className="relative z-10 flex flex-col h-full">
          {/* Chrome slimming: X-header + collapsing tab strip; close-only
              footer removed. */}
          <CollapsibleModalHeader
            title={t('settingsModal.title', 'Settings')}
            onClose={onClose}
            closeLabel={t('settingsModal.doneButton', 'Done')}
            collapse={headerCollapse}
          >
          {/* Tab Navigation */}
          <div className="flex w-full gap-2 px-6 py-3 bg-slate-900/50 flex-shrink-0">
            <button onClick={() => setActiveTab('general')} className={`${getTabStyle('general')} flex-1`} aria-pressed={activeTab === 'general'}>
              {t('settingsModal.tabs.general', 'General')}
            </button>
            <button onClick={() => setActiveTab('data')} className={`${getTabStyle('data')} flex-1`} aria-pressed={activeTab === 'data'}>
              {t('settingsModal.tabs.data', 'Data')}
            </button>
            <button onClick={() => setActiveTab('account')} className={`${getTabStyle('account')} flex-1`} aria-pressed={activeTab === 'account'}>
              {t('settingsModal.tabs.account', 'Account')}
            </button>
            <button onClick={() => setActiveTab('about')} className={`${getTabStyle('about')} flex-1`} aria-pressed={activeTab === 'about'}>
              {t('settingsModal.tabs.about', 'About')}
            </button>
          </div>
          </CollapsibleModalHeader>

          <div className="flex-1 overflow-y-auto min-h-0 px-4 py-4 space-y-4" onScroll={headerCollapse.onScroll}>
            {/* General Tab - App preferences and season settings */}
            {activeTab === 'general' && (
            <>
            <div className="bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner space-y-2">
              <h3 className="text-lg font-semibold text-slate-200 mb-3">
                {t('settingsModal.preferencesTitle', 'Preferences')}
              </h3>
              {/* Language */}
              <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-md">
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-200">
                    {t('settingsModal.languageLabel', 'Language')}
                  </p>
                </div>
                <select
                  id="language-select"
                  value={language}
                  onChange={(e) => onLanguageChange(e.target.value)}
                  className="bg-slate-700 border border-slate-600 rounded-md py-1.5 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="en">English</option>
                  <option value="fi">Suomi</option>
                </select>
              </div>
              {/* Player assessments: off by default (owner decision 2026-09-09).
                  Ratings already recorded are kept; the style and metric
                  choices below only matter while this is on. */}
              <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-md">
                <div className="flex-1">
                  <label htmlFor="assessments-enabled-toggle" className="block text-sm font-medium text-slate-200 cursor-pointer">
                    {t('settingsModal.assessmentsEnabledLabel', 'Player assessments')}
                  </label>
                  <p className="text-sm text-slate-400">
                    {t('settingsModal.assessmentsEnabledHint', 'Rate players after each game on a set of qualities. Off by default. Ratings you have already made are kept either way.')}
                  </p>
                </div>
                <input
                  type="checkbox"
                  id="assessments-enabled-toggle"
                  checked={assessmentsEnabled}
                  onChange={(e) => handleAssessmentsEnabledChange(e.target.checked)}
                  aria-label={t('settingsModal.assessmentsEnabledLabel', 'Player assessments')}
                  className="w-5 h-5 rounded border-slate-500 bg-slate-700 text-indigo-600 focus:ring-indigo-500"
                />
              </div>
              {assessmentsEnabled && (<>
              {/* Assessment rating style */}
              <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-md">
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-200">
                    {t('settingsModal.assessmentRatingStyleLabel', 'Assessment rating style')}
                  </p>
                  <p className="text-sm text-slate-400">
                    {t('settingsModal.assessmentRatingStyleHint', 'How player ratings are shown and entered. Switching is safe - existing ratings are kept.')}
                  </p>
                </div>
                <select
                  id="assessment-rating-style-select"
                  value={assessmentRatingStyle}
                  onChange={(e) => handleAssessmentRatingStyleChange(e.target.value as AssessmentRatingStyle)}
                  className="bg-slate-700 border border-slate-600 rounded-md py-1.5 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="words">{t('settingsModal.assessmentRatingStyleWords', 'Words (5 levels)')}</option>
                  <option value="num5">{t('settingsModal.assessmentRatingStyleNum5', 'Numbers 1-5')}</option>
                  <option value="num10">{t('settingsModal.assessmentRatingStyleNum10', 'Numbers 1-10')}</option>
                </select>
              </div>
              {/* Assessment metric template */}
              <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-md">
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-200">
                    {t('settingsModal.assessmentTemplateLabel', 'Assessment metrics')}
                  </p>
                  <p className="text-sm text-slate-400">
                    {t('settingsModal.assessmentTemplateHint', 'Which set of qualities to assess. Switching is safe - past ratings are kept.')}
                  </p>
                </div>
                <select
                  id="assessment-template-select"
                  value={assessmentTemplate}
                  onChange={(e) => handleAssessmentTemplateChange(e.target.value as AssessmentTemplate)}
                  className="bg-slate-700 border border-slate-600 rounded-md py-1.5 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="balanced">{t('settingsModal.assessmentTemplateBalanced', 'Balanced (10)')}</option>
                  <option value="light6">{t('settingsModal.assessmentTemplateLight6', 'Light 6 (U7-U9)')}</option>
                  <option value="creative">{t('settingsModal.assessmentTemplateCreative', 'Creative-attacking (14)')}</option>
                </select>
              </div>
              </>)}
              {/* Default Team Name */}
              <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-md">
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-200">
                    {t('settingsModal.defaultTeamNameLabel', 'Default Team Name')}
                  </p>
                </div>
                <input
                  id="team-name-input"
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  onBlur={() => onDefaultTeamNameChange(teamName)}
                  className="bg-slate-700 border border-slate-600 rounded-md py-1.5 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 w-40"
                />
              </div>
            </div>

            {/* Kirjuri (PR 4): own AI provider behind the consent gate */}
            <AiSettingsCard userId={userId} />

            {/* THE JOURNEY. Both numbers behind the next-match card's departure
                time live here, because both are club facts rather than
                per-match ones - and because a derived starting point was
                invisible and uncorrectable, which is why it is asked for. */}
            <div className="space-y-3 bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner">
              <h3 className="text-lg font-semibold text-slate-200">
                {t('settingsModal.travelTitle', 'Getting to matches')}
              </h3>
              <p className="text-sm text-slate-300">
                {t('settingsModal.travelDescription', 'Used to work out when to leave for your next match. Without a starting point no departure time is shown.')}
              </p>

              <VenueInput
                id="starting-point"
                value={startingPoint?.name ?? ''}
                latitude={startingPoint?.latitude}
                longitude={startingPoint?.longitude}
                address={startingPoint?.address}
                hasCoordinates={startingPoint?.latitude !== undefined}
                onChange={handleStartingPointChange}
                className={inputStyle}
              />

              <div>
                <label className={labelStyle} htmlFor="arrival-buffer">
                  {t('settingsModal.arrivalBufferLabel', 'Be at the ground before kick-off (minutes)')}
                </label>
                <input
                  id="arrival-buffer"
                  type="number"
                  min={0}
                  max={240}
                  value={arrivalBuffer}
                  onChange={(e) => handleArrivalBufferChange(Number(e.target.value))}
                  className={inputStyle}
                />
                <p className="mt-1 text-xs text-slate-400">
                  {t('settingsModal.arrivalBufferHint', 'Warm-up, lineup and changing. A single match can be given its own figure.')}
                </p>
              </div>
            </div>

            {/* Season Settings - merged from Season tab */}
            <div className="space-y-3 bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner">
              <h3 className="text-lg font-semibold text-slate-200">
                {t('settingsModal.seasonStartTitle', 'Season Start Date')}
              </h3>
              <p id="club-season-description" className="text-sm text-slate-300">
                {t('settingsModal.seasonStartDescription', 'When does your club\'s new season begin? This is typically when players move to new age groups. The previous season automatically ends the day before.')}
              </p>
              <div className="space-y-3">
                {/* Season Start Date */}
                <div>
                  <label className={labelStyle} htmlFor="club-season-start">
                    {t('settingsModal.newSeasonStartsLabel', 'New season starts')}
                  </label>
                  {/* ONE DATE, and a real picker rather than two dropdowns -
                      the same control a match date uses. Only the month and day
                      matter; the preview below spells out what that produces so
                      the recurring part is never in doubt. */}
                  <input
                    type="date"
                    id="club-season-start"
                    value={clubSeasonPickerValue}
                    onChange={(e) => handleClubSeasonStartDateChange(e.target.value)}
                    className={inputStyle}
                    aria-describedby="club-season-description"
                  />
                </div>

                {/* What that boundary actually produces. The end is never stored
                    and never configured: it is the day before the next season
                    begins, which is what makes every date belong to exactly one
                    season instead of falling into an 'off-season' gap. */}
                <div className="rounded-md border border-slate-600 bg-slate-800/50 px-3 py-2 text-sm text-slate-300">
                  <div>
                    {t('settingsModal.seasonThis', 'This season')}:{' '}
                    <span className="font-semibold text-slate-100">{clubSeasonPreview.current}</span>
                  </div>
                  <div className="mt-0.5">
                    {t('settingsModal.seasonNext', 'Next season')}:{' '}
                    <span className="font-semibold text-slate-100">{clubSeasonPreview.next}</span>
                  </div>
                </div>
              </div>
            </div>
            </>
            )}

            {/* Account Tab - Cloud sync and account management */}
            {activeTab === 'account' && (
            <>
              <CloudSyncSection />

              {/* Marketing Consent Toggle - cloud mode only */}
              {authMode === 'cloud' && <MarketingConsentToggle />}
            </>
            )}

            {/* Data Tab */}
            {activeTab === 'data' && (
            <>
            {/* Backup & Export Section */}
            <div className="space-y-3 bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner">
              <h3 className="text-lg font-semibold text-slate-200">
                {t('settingsModal.backupExportTitle', 'Backup & Export')}
              </h3>
              <input
                type="file"
                ref={restoreFileInputRef}
                onChange={handleRestoreFileSelected}
                accept=".json,.txt,application/json,text/plain"
                style={{ display: "none" }}
                data-testid="restore-backup-input"
              />
              <div className="space-y-2">
                <div className="flex items-start gap-3 p-3 bg-slate-800/50 rounded-md">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-200">
                      {t('settingsModal.backupButton', 'Backup All Data')}
                    </p>
                    <p className="text-sm text-slate-400">
                      {t('settingsModal.backupCardDesc', 'Export all your data to a backup file you can keep.')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={onCreateBackup}
                      aria-label={t('settingsModal.backupShareAria', 'Share backup')}
                      title={t('settingsModal.backupShareAria', 'Share backup')}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-sm font-medium transition-colors"
                    >
                      <HiOutlineShare className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => downloadFullBackup(showToast, userId)}
                      aria-label={t('settingsModal.backupDownloadAria', 'Download backup to device')}
                      title={t('settingsModal.backupDownloadAria', 'Download backup to device')}
                      className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm font-medium transition-colors"
                    >
                      <HiOutlineDocumentArrowDown className="h-5 w-5" />
                    </button>
                  </div>
                </div>
                {/* Download Cloud Data - cloud mode only */}
                <div className={`flex items-start gap-3 p-3 bg-slate-800/50 rounded-md${authMode !== 'cloud' ? ' opacity-50' : ''}`}>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-200">
                      {t('settingsModal.gdpr.downloadTitle', 'Download Your Data')}
                    </p>
                    <p className="text-sm text-slate-400">
                      {authMode === 'cloud'
                        ? t('settingsModal.gdpr.downloadDescriptionCloud', 'Download all data stored on the server to a file you can keep.')
                        : t('settingsModal.gdpr.downloadDescriptionLocal', 'Cloud account required. Your local data can be exported using Backup above.')}
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      if (!onCloudDataDownload) return;
                      setIsDownloadingCloudData(true);
                      try {
                        await onCloudDataDownload();
                      } finally {
                        setIsDownloadingCloudData(false);
                      }
                    }}
                    disabled={authMode !== 'cloud' || isDownloadingCloudData}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded text-sm font-medium transition-colors"
                    aria-label={t('settingsModal.gdpr.downloadButton', 'Download')}
                  >
                    {isDownloadingCloudData
                      ? <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-400 border-t-white" />
                      : <HiOutlineCloudArrowDown className="h-5 w-5" />}
                  </button>
                </div>
                <div className="flex items-start gap-3 p-3 bg-slate-800/50 rounded-md">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-200">
                      {t('settingsModal.restoreButton', 'Restore from Backup')}
                    </p>
                    <p className="text-sm text-slate-400">
                      {t('settingsModal.restoreCardDesc', 'Replace current data with a backup file.')}
                    </p>
                  </div>
                  <button
                    onClick={handleRestore}
                    className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white rounded text-sm font-medium transition-colors"
                  >
                    <HiOutlineDocumentArrowUp className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Automatic Restore Points (Data Safety - Layer 1) */}
              <div className="pt-3 mt-1 border-t border-white/10 space-y-2">
                <div>
                  <p className="text-sm font-medium text-slate-200">
                    {t('settingsModal.restorePoints.title', 'Automatic Restore Points')}
                  </p>
                  <p className="text-sm text-slate-400">
                    {t('settingsModal.restorePoints.description', 'The app automatically keeps recent on-device backups. Restore one if something goes wrong.')}
                  </p>
                  <p className="text-sm text-slate-400 mt-1">
                    {restorePoints === null
                      ? t('settingsModal.restorePoints.loading', 'Loading restore points...')
                      : restorePoints.length > 0
                        ? t('settingsModal.restorePoints.lastBackup', 'Last automatic backup: {{when}}', { when: new Date(restorePoints[0].createdAt).toLocaleString() })
                        : t('settingsModal.restorePoints.lastBackupNever', 'No automatic backup yet.')}
                  </p>
                </div>
                {restorePoints !== null && (restorePoints.length === 0 ? (
                  <p className="text-sm text-slate-400 italic">
                    {t('settingsModal.restorePoints.empty', 'No restore points yet - one is created automatically.')}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {restorePoints.map((snap) => (
                      <li key={snap.id} className="flex items-start gap-3 p-3 bg-slate-800/50 rounded-md">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-200">
                            {new Date(snap.createdAt).toLocaleString()}
                            <span className="ml-2 text-xs text-slate-400">({restorePointReasonLabel(snap.reason)})</span>
                          </p>
                          <p className="text-sm text-slate-400">
                            {t('settingsModal.restorePoints.summary', '{{games}} games, {{players}} players', { games: snap.summary.games, players: snap.summary.players })}
                          </p>
                        </div>
                        <button
                          onClick={() => handleRestoreSnapshot(snap.id)}
                          aria-label={t('settingsModal.restorePoints.restoreAriaLabel', 'Restore backup from {{when}}', { when: new Date(snap.createdAt).toLocaleString() })}
                          className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white rounded text-sm font-medium transition-colors shrink-0"
                        >
                          {t('settingsModal.restorePoints.restore', 'Restore')}
                        </button>
                      </li>
                    ))}
                  </ul>
                ))}
              </div>
            </div>

            {/* Danger Zone */}
            <div className="space-y-4 bg-slate-900/70 p-4 rounded-lg border border-red-700/50 shadow-inner">
              <h3 className="text-lg font-semibold text-red-300">
                {t('settingsModal.dangerZoneTitle', 'Danger Zone')}
              </h3>

              {authMode === 'cloud' ? (
                <>
                  {/* Re-sync from Cloud */}
                  <div className="space-y-2">
                    <h4 className="text-md font-semibold text-amber-300">
                      {t('settingsModal.resyncTitle', 'Re-sync from Cloud')}
                    </h4>
                    <p className="text-sm text-amber-200">
                      {t('settingsModal.resyncDescription',
                        'Clear local data and re-download from cloud. Your cloud backup will be restored.')}
                    </p>
                    <label htmlFor="resync-confirm" className={labelStyle}>
                      {t('settingsModal.confirmResyncLabel', 'Type RESYNC to confirm')}
                    </label>
                    <input
                      id="resync-confirm"
                      type="text"
                      value={resyncConfirm}
                      onChange={(e) => setResyncConfirm(e.target.value)}
                      className={inputStyle}
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (resyncConfirm.trim() === 'RESYNC') {
                          logger.log('[SettingsModal] Re-sync from Cloud clicked');
                          onResyncFromCloud?.();
                          setResyncConfirm('');
                        }
                      }}
                      className="w-full py-2 px-4 rounded-md text-sm font-medium bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      disabled={resyncConfirm.trim() !== 'RESYNC'}
                    >
                      {t('settingsModal.resyncButton', 'Re-sync from Cloud')}
                    </button>
                  </div>

                  {/* Delete All Data (Factory Reset) */}
                  <div className="space-y-2 mt-4 pt-4 border-t border-red-700/30">
                    <h4 className="text-md font-semibold text-red-300">
                      {t('settingsModal.factoryResetTitle', 'Delete All Data')}
                    </h4>
                    <p className="text-sm text-red-200">
                      {t('settingsModal.factoryResetDescription',
                        'Permanently delete ALL data - both local and cloud. This cannot be undone.')}
                    </p>
                    <label htmlFor="factory-reset-confirm" className={labelStyle}>
                      {t('settingsModal.confirmFactoryResetLabel', 'Type FACTORY RESET to confirm')}
                    </label>
                    <input
                      id="factory-reset-confirm"
                      type="text"
                      value={factoryResetConfirm}
                      onChange={(e) => setFactoryResetConfirm(e.target.value)}
                      className={inputStyle}
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (factoryResetConfirm.trim() === 'FACTORY RESET') {
                          logger.log('[SettingsModal] Factory Reset clicked');
                          onFactoryReset?.();
                          setFactoryResetConfirm('');
                        }
                      }}
                      className={dangerButtonStyle}
                      disabled={factoryResetConfirm.trim() !== 'FACTORY RESET'}
                    >
                      {t('settingsModal.factoryResetButton', 'Delete All Data')}
                    </button>
                  </div>

                  {/* Delete Account */}
                  <div className="mt-4 pt-4 border-t border-red-700/30">
                    <h4 className="text-md font-semibold text-red-300 mb-2">
                      {t('settingsModal.deleteAccountTitle', 'Delete Account')}
                    </h4>
                    <p className="text-sm text-red-200 mb-3">
                      {t(
                        'settingsModal.deleteAccountDescription',
                        'Permanently delete your account and all of its data — both in the cloud and on this device. This action cannot be undone. You will need to create a new account to use cloud features again.'
                      )}
                    </p>
                    {/* Keep-data affordance: let users who only want out of cloud export first */}
                    <div className="mb-3 p-2 rounded-md bg-slate-800/60 border border-slate-700">
                      <p className="text-sm text-slate-300 mb-2">
                        {t(
                          'settingsModal.deleteAccountKeepDataHint',
                          'Want to keep your data? Export a backup first — you can restore it on another device or after creating a new account.'
                        )}
                      </p>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onCreateBackup();
                        }}
                        className={secondaryButtonStyle}
                        disabled={isDeletingAccount}
                      >
                        {t('settingsModal.deleteAccountExportButton', 'Export backup first')}
                      </button>
                    </div>
                    <label htmlFor="delete-account-confirm" className={labelStyle}>
                      {t('settingsModal.confirmDeleteLabel', 'Type DELETE to confirm')}
                    </label>
                    <input
                      id="delete-account-confirm"
                      type="text"
                      value={deleteAccountConfirm}
                      onChange={(e) => setDeleteAccountConfirm(e.target.value)}
                      className={inputStyle}
                      disabled={isDeletingAccount}
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDeleteAccount();
                      }}
                      className={dangerButtonStyle}
                      disabled={deleteAccountConfirm.trim() !== 'DELETE' || isDeletingAccount}
                    >
                      {isDeletingAccount
                        ? t('settingsModal.deletingAccount', 'Deleting...')
                        : t('settingsModal.deleteAccountButton', 'Delete Account')}
                    </button>
                  </div>
                </>
              ) : (
                /* Local mode: Delete All Data */
                <div className="space-y-2">
                  <p className="text-sm text-red-200">
                    {t(
                      'settingsModal.deleteAllDataDescription',
                      'Permanently delete all games, players, teams and settings from this device. This action cannot be undone.'
                    )}
                  </p>
                  <label htmlFor="hard-reset-confirm" className={labelStyle}>
                    {t('settingsModal.confirmResetLabel', 'Type RESET to confirm')}
                  </label>
                  <input
                    id="hard-reset-confirm"
                    type="text"
                    value={resetConfirm}
                    onChange={(e) => setResetConfirm(e.target.value)}
                    className={inputStyle}
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (resetConfirm.trim() === 'RESET') {
                        logger.debug('[SettingsModal] Calling onHardResetApp');
                        onHardResetApp();
                        setResetConfirm('');
                      }
                    }}
                    className={dangerButtonStyle}
                    disabled={resetConfirm.trim() !== 'RESET'}
                  >
                    {t('settingsModal.deleteAllDataButton', 'Delete All Data')}
                  </button>
                </div>
              )}
            </div>

            {/* GDPR Data Rights footnote */}
            <p className="text-sm text-slate-400 px-1">
              {t('settingsModal.gdpr.footnote', 'Under GDPR, you can export your data using Backup or Download above, delete it using Danger Zone, or correct any data directly in the app.')}
            </p>
            </>
            )}

            {/* About Tab */}
            {activeTab === 'about' && (
            <div className="space-y-4 bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner">
              <h3 className="text-lg font-semibold text-slate-200">
                {t('settingsModal.aboutTitle', 'About')}
              </h3>

              <div className="space-y-2">
                {/* Version */}
                <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-md">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-200">
                      {t('settingsModal.appVersion', 'App Version')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-300">{packageJson.version}</span>
                    {process.env.NEXT_PUBLIC_GIT_BRANCH && process.env.NEXT_PUBLIC_GIT_BRANCH !== 'master' && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        {t('settingsModal.previewBadge', 'Preview')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Storage Usage */}
                <div className="p-3 bg-slate-800/50 rounded-md space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-200">
                      {t('settingsModal.storageUsageLabel', 'Storage Usage')}
                    </p>
                    <p className="text-sm text-slate-400">
                      {storageEstimate
                        ? t('settingsModal.storageUsageDetails', {
                            used: formatBytes(storageEstimate.usage),
                            quota: formatBytes(storageEstimate.quota),
                          })
                        : t('settingsModal.storageUsageUnavailable', 'Storage usage information unavailable.')}
                    </p>
                  </div>
                  {storageEstimate && (
                    <div className="w-full bg-slate-700 rounded-md h-2 overflow-hidden">
                      <div
                        className="bg-indigo-500 h-2"
                        style={{ width: `${Math.min(100, (storageEstimate.usage / storageEstimate.quota) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* Check for Updates */}
                <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-md">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-200">
                      {t('settingsModal.checkForUpdates', 'Check for Updates')}
                    </p>
                    <p className="text-sm text-slate-400">
                      {t('settingsModal.checkForUpdatesDesc', 'Check if a new version is available.')}
                    </p>
                  </div>
                  <button
                    onClick={handleCheckForUpdates}
                    disabled={checkingForUpdates}
                    className="px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded text-sm font-medium transition-colors"
                  >
                    {checkingForUpdates ? (
                      <HiOutlineArrowPath className="h-5 w-5 animate-spin" />
                    ) : (
                      <HiOutlineArrowPath className="h-5 w-5" />
                    )}
                  </button>
                </div>

              </div>

              {/* Send Feedback */}
              <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-md">
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-200">
                    {t('settingsModal.sendFeedback', 'Send Feedback')}
                  </p>
                  <p className="text-sm text-slate-400">
                    {t('settingsModal.sendFeedbackDesc', 'Share feedback, questions, or ideas.')}
                  </p>
                  <p className="text-sm text-slate-400 mt-1">
                    {t('settingsModal.sendFeedbackPrivacy', 'No game, roster, or player data is attached automatically.')}
                  </p>
                </div>
                <a
                  href={feedbackHref}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-sm font-medium transition-colors flex items-center gap-1.5"
                >
                  ✉ {t('settingsModal.emailButton', 'Email')}
                </a>
              </div>

              {/* Copy App Info */}
              <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-md">
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-200">
                    {t('settingsModal.copyAppInfo', 'Copy app info')}
                  </p>
                  <p className="text-sm text-slate-400">
                    {t('settingsModal.copyAppInfoDesc', 'Copy version and device details you can paste into feedback.')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCopyAppInfo}
                  className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white rounded text-sm font-medium transition-colors flex items-center gap-1.5"
                >
                  <HiOutlineClipboardDocument className="h-5 w-5" />
                  {t('settingsModal.copyAppInfoButton', 'Copy')}
                </button>
              </div>

              {/* Legal Links */}
              <div className="pt-2 border-t border-white/10">
                <div className="flex gap-4 text-sm">
                  <a
                    href="/privacy-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-400 hover:text-indigo-300 underline"
                  >
                    {t('settingsModal.privacyPolicy', 'Privacy Policy')}
                  </a>
                  <a
                    href="/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-400 hover:text-indigo-300 underline"
                  >
                    {t('settingsModal.termsOfService', 'Terms of Service')}
                  </a>
                </div>
              </div>
            </div>
            )}
          </div>
        </div>
      </div>

      {/* Restore Confirmation Modal */}
      <ConfirmationModal
        isOpen={showRestoreConfirm}
        title={t('fullBackup.confirmRestoreTitle', 'Restore from Backup?')}
        message={t('fullBackup.confirmRestore', 'Restore from backup? This will replace all data.')}
        warningMessage={t('fullBackup.confirmRestoreWarning', 'This action cannot be undone. Make sure you have a current backup before proceeding.')}
        onConfirm={handleRestoreConfirmed}
        onCancel={() => {
          setShowRestoreConfirm(false);
          setPendingRestoreContent(null);
        }}
        confirmLabel={t('common.restore', 'Restore')}
        cancelLabel={t('common.cancel', 'Cancel')}
        variant="danger"
        isConfirming={isRestoring}
      />

      {/* Backup Restore Results Modal */}
      <BackupRestoreResultsModal
        isOpen={showRestoreResults}
        onClose={handleRestoreResultsClose}
        result={backupRestoreResult}
      />

      {/* Restoring Loading Overlay */}
      {isRestoring && (
        <div className={`${MODAL_BACKDROP_BLOCKING} ${Z_LAYER.modalNested}`}>
          <div className="bg-slate-800 rounded-xl p-6 max-w-sm mx-4 shadow-xl border border-slate-700 text-center">
            <div
              className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500 mx-auto mb-4"
              role="status"
              aria-label={t('settingsModal.restoring', 'Restoring backup...')}
            />
            <h3 className="text-lg font-semibold text-slate-100 mb-2">
              {t('settingsModal.restoringTitle', 'Restoring Backup')}
            </h3>
            <p className="text-slate-300 text-sm">
              {t('settingsModal.restoringDescription', 'Please wait while your data is being restored. This may take a moment.')}
            </p>
          </div>
        </div>
      )}

      {transitionMessage && <TransitionOverlay message={transitionMessage} />}
    </div>
  );
};

export default SettingsModal;
