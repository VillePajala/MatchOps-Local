'use client';

import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getBackendMode } from '@/config/backendConfig';

// Time constants for cloud mode configuration
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const MAX_RETRY_DELAY_MS = 30_000;

/**
 * Create a QueryClient with mode-specific configuration.
 *
 * **Local mode** (IndexedDB):
 * - Uses React Query defaults with retry: 3
 * - Important for mobile: IndexedDB has transient failures that require retries
 * - No staleTime optimization needed (reads are fast, always fresh)
 *
 * **Cloud mode** (Supabase):
 * - 5-minute staleTime: Reduces network requests, data stays fresh in memory
 * - 30-minute gcTime: Keeps unused data available for faster subsequent loads
 * - Exponential backoff retries: Handles network hiccups gracefully
 * - refetchOnMount: false - Use cached data, don't refetch on every mount
 * - refetchOnWindowFocus: true - Get fresh data when user returns to tab
 * - refetchOnReconnect: true - Sync when network reconnects
 *
 * After initial load in cloud mode:
 * - All reads come from in-memory cache
 * - All writes use optimistic updates (cache → UI → network background)
 * - Network never blocks the UI
 *
 * @returns QueryClient configured for current backend mode
 */
function createQueryClient(): QueryClient {
  // Determine mode with fallback to 'local' if detection fails
  // This ensures the app always starts, even with corrupted localStorage
  let mode: 'local' | 'cloud' = 'local';
  try {
    mode = getBackendMode();
  } catch {
    // If mode detection fails (e.g., corrupted localStorage), default to local
    // This is a safety net - getBackendMode already has internal error handling
  }

  if (mode === 'cloud') {
    return new QueryClient({
      defaultOptions: {
        queries: {
          // Keep data fresh for 5 minutes
          staleTime: FIVE_MINUTES_MS,

          // Keep unused data for 30 minutes
          gcTime: THIRTY_MINUTES_MS,

          // Retry 3 times with exponential backoff
          retry: 3,
          retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, MAX_RETRY_DELAY_MS),

          // Show cached data while refetching
          refetchOnWindowFocus: true,
          refetchOnMount: false,
          refetchOnReconnect: true,
        },
      },
    });
  }

  // Local mode: current defaults (unchanged behavior)
  // retry: 3 is critical for IndexedDB transient failures on mobile
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 3,
      },
    },
  });
}

interface QueryProviderProps {
  children: React.ReactNode;
}

/**
 * React Query provider with mode-specific configuration.
 *
 * Creates QueryClient once on initial render using useState initializer.
 * This ensures the client persists across re-renders and mode is determined
 * at component mount time.
 *
 * @see docs/03-active-plans/supabase-implementation-guide.md Section 7
 */
export default function QueryProvider({ children }: QueryProviderProps) {
  // Use useState initializer to create QueryClient once
  // This ensures stable client reference and avoids recreation on re-renders
  const [queryClient] = useState(() => createQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
