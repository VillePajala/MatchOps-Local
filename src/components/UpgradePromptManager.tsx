'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { usePremiumContext } from '@/contexts/PremiumContext';
import { ResourceType } from '@/config/premiumLimits';
import UpgradePromptModal from './UpgradePromptModal';

/**
 * Manages the upgrade prompt modal state and connects it to PremiumContext
 *
 * This component:
 * 1. Registers a handler with PremiumContext for showing the upgrade prompt
 * 2. Manages the modal open/close state
 * 3. Tracks which resource triggered the limit
 *
 * Place this component inside PremiumProvider in the component tree.
 */
const UpgradePromptManager: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { setUpgradePromptHandler } = usePremiumContext();
  const [isOpen, setIsOpen] = useState(false);
  const [triggeredResource, setTriggeredResource] = useState<ResourceType | undefined>();
  const [triggeredCount, setTriggeredCount] = useState<number | undefined>();

  const handleShowUpgradePrompt = useCallback((resource?: ResourceType, currentCount?: number) => {
    setTriggeredResource(resource);
    setTriggeredCount(currentCount);
    setIsOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setTriggeredResource(undefined);
    setTriggeredCount(undefined);
  }, []);

  // Register the handler on mount
  useEffect(() => {
    setUpgradePromptHandler(handleShowUpgradePrompt);
  }, [setUpgradePromptHandler, handleShowUpgradePrompt]);

  return (
    <>
      {children}
      <UpgradePromptModal
        isOpen={isOpen}
        onClose={handleClose}
        resource={triggeredResource}
        currentCount={triggeredCount}
      />
    </>
  );
};

export default UpgradePromptManager;
