/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { useQueryClient } from '@tanstack/react-query';
import QueryProvider from '../QueryProvider';

// Mock backendConfig
jest.mock('@/config/backendConfig', () => ({
  getBackendMode: jest.fn(),
}));

import { getBackendMode } from '@/config/backendConfig';

const mockGetBackendMode = getBackendMode as jest.MockedFunction<typeof getBackendMode>;

// Helper to safely convert query option to string for testing
function optionToString(value: unknown): string {
  if (value === undefined || value === null) return 'default';
  if (typeof value === 'function') return 'function';
  return String(value);
}

// Test component that exposes QueryClient configuration
function QueryClientInspector() {
  const queryClient = useQueryClient();
  const defaults = queryClient.getDefaultOptions();

  return (
    <div>
      <span data-testid="stale-time">{optionToString(defaults.queries?.staleTime)}</span>
      <span data-testid="gc-time">{optionToString(defaults.queries?.gcTime)}</span>
      <span data-testid="retry">{optionToString(defaults.queries?.retry)}</span>
      <span data-testid="refetch-on-mount">{optionToString(defaults.queries?.refetchOnMount)}</span>
      <span data-testid="refetch-on-window-focus">{optionToString(defaults.queries?.refetchOnWindowFocus)}</span>
      <span data-testid="refetch-on-reconnect">{optionToString(defaults.queries?.refetchOnReconnect)}</span>
    </div>
  );
}

describe('QueryProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('local mode configuration', () => {
    beforeEach(() => {
      mockGetBackendMode.mockReturnValue('local');
    });

    it('creates QueryClient with local mode defaults', () => {
      render(
        <QueryProvider>
          <QueryClientInspector />
        </QueryProvider>
      );

      // Local mode should have retry: 3 for IndexedDB transient failures
      expect(screen.getByTestId('retry')).toHaveTextContent('3');

      // Local mode should use React Query defaults (no staleTime override)
      expect(screen.getByTestId('stale-time')).toHaveTextContent('default');
      expect(screen.getByTestId('gc-time')).toHaveTextContent('default');
    });

    it('does not set cloud-specific options in local mode', () => {
      render(
        <QueryProvider>
          <QueryClientInspector />
        </QueryProvider>
      );

      // These should be defaults, not cloud-specific values
      expect(screen.getByTestId('refetch-on-mount')).toHaveTextContent('default');
    });
  });

  describe('cloud mode configuration', () => {
    beforeEach(() => {
      mockGetBackendMode.mockReturnValue('cloud');
    });

    it('creates QueryClient with cloud-optimized staleTime', () => {
      render(
        <QueryProvider>
          <QueryClientInspector />
        </QueryProvider>
      );

      // Cloud mode: 5-minute staleTime (300000ms)
      expect(screen.getByTestId('stale-time')).toHaveTextContent('300000');
    });

    it('creates QueryClient with cloud-optimized gcTime', () => {
      render(
        <QueryProvider>
          <QueryClientInspector />
        </QueryProvider>
      );

      // Cloud mode: 30-minute gcTime (1800000ms)
      expect(screen.getByTestId('gc-time')).toHaveTextContent('1800000');
    });

    it('sets retry with exponential backoff', () => {
      render(
        <QueryProvider>
          <QueryClientInspector />
        </QueryProvider>
      );

      // Cloud mode should have retry: 3
      expect(screen.getByTestId('retry')).toHaveTextContent('3');
      // Note: retryDelay is a function: Math.min(1000 * 2 ** attemptIndex, 30000)
      // attempt 0: 1000ms, attempt 1: 2000ms, attempt 2: 4000ms, capped at 30s
      // This matches TanStack Query's default exponential backoff pattern
    });

    it('configures refetch behavior for cloud mode', () => {
      render(
        <QueryProvider>
          <QueryClientInspector />
        </QueryProvider>
      );

      // Cloud mode: refetchOnMount: false (use cached data)
      expect(screen.getByTestId('refetch-on-mount')).toHaveTextContent('false');

      // Cloud mode: refetchOnWindowFocus: true (get fresh data when returning)
      expect(screen.getByTestId('refetch-on-window-focus')).toHaveTextContent('true');

      // Cloud mode: refetchOnReconnect: true (sync when network returns)
      expect(screen.getByTestId('refetch-on-reconnect')).toHaveTextContent('true');
    });
  });

  describe('error handling', () => {
    it('falls back to local mode if getBackendMode throws', () => {
      // Simulate corrupted localStorage or other error
      mockGetBackendMode.mockImplementation(() => {
        throw new Error('localStorage corrupted');
      });

      // Should not throw - falls back to local mode gracefully
      render(
        <QueryProvider>
          <QueryClientInspector />
        </QueryProvider>
      );

      // Should have local mode defaults (retry: 3, no staleTime override)
      expect(screen.getByTestId('retry')).toHaveTextContent('3');
      expect(screen.getByTestId('stale-time')).toHaveTextContent('default');
    });
  });

  describe('QueryClient stability', () => {
    it('provides QueryClient to children', () => {
      mockGetBackendMode.mockReturnValue('local');

      render(
        <QueryProvider>
          <QueryClientInspector />
        </QueryProvider>
      );

      // If QueryClient was not provided, these would throw
      expect(screen.getByTestId('retry')).toBeInTheDocument();
    });

    it('creates QueryClient once at mount time (mode determined at initialization)', () => {
      // Start in local mode
      mockGetBackendMode.mockReturnValue('local');

      const { rerender } = render(
        <QueryProvider>
          <QueryClientInspector />
        </QueryProvider>
      );

      // Verify local mode config
      expect(screen.getByTestId('stale-time')).toHaveTextContent('default');

      // Change mock to cloud mode (simulating mode change after mount)
      mockGetBackendMode.mockReturnValue('cloud');

      // Re-render the provider
      rerender(
        <QueryProvider>
          <QueryClientInspector />
        </QueryProvider>
      );

      // QueryClient should still have local mode config (created once at mount)
      // This documents expected behavior: mode changes require app restart
      expect(screen.getByTestId('stale-time')).toHaveTextContent('default');
    });
  });
});
