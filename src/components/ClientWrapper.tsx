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
          {/* The app root the full-height CSS targets (globals.css, review 10.9). */}
          <div id="app-root">{children}</div>
        </UpgradePromptManager>
      </PremiumProvider>
    </ToastProvider>
  );
};

export default ClientWrapper; 