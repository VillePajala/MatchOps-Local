'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { HiOutlineCloud, HiOutlineServer, HiOutlineArrowPath, HiOutlineExclamationTriangle, HiOutlineTrash } from 'react-icons/hi2';
import {
  getBackendMode,
  isCloudAvailable,
  enableCloudMode,
  disableCloudMode,
} from '@/config/backendConfig';
import { useToast } from '@/contexts/ToastProvider';
import { getDataStore } from '@/datastore/factory';
import { primaryButtonStyle, secondaryButtonStyle, dangerButtonStyle } from '@/styles/modalStyles';
import logger from '@/utils/logger';

interface CloudSyncSectionProps {
  /** Callback when mode changes (app needs restart) */
  onModeChange?: () => void;
}

/**
 * Cloud Sync settings section for SettingsModal.
 * Allows users to enable/disable cloud mode and shows current sync status.
 *
 * When cloud mode is enabled:
 * - Data syncs to Supabase cloud
 * - Requires authentication
 * - Works across devices
 *
 * When local mode is enabled (default):
 * - Data stored in browser IndexedDB
 * - Works offline
 * - Single device only
 */
export default function CloudSyncSection({ onModeChange }: CloudSyncSectionProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // Use lazy initialization to load values only once on mount (avoids lint warning about setState in useEffect)
  const [currentMode] = useState<'local' | 'cloud'>(() => getBackendMode());
  const [cloudAvailable] = useState(() => isCloudAvailable());
  const [isChangingMode, setIsChangingMode] = useState(false);

  // Clear cloud data confirmation state
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState('');
  const [isClearingCloud, setIsClearingCloud] = useState(false);

  // Track mount state to prevent state updates after unmount
  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleEnableCloud = () => {
    if (!cloudAvailable) {
      showToast(
        t('cloudSync.notConfigured', 'Cloud sync is not configured. Contact support for access.'),
        'error'
      );
      return;
    }

    setIsChangingMode(true);
    try {
      const success = enableCloudMode();
      if (success) {
        showToast(
          t('cloudSync.enabledReloading', 'Cloud mode enabled. Reloading...'),
          'success'
        );
        onModeChange?.();
        // Reload after brief delay so user sees the toast
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        showToast(
          t('cloudSync.enableFailed', 'Failed to enable cloud mode. Please try again.'),
          'error'
        );
        if (isMountedRef.current) {
          setIsChangingMode(false);
        }
      }
    } catch (error) {
      logger.error('[CloudSyncSection] Failed to enable cloud mode:', error);
      showToast(
        t('cloudSync.enableError', 'An error occurred while enabling cloud mode.'),
        'error'
      );
      if (isMountedRef.current) {
        setIsChangingMode(false);
      }
    }
  };

  const handleDisableCloud = () => {
    setIsChangingMode(true);
    try {
      const success = disableCloudMode();
      if (success) {
        showToast(
          t('cloudSync.disabledReloading', 'Local mode enabled. Reloading...'),
          'success'
        );
        onModeChange?.();
        // Reload after brief delay so user sees the toast
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        // localStorage write was denied (e.g., browser policy, quota exceeded)
        logger.warn('[CloudSyncSection] Failed to persist local mode - localStorage write denied');
        showToast(
          t('cloudSync.disableFailed', 'Failed to switch to local mode. Please try again.'),
          'error'
        );
        if (isMountedRef.current) {
          setIsChangingMode(false);
        }
      }
    } catch (error) {
      logger.error('[CloudSyncSection] Failed to disable cloud mode:', error);
      showToast(
        t('cloudSync.disableError', 'An error occurred while disabling cloud mode.'),
        'error'
      );
      if (isMountedRef.current) {
        setIsChangingMode(false);
      }
    }
  };

  const handleClearCloudData = async () => {
    if (clearConfirmText !== 'DELETE') {
      return;
    }

    // Safety check: Ensure cloud is actually available
    // This prevents accidentally clearing local data if cloud config is missing
    if (!cloudAvailable) {
      logger.error('[CloudSyncSection] Attempted to clear cloud data but cloud is unavailable');
      showToast(
        t('cloudSync.cloudUnavailable', 'Cloud is not available. Cannot clear cloud data.'),
        'error'
      );
      return;
    }

    setIsClearingCloud(true);
    try {
      const dataStore = await getDataStore();

      // Defense-in-depth: Verify we're actually using cloud backend
      // This catches edge cases where cloudAvailable is true but factory returned LocalDataStore
      const backendName = dataStore.getBackendName();
      if (backendName !== 'supabase') {
        logger.error(`[CloudSyncSection] Expected supabase backend but got ${backendName}`);
        showToast(
          t('cloudSync.wrongBackend', 'Cannot clear: not connected to cloud storage.'),
          'error'
        );
        return;
      }

      await dataStore.clearAllUserData();

      // Invalidate all React Query cache to refresh UI with empty state
      // This avoids page reload which could lose unsaved work
      await queryClient.invalidateQueries();

      showToast(
        t('cloudSync.clearSuccess', 'All cloud data deleted.'),
        'success'
      );

      // Reset the confirmation dialog
      setShowClearConfirm(false);
      setClearConfirmText('');
    } catch (error) {
      logger.error('[CloudSyncSection] Failed to clear cloud data:', error);
      showToast(
        t('cloudSync.clearError', 'Failed to clear cloud data. Please try again.'),
        'error'
      );
    } finally {
      if (isMountedRef.current) {
        setIsClearingCloud(false);
      }
    }
  };

  const labelStyle = 'text-sm font-medium text-slate-300 mb-1';

  return (
    <div className="space-y-3 bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner -mx-2 sm:-mx-4 md:-mx-6 -mt-2 sm:-mt-4 md:-mt-6">
      <h3 className="text-lg font-semibold text-slate-200">
        {t('cloudSync.title', 'Cloud Sync')}
      </h3>

      {/* Current Status */}
      <div className="flex items-center gap-3 p-3 rounded-md bg-slate-800/50">
        {currentMode === 'cloud' ? (
          <>
            <HiOutlineCloud className="h-6 w-6 text-sky-400" />
            <div>
              <p className={labelStyle}>{t('cloudSync.statusLabel', 'Current Mode')}</p>
              <p className="text-sm text-sky-400 font-medium">
                {t('cloudSync.cloudMode', 'Cloud Sync Enabled')}
              </p>
            </div>
          </>
        ) : (
          <>
            <HiOutlineServer className="h-6 w-6 text-slate-400" />
            <div>
              <p className={labelStyle}>{t('cloudSync.statusLabel', 'Current Mode')}</p>
              <p className="text-sm text-slate-300 font-medium">
                {t('cloudSync.localMode', 'Local Storage')}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Mode Description */}
      <p className="text-sm text-slate-400">
        {currentMode === 'cloud'
          ? t('cloudSync.cloudDescription', 'Your data syncs to the cloud. Access from any device after signing in.')
          : t('cloudSync.localDescription', 'Your data is stored locally on this device. Works offline, but data is not synced.')
        }
      </p>

      {/* Cloud Not Available Warning */}
      {!cloudAvailable && currentMode === 'local' && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/30">
          <HiOutlineExclamationTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-300">
            {t('cloudSync.notAvailable', 'Cloud sync is not available. This feature requires a premium subscription and server configuration.')}
          </p>
        </div>
      )}

      {/* Mode Toggle Button */}
      <div className="pt-2">
        {currentMode === 'local' ? (
          <button
            onClick={handleEnableCloud}
            disabled={isChangingMode || !cloudAvailable}
            className={`${primaryButtonStyle} flex items-center justify-center gap-2 w-full py-3`}
          >
            {isChangingMode ? (
              <HiOutlineArrowPath className="h-5 w-5 animate-spin" />
            ) : (
              <HiOutlineCloud className="h-5 w-5" />
            )}
            {isChangingMode
              ? t('cloudSync.enabling', 'Enabling...')
              : t('cloudSync.enableButton', 'Enable Cloud Sync')
            }
          </button>
        ) : (
          <button
            onClick={handleDisableCloud}
            disabled={isChangingMode}
            className={`${secondaryButtonStyle} flex items-center justify-center gap-2 w-full py-3`}
          >
            {isChangingMode ? (
              <HiOutlineArrowPath className="h-5 w-5 animate-spin" />
            ) : (
              <HiOutlineServer className="h-5 w-5" />
            )}
            {isChangingMode
              ? t('cloudSync.disabling', 'Disabling...')
              : t('cloudSync.disableButton', 'Switch to Local Mode')
            }
          </button>
        )}
      </div>

      {/* Migration Note */}
      {currentMode === 'local' && cloudAvailable && (
        <p className="text-xs text-slate-500">
          {t('cloudSync.migrationNote', 'When you enable cloud sync, you can migrate your existing local data to the cloud.')}
        </p>
      )}

      {/* Clear Cloud Data Section - Only shown when cloud mode is active AND cloud is available */}
      {/* Safety: If cloudAvailable is false, getDataStore() falls back to LocalDataStore */}
      {/* which would clear local IndexedDB instead of cloud data - so we must gate on both */}
      {currentMode === 'cloud' && cloudAvailable && (
        <div className="pt-4 mt-4 border-t border-slate-700">
          <h4 className="text-sm font-medium text-slate-300 mb-2">
            {t('cloudSync.dangerZone', 'Danger Zone')}
          </h4>

          {!showClearConfirm ? (
            <button
              onClick={() => setShowClearConfirm(true)}
              disabled={isChangingMode}
              className={`${dangerButtonStyle} flex items-center justify-center gap-2 w-full py-3 !bg-red-600/20 hover:!bg-red-600/30 !text-red-400 border border-red-500/50`}
            >
              <HiOutlineTrash className="h-5 w-5" />
              {t('cloudSync.clearCloudData', 'Clear All Cloud Data')}
            </button>
          ) : (
            <div className="p-4 rounded-md bg-red-900/20 border border-red-500/50">
              <div className="flex items-start gap-2 mb-3">
                <HiOutlineExclamationTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-red-300 font-medium">
                    {t('cloudSync.clearWarningTitle', 'This action cannot be undone!')}
                  </p>
                  <p className="text-sm text-red-300/80 mt-1">
                    {t('cloudSync.clearWarningDescription', 'All your games, players, teams, seasons, and other data will be permanently deleted from the cloud.')}
                  </p>
                </div>
              </div>

              <div className="mb-3">
                <label className="block text-sm text-slate-300 mb-1">
                  {t('cloudSync.clearConfirmLabel', 'Type DELETE to confirm:')}
                </label>
                <input
                  type="text"
                  value={clearConfirmText}
                  onChange={(e) => setClearConfirmText(e.target.value)}
                  placeholder="DELETE"
                  disabled={isClearingCloud}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent disabled:opacity-50"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowClearConfirm(false);
                    setClearConfirmText('');
                  }}
                  disabled={isClearingCloud}
                  className={`${secondaryButtonStyle} flex-1`}
                >
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  onClick={handleClearCloudData}
                  disabled={clearConfirmText !== 'DELETE' || isClearingCloud}
                  className={`${dangerButtonStyle} flex-1 flex items-center justify-center gap-2`}
                >
                  {isClearingCloud ? (
                    <>
                      <HiOutlineArrowPath className="h-4 w-4 animate-spin" />
                      {t('cloudSync.clearing', 'Clearing...')}
                    </>
                  ) : (
                    <>
                      <HiOutlineTrash className="h-4 w-4" />
                      {t('cloudSync.confirmClear', 'Clear All Data')}
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          <p className="text-xs text-slate-500 mt-2">
            {t('cloudSync.clearNote', 'This will delete all your data from the cloud. Local data on this device will not be affected.')}
          </p>
        </div>
      )}
    </div>
  );
}
