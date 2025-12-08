'use client';

import React from 'react';
import { ToastProvider } from '@/contexts/ToastProvider';
import { PremiumProvider } from '@/contexts/PremiumContext';

const ClientWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <ToastProvider>
      <PremiumProvider>
        {children}
      </PremiumProvider>
    </ToastProvider>
  );
};

export default ClientWrapper; 