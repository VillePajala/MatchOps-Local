'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { clubSeasonEndFromStart } from '@/utils/clubSeason';
import VenueInput from '@/components/VenueInput';
import type { AppSettings } from '@/types/settings';
import { DEFAULT_ARRIVAL_BUFFER_MINUTES } from '@/utils/travelPlan';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/contexts/ToastProvider';
import { useTranslation } from 'react-i18next';
import { translateAuthError } from '@/utils/authHelpers';
import { formatBytes } from '@/utils/bytes';
import { APP_VERSION } from '@/config/constants';
import { HiOutlineDocumentArrowDown, HiOutlineDocumentArrowUp, HiOutlineArrowPath, HiOutlineCloudArrowDown, HiOutlineClipboardDocument, HiOutlineShare, HiOutlineEnvelope } from 'react-icons/hi2';
import { importFullBackup, prewarmBackup, downloadFullBackup } from '@/utils/fullBackup';
import type { SnapshotMeta } from '@/utils/backupSnapshots';
import ConfirmationModal from './ConfirmationModal';
import BackupRestoreResultsModal, { type BackupRestoreResult } from './BackupRestoreResultsModal';
// backendConfig import removed — migration flag is now handled entirely by importFullBackup
import { useAuth } from '@/contexts/AuthProvider';
import {
  CollapsibleModalHeader,
  useCollapsingHeader,
  modalContainerStyle,
  secondaryButtonStyle,
  dangerButtonStyle,
  groupedListStyle,
  listRowStyle,
  sectionLabelStyle,
  inputBaseStyle,
  labelStyle,
  subtextStyle,
  inlineSelectStyle,
  switchInputStyle,
  segmentTrackStyle,
  segmentStyle,
  segmentSelectedStyle,
  linkStyle,
  neutralBadgeStyle,
} from '@/styles/modalStyles';
import logger from '@/utils/logger';
import { getAppSettings, updateAppSettings, DEFAULT_CLUB_SEASON_START_DATE } from '@/utils/appSettings';
import { queryKeys } from '@/config/queryKeys';
import { useDataStore } from '@/hooks/useDataStore';
import { useAppLayout, useSetAppLayout } from '@/hooks/useAppLayout';
import type { AppLayout } from '@/types/settings';
import AiSettingsCard from '@/components/AiSettingsCard';
import { LABS_TAP_COUNT, isLabsEnabled, setLabsEnabled, useLabsEnabled } from '@/utils/labs';
import PrivacySettingsSection from '@/components/PrivacySettingsSection';
import CloudSyncSection from './CloudSyncSection';
import TransitionOverlay from './TransitionOverlay';
import { MODAL_BACKDROP, MODAL_BACKDROP_BLOCKING, Z_LAYER } from '@/styles/modalStyles';
import { formatAppDateTime } from '@/utils/localeFormat';

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
    <section className="space-y-2">
      <h3 className={`${sectionLabelStyle} px-1`}>
        {t('marketingConsent.settingsTitle', 'Email Preferences')}
      </h3>
      <div className={groupedListStyle}>
        <div className={`${listRowStyle} py-3 pr-4`}>
          <div className="flex-1 min-w-0">
            <label htmlFor="marketing-consent-toggle" className="block font-ui text-base font-medium text-ink cursor-pointer">
              {t('marketingConsent.settingsLabel', 'Product updates & tips')}
            </label>
            <p className={`${subtextStyle} mt-1`}>
              {t('marketingConsent.settingsDescription', 'Receive occasional emails about new features, tips, and announcements.')}
            </p>
          </div>
          <input
            type="checkbox"
            role="switch"
            id="marketing-consent-toggle"
            checked={isGranted}
            onChange={handleToggle}
            disabled={isUpdating}
            className={switchInputStyle}
          />
        </div>
      </div>
    </section>
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
  // Perusnäkymä / Koko näkymä (Onboarding v3): the one layout control.
  const appLayout = useAppLayout();
  const setAppLayout = useSetAppLayout();
  const handleAppLayoutChange = async (layout: AppLayout) => {
    if (layout === appLayout) return;
    if (!(await setAppLayout(layout))) {
      showToast(t('settingsModal.saveSettingError', 'Failed to save setting. Please try again.'), 'error');
    }
  };
  const [teamName, setTeamName] = useState(defaultTeamName);
  // Committed on blur - and when the modal closes (review 4.17): back with the
  // cursor still in the field closed it without a blur and the name was lost.
  const pendingTeamNameRef = useRef({ teamName, defaultTeamName, onDefaultTeamNameChange });
  useEffect(() => {
    pendingTeamNameRef.current = { teamName, defaultTeamName, onDefaultTeamNameChange };
  });
  useEffect(() => {
    if (!isOpen) return;
    return () => {
      const pending = pendingTeamNameRef.current;
      if (pending.teamName !== pending.defaultTeamName) pending.onDefaultTeamNameChange(pending.teamName);
    };
  }, [isOpen]);
  const [resetConfirm, setResetConfirm] = useState('');
  // Labs switch (privacy 2026-11): tapping the version line LABS_TAP_COUNT
  // times in a row toggles the device's experimental features (the AI).
  const labsEnabled = useLabsEnabled();
  const versionTapsRef = useRef<{ count: number; last: number }>({ count: 0, last: 0 });
  const handleVersionTap = useCallback(() => {
    const now = Date.now();
    const taps = versionTapsRef.current;
    taps.count = now - taps.last > 2000 ? 1 : taps.count + 1;
    taps.last = now;
    if (taps.count < LABS_TAP_COUNT) return;
    taps.count = 0;
    const next = !isLabsEnabled();
    setLabsEnabled(next);
    showToast(
      next
        ? t('settingsModal.labsOn', 'Experimental features on')
        : t('settingsModal.labsOff', 'Experimental features off'),
      'info',
    );
  }, [showToast, t]);
  const [storageEstimate, setStorageEstimate] = useState<{ usage: number; quota: number } | null>(null);
  const restoreFileInputRef = useRef<HTMLInputElement>(null);
  const [clubSeasonStartDate, setClubSeasonStartDate] = useState<string>(DEFAULT_CLUB_SEASON_START_DATE);
  const [startingPoint, setStartingPoint] = useState<AppSettings['startingPoint']>(undefined);
  const [arrivalBuffer, setArrivalBuffer] = useState<number>(DEFAULT_ARRIVAL_BUFFER_MINUTES);
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
          // importFullBackup already showed the precise reason through showToast (it
          // reports every failure itself). A second, generic "file may be corrupted"
          // toast here contradicted it - e.g. "could not reach the cloud, nothing was
          // changed" (review 3.16).
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
        // The provider's message, translated (review 8.3) - it was appended in English.
        showToast(translateAuthError(result.error, t), 'error');
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

  const inputStyle = inputBaseStyle;
  const rowIconButton = 'inline-flex items-center justify-center min-h-11 min-w-11 rounded-full s1-ghost text-ink transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-action';
  const feedbackSubject = t('settingsModal.feedbackEmailSubject', 'MatchOps feedback');
  const feedbackBody = t(
    'settingsModal.feedbackEmailBody',
    'Hi, I wanted to share feedback about MatchOps:\n\n\n\nApp version: {{version}}',
    { version: APP_VERSION },
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
    t('settingsModal.appInfoTitle', 'PePo Ops app info'),
    `${t('settingsModal.appInfoVersion', 'Version')}: ${APP_VERSION}`,
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
      <div className={`${modalContainerStyle} relative overflow-hidden h-full w-full`}>

        <div className="relative z-10 flex flex-col h-full">
          {/* Chrome slimming: X-header + collapsing tab strip; close-only
              footer removed. */}
          <CollapsibleModalHeader
            title={t('settingsModal.title', 'Settings')}
            onClose={onClose}
            closeLabel={t('settingsModal.doneButton', 'Done')}
            collapse={headerCollapse}
          >
          {/* Tab Navigation: one segmented control */}
          <div className="px-4 pt-1 pb-3">
            <div className={segmentTrackStyle}>
              {([
                ['general', t('settingsModal.tabs.general', 'General')],
                ['data', t('settingsModal.tabs.data', 'Data')],
                ['account', t('settingsModal.tabs.account', 'Account')],
                ['about', t('settingsModal.tabs.about', 'About')],
              ] as [SettingsTab, string][]).map(([tab, label]) => (
                <button key={tab} onClick={() => setActiveTab(tab)} className={activeTab === tab ? segmentSelectedStyle : segmentStyle} aria-pressed={activeTab === tab}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          </CollapsibleModalHeader>

          <div className="flex-1 overflow-y-auto min-h-0 px-4 pt-2 pb-6 space-y-5" onScroll={headerCollapse.onScroll}>
            {/* General Tab - App preferences and season settings */}
            {activeTab === 'general' && (
            <>
            <section className="space-y-2">
              <h3 className={`${sectionLabelStyle} px-1`}>
                {t('settingsModal.preferencesTitle', 'Preferences')}
              </h3>
              <div className={groupedListStyle}>
              {/* Language */}
              <div className={`${listRowStyle} py-3 pr-4`}>
                <div className="flex-1 min-w-0">
                  <p className="font-ui text-base font-medium text-ink">
                    {t('settingsModal.languageLabel', 'Language')}
                  </p>
                </div>
                <select
                  id="language-select"
                  value={language}
                  onChange={(e) => onLanguageChange(e.target.value)}
                  className={inlineSelectStyle}
                >
                  <option value="en">English</option>
                  <option value="fi">Suomi</option>
                </select>
              </div>
              {/* Layout: basic or full - the only switch (no module switches, D21). */}
              <div className={`${listRowStyle} py-3 pr-4 flex-col items-stretch gap-2`}>
                <p className="font-ui text-base font-medium text-ink">
                  {t('settingsModal.layoutLabel', 'Layout')}
                </p>
                <div className={segmentTrackStyle} role="group" aria-label={t('settingsModal.layoutLabel', 'Layout')}>
                  {([
                    ['basic', t('settingsModal.layoutBasic', 'Basic')],
                    ['full', t('settingsModal.layoutFull', 'Full')],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      data-testid={`layout-${value}`}
                      onClick={() => void handleAppLayoutChange(value)}
                      aria-pressed={appLayout === value}
                      disabled={!appLayout}
                      className={appLayout === value ? segmentSelectedStyle : segmentStyle}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className={subtextStyle}>
                  {t('settingsModal.layoutHint', 'The full layout shows every feature. Nothing is removed.')}
                </p>
              </div>
              {/* Player assessments were removed from Settings for now (owner
                  decision 2026-11): useAssessmentsEnabled() is false for
                  everyone. Ratings already recorded stay in the data and in
                  exports. */}
              {/* Default Team Name: a text input takes the label above and
                  the full width - label-beside is only for switches and
                  short selects. */}
              <div className={`${listRowStyle} flex-col items-stretch gap-2 py-3 pr-4`}>
                <label htmlFor="team-name-input" className="block font-ui text-base font-medium text-ink">
                  {t('settingsModal.defaultTeamNameLabel', 'Default Team Name')}
                </label>
                <input
                  id="team-name-input"
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  onBlur={() => onDefaultTeamNameChange(teamName)}
                  className={inputStyle}
                />
              </div>
            </div>
            </section>

            {/* Kirjuri (PR 4): own AI provider behind the consent gate. Hidden
                unless the device's labs switch is on (privacy 2026-11). */}
            {labsEnabled && <AiSettingsCard userId={userId} />}

            {/* THE JOURNEY. Both numbers behind the next-match card's departure
                time live here, because both are club facts rather than
                per-match ones - and because a derived starting point was
                invisible and uncorrectable, which is why it is asked for. */}
            <section className="space-y-2">
              <h3 className={`${sectionLabelStyle} px-1`}>
                {t('settingsModal.travelTitle', 'Getting to matches')}
              </h3>
              <div className={`${groupedListStyle} p-4 space-y-3`}>
              {/* Help text sits below the field it explains. */}
              <div>
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
                <p className={`${subtextStyle} mt-1.5`}>
                  {t('settingsModal.travelDescription', 'Used to work out when to leave for your next match. Without a starting point no departure time is shown.')}
                </p>
              </div>

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
                <p className={`${subtextStyle} mt-1.5`}>
                  {t('settingsModal.arrivalBufferHint', 'Warm-up, lineup and changing. A single match can be given its own figure.')}
                </p>
              </div>
            </div>
            </section>

            {/* Season Settings - merged from Season tab */}
            <section className="space-y-2">
              <h3 className={`${sectionLabelStyle} px-1`}>
                {t('settingsModal.seasonStartTitle', 'Season Start Date')}
              </h3>
              <div className={`${groupedListStyle} p-4 space-y-3`}>
              <p id="club-season-description" className="font-ui text-sm leading-snug text-ink-2">
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
                <div className="rounded-2xl bg-white/[0.04] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)] px-4 py-3 font-ui text-sm text-ink-2">
                  <div>
                    {t('settingsModal.seasonThis', 'This season')}:{' '}
                    <span className="font-semibold text-ink">{clubSeasonPreview.current}</span>
                  </div>
                  <div className="mt-0.5">
                    {t('settingsModal.seasonNext', 'Next season')}:{' '}
                    <span className="font-semibold text-ink">{clubSeasonPreview.next}</span>
                  </div>
                </div>
              </div>
            </div>
            </section>
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
            <section className="space-y-2">
              <h3 className={`${sectionLabelStyle} px-1`}>
                {t('settingsModal.backupExportTitle', 'Backup & Export')}
              </h3>
              <div className={`${groupedListStyle}`}>
              <input
                type="file"
                ref={restoreFileInputRef}
                onChange={handleRestoreFileSelected}
                accept=".json,.txt,application/json,text/plain"
                style={{ display: "none" }}
                data-testid="restore-backup-input"
              />
              <>
                <div className={`${listRowStyle} flex-col items-stretch gap-3 py-3 pr-4`}>
                  <div className="min-w-0">
                    <p className="font-ui text-base font-medium text-ink">
                      {t('settingsModal.backupButton', 'Backup All Data')}
                    </p>
                    <p className={`${subtextStyle} mt-1`}>
                      {t('settingsModal.backupCardDesc', 'Export all your data to a backup file you can keep.')}
                    </p>
                  </div>
                  {/* Two related actions: an equal two-column grid. Short labels
                      (the row title says what is shared or saved; the aria
                      labels say it in full) so each fits one line on a phone. */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={onCreateBackup}
                      aria-label={t('settingsModal.backupShareAria', 'Share backup')}
                      className={`${secondaryButtonStyle} min-w-0 px-3! text-sm!`}
                    >
                      <HiOutlineShare className="h-5 w-5 shrink-0" />
                      {t('settingsModal.backupShareLabel', 'Share')}
                    </button>
                    <button
                      onClick={() => downloadFullBackup(showToast, userId)}
                      aria-label={t('settingsModal.backupDownloadAria', 'Download backup to device')}
                      className={`${secondaryButtonStyle} min-w-0 px-3! text-sm!`}
                    >
                      <HiOutlineDocumentArrowDown className="h-5 w-5 shrink-0" />
                      {t('settingsModal.backupSaveLabel', 'Save')}
                    </button>
                  </div>
                </div>
                {/* Download Cloud Data - cloud mode only */}
                <div className={`${listRowStyle} items-start py-3 pr-4${authMode !== 'cloud' ? ' opacity-50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className="font-ui text-base font-medium text-ink">
                      {t('settingsModal.gdpr.downloadTitle', 'Download Your Data')}
                    </p>
                    <p className={`${subtextStyle} mt-1`}>
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
                    className={rowIconButton}
                    aria-label={t('settingsModal.gdpr.downloadButton', 'Download')}
                  >
                    {isDownloadingCloudData
                      ? <div className="h-5 w-5 animate-spin rounded-full border-2 border-ink-3 border-t-white" />
                      : <HiOutlineCloudArrowDown className="h-5 w-5" />}
                  </button>
                </div>
                <div className={`${listRowStyle} flex-col items-stretch gap-3 py-3 pr-4 mt-3 border-t border-hairline`}>
                  <div className="min-w-0">
                    <p className="font-ui text-base font-medium text-ink">
                      {t('settingsModal.restoreButton', 'Restore from Backup')}
                    </p>
                    <p className={`${subtextStyle} mt-1`}>
                      {t('settingsModal.restoreCardDesc', 'Replace current data with a backup file.')}
                    </p>
                  </div>
                  <div>
                    {/* A single action in a card: full width. */}
                    <button
                      onClick={handleRestore}
                      aria-label={t('settingsModal.restoreButton', 'Restore from Backup')}
                      className={`${secondaryButtonStyle} w-full px-4! text-sm!`}
                    >
                      <HiOutlineDocumentArrowUp className="h-5 w-5 shrink-0" />
                      {t('settingsModal.restoreButton', 'Restore from Backup')}
                    </button>
                  </div>
                </div>
              </>

              {/* Automatic Restore Points (Data Safety - Layer 1) */}
              <div className={`${listRowStyle} flex-col items-stretch gap-2 py-3 pr-4`}>
                <div>
                  <p className="font-ui text-base font-medium text-ink">
                    {t('settingsModal.restorePoints.title', 'Automatic Restore Points')}
                  </p>
                  <p className={`${subtextStyle} mt-1`}>
                    {t('settingsModal.restorePoints.description', 'The app automatically keeps recent on-device backups. Restore one if something goes wrong.')}
                  </p>
                  <p className={`${subtextStyle} mt-1`}>
                    {restorePoints === null
                      ? t('settingsModal.restorePoints.loading', 'Loading restore points...')
                      : restorePoints.length > 0
                        ? t('settingsModal.restorePoints.lastBackup', 'Last automatic backup: {{when}}', { when: formatAppDateTime(restorePoints[0].createdAt) })
                        : t('settingsModal.restorePoints.empty', 'No restore points yet - one is created automatically.')}
                  </p>
                </div>
                {restorePoints !== null && restorePoints.length > 0 && (
                  <ul className="divide-y divide-hairline">
                    {restorePoints.map((snap) => (
                      <li key={snap.id} className="flex items-center gap-3 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-ui text-base text-ink">
                            {formatAppDateTime(snap.createdAt)}
                            <span className="ml-2 text-xs text-ink-3">({restorePointReasonLabel(snap.reason)})</span>
                          </p>
                          <p className={`${subtextStyle} mt-1`}>
                            {t('settingsModal.restorePoints.summary', '{{games}} games, {{players}} players', { games: snap.summary.games, players: snap.summary.players })}
                          </p>
                        </div>
                        <button
                          onClick={() => handleRestoreSnapshot(snap.id)}
                          aria-label={t('settingsModal.restorePoints.restoreAriaLabel', 'Restore backup from {{when}}', { when: formatAppDateTime(snap.createdAt) })}
                          className={`${secondaryButtonStyle} shrink-0 min-h-10! px-4! text-sm!`}
                        >
                          {t('settingsModal.restorePoints.restore', 'Restore')}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            </section>

            {/* Privacy: error-reporting switch + notice to families */}
            <PrivacySettingsSection />

            {/* Danger Zone */}
            <section className="space-y-2">
              <h3 className={`${sectionLabelStyle} px-1 text-red-400!`}>
                {t('settingsModal.dangerZoneTitle', 'Danger Zone')}
              </h3>
              <div className={`${groupedListStyle} p-4 space-y-4`}>

              {authMode === 'cloud' ? (
                <>
                  {/* Re-sync from Cloud */}
                  <div className="space-y-2">
                    <h4 className="font-ui text-base font-semibold text-ink">
                      {t('settingsModal.resyncTitle', 'Re-sync from Cloud')}
                    </h4>
                    <p className={subtextStyle}>
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
                      className={`${secondaryButtonStyle} w-full`}
                      disabled={resyncConfirm.trim() !== 'RESYNC'}
                    >
                      {t('settingsModal.resyncButton', 'Re-sync from Cloud')}
                    </button>
                  </div>

                  {/* Delete All Data (Factory Reset) */}
                  <div className="space-y-2 pt-4 border-t border-hairline">
                    <h4 className="font-ui text-base font-semibold text-red-400">
                      {t('settingsModal.factoryResetTitle', 'Delete All Data')}
                    </h4>
                    <p className={subtextStyle}>
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
                      className={`${dangerButtonStyle} w-full`}
                      disabled={factoryResetConfirm.trim() !== 'FACTORY RESET'}
                    >
                      {t('settingsModal.factoryResetButton', 'Delete All Data')}
                    </button>
                  </div>

                  {/* Delete Account */}
                  <div className="pt-4 border-t border-hairline">
                    <h4 className="font-ui text-base font-semibold text-red-400 mb-2">
                      {t('settingsModal.deleteAccountTitle', 'Delete Account')}
                    </h4>
                    <p className={`${subtextStyle} mb-3`}>
                      {t(
                        'settingsModal.deleteAccountDescription',
                        'Permanently delete your account and all of its data — both in the cloud and on this device. This action cannot be undone. You will need to create a new account to use cloud features again.'
                      )}
                    </p>
                    {/* Keep-data affordance: let users who only want out of cloud export first */}
                    <div className="mb-3 p-3 rounded-2xl bg-white/[0.04] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]">
                      <p className="font-ui text-sm text-ink-2 mb-3">
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
                      className={`${dangerButtonStyle} w-full`}
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
                  <p className={subtextStyle}>
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
                    className={`${dangerButtonStyle} w-full`}
                    disabled={resetConfirm.trim() !== 'RESET'}
                  >
                    {t('settingsModal.deleteAllDataButton', 'Delete All Data')}
                  </button>
                </div>
              )}
              </div>
            </section>

            {/* GDPR Data Rights footnote */}
            <p className={`${subtextStyle} px-1`}>
              {t('settingsModal.gdpr.footnote', 'Under GDPR, you can export your data using Backup or Download above, delete it using Danger Zone, or correct any data directly in the app.')}
            </p>
            </>
            )}

            {/* About Tab */}
            {activeTab === 'about' && (
            <section className="space-y-2">
              <h3 className={`${sectionLabelStyle} px-1`}>
                {t('settingsModal.aboutTitle', 'About')}
              </h3>
              <div className={`${groupedListStyle}`}>

              <div className="space-y-2">
                {/* Version */}
                <div className={`${listRowStyle} py-3 pr-4`}>
                  <div className="flex-1 min-w-0">
                    <p className="font-ui text-base font-medium text-ink">
                      {t('settingsModal.appVersion', 'App Version')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Also the labs switch: tapped LABS_TAP_COUNT times in a row. */}
                    <button
                      type="button"
                      onClick={handleVersionTap}
                      data-testid="app-version"
                      className="font-ui text-base text-ink-2 bg-transparent border-0 p-0 cursor-default select-none"
                    >
                      {APP_VERSION}
                    </button>
                    {process.env.NEXT_PUBLIC_GIT_BRANCH && process.env.NEXT_PUBLIC_GIT_BRANCH !== 'master' && (
                      <span className={neutralBadgeStyle}>
                        {t('settingsModal.previewBadge', 'Preview')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Storage Usage */}
                <div className={`${listRowStyle} flex-col items-stretch gap-2 py-3 pr-4`}>
                  {/* Wraps the figure under the label when both do not fit (320px). */}
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <p className="font-ui text-base font-medium text-ink">
                      {t('settingsModal.storageUsageLabel', 'Storage Usage')}
                    </p>
                    <p className={subtextStyle}>
                      {storageEstimate
                        ? t('settingsModal.storageUsageDetails', {
                            used: formatBytes(storageEstimate.usage),
                            quota: formatBytes(storageEstimate.quota),
                          })
                        : t('settingsModal.storageUsageUnavailable', 'Storage usage information unavailable.')}
                    </p>
                  </div>
                  {storageEstimate && (
                    <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-action h-2 rounded-full"
                        style={{ width: `${Math.min(100, (storageEstimate.usage / storageEstimate.quota) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* Check for Updates */}
                <div className={`${listRowStyle} py-3 pr-4`}>
                  <div className="flex-1 min-w-0">
                    <p className="font-ui text-base font-medium text-ink">
                      {t('settingsModal.checkForUpdates', 'Check for Updates')}
                    </p>
                    <p className={`${subtextStyle} mt-1`}>
                      {t('settingsModal.checkForUpdatesDesc', 'Check if a new version is available.')}
                    </p>
                  </div>
                  <button
                    onClick={handleCheckForUpdates}
                    disabled={checkingForUpdates}
                    className={rowIconButton}
                    aria-label={t('settingsModal.checkForUpdates', 'Check for Updates')}
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
              <div className={`${listRowStyle} flex-col items-stretch gap-3 py-3 pr-4`}>
                <div className="min-w-0">
                  <p className="font-ui text-base font-medium text-ink">
                    {t('settingsModal.sendFeedback', 'Send Feedback')}
                  </p>
                  <p className={`${subtextStyle} mt-1`}>
                    {t('settingsModal.sendFeedbackDesc', 'Share feedback, questions, or ideas.')}
                  </p>
                  <p className={`${subtextStyle} mt-1`}>
                    {t('settingsModal.sendFeedbackPrivacy', 'No game, roster, or player data is attached automatically.')}
                  </p>
                </div>
                {/* A single action in a card: full width. */}
                <a
                  href={feedbackHref}
                  className={`${secondaryButtonStyle} w-full px-4! text-sm!`}
                >
                  <HiOutlineEnvelope className="h-5 w-5 shrink-0" aria-hidden="true" />
                  {t('settingsModal.emailButton', 'Email')}
                </a>
              </div>

              {/* Copy App Info */}
              <div className={`${listRowStyle} flex-wrap gap-y-2 py-3 pr-4`}>
                <div className="flex-1 min-w-[11rem]">
                  <p className="font-ui text-base font-medium text-ink">
                    {t('settingsModal.copyAppInfo', 'Copy app info')}
                  </p>
                  <p className={`${subtextStyle} mt-1`}>
                    {t('settingsModal.copyAppInfoDesc', 'Copy version and device details you can paste into feedback.')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCopyAppInfo}
                  className={`${secondaryButtonStyle} shrink-0 min-h-10! px-4! text-sm!`}
                >
                  <HiOutlineClipboardDocument className="h-5 w-5" />
                  {t('settingsModal.copyAppInfoButton', 'Copy')}
                </button>
              </div>

              {/* Legal Links */}
              <div className={`${listRowStyle} py-3`}>
                <div className="flex gap-5 font-ui text-sm">
                  <a
                    href="/privacy-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={linkStyle}
                  >
                    {t('settingsModal.privacyPolicy', 'Privacy Policy')}
                  </a>
                  <a
                    href="/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={linkStyle}
                  >
                    {t('settingsModal.termsOfService', 'Terms of Service')}
                  </a>
                </div>
              </div>
            </div>
            </section>
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
          <div className="s1-sheet rounded-3xl p-6 max-w-sm mx-4 text-center font-ui">
            <div
              className="animate-spin rounded-full h-10 w-10 border-b-2 border-action mx-auto mb-4"
              role="status"
              aria-label={t('settingsModal.restoring', 'Restoring backup...')}
            />
            <h3 className="font-display text-2xl font-bold text-ink mb-2">
              {t('settingsModal.restoringTitle', 'Restoring Backup')}
            </h3>
            <p className="text-ink-2 text-sm">
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
