'use client';

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Query client with default settings.
 *
 * Uses React Query defaults which are well-tested:
 * - retry: 3 (handles transient failures, important on mobile)
 * - refetchOnWindowFocus: true (ensures fresh data)
 * - staleTime: 0 (always refetch)
 */
const queryClient = new QueryClient();

interface QueryProviderProps {
  children: React.ReactNode;
}

export default function QueryProvider({ children }: QueryProviderProps) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
} 