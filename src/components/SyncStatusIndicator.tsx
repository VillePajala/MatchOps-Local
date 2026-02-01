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
import { useModalContext } from '@/contexts/ModalProvider';

interface SyncStatusIndicatorProps {
  /** Optional click handler for opening sync details */
  onClick?: () => void;
  /** Size variant: 'normal' (40px) or 'small' (24px) */
  size?: 'normal' | 'small';
  /** Style variant: 'standalone' (colored bg) or 'field' (matches field action buttons) */
  variant?: 'standalone' | 'field';
}

/**
 * Compact fixed-width sync status indicator for the PlayerBar or field overlay
 */
export const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({ onClick, size = 'normal', variant = 'standalone' }) => {
  const isSmall = size === 'small';
  const isField = variant === 'field';
  // Field variant uses fixed icon size (w-5 h-5) to match other field buttons
  const containerClass = isField ? 'p-2' : (isSmall ? 'w-6 h-6' : 'w-10 h-10');
  const iconClass = isField ? 'w-5 h-5' : (isSmall ? 'w-4 h-4' : 'w-6 h-6');
  const smallIconClass = isField ? 'w-5 h-5' : (isSmall ? 'w-3 h-3' : 'w-5 h-5');
  const badgeIconClass = isSmall ? 'w-2 h-2' : 'w-3 h-3';
  const { t } = useTranslation();
  const { mode, state, pendingCount, failedCount, isPaused } = useSyncStatus();
  const subscription = useSubscriptionOptional();
  const { openSettingsToTab } = useModalContext();

  // Default click handler opens Settings modal to Account tab
  const handleClick = onClick ?? (() => openSettingsToTab('account'));

  // Check subscription status for cloud mode
  const subscriptionLoading = !subscription || subscription.isLoading;
  const hasSubscription = subscription?.isActive ?? false;

  // Field variant base styles (matches rules/screenshot buttons)
  const fieldBaseClass = 'bg-slate-700/80 hover:bg-slate-600 rounded-lg shadow-lg backdrop-blur-sm focus:ring-2 focus:ring-yellow-400 focus:outline-none';

  // Local mode: just phone icon
  if (mode === 'local') {
    const localContainerClass = isField
      ? `flex items-center justify-center ${containerClass} ${fieldBaseClass} transition-colors cursor-pointer`
      : `flex items-center justify-center ${containerClass} rounded-md border transition-colors bg-slate-600/30 border-slate-500/40 hover:opacity-80 cursor-pointer`;

    return (
      <button
        type="button"
        onClick={handleClick}
        className={localContainerClass}
        title={t('syncStatus.localTitle', 'Data stored locally on device')}
        aria-label={t('syncStatus.localTitle', 'Data stored locally on device')}
      >
        <HiOutlineDevicePhoneMobile className={`${iconClass} ${isField ? 'text-slate-300' : 'text-slate-400'}`} />
      </button>
    );
  }

  // Cloud mode without subscription: show paused state (subscription required)
  // Don't show confusing pending/error counts when sync is effectively disabled
  if (!subscriptionLoading && !hasSubscription) {
    const pausedContainerClass = isField
      ? `flex items-center justify-center ${containerClass} ${fieldBaseClass} transition-colors cursor-pointer`
      : `flex items-center justify-center ${containerClass} rounded-md border transition-colors bg-amber-500/20 border-amber-500/40 hover:opacity-80 cursor-pointer`;

    return (
      <button
        type="button"
        onClick={handleClick}
        className={pausedContainerClass}
        title={t('syncStatus.pausedTitle', 'Sync paused - subscription required')}
        aria-label={t('syncStatus.pausedTitle', 'Sync paused - subscription required')}
      >
        <HiOutlinePause className={`${iconClass} text-amber-400`} />
      </button>
    );
  }

  // Cloud mode with user-initiated pause: show paused state with pending count
  if (isPaused) {
    const pausedContainerClass = isField
      ? `flex items-center justify-center ${containerClass} ${fieldBaseClass} transition-colors cursor-pointer`
      : `flex items-center justify-center ${containerClass} rounded-md border transition-colors bg-amber-500/20 border-amber-500/40 hover:opacity-80 cursor-pointer`;

    const pauseTitle = pendingCount > 0
      ? t('syncStatus.pausedWithPending', 'Sync paused - {{count}} changes waiting', { count: pendingCount })
      : t('syncStatus.pausedByUser', 'Sync paused');

    return (
      <button
        type="button"
        onClick={handleClick}
        className={pausedContainerClass}
        title={pauseTitle}
        aria-label={pauseTitle}
      >
        <HiOutlinePause className={`${iconClass} text-amber-400`} />
        {/* Show pending count badge if there are pending operations */}
        {!isField && pendingCount > 0 && (
          <span className="text-[10px] font-bold leading-none text-amber-400">
            {pendingCount}
          </span>
        )}
      </button>
    );
  }

  // Cloud mode: icon with status below
  const getCloudConfig = () => {
    switch (state) {
      case 'synced':
        return {
          icon: <HiOutlineCloud className={`${smallIconClass} text-green-400`} />,
          badge: <HiCheck className={badgeIconClass} />,
          badgeClass: 'text-green-400',
          statusText: null,
          bgClass: 'bg-green-500/20 border-green-500/40',
          title: t('syncStatus.syncedTitle', 'All data synced to cloud'),
        };

      case 'syncing':
        return {
          icon: <HiOutlineArrowPath className={`${smallIconClass} text-sky-400 animate-spin`} />,
          badge: null,
          badgeClass: '',
          statusText: null,
          bgClass: 'bg-sky-500/20 border-sky-500/40',
          title: t('syncStatus.syncingTitle', 'Syncing data to cloud...'),
        };

      case 'pending':
        return {
          icon: <HiOutlineCloud className={`${smallIconClass} text-amber-400`} />,
          badge: pendingCount > 0 ? pendingCount : null,
          badgeClass: 'text-amber-400',
          statusText: null,
          bgClass: 'bg-amber-500/20 border-amber-500/40',
          title: t('syncStatus.pendingTitle', '{{count}} changes waiting to sync', { count: pendingCount }),
        };

      case 'error':
        return {
          icon: <HiOutlineExclamationCircle className={`${smallIconClass} text-red-400`} />,
          badge: failedCount > 0 ? failedCount : '!',
          badgeClass: 'text-red-400',
          statusText: null,
          bgClass: 'bg-red-500/20 border-red-500/40',
          title: t('syncStatus.errorTitle', '{{count}} operations failed - tap to retry', { count: failedCount }),
        };

      case 'offline':
        return {
          icon: <HiOutlineSignalSlash className={`${smallIconClass} text-slate-400`} />,
          badge: null,
          badgeClass: '',
          statusText: null,
          bgClass: 'bg-slate-600/30 border-slate-500/40',
          title: t('syncStatus.offlineTitle', 'No internet connection - changes will sync when online'),
        };

      default:
        return {
          icon: <HiOutlineCloud className={`${smallIconClass} text-sky-400`} />,
          badge: null,
          badgeClass: '',
          statusText: null,
          bgClass: 'bg-sky-500/20 border-sky-500/40',
          title: t('syncStatus.cloudTitle', 'Data syncs to cloud'),
        };
    }
  };

  const config = getCloudConfig();

  const badgeTextClass = isSmall ? 'text-[8px]' : 'text-[10px]';

  // Field variant: unified background, colored icons only
  const cloudContainerClass = isField
    ? `relative flex items-center justify-center ${containerClass} ${fieldBaseClass} transition-colors cursor-pointer`
    : `relative flex flex-col items-center justify-center ${containerClass} rounded-md border transition-colors ${config.bgClass} hover:opacity-80 cursor-pointer`;

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cloudContainerClass}
      title={config.title}
      aria-label={config.title}
    >
      {config.icon}
      {/* Badge below icon: checkmark, count, or nothing (standalone variant only) */}
      {!isField && config.badge !== null && (
        <span className={`${badgeTextClass} font-bold leading-none ${config.badgeClass}`}>
          {config.badge}
        </span>
      )}
    </button>
  );
};

export default SyncStatusIndicator;
