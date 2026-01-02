'use client';

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Query client configured for local-first IndexedDB usage.
 *
 * Unlike server APIs, local storage:
 * - Doesn't change from external sources (no need for refetchOnWindowFocus)
 * - Errors won't self-heal with retries (IndexedDB failures are persistent)
 * - Data is stable once loaded (longer staleTime is appropriate)
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Limited retries: IndexedDB errors are typically persistent
      // (quota exceeded, corruption, private mode restrictions)
      retry: 1,

      // No refetch on window focus: local data doesn't change externally
      refetchOnWindowFocus: false,

      // 5 minute stale time: local data is stable, reduce unnecessary re-reads
      // Individual queries can override with shorter times if needed
      staleTime: 5 * 60 * 1000,

      // Keep unused data in cache for 10 minutes before garbage collection
      gcTime: 10 * 60 * 1000,
    },
    mutations: {
      // Mutations should not retry by default - let the UI handle errors
      retry: false,
    },
  },
});

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