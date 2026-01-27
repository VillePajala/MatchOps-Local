'use client';

/**
 * Sync Status Indicator Component
 *
 * Shows the current sync status in the PlayerBar with fixed width.
 * - Local mode: Phone icon only (no text)
 * - Cloud mode: Cloud icon with small status text below
 * - Cloud mode without subscription: Paused icon (sync disabled)
 *
 * Fixed width prevents layout shift when status changes.
 *
 * @see docs/03-active-plans/local-first-sync-plan.md
 */

import React from 'react';
import {
  HiOutlineCloud,
  HiOutlineDevicePhoneMobile,
  HiOutlineExclamationCircle,
  HiOutlineArrowPath,
  HiOutlineSignalSlash,
  HiOutlinePause,
  HiCheck,
} from 'react-icons/hi2';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import { useSubscriptionOptional } from '@/contexts/SubscriptionContext';
import { useTranslation } from 'react-i18next';

interface SyncStatusIndicatorProps {
  /** Optional click handler for opening sync details */
  onClick?: () => void;
}

/**
 * Compact fixed-width sync status indicator for the PlayerBar
 */
export const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({ onClick }) => {
  const { t } = useTranslation();
  const { mode, state, pendingCount, failedCount } = useSyncStatus();
  const subscription = useSubscriptionOptional();

  // Check subscription status for cloud mode
  const subscriptionLoading = !subscription || subscription.isLoading;
  const hasSubscription = subscription?.isActive ?? false;

  // Local mode: just phone icon
  if (mode === 'local') {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`flex items-center justify-center w-10 h-10 rounded-md border transition-colors bg-slate-600/30 border-slate-500/40 ${
          onClick ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'
        }`}
        title={t('syncStatus.localTitle', 'Data stored locally on device')}
        aria-label={t('syncStatus.localTitle', 'Data stored locally on device')}
      >
        <HiOutlineDevicePhoneMobile className="w-6 h-6 text-slate-400" />
      </button>
    );
  }

  // Cloud mode without subscription: show paused state
  // Don't show confusing pending/error counts when sync is effectively disabled
  if (!subscriptionLoading && !hasSubscription) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`flex items-center justify-center w-10 h-10 rounded-md border transition-colors bg-amber-500/20 border-amber-500/40 ${
          onClick ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'
        }`}
        title={t('syncStatus.pausedTitle', 'Sync paused - subscription required')}
        aria-label={t('syncStatus.pausedTitle', 'Sync paused - subscription required')}
      >
        <HiOutlinePause className="w-6 h-6 text-amber-400" />
      </button>
    );
  }

  // Cloud mode: icon with status below
  const getCloudConfig = () => {
    switch (state) {
      case 'synced':
        return {
          icon: <HiOutlineCloud className="w-5 h-5 text-green-400" />,
          badge: <HiCheck className="w-3 h-3" />,
          badgeClass: 'text-green-400',
          statusText: null,
          bgClass: 'bg-green-500/20 border-green-500/40',
          title: t('syncStatus.syncedTitle', 'All data synced to cloud'),
        };

      case 'syncing':
        return {
          icon: <HiOutlineArrowPath className="w-5 h-5 text-sky-400 animate-spin" />,
          badge: null,
          badgeClass: '',
          statusText: null,
          bgClass: 'bg-sky-500/20 border-sky-500/40',
          title: t('syncStatus.syncingTitle', 'Syncing data to cloud...'),
        };

      case 'pending':
        return {
          icon: <HiOutlineCloud className="w-5 h-5 text-amber-400" />,
          badge: pendingCount > 0 ? pendingCount : null,
          badgeClass: 'text-amber-400',
          statusText: null,
          bgClass: 'bg-amber-500/20 border-amber-500/40',
          title: t('syncStatus.pendingTitle', '{{count}} changes waiting to sync', { count: pendingCount }),
        };

      case 'error':
        return {
          icon: <HiOutlineExclamationCircle className="w-5 h-5 text-red-400" />,
          badge: failedCount > 0 ? failedCount : '!',
          badgeClass: 'text-red-400',
          statusText: null,
          bgClass: 'bg-red-500/20 border-red-500/40',
          title: t('syncStatus.errorTitle', '{{count}} operations failed - tap to retry', { count: failedCount }),
        };

      case 'offline':
        return {
          icon: <HiOutlineSignalSlash className="w-5 h-5 text-slate-400" />,
          badge: null,
          badgeClass: '',
          statusText: null,
          bgClass: 'bg-slate-600/30 border-slate-500/40',
          title: t('syncStatus.offlineTitle', 'No internet connection - changes will sync when online'),
        };

      default:
        return {
          icon: <HiOutlineCloud className="w-5 h-5 text-sky-400" />,
          badge: null,
          badgeClass: '',
          statusText: null,
          bgClass: 'bg-sky-500/20 border-sky-500/40',
          title: t('syncStatus.cloudTitle', 'Data syncs to cloud'),
        };
    }
  };

  const config = getCloudConfig();

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col items-center justify-center w-10 h-10 rounded-md border transition-colors ${config.bgClass} ${
        onClick ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'
      }`}
      title={config.title}
      aria-label={config.title}
    >
      {config.icon}
      {/* Badge below icon: checkmark, count, or nothing */}
      {config.badge !== null && (
        <span className={`text-[10px] font-bold leading-none ${config.badgeClass}`}>
          {config.badge}
        </span>
      )}
    </button>
  );
};

export default SyncStatusIndicator;
