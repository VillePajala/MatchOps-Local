'use client';

import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { usePremiumContext } from '@/contexts/PremiumContext';
import { ResourceType } from '@/config/premiumLimits';
import UpgradePromptModal from './UpgradePromptModal';
import logger from '@/utils/logger';

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
    logger.debug('UpgradePromptManager handler called', { resource, currentCount });
    setTriggeredResource(resource);
    setTriggeredCount(currentCount);
    setIsOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setTriggeredResource(undefined);
    setTriggeredCount(undefined);
  }, []);

  // Use ref to avoid re-registering handler on every render
  const handleShowUpgradePromptRef = useRef(handleShowUpgradePrompt);
  useLayoutEffect(() => {
    handleShowUpgradePromptRef.current = handleShowUpgradePrompt;
  }, [handleShowUpgradePrompt]);

  // Register the handler once on mount (ref ensures latest callback is used)
  useEffect(() => {
    logger.debug('UpgradePromptManager registering handler');
    setUpgradePromptHandler((resource, count) => handleShowUpgradePromptRef.current(resource, count));
  }, [setUpgradePromptHandler]);

  logger.debug('UpgradePromptManager render', { isOpen, triggeredResource, triggeredCount });

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
