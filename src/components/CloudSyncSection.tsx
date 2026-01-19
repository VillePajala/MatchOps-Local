'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineCloud, HiOutlineServer, HiOutlineArrowPath, HiOutlineExclamationTriangle } from 'react-icons/hi2';
import {
  getBackendMode,
  isCloudAvailable,
  enableCloudMode,
  disableCloudMode,
  hasModeOverride,
} from '@/config/backendConfig';
import { useToast } from '@/contexts/ToastProvider';
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

  const [currentMode, setCurrentMode] = useState<'local' | 'cloud'>('local');
  const [cloudAvailable, setCloudAvailable] = useState(false);
  const [hasOverride, setHasOverride] = useState(false);
  const [isChangingMode, setIsChangingMode] = useState(false);

  // Track mount state to prevent state updates after unmount
  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Load current state on mount
  useEffect(() => {
    setCurrentMode(getBackendMode());
    setCloudAvailable(isCloudAvailable());
    setHasOverride(hasModeOverride());
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
          t('cloudSync.enabledRestartRequired', 'Cloud mode enabled. Restart the app to apply changes.'),
          'success'
        );
        // Optimistically update local state for immediate UI feedback.
        // Note: getBackendMode() won't return 'cloud' until after restart,
        // but this component's local state shows the pending mode.
        setCurrentMode('cloud');
        setHasOverride(true);
        onModeChange?.();
      } else {
        showToast(
          t('cloudSync.enableFailed', 'Failed to enable cloud mode. Please try again.'),
          'error'
        );
      }
    } catch (error) {
      logger.error('[CloudSyncSection] Failed to enable cloud mode:', error);
      showToast(
        t('cloudSync.enableError', 'An error occurred while enabling cloud mode.'),
        'error'
      );
    } finally {
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
          t('cloudSync.disabledRestartRequired', 'Local mode enabled. Restart the app to apply changes.'),
          'success'
        );
        // Optimistically update local state for immediate UI feedback.
        // Note: getBackendMode() won't return 'local' until after restart,
        // but this component's local state shows the pending mode.
        setCurrentMode('local');
        setHasOverride(true);
        onModeChange?.();
      } else {
        // localStorage write was denied (e.g., browser policy, quota exceeded)
        logger.warn('[CloudSyncSection] Failed to persist local mode - localStorage write denied');
        showToast(
          t('cloudSync.disableFailed', 'Failed to switch to local mode. Please try again.'),
          'error'
        );
      }
    } catch (error) {
      logger.error('[CloudSyncSection] Failed to disable cloud mode:', error);
      showToast(
        t('cloudSync.disableError', 'An error occurred while disabling cloud mode.'),
        'error'
      );
    } finally {
      if (isMountedRef.current) {
        setIsChangingMode(false);
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
            className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-md text-sm font-medium shadow-sm transition-colors"
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
            className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-slate-600 hover:bg-slate-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-md text-sm font-medium shadow-sm transition-colors"
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

      {/* Restart Required Notice */}
      {hasOverride && (
        <p className="text-xs text-amber-400 text-center">
          {t('cloudSync.restartRequired', 'Restart the app to apply mode changes.')}
        </p>
      )}

      {/* Migration Note */}
      {currentMode === 'local' && cloudAvailable && (
        <p className="text-xs text-slate-500">
          {t('cloudSync.migrationNote', 'When you enable cloud sync, you can migrate your existing local data to the cloud.')}
        </p>
      )}
    </div>
  );
}
