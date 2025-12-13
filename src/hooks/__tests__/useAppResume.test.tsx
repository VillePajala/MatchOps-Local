/**
 * Tests for useAppResume hook
 * @critical - Addresses blank screen bug on Android TWA resume
 *
 * Tests cover:
 * - visibilitychange event handling
 * - pageshow event handling (bfcache restoration)
 * - pagehide event handling (iOS Safari bfcache entry)
 * - Rapid pageshow debouncing (iOS Safari gesture navigation)
 * - Background time threshold logic
 * - React Query cache invalidation
 * - Event listener cleanup
 */

import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useAppResume } from '../useAppResume';

// Mock logger
jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('useAppResume', () => {
  let queryClient: QueryClient;
  let originalDateNow: () => number;
  let mockNow: number;

  // Store original document.hidden descriptor
  const originalHiddenDescriptor = Object.getOwnPropertyDescriptor(
    document,
    'hidden'
  );

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    // Mock Date.now for controlling time
    originalDateNow = Date.now;
    mockNow = 1000000;
    Date.now = jest.fn(() => mockNow);

    // Reset document.hidden to false
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    });
  });

  afterEach(() => {
    Date.now = originalDateNow;

    // Restore original document.hidden
    if (originalHiddenDescriptor) {
      Object.defineProperty(document, 'hidden', originalHiddenDescriptor);
    }

    queryClient.clear();
  });

  /**
   * Tests critical workflow: app backgrounding → resume → state refresh
   * @critical
   */
  it('should trigger onResume after minBackgroundTime threshold', async () => {
    const onResume = jest.fn();
    const invalidateQueriesSpy = jest.spyOn(queryClient, 'invalidateQueries');

    renderHook(() => useAppResume({ onResume, minBackgroundTime: 30000 }), {
      wrapper,
    });

    // Simulate going to background
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => true,
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Advance time past threshold (31 seconds)
    mockNow += 31000;

    // Simulate returning to foreground
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(onResume).toHaveBeenCalledTimes(1);
    expect(invalidateQueriesSpy).toHaveBeenCalled();
  });

  /**
   * Tests edge case: rapid background/foreground switches
   * @edge-case
   */
  it('should NOT trigger onResume for quick background switches', async () => {
    const onResume = jest.fn();

    renderHook(() => useAppResume({ onResume, minBackgroundTime: 30000 }), {
      wrapper,
    });

    // Simulate going to background
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => true,
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Advance time only 5 seconds (below threshold)
    mockNow += 5000;

    // Simulate returning to foreground
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(onResume).not.toHaveBeenCalled();
  });

  /**
   * Tests bfcache restoration (Android TWA specific)
   * @critical
   */
  it('should trigger onResume on pageshow with persisted=true', async () => {
    const onResume = jest.fn();
    const invalidateQueriesSpy = jest.spyOn(queryClient, 'invalidateQueries');

    renderHook(() => useAppResume({ onResume }), { wrapper });

    // Simulate bfcache restoration (pageshow with persisted=true)
    const pageShowEvent = new PageTransitionEvent('pageshow', {
      persisted: true,
    });
    act(() => {
      window.dispatchEvent(pageShowEvent);
    });

    expect(onResume).toHaveBeenCalledTimes(1);
    expect(invalidateQueriesSpy).toHaveBeenCalled();
  });

  /**
   * Tests that non-bfcache pageshow doesn't trigger refresh
   * @edge-case
   */
  it('should NOT trigger onResume on pageshow with persisted=false', async () => {
    const onResume = jest.fn();

    renderHook(() => useAppResume({ onResume }), { wrapper });

    // Simulate normal page load (not from bfcache)
    const pageShowEvent = new PageTransitionEvent('pageshow', {
      persisted: false,
    });
    act(() => {
      window.dispatchEvent(pageShowEvent);
    });

    expect(onResume).not.toHaveBeenCalled();
  });

  /**
   * Tests debouncing of rapid pageshow events (iOS Safari gesture navigation)
   * @edge-case
   */
  it('should debounce multiple rapid pageshow events', async () => {
    const onResume = jest.fn();

    renderHook(() => useAppResume({ onResume }), { wrapper });

    // Simulate 3 rapid pageshow events (iOS Safari edge case)
    act(() => {
      window.dispatchEvent(
        new PageTransitionEvent('pageshow', { persisted: true })
      );
      window.dispatchEvent(
        new PageTransitionEvent('pageshow', { persisted: true })
      );
      window.dispatchEvent(
        new PageTransitionEvent('pageshow', { persisted: true })
      );
    });

    // Should only trigger once due to debounce
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  /**
   * Tests React Query cache invalidation on resume
   * @critical
   */
  it('should invalidate React Query cache on resume', async () => {
    const invalidateQueriesSpy = jest.spyOn(queryClient, 'invalidateQueries');

    renderHook(() => useAppResume({ minBackgroundTime: 30000 }), { wrapper });

    // Simulate background → foreground after threshold
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => true,
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    mockNow += 31000;

    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(invalidateQueriesSpy).toHaveBeenCalled();
  });

  /**
   * Tests event listener cleanup on unmount
   * @critical - Prevents memory leaks
   */
  it('should cleanup event listeners on unmount', async () => {
    const removeEventListenerSpy = jest.spyOn(document, 'removeEventListener');
    const windowRemoveEventListenerSpy = jest.spyOn(
      window,
      'removeEventListener'
    );

    const { unmount } = renderHook(() => useAppResume({}), { wrapper });

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function)
    );
    expect(windowRemoveEventListenerSpy).toHaveBeenCalledWith(
      'pageshow',
      expect.any(Function)
    );
    expect(windowRemoveEventListenerSpy).toHaveBeenCalledWith(
      'pagehide',
      expect.any(Function)
    );

    removeEventListenerSpy.mockRestore();
    windowRemoveEventListenerSpy.mockRestore();
  });

  /**
   * Tests custom minBackgroundTime configuration
   * @integration
   */
  it('should respect custom minBackgroundTime', async () => {
    const onResume = jest.fn();

    // Use very short threshold (1 second)
    renderHook(() => useAppResume({ onResume, minBackgroundTime: 1000 }), {
      wrapper,
    });

    // Go to background
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => true,
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Advance 2 seconds (above custom threshold)
    mockNow += 2000;

    // Return to foreground
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(onResume).toHaveBeenCalledTimes(1);
  });

  /**
   * Tests that onResume is optional
   * @edge-case
   */
  it('should work without onResume callback', async () => {
    const invalidateQueriesSpy = jest.spyOn(queryClient, 'invalidateQueries');

    // No onResume provided
    renderHook(() => useAppResume({ minBackgroundTime: 30000 }), { wrapper });

    // Simulate background → foreground after threshold
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => true,
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    mockNow += 31000;

    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Should still invalidate queries even without callback
    expect(invalidateQueriesSpy).toHaveBeenCalled();
  });

  /**
   * Tests default minBackgroundTime (30 seconds)
   * @integration
   */
  it('should use default 30 second threshold when not specified', async () => {
    const onResume = jest.fn();

    renderHook(() => useAppResume({ onResume }), { wrapper });

    // Go to background
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => true,
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // 29 seconds - just under default threshold
    mockNow += 29000;

    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(onResume).not.toHaveBeenCalled();

    // Go to background again
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => true,
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // 31 seconds - just over default threshold
    mockNow += 31000;

    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(onResume).toHaveBeenCalledTimes(1);
  });
});
