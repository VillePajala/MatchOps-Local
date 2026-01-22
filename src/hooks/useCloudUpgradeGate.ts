'use client';

import { useState, useCallback } from 'react';
import { usePremium } from './usePremium';

/**
 * Hook for gating cloud actions behind premium.
 *
 * When user tries to enable cloud sync without premium:
 * 1. Shows upgrade modal
 * 2. If user upgrades, executes the pending action
 * 3. If user cancels, the action is not executed
 *
 * @example
 * ```tsx
 * const { showModal, gateCloudAction, handleUpgradeSuccess, handleCancel } = useCloudUpgradeGate();
 *
 * const handleEnableCloud = () => {
 *   gateCloudAction(() => {
 *     enableCloudMode();
 *     window.location.reload();
 *   });
 * };
 *
 * return (
 *   <>
 *     <button onClick={handleEnableCloud}>Enable Cloud</button>
 *     <UpgradePromptModal
 *       isOpen={showModal}
 *       onClose={handleCancel}
 *       variant="cloudUpgrade"
 *       onUpgradeSuccess={handleUpgradeSuccess}
 *     />
 *   </>
 * );
 * ```
 */
export function useCloudUpgradeGate() {
  const { isPremium } = usePremium();
  const [showModal, setShowModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  /**
   * Gate a cloud action behind premium.
   * If user is premium, executes immediately.
   * If not premium, shows upgrade modal and stores action for later.
   */
  const gateCloudAction = useCallback(
    (action: () => void) => {
      if (isPremium) {
        action();
      } else {
        // Store the action to execute after successful upgrade
        // Note: Using function form to prevent React from calling the action immediately
        setPendingAction(() => action);
        setShowModal(true);
      }
    },
    [isPremium]
  );

  /**
   * Called after successful upgrade.
   * Executes the pending action and closes the modal.
   */
  const handleUpgradeSuccess = useCallback(() => {
    setShowModal(false);
    pendingAction?.();
    setPendingAction(null);
  }, [pendingAction]);

  /**
   * Called when user cancels/closes the modal.
   * Clears the pending action.
   */
  const handleCancel = useCallback(() => {
    setShowModal(false);
    setPendingAction(null);
  }, []);

  return {
    /** Whether the upgrade modal should be shown */
    showModal,
    /** Gate a cloud action - shows modal if not premium */
    gateCloudAction,
    /** Handle successful upgrade - executes pending action */
    handleUpgradeSuccess,
    /** Handle modal close/cancel - clears pending action */
    handleCancel,
  };
}
