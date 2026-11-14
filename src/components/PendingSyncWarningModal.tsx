'use client';

/**
 * Pending Sync Warning Modal
 *
 * Shown when user tries to switch from cloud to local mode - or to sign out
 * (review 3.13) - while there are pending or failed sync operations. Gives the user
 * options to sync first, continue anyway, or cancel.
 *
 * @see docs/03-active-plans/local-first-sync-plan.md
 */

import React, { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineExclamationTriangle,
  HiOutlineArrowPath,
  HiOutlineXMark,
  HiOutlineCloudArrowUp,
  HiOutlineTrash,
} from 'react-icons/hi2';
import {
  primaryButtonStyle,
  secondaryButtonStyle,
  dangerButtonStyle,
  WizardBackdrop,
  wizardModalStyle,
  wizardHeaderStyle,
  wizardTitleStyle,
  wizardContentStyle,
  wizardCloseButtonStyle,
  warningBoxStyle,
} from '@/styles/modalStyles';
import { useFocusTrap } from '@/hooks/useFocusTrap';

export interface PendingSyncWarningModalProps {
  /** Number of pending sync operations */
  pendingCount: number;
  /** Number of failed sync operations */
  failedCount: number;
  /** Whether sync is currently in progress */
  isSyncing: boolean;
  /** Whether device is online */
  isOnline: boolean;
  /** Callback when user makes a choice ('discard' = continue anyway) */
  onAction: (action: 'sync' | 'discard' | 'cancel') => void;
  /**
   * What the user is about to do. 'signOut': the changes are NOT lost (they stay on
   * this device and are sent at the next sign-in here), so continuing is not a discard.
   */
  purpose?: 'switchToLocal' | 'signOut';
}

/**
 * Modal warning about pending syncs before switching to local mode
 */
const PendingSyncWarningModal: React.FC<PendingSyncWarningModalProps> = ({
  pendingCount,
  failedCount,
  isSyncing,
  isOnline,
  onAction,
  purpose = 'switchToLocal',
}) => {
  const isSignOut = purpose === 'signOut';
  const { t } = useTranslation();
  const modalRef = useRef<HTMLDivElement>(null);

  // Focus trap for accessibility
  useFocusTrap(modalRef, true);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSyncing) {
        onAction('cancel');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onAction is stable from useCallback in parent
  }, [isSyncing]);

  const totalUnsyncedCount = pendingCount + failedCount;
  const hasPending = pendingCount > 0;
  const hasFailed = failedCount > 0;

  return (
    <WizardBackdrop>
      <div
        ref={modalRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="pending-sync-warning-title"
        aria-describedby="pending-sync-warning-description"
        className={`${wizardModalStyle} max-w-md`}
      >
        {/* Header */}
        <div className={wizardHeaderStyle}>
          <h2 id="pending-sync-warning-title" className={wizardTitleStyle}>
            {t('cloudSync.pendingSync.title', 'Unsynced Changes')}
          </h2>
          {!isSyncing && (
            <button
              onClick={() => onAction('cancel')}
              className={wizardCloseButtonStyle}
              aria-label={t('common.close', 'Close')}
            >
              <HiOutlineXMark className="h-6 w-6" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className={wizardContentStyle}>
          {/* Warning Icon */}
          <div className="text-center mb-4">
            <HiOutlineExclamationTriangle className="h-12 w-12 text-amber-400 mx-auto" />
          </div>

          {/* Warning Message */}
          <div id="pending-sync-warning-description" className={`${warningBoxStyle} mb-6`}>
            <p className="text-amber-200 mb-3">
              {t(
                'cloudSync.pendingSync.warning',
                'You have {{count}} changes that haven\'t been synced to the cloud yet.',
                { count: totalUnsyncedCount }
              )}
            </p>

            {/* Breakdown of pending vs failed */}
            <ul className="text-sm text-amber-300 space-y-1 mb-3">
              {hasPending && (
                <li className="flex items-center gap-2">
                  <HiOutlineCloudArrowUp className="h-4 w-4" />
                  {t('cloudSync.pendingSync.pendingCount', '{{count}} pending changes', { count: pendingCount })}
                </li>
              )}
              {hasFailed && (
                <li className="flex items-center gap-2">
                  <HiOutlineExclamationTriangle className="h-4 w-4 text-red-400" />
                  {t('cloudSync.pendingSync.failedCount', '{{count}} failed to sync', { count: failedCount })}
                </li>
              )}
            </ul>

            <p className="text-amber-200 font-medium">
              {isSignOut
                ? t('cloudSync.pendingSync.signOutConsequence', 'If you sign out now, they stay on this device and are sent the next time you sign in here.')
                : t('cloudSync.pendingSync.consequence', 'Switching to local mode now will abandon these changes.')}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            {/* Sync First Button */}
            <button
              onClick={() => onAction('sync')}
              disabled={isSyncing || !isOnline}
              className={`${primaryButtonStyle} w-full flex items-center justify-center gap-2 py-3`}
              aria-busy={isSyncing}
            >
              <span aria-live="polite" className="flex items-center justify-center gap-2">
                {isSyncing ? (
                  <>
                    <HiOutlineArrowPath className="h-5 w-5 animate-spin" aria-hidden="true" />
                    {t('cloudSync.pendingSync.syncing', 'Syncing...')}
                  </>
                ) : (
                  <>
                    <HiOutlineCloudArrowUp className="h-5 w-5" aria-hidden="true" />
                    {t('cloudSync.pendingSync.syncFirst', 'Sync First')}
                  </>
                )}
              </span>
            </button>

            {/* Offline notice */}
            {!isOnline && (
              <p className="text-sm text-slate-400 text-center">
                {t('cloudSync.pendingSync.offlineNotice', 'Cannot sync while offline')}
              </p>
            )}

            {/* Continue anyway: discards on a mode switch; just signs out on sign-out */}
            {isSignOut ? (
              <button
                onClick={() => onAction('discard')}
                disabled={isSyncing}
                className={`${secondaryButtonStyle} w-full py-3`}
              >
                {t('cloudSync.pendingSync.signOutAnyway', 'Sign out anyway')}
              </button>
            ) : (
              <button
                onClick={() => onAction('discard')}
                disabled={isSyncing}
                className={`${dangerButtonStyle} w-full flex items-center justify-center gap-2 py-3 !bg-red-600/20 hover:!bg-red-600/30 !text-red-400`}
              >
                <HiOutlineTrash className="h-5 w-5" />
                {t('cloudSync.pendingSync.discardAndContinue', 'Discard & Continue')}
              </button>
            )}

            {/* Cancel Button */}
            <button
              onClick={() => onAction('cancel')}
              disabled={isSyncing}
              className={`${secondaryButtonStyle} w-full py-3`}
            >
              {t('common.cancel', 'Cancel')}
            </button>
          </div>
        </div>
      </div>
    </WizardBackdrop>
  );
};

export default PendingSyncWarningModal;
