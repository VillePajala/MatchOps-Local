'use client';

import React, { useEffect, useState, useRef } from 'react';
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
import { ModalFooter, primaryButtonStyle, dangerButtonStyle } from '@/styles/modalStyles';
import logger from '@/utils/logger';
import { getAppSettings, updateAppSettings } from '@/utils/appSettings';
import { validateSeasonDates } from '@/utils/clubSeason';
import { queryKeys } from '@/config/queryKeys';

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
  onDataImportSuccess,
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
  const [clubSeasonStartDate, setClubSeasonStartDate] = useState<string>('2000-10-01');
  const [clubSeasonEndDate, setClubSeasonEndDate] = useState<string>('2000-05-01');

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
  const [checkingForUpdates, setCheckingForUpdates] = useState(false);
  const [showUpdateConfirm, setShowUpdateConfirm] = useState(false);
  const [updateRegistration, setUpdateRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [pendingRestoreContent, setPendingRestoreContent] = useState<string | null>(null);

  useEffect(() => {
    setTeamName(defaultTeamName);
  }, [defaultTeamName]);

  useEffect(() => {
    if (isOpen) {
      // Load club season settings
      getAppSettings().then(settings => {
        setClubSeasonStartDate(settings.clubSeasonStartDate ?? '2000-10-01');
        setClubSeasonEndDate(settings.clubSeasonEndDate ?? '2000-05-01');
      }).catch((error) => {
        // Use defaults if loading fails
        logger.error('Failed to load club season settings:', error);
        setClubSeasonStartDate('2000-10-01');
        setClubSeasonEndDate('2000-05-01');
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
        setShowRestoreConfirm(true);
      } else {
        showToast(t('settingsModal.importReadError', 'Error reading file content.'), 'error');
      }
    };
    reader.onerror = () => showToast(t('settingsModal.importReadError', 'Error reading file content.'), 'error');
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleRestoreConfirmed = async () => {
    if (!pendingRestoreContent) {
      setShowRestoreConfirm(false);
      return;
    }

    try {
      if (onDataImportSuccess) {
        await importFullBackup(pendingRestoreContent, {
          onImportSuccess: onDataImportSuccess,
          showToast,
          confirmed: true,
          queryClient,
        });
      } else {
        await importFullBackup(pendingRestoreContent, {
          showToast,
          confirmed: true,
        });
      }
    } catch (error) {
      logger.error('[SettingsModal] Full backup restore failed:', error);
    } finally {
      setShowRestoreConfirm(false);
      setPendingRestoreContent(null);
    }
  };

  const handleGameImportFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const result = await importFromFile(file, false); // Don't overwrite by default
      setShowImportResults(true);

      if (result.success && result.successful > 0) {
        onDataImportSuccess?.();
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
          // Log current service worker state
          logger.log('[PWA] Current SW state before update:', {
            active: registration.active?.scriptURL,
            waiting: registration.waiting?.scriptURL,
            installing: registration.installing?.scriptURL,
          });

          // Try to fetch sw.js directly to check if it's different
          try {
            const swResponse = await fetch('/sw.js', { cache: 'no-store' });
            const swText = await swResponse.text();
            const timestampMatch = swText.match(/Build Timestamp: (.*)/);
            const deployedTimestamp = timestampMatch ? timestampMatch[1] : 'unknown';
            logger.log('[PWA] Deployed sw.js timestamp:', deployedTimestamp);
          } catch (e) {
            logger.error('[PWA] Failed to fetch sw.js directly:', e);
          }

          logger.log('[PWA] Manual check - forcing registration.update()');
          await registration.update();

          // Wait a bit for the update to process
          await new Promise(resolve => setTimeout(resolve, 1000));

          logger.log('[PWA] Manual update check completed - checking for waiting worker');
          logger.log('[PWA] SW state after update:', {
            active: registration.active?.scriptURL,
            waiting: registration.waiting?.scriptURL,
            installing: registration.installing?.scriptURL,
          });

          if (registration.waiting) {
            logger.log('[PWA] Update found! Waiting worker detected');
            setUpdateRegistration(registration);
            setShowUpdateConfirm(true);
          } else if (registration.installing) {
            logger.log('[PWA] Update installing... please wait');
            showToast(t('settingsModal.updateInstalling', 'Update is installing... Please wait a moment and check again.'), 'info');
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

  const handleUpdateConfirmed = () => {
    if (updateRegistration?.waiting) {
      updateRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
      window.location.reload();
    }
    setShowUpdateConfirm(false);
    setUpdateRegistration(null);
  };

  const handleClubSeasonStartMonthChange = async (month: number) => {
    let { day } = parseMonthDay(clubSeasonStartDate);

    // Auto-correct day if it exceeds max for the new month
    const maxDay = getMaxDayForMonth(month);
    if (day > maxDay) {
      day = maxDay;
      logger.log(`[handleClubSeasonStartMonthChange] Auto-corrected day from ${day} to ${maxDay} for month ${month}`);
    }

    const date = constructDateString(month, day);

    // Validate date before saving
    if (!validateSeasonDates(date, clubSeasonEndDate)) {
      logger.error('Invalid season start date:', date);
      showToast(
        t('settingsModal.invalidPeriodDateError', 'Invalid period date. Please enter a valid date.'),
        'error'
      );
      return;
    }

    setClubSeasonStartDate(date);
    try {
      await updateAppSettings({
        clubSeasonStartDate: date,
        hasConfiguredSeasonDates: true
      });
      // Invalidate React Query cache so GameStatsModal sees the update
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.detail() });
    } catch (error) {
      logger.error('Failed to save club season start date:', error);
      showToast(
        t('settingsModal.savePeriodDateError', 'Failed to save period date. Please try again.'),
        'error'
      );
    }
  };

  const handleClubSeasonStartDayChange = async (day: number) => {
    const { month } = parseMonthDay(clubSeasonStartDate);
    const date = constructDateString(month, day);

    // Validate date before saving
    if (!validateSeasonDates(date, clubSeasonEndDate)) {
      logger.error('Invalid season start date:', date);
      showToast(
        t('settingsModal.invalidPeriodDateError', 'Invalid period date. Please enter a valid date.'),
        'error'
      );
      return;
    }

    setClubSeasonStartDate(date);
    try {
      await updateAppSettings({
        clubSeasonStartDate: date,
        hasConfiguredSeasonDates: true
      });
      // Invalidate React Query cache so GameStatsModal sees the update
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.detail() });
    } catch (error) {
      logger.error('Failed to save club season start date:', error);
      showToast(
        t('settingsModal.savePeriodDateError', 'Failed to save period date. Please try again.'),
        'error'
      );
    }
  };

  const handleClubSeasonEndMonthChange = async (month: number) => {
    let { day } = parseMonthDay(clubSeasonEndDate);

    // Auto-correct day if it exceeds max for the new month
    const maxDay = getMaxDayForMonth(month);
    if (day > maxDay) {
      day = maxDay;
      logger.log(`[handleClubSeasonEndMonthChange] Auto-corrected day from ${day} to ${maxDay} for month ${month}`);
    }

    const date = constructDateString(month, day);

    // Validate date before saving
    if (!validateSeasonDates(clubSeasonStartDate, date)) {
      logger.error('Invalid season end date:', date);
      showToast(
        t('settingsModal.invalidPeriodDateError', 'Invalid period date. Please enter a valid date.'),
        'error'
      );
      return;
    }

    setClubSeasonEndDate(date);
    try {
      await updateAppSettings({
        clubSeasonEndDate: date,
        hasConfiguredSeasonDates: true
      });
      // Invalidate React Query cache so GameStatsModal sees the update
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.detail() });
    } catch (error) {
      logger.error('Failed to save club season end date:', error);
      showToast(
        t('settingsModal.savePeriodDateError', 'Failed to save period date. Please try again.'),
        'error'
      );
    }
  };

  const handleClubSeasonEndDayChange = async (day: number) => {
    const { month } = parseMonthDay(clubSeasonEndDate);
    const date = constructDateString(month, day);

    // Validate date before saving
    if (!validateSeasonDates(clubSeasonStartDate, date)) {
      logger.error('Invalid season end date:', date);
      showToast(
        t('settingsModal.invalidPeriodDateError', 'Invalid period date. Please enter a valid date.'),
        'error'
      );
      return;
    }

    setClubSeasonEndDate(date);
    try {
      await updateAppSettings({
        clubSeasonEndDate: date,
        hasConfiguredSeasonDates: true
      });
      // Invalidate React Query cache so GameStatsModal sees the update
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.detail() });
    } catch (error) {
      logger.error('Failed to save club season end date:', error);
      showToast(
        t('settingsModal.savePeriodDateError', 'Failed to save period date. Please try again.'),
        'error'
      );
    }
  };

  if (!isOpen) return null;

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
          <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4 space-y-4">
            {/* General Settings */}
            <div className="bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner -mx-2 sm:-mx-4 md:-mx-6 -mt-2 sm:-mt-4 md:-mt-6 space-y-4">
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
            {/* Season Period */}
            <div className="space-y-3 bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner -mx-2 sm:-mx-4 md:-mx-6 -mt-2 sm:-mt-4 md:-mt-6">
              <h3 className="text-lg font-semibold text-slate-200">
                {t('settingsModal.seasonPeriodTitle', 'Season Period')}
              </h3>
              <p id="club-season-description" className="text-sm text-slate-300">
                {t('settingsModal.seasonPeriodDescription', 'Define when your season runs (for filtering statistics). Month and day only - the year is just a template (e.g., October to May).')}
              </p>
              <div className="space-y-3">
                {/* Period Start */}
                <div>
                  <label className={labelStyle}>
                    {t('settingsModal.periodStartLabel', 'Period Start')}
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
                {/* Period End */}
                <div>
                  <label className={labelStyle}>
                    {t('settingsModal.periodEndLabel', 'Period End')}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      id="season-end-month"
                      value={parseMonthDay(clubSeasonEndDate).month}
                      onChange={(e) => handleClubSeasonEndMonthChange(parseInt(e.target.value, 10))}
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
                      id="season-end-day"
                      value={parseMonthDay(clubSeasonEndDate).day}
                      onChange={(e) => handleClubSeasonEndDayChange(parseInt(e.target.value, 10))}
                      className={inputStyle}
                      aria-describedby="club-season-description"
                      aria-label={t('settingsModal.dayLabel', 'Day')}
                    >
                      {Array.from(
                        { length: getMaxDayForMonth(parseMonthDay(clubSeasonEndDate).month) },
                        (_, i) => i + 1
                      ).map(day => (
                        <option key={day} value={day}>{day}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
            {/* Data Management */}
            <div className="space-y-3 bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner -mx-2 sm:-mx-4 md:-mx-6 -mt-2 sm:-mt-4 md:-mt-6">
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
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-sm font-medium shadow-sm transition-colors"
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
            {/* About */}
            <div className="space-y-2 bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner -mx-2 sm:-mx-4 md:-mx-6 -mt-2 sm:-mt-4 md:-mt-6">
              <h3 className="text-lg font-semibold text-slate-200">
                {t('settingsModal.aboutTitle', 'About')}
              </h3>
              <p className="text-sm text-slate-300">
                {t('settingsModal.appVersion', 'App Version')}: {packageJson.version}
              </p>
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
            <div className="space-y-2 bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner -mx-2 sm:-mx-4 md:-mx-6 -mt-2 sm:-mt-4 md:-mt-6">
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
                onClick={() => {
                  onHardResetApp();
                  setResetConfirm('');
                }}
                className={dangerButtonStyle}
                disabled={resetConfirm !== 'RESET'}
              >
                {t('settingsModal.hardResetButton', 'Hard Reset App')}
              </button>
            </div>
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

      {/* Update Confirmation Modal */}
      <ConfirmationModal
        isOpen={showUpdateConfirm}
        title={t('settingsModal.updateAvailableTitle', 'Update Available')}
        message={t('settingsModal.updateAvailableConfirm', 'Update available! Click OK to reload now, or Cancel to update later.')}
        onConfirm={handleUpdateConfirmed}
        onCancel={() => {
          setShowUpdateConfirm(false);
          setUpdateRegistration(null);
        }}
        confirmLabel={t('common.ok', 'OK')}
        cancelLabel={t('common.cancel', 'Cancel')}
        variant="primary"
      />

      {/* Restore Confirmation Modal */}
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
    </div>
  );
};

export default SettingsModal;
