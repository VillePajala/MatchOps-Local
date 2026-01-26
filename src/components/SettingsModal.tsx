'use client';

import React, { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/contexts/ToastProvider';
import { useTranslation } from 'react-i18next';
import { formatBytes } from '@/utils/bytes';
import packageJson from '../../package.json';
import { HiOutlineDocumentArrowDown, HiOutlineDocumentArrowUp, HiOutlineChartBar, HiOutlineArrowPath } from 'react-icons/hi2';
import { importFullBackup } from '@/utils/fullBackup';
import { useGameImport } from '@/hooks/useGameImport';
import ImportResultsModal from './ImportResultsModal';
import ConfirmationModal from './ConfirmationModal';
import BackupRestoreResultsModal, { type BackupRestoreResult } from './BackupRestoreResultsModal';
import CloudModeImportModal from './CloudModeImportModal';
import { getBackendMode, disableCloudMode, clearMigrationCompleted } from '@/config/backendConfig';
import { useAuth } from '@/contexts/AuthProvider';
import { ModalFooter, primaryButtonStyle, dangerButtonStyle } from '@/styles/modalStyles';
import logger from '@/utils/logger';
import { getAppSettings, updateAppSettings, DEFAULT_CLUB_SEASON_START_DATE, DEFAULT_CLUB_SEASON_END_DATE } from '@/utils/appSettings';
import { queryKeys } from '@/config/queryKeys';
import CloudSyncSection from './CloudSyncSection';

type SettingsTab = 'general' | 'season' | 'data' | 'premium' | 'about';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: string;
  onLanguageChange: (lang: string) => void;
  defaultTeamName: string;
  onDefaultTeamNameChange: (name: string) => void;
  onResetGuide: () => void;
  onHardResetApp: () => void;
  onCreateBackup: () => void;
  // onDataImportSuccess prop kept for interface compatibility but not used
  // Backup restore now uses full page reload instead of state refresh
  onDataImportSuccess?: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  language,
  onLanguageChange,
  defaultTeamName,
  onDefaultTeamNameChange,
  onResetGuide,
  onHardResetApp,
  onCreateBackup,
  // onDataImportSuccess not destructured - backup restore uses full page reload
}) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [teamName, setTeamName] = useState(defaultTeamName);
  const [resetConfirm, setResetConfirm] = useState('');
  const [storageEstimate, setStorageEstimate] = useState<{ usage: number; quota: number } | null>(null);
  const restoreFileInputRef = useRef<HTMLInputElement>(null);
  const gameImportFileInputRef = useRef<HTMLInputElement>(null);
  const [showImportResults, setShowImportResults] = useState(false);
  const { importFromFile, isImporting, lastResult } = useGameImport();
  const [clubSeasonStartDate, setClubSeasonStartDate] = useState<string>(DEFAULT_CLUB_SEASON_START_DATE);
  const [clubSeasonEndDate, setClubSeasonEndDate] = useState<string>(DEFAULT_CLUB_SEASON_END_DATE);
  const [backupRestoreResult, setBackupRestoreResult] = useState<BackupRestoreResult | null>(null);
  const [showRestoreResults, setShowRestoreResults] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [deleteAccountConfirm, setDeleteAccountConfirm] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const { deleteAccount, mode: authMode } = useAuth();

  // Helper to get maximum day for a given month
  const getMaxDayForMonth = (month: number): number => {
    // February has 29 days (use 29 to allow leap year dates)
    if (month === 2) return 29;
    // April, June, September, November have 30 days
    if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
    // All other months have 31 days
    return 31;
  };

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
  const constructDateString = (month: number, day: number): string => {
    const monthStr = month.toString().padStart(2, '0');
    const dayStr = day.toString().padStart(2, '0');
    return `2000-${monthStr}-${dayStr}`;
  };

  // Helper to calculate end date (day before start date)
  // E.g., if season starts Aug 1, it ends Jul 31
  const calculateEndDate = (startDateStr: string): string => {
    const { month, day } = parseMonthDay(startDateStr);

    // Subtract one day
    if (day > 1) {
      // Simple case: just go back one day in same month
      return constructDateString(month, day - 1);
    }

    // Day is 1, need to go to previous month's last day
    const prevMonth = month === 1 ? 12 : month - 1;
    const lastDayOfPrevMonth = getMaxDayForMonth(prevMonth);
    // For February, use 28 as default (29 would be for leap years but we're using template year 2000)
    const actualLastDay = prevMonth === 2 ? 28 : lastDayOfPrevMonth;
    return constructDateString(prevMonth, actualLastDay);
  };

  // Helper to format date for display (e.g., "July 31")
  const formatDateForDisplay = (dateStr: string): string => {
    const { month, day } = parseMonthDay(dateStr);
    const monthNames = [
      t('months.january', 'January'),
      t('months.february', 'February'),
      t('months.march', 'March'),
      t('months.april', 'April'),
      t('months.may', 'May'),
      t('months.june', 'June'),
      t('months.july', 'July'),
      t('months.august', 'August'),
      t('months.september', 'September'),
      t('months.october', 'October'),
      t('months.november', 'November'),
      t('months.december', 'December'),
    ];
    return `${monthNames[month - 1]} ${day}`;
  };
  const [checkingForUpdates, setCheckingForUpdates] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [pendingRestoreContent, setPendingRestoreContent] = useState<string | null>(null);
  const [showCloudModeImportModal, setShowCloudModeImportModal] = useState(false);
  const { user } = useAuth();

  React.useLayoutEffect(() => {
    setTeamName(defaultTeamName);
  }, [defaultTeamName]);

  React.useLayoutEffect(() => {
    if (isOpen) {
      // Load club season settings
      getAppSettings().then(settings => {
        setClubSeasonStartDate(settings.clubSeasonStartDate ?? DEFAULT_CLUB_SEASON_START_DATE);
        setClubSeasonEndDate(settings.clubSeasonEndDate ?? DEFAULT_CLUB_SEASON_END_DATE);
      }).catch((error) => {
        // Use defaults if loading fails
        logger.error('Failed to load club season settings:', error);
        setClubSeasonStartDate(DEFAULT_CLUB_SEASON_START_DATE);
        setClubSeasonEndDate(DEFAULT_CLUB_SEASON_END_DATE);
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
      // Clear reset confirmation when modal closes
      setResetConfirm('');
    }
  }, [isOpen]);

  const handleRestore = () => {
    restoreFileInputRef.current?.click();
  };
  
  const handleRestoreFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const jsonContent = e.target?.result as string;
      if (jsonContent) {
        setPendingRestoreContent(jsonContent);
        // Check if in cloud mode - if so, show the cloud mode import modal
        const mode = getBackendMode();
        if (mode === 'cloud') {
          setShowCloudModeImportModal(true);
        } else {
          setShowRestoreConfirm(true);
        }
      } else {
        showToast(t('settingsModal.importReadError', 'Error reading file content.'), 'error');
      }
    };
    reader.onerror = () => showToast(t('settingsModal.importReadError', 'Error reading file content.'), 'error');
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleRestoreConfirmed = async () => {
    if (pendingRestoreContent) {
      // Pass delayReload=true to prevent automatic reload - we'll reload after showing results modal
      const result = await importFullBackup(pendingRestoreContent, undefined, showToast, true, true);
      if (result) {
        // Show results modal
        setBackupRestoreResult(result);
        setShowRestoreResults(true);
      }
    }
    setShowRestoreConfirm(false);
    setPendingRestoreContent(null);
  };

  const handleRestoreResultsClose = () => {
    setShowRestoreResults(false);
    setBackupRestoreResult(null);
    // Trigger full page reload after user has seen the results
    // This ensures all state (React Query caches, component state, etc.) is fresh
    setTimeout(() => {
      window.location.reload();
    }, 100);
  };

  // Cloud mode import modal handlers
  const handleCloudModeImportCancel = () => {
    setShowCloudModeImportModal(false);
    setPendingRestoreContent(null);
  };

  const handleCloudModeImportAndMigrate = async () => {
    setShowCloudModeImportModal(false);
    if (!pendingRestoreContent) return;

    // Clear migration completed flag so migration wizard will show after import
    // This ensures the imported local data gets uploaded to cloud
    if (user?.id) {
      clearMigrationCompleted(user.id);
      logger.info('[SettingsModal] Cleared migration flag for import & migrate flow');
    }

    // Proceed with normal import flow
    const result = await importFullBackup(pendingRestoreContent, undefined, showToast, true, true);
    if (result) {
      setBackupRestoreResult(result);
      setShowRestoreResults(true);
    }
    setPendingRestoreContent(null);
  };

  const handleCloudModeSwitchToLocal = async () => {
    setShowCloudModeImportModal(false);
    if (!pendingRestoreContent) return;

    // Switch to local mode first
    const switchResult = disableCloudMode();
    if (!switchResult.success) {
      showToast(t('cloudModeImport.switchFailed', 'Failed to switch to local mode. Please try again.'), 'error');
      logger.error('[SettingsModal] Failed to switch to local mode:', switchResult.message);
      setPendingRestoreContent(null);
      return;
    }

    logger.info('[SettingsModal] Switched to local mode for import');

    // Now proceed with import
    const result = await importFullBackup(pendingRestoreContent, undefined, showToast, true, true);
    if (result) {
      setBackupRestoreResult(result);
      setShowRestoreResults(true);
    }
    setPendingRestoreContent(null);
  };

  const handleGameImportFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const result = await importFromFile(file, false); // Don't overwrite by default
      setShowImportResults(true);

      if (result.success && result.successful > 0) {
        // Success message is handled by the ImportResultsModal
      } else if (result.warnings.length > 0 || result.failed.length > 0) {
        logger.error('Game import issues:', { warnings: result.warnings, failed: result.failed });
      }
    } catch (error) {
      showToast(t('settingsModal.gameImportError', 'Error importing games: ') + (error instanceof Error ? error.message : 'Unknown error'), 'error');
    }

    event.target.value = '';
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

          // Check if update was found (waiting worker exists)
          // The global UpdateBanner (ServiceWorkerRegistration) will handle showing the notification
          if (registration.waiting) {
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
        showToast(t('settingsModal.deleteAccountFailed', 'Failed to delete account: ') + result.error, 'error');
        logger.error('[SettingsModal] Delete account failed:', result.error);
      } else {
        showToast(t('settingsModal.deleteAccountSuccess', 'Account deleted successfully'), 'success');
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
  const handleClubSeasonStartChange = async (month: number, day: number) => {
    // Auto-correct day if it exceeds max for the new month
    const maxDay = getMaxDayForMonth(month);
    if (day > maxDay) {
      day = maxDay;
      logger.log(`[handleClubSeasonStartChange] Auto-corrected day to ${maxDay} for month ${month}`);
    }

    const startDate = constructDateString(month, day);
    const endDate = calculateEndDate(startDate);

    setClubSeasonStartDate(startDate);
    setClubSeasonEndDate(endDate);

    try {
      await updateAppSettings({
        clubSeasonStartDate: startDate,
        clubSeasonEndDate: endDate,
        hasConfiguredSeasonDates: true
      });
      // Invalidate React Query cache so GameStatsModal sees the update
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.detail() });
    } catch (error) {
      logger.error('Failed to save club season dates:', error);
      showToast(
        t('settingsModal.savePeriodDateError', 'Failed to save period date. Please try again.'),
        'error'
      );
    }
  };

  const handleClubSeasonStartMonthChange = (month: number) => {
    const { day } = parseMonthDay(clubSeasonStartDate);
    handleClubSeasonStartChange(month, day);
  };

  const handleClubSeasonStartDayChange = (day: number) => {
    const { month } = parseMonthDay(clubSeasonStartDate);
    handleClubSeasonStartChange(month, day);
  };

  if (!isOpen) return null;

  const getTabStyle = (tab: SettingsTab) => {
    const baseStyle = 'px-2 py-1.5 text-sm font-medium rounded-md transition-colors';
    if (activeTab === tab) {
      return `${baseStyle} bg-indigo-600 text-white`;
    }
    return `${baseStyle} bg-slate-700 text-slate-300 hover:bg-slate-600`;
  };

  const modalContainerStyle =
    'bg-slate-800 rounded-none shadow-xl flex flex-col border-0 overflow-hidden';
  const titleStyle =
    'text-3xl font-bold text-yellow-400 tracking-wide drop-shadow-lg';
  const labelStyle = 'text-sm font-medium text-slate-300 mb-1';
  const inputStyle =
    'block w-full bg-slate-700 border border-slate-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-indigo-500 sm:text-sm text-white';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] font-display">
      <div className={`${modalContainerStyle} bg-noise-texture relative overflow-hidden h-full w-full`}>
        <div className="absolute inset-0 bg-indigo-600/10 mix-blend-soft-light" />
        <div className="absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent" />
        <div className="absolute -inset-[50px] bg-sky-400/5 blur-2xl top-0 opacity-50" />
        <div className="absolute -inset-[50px] bg-indigo-600/5 blur-2xl bottom-0 opacity-50" />

        <div className="relative z-10 flex flex-col h-full">
          <div className="flex justify-center items-center pt-10 pb-4 px-6 backdrop-blur-sm bg-slate-900/20 border-b border-slate-700/20 flex-shrink-0">
            <h2 className={titleStyle}>{t('settingsModal.title', 'App Settings')}</h2>
          </div>

          {/* Tab Navigation */}
          <div className="flex w-full gap-2 px-6 py-3 bg-slate-900/50 border-b border-slate-700/30 flex-shrink-0">
            <button onClick={() => setActiveTab('general')} className={`${getTabStyle('general')} flex-1`} aria-pressed={activeTab === 'general'}>
              {t('settingsModal.tabs.general', 'General')}
            </button>
            <button onClick={() => setActiveTab('season')} className={`${getTabStyle('season')} flex-1`} aria-pressed={activeTab === 'season'}>
              {t('settingsModal.tabs.season', 'Season')}
            </button>
            <button onClick={() => setActiveTab('data')} className={`${getTabStyle('data')} flex-1`} aria-pressed={activeTab === 'data'}>
              {t('settingsModal.tabs.data', 'Data')}
            </button>
            <button onClick={() => setActiveTab('premium')} className={`${getTabStyle('premium')} flex-1`} aria-pressed={activeTab === 'premium'}>
              {t('settingsModal.tabs.premium', 'Premium')}
            </button>
            <button onClick={() => setActiveTab('about')} className={`${getTabStyle('about')} flex-1`} aria-pressed={activeTab === 'about'}>
              {t('settingsModal.tabs.about', 'About')}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4 space-y-4">
            {/* Premium Tab - Cloud Subscription */}
            {activeTab === 'premium' && (
              <CloudSyncSection />
            )}

            {/* General Tab */}
            {activeTab === 'general' && (
            <div className="bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner space-y-4">
              <label htmlFor="language-select" className={labelStyle}>{t('settingsModal.languageLabel', 'Language')}</label>
              <select
                id="language-select"
                value={language}
                onChange={(e) => onLanguageChange(e.target.value)}
                className={inputStyle}
              >
                <option value="en">English</option>
                <option value="fi">Suomi</option>
              </select>
              <div>
              <label htmlFor="team-name-input" className={labelStyle}>{t('settingsModal.defaultTeamNameLabel', 'Default Team Name')}</label>
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
            )}

            {/* Season Tab */}
            {activeTab === 'season' && (
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
                  <label className={labelStyle}>
                    {t('settingsModal.newSeasonStartsLabel', 'New season starts')}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      id="season-start-month"
                      value={parseMonthDay(clubSeasonStartDate).month}
                      onChange={(e) => handleClubSeasonStartMonthChange(parseInt(e.target.value, 10))}
                      className={inputStyle}
                      aria-describedby="club-season-description"
                      aria-label={t('settingsModal.monthLabel', 'Month')}
                    >
                      <option value={1}>{t('months.january', 'January')}</option>
                      <option value={2}>{t('months.february', 'February')}</option>
                      <option value={3}>{t('months.march', 'March')}</option>
                      <option value={4}>{t('months.april', 'April')}</option>
                      <option value={5}>{t('months.may', 'May')}</option>
                      <option value={6}>{t('months.june', 'June')}</option>
                      <option value={7}>{t('months.july', 'July')}</option>
                      <option value={8}>{t('months.august', 'August')}</option>
                      <option value={9}>{t('months.september', 'September')}</option>
                      <option value={10}>{t('months.october', 'October')}</option>
                      <option value={11}>{t('months.november', 'November')}</option>
                      <option value={12}>{t('months.december', 'December')}</option>
                    </select>
                    <select
                      id="season-start-day"
                      value={parseMonthDay(clubSeasonStartDate).day}
                      onChange={(e) => handleClubSeasonStartDayChange(parseInt(e.target.value, 10))}
                      className={inputStyle}
                      aria-describedby="club-season-description"
                      aria-label={t('settingsModal.dayLabel', 'Day')}
                    >
                      {Array.from(
                        { length: getMaxDayForMonth(parseMonthDay(clubSeasonStartDate).month) },
                        (_, i) => i + 1
                      ).map(day => (
                        <option key={day} value={day}>{day}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {/* Season End Date (auto-calculated, read-only) */}
                <div>
                  <label className={labelStyle}>
                    {t('settingsModal.seasonEndsLabel', 'Season ends')}
                  </label>
                  <div className="px-3 py-2 bg-slate-800/50 rounded-md border border-slate-600 text-slate-300">
                    {formatDateForDisplay(clubSeasonEndDate)}
                    <span className="text-slate-500 text-xs ml-2">
                      ({t('settingsModal.autoCalculated', 'auto-calculated')})
                    </span>
                  </div>
                </div>
                {/* Example */}
                <p className="text-xs text-slate-400 mt-2">
                  {t('settingsModal.seasonExample', 'Example: If your season starts {{startDate}}, the 2024-25 season runs {{startDate}}, 2024 → {{endDate}}, 2025.', {
                    startDate: formatDateForDisplay(clubSeasonStartDate),
                    endDate: formatDateForDisplay(clubSeasonEndDate)
                  })}
                </p>
              </div>
            </div>
            )}

            {/* Data Tab */}
            {activeTab === 'data' && (
            <>
            {/* GDPR / Your Data Rights Section */}
            <div className="space-y-3 bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner">
              <h3 className="text-lg font-semibold text-slate-200">
                {t('settingsModal.gdpr.title', 'Your Data Rights')}
              </h3>
              <p className="text-sm text-slate-300">
                {t('settingsModal.gdpr.description', 'You have full control over your data. Use the options below to exercise your GDPR rights.')}
              </p>
              <div className="space-y-2">
                <div className="flex items-start gap-3 p-3 bg-slate-800/50 rounded-md">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-200">
                      {t('settingsModal.gdpr.downloadTitle', 'Download Your Data')}
                    </p>
                    <p className="text-xs text-slate-400">
                      {t('settingsModal.gdpr.downloadDescription', 'Export all your data (players, games, teams, etc.) to a backup file you can keep.')}
                    </p>
                  </div>
                  <button
                    onClick={onCreateBackup}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-sm font-medium transition-colors"
                  >
                    {t('settingsModal.gdpr.downloadButton', 'Download')}
                  </button>
                </div>
                <div className="flex items-start gap-3 p-3 bg-slate-800/50 rounded-md">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-200">
                      {t('settingsModal.gdpr.deleteTitle', 'Delete Your Data')}
                    </p>
                    <p className="text-xs text-slate-400">
                      {getBackendMode() === 'cloud'
                        ? t('settingsModal.gdpr.deleteDescriptionCloud', 'To delete all cloud data, use the "Clear Cloud Data" option in the Premium tab.')
                        : t('settingsModal.gdpr.deleteDescriptionLocal', 'To delete all local data, use the "Hard Reset App" option in the About tab.')}
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab(getBackendMode() === 'cloud' ? 'premium' : 'about')}
                    className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white rounded text-sm font-medium transition-colors"
                  >
                    {t('settingsModal.gdpr.goToDelete', 'Go')}
                  </button>
                </div>
                <div className="flex items-start gap-3 p-3 bg-slate-800/50 rounded-md">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-200">
                      {t('settingsModal.gdpr.correctTitle', 'Correct Your Data')}
                    </p>
                    <p className="text-xs text-slate-400">
                      {t('settingsModal.gdpr.correctDescription', 'You can edit player names, game details, and all other data directly in the app at any time.')}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Data Management Section */}
            <div className="space-y-3 bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner">
              <h3 className="text-lg font-semibold text-slate-200">
                {t('settingsModal.backupTitle', 'Data Management')}
              </h3>
              <input
                type="file"
                ref={restoreFileInputRef}
                onChange={handleRestoreFileSelected}
                accept=".json"
                style={{ display: "none" }}
                data-testid="restore-backup-input"
              />
              <input
                type="file"
                ref={gameImportFileInputRef}
                onChange={handleGameImportFileChange}
                accept=".json"
                style={{ display: "none" }}
                data-testid="game-import-input"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={onCreateBackup}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-sm text-sm font-medium transition-colors border border-indigo-400/30"
                >
                  <HiOutlineDocumentArrowDown className="h-5 w-5" />
                  {t('settingsModal.backupButton', 'Backup All Data')}
                </button>
                <button
                  onClick={handleRestore}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-600 hover:bg-slate-500 text-slate-200 rounded-md text-sm font-medium shadow-sm transition-colors"
                >
                  <HiOutlineDocumentArrowUp className="h-5 w-5" />
                  {t('settingsModal.restoreButton', 'Restore from Backup')}
                </button>
                <button
                  onClick={() => gameImportFileInputRef.current?.click()}
                  disabled={isImporting}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-md text-sm font-medium shadow-sm transition-colors"
                >
                  <HiOutlineChartBar className="h-5 w-5" />
                  {isImporting ? t('settingsModal.importing', 'Importing...') : t('settingsModal.importGamesButton', 'Import Games')}
                </button>
                <button
                  onClick={handleCheckForUpdates}
                  disabled={checkingForUpdates}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-md text-sm font-medium shadow-sm transition-colors"
                >
                  <HiOutlineArrowPath className={`h-5 w-5 ${checkingForUpdates ? 'animate-spin' : ''}`} />
                  {checkingForUpdates ? t('settingsModal.checkingUpdates', 'Checking...') : t('settingsModal.checkForUpdates', 'Check for Updates')}
                </button>
              </div>
              <p className="text-sm text-slate-300">
                {t(
                  'settingsModal.backupDescription',
                  'Export your data to a backup file or restore from a previous backup. All data will be replaced when restoring.'
                )}
              </p>
            </div>
            </>
            )}

            {/* About Tab */}
            {activeTab === 'about' && (
            <>
            <div className="space-y-2 bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner">
              <h3 className="text-lg font-semibold text-slate-200">
                {t('settingsModal.aboutTitle', 'About')}
              </h3>
              <div className="flex items-center gap-2">
                <p className="text-sm text-slate-300">
                  {t('settingsModal.appVersion', 'App Version')}: {packageJson.version}
                </p>
                {process.env.NEXT_PUBLIC_GIT_BRANCH && process.env.NEXT_PUBLIC_GIT_BRANCH !== 'master' && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    {t('settingsModal.previewBadge', 'Preview')}
                  </span>
                )}
              </div>
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
              <div className="space-y-1">
                <label className={labelStyle}>{t('settingsModal.storageUsageLabel', 'Storage Usage')}</label>
                  <p className="text-sm text-slate-300">
                    {storageEstimate
                      ? t('settingsModal.storageUsageDetails', {
                          used: formatBytes(storageEstimate.usage),
                          quota: formatBytes(storageEstimate.quota),
                        })
                      : t(
                          'settingsModal.storageUsageUnavailable',
                          'Storage usage information unavailable.'
                        )}
                  </p>
                {storageEstimate && (
                  <div className="w-full bg-slate-700 rounded-md h-2 overflow-hidden">
                    <div
                      className="bg-indigo-500 h-2"
                      style={{ width: `${Math.min(100, (storageEstimate.usage / storageEstimate.quota) * 100)}%` }}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <button onClick={onResetGuide} className={primaryButtonStyle}>
                  {t('settingsModal.resetGuideButton', 'Reset App Guide')}
                </button>
                <p className="text-sm text-slate-300">
                  {t(
                    'settingsModal.resetGuideDescription',
                    'Show the onboarding guide again the next time you open the app.'
                  )}
                </p>
              </div>
            </div>
            {/* Danger Zone */}
            <div className="space-y-2 bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner">
              <h3 className="text-lg font-semibold text-red-300">
                {t('settingsModal.dangerZoneTitle', 'Danger Zone')}
              </h3>
              <p className="text-sm text-red-200">
                {t(
                  'settingsModal.hardResetDescription',
                  'Erase all saved teams, games and settings. This action cannot be undone.'
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
                  logger.log('[SettingsModal] Hard Reset button clicked', {
                    resetConfirm,
                    matches: resetConfirm === 'RESET',
                    length: resetConfirm.length,
                    trimmed: resetConfirm.trim()
                  });
                  if (resetConfirm.trim() === 'RESET') {
                    logger.log('[SettingsModal] Calling onHardResetApp');
                    onHardResetApp();
                    setResetConfirm('');
                  }
                }}
                className={dangerButtonStyle}
                disabled={resetConfirm.trim() !== 'RESET'}
              >
                {t('settingsModal.hardResetButton', 'Hard Reset App')}
              </button>

              {/* Delete Account - Only visible in cloud mode */}
              {authMode === 'cloud' && (
                <div className="mt-6 pt-4 border-t border-red-700/30">
                  <h4 className="text-md font-semibold text-red-300 mb-2">
                    {t('settingsModal.deleteAccountTitle', 'Delete Account')}
                  </h4>
                  <p className="text-sm text-red-200 mb-3">
                    {t(
                      'settingsModal.deleteAccountDescription',
                      'Permanently delete your account and all cloud data. This action cannot be undone. You will need to create a new account to use cloud features again.'
                    )}
                  </p>
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
              )}
            </div>
            </>
            )}
          </div>
          <ModalFooter>
            <button onClick={onClose} className={primaryButtonStyle}>
              {t('settingsModal.doneButton', 'Done')}
            </button>
          </ModalFooter>
        </div>
      </div>
      
      {/* Import Results Modal */}
      <ImportResultsModal
        isOpen={showImportResults}
        onClose={() => setShowImportResults(false)}
        importResult={lastResult}
        isImporting={isImporting}
      />

      {/* Cloud Mode Import Warning Modal */}
      <CloudModeImportModal
        isOpen={showCloudModeImportModal}
        onImportAndMigrate={handleCloudModeImportAndMigrate}
        onSwitchToLocal={handleCloudModeSwitchToLocal}
        onCancel={handleCloudModeImportCancel}
      />

      {/* Restore Confirmation Modal (shown in local mode) */}
      <ConfirmationModal
        isOpen={showRestoreConfirm}
        title={t('fullBackup.confirmRestoreTitle', 'Restore from Backup?')}
        message={t('fullBackup.confirmRestore', 'Are you sure you want to restore from this backup? All current data will be replaced with the backup data.')}
        warningMessage={t('fullBackup.confirmRestoreWarning', 'This action cannot be undone. Make sure you have a current backup before proceeding.')}
        onConfirm={handleRestoreConfirmed}
        onCancel={() => {
          setShowRestoreConfirm(false);
          setPendingRestoreContent(null);
        }}
        confirmLabel={t('common.restore', 'Restore')}
        cancelLabel={t('common.cancel', 'Cancel')}
        variant="danger"
      />

      {/* Backup Restore Results Modal */}
      <BackupRestoreResultsModal
        isOpen={showRestoreResults}
        onClose={handleRestoreResultsClose}
        result={backupRestoreResult}
      />
    </div>
  );
};

export default SettingsModal;
