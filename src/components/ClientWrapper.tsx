'use client';

import React from 'react';
import { ToastProvider } from '@/contexts/ToastProvider';

const ClientWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <ToastProvider>
      {children}
    </ToastProvider>
  );
};

export default ClientWrapper; 