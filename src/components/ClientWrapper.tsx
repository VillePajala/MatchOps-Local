'use client';

import React from 'react';
import { ToastProvider } from '@/contexts/ToastProvider';
import { PremiumProvider } from '@/contexts/PremiumContext';
import UpgradePromptManager from './UpgradePromptManager';

const ClientWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <ToastProvider>
      <PremiumProvider>
        <UpgradePromptManager>
          {children}
        </UpgradePromptManager>
      </PremiumProvider>
    </ToastProvider>
  );
};

export default ClientWrapper; 