'use client';

/**
 * Sync Status Indicator Component
 *
 * Shows the current sync status in the PlayerBar.
 * - Local mode: Shows device icon with "Local" label
 * - Cloud mode: Shows cloud icon with sync status (synced, syncing, pending, error, offline)
 *
 * @see docs/03-active-plans/local-first-sync-plan.md
 */

import React from 'react';
import {
  HiOutlineCloud,
  HiOutlineDevicePhoneMobile,
  HiOutlineExclamationCircle,
  HiOutlineArrowPath,
  HiOutlineSignal,
  HiOutlineSignalSlash,
} from 'react-icons/hi2';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import { useTranslation } from 'react-i18next';

interface SyncStatusIndicatorProps {
  /** Optional click handler for opening sync details */
  onClick?: () => void;
}

/**
 * Compact sync status indicator for the PlayerBar
 */
export const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({ onClick }) => {
  const { t } = useTranslation();
  const { mode, state, pendingCount, failedCount, isOnline } = useSyncStatus();

  // Determine icon and styling based on state
  const getStatusConfig = () => {
    if (mode === 'local') {
      return {
        icon: <HiOutlineDevicePhoneMobile className="w-5 h-5 text-slate-400" />,
        label: t('syncStatus.local', 'Local'),
        bgClass: 'bg-slate-600/30 border-slate-500/40',
        textClass: 'text-slate-300',
        title: t('syncStatus.localTitle', 'Data stored locally on device'),
      };
    }

    switch (state) {
      case 'synced':
        return {
          icon: <HiOutlineCloud className="w-5 h-5 text-green-400" />,
          label: t('syncStatus.synced', 'Synced'),
          bgClass: 'bg-green-500/20 border-green-500/40',
          textClass: 'text-green-300',
          title: t('syncStatus.syncedTitle', 'All data synced to cloud'),
        };

      case 'syncing':
        return {
          icon: <HiOutlineArrowPath className="w-5 h-5 text-sky-400 animate-spin" />,
          label: t('syncStatus.syncing', 'Syncing'),
          bgClass: 'bg-sky-500/20 border-sky-500/40',
          textClass: 'text-sky-300',
          title: t('syncStatus.syncingTitle', 'Syncing data to cloud...'),
        };

      case 'pending':
        return {
          icon: <HiOutlineCloud className="w-5 h-5 text-amber-400" />,
          label: pendingCount > 0
            ? t('syncStatus.pendingCount', '{{count}} pending', { count: pendingCount })
            : t('syncStatus.pending', 'Pending'),
          bgClass: 'bg-amber-500/20 border-amber-500/40',
          textClass: 'text-amber-300',
          title: t('syncStatus.pendingTitle', '{{count}} changes waiting to sync', { count: pendingCount }),
        };

      case 'error':
        return {
          icon: <HiOutlineExclamationCircle className="w-5 h-5 text-red-400" />,
          label: failedCount > 0
            ? t('syncStatus.errorCount', '{{count}} failed', { count: failedCount })
            : t('syncStatus.error', 'Error'),
          bgClass: 'bg-red-500/20 border-red-500/40',
          textClass: 'text-red-300',
          title: t('syncStatus.errorTitle', '{{count}} operations failed - tap to retry', { count: failedCount }),
        };

      case 'offline':
        return {
          icon: <HiOutlineSignalSlash className="w-5 h-5 text-slate-400" />,
          label: t('syncStatus.offline', 'Offline'),
          bgClass: 'bg-slate-600/30 border-slate-500/40',
          textClass: 'text-slate-300',
          title: t('syncStatus.offlineTitle', 'No internet connection - changes will sync when online'),
        };

      default:
        return {
          icon: <HiOutlineCloud className="w-5 h-5 text-sky-400" />,
          label: t('syncStatus.cloud', 'Cloud'),
          bgClass: 'bg-sky-500/20 border-sky-500/40',
          textClass: 'text-sky-300',
          title: t('syncStatus.cloudTitle', 'Data syncs to cloud'),
        };
    }
  };

  const config = getStatusConfig();

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2 py-1 rounded-md border transition-colors ${config.bgClass} ${
        onClick ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'
      }`}
      title={config.title}
      aria-label={config.title}
    >
      {config.icon}
      <span className={`text-xs font-medium ${config.textClass}`}>
        {config.label}
      </span>
      {/* Show online indicator for cloud mode when not synced */}
      {mode === 'cloud' && state !== 'synced' && state !== 'offline' && isOnline && (
        <HiOutlineSignal className="w-3 h-3 text-green-400 ml-0.5" title={t('syncStatus.online', 'Online')} />
      )}
    </button>
  );
};

export default SyncStatusIndicator;
