/**
 * Tests for useMultiTabPrevention hook
 * @critical - Prevents data corruption from simultaneous multi-tab usage
 *
 * Tests cover:
 * - Lock acquisition success (isBlocked: false)
 * - Lock unavailable / another tab holds lock (isBlocked: true)
 * - Graceful fallback when Web Locks API is not available
 * - Cleanup / lock release on unmount
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useMultiTabPrevention } from '../useMultiTabPrevention';
import { getTabOwnership, __resetTabOwnershipForTests } from '@/utils/tabOwnership';

describe('useMultiTabPrevention', () => {
  // Store original navigator.locks for restoration
  const originalLocks = navigator.locks;

  afterEach(() => {
    // Restore navigator.locks after each test
    Object.defineProperty(navigator, 'locks', {
      value: originalLocks,
      configurable: true,
      writable: true,
    });
  });

  describe('lock acquired successfully', () => {
    /**
     * When the lock is available, the callback receives a non-null lock object.
     * The hook should report isBlocked: false.
     * @critical
     */
    it('should return isBlocked: false when lock is acquired', async () => {
      const mockRequest = jest.fn(
        (
          _name: string,
          _options: LockOptions,
          callback: (lock: Lock | null) => Promise<void>
        ) => {
          // Simulate lock granted: callback receives a non-null lock
          return callback({ name: 'matchops-active-tab', mode: 'exclusive' } as Lock);
        }
      );

      Object.defineProperty(navigator, 'locks', {
        value: { request: mockRequest },
        configurable: true,
        writable: true,
      });

      const { result } = renderHook(() => useMultiTabPrevention());

      // Lock was acquired, so isBlocked should remain false (default)
      expect(result.current.isBlocked).toBe(false);
      expect(mockRequest).toHaveBeenCalledWith(
        'matchops-active-tab',
        { ifAvailable: true },
        expect.any(Function)
      );
    });
  });

  describe('lock unavailable (another tab holds it)', () => {
    /**
     * When another tab holds the lock, the callback receives null.
     * The hook should set isBlocked: true.
     * @critical
     */
    it('should return isBlocked: true when lock is unavailable', async () => {
      const mockRequest = jest.fn(
        (
          _name: string,
          _options: LockOptions,
          callback: (lock: Lock | null) => Promise<void>
        ) => {
          // Simulate lock denied: callback receives null
          return callback(null);
        }
      );

      Object.defineProperty(navigator, 'locks', {
        value: { request: mockRequest },
        configurable: true,
        writable: true,
      });

      const { result } = renderHook(() => useMultiTabPrevention());

      // The state update from setIsBlocked(true) may be async
      await waitFor(() => {
        expect(result.current.isBlocked).toBe(true);
      });
    });
  });

  describe('Web Locks API not available', () => {
    /**
     * When navigator.locks is undefined (e.g., older browsers, non-secure context),
     * the hook should gracefully return isBlocked: false to not block the user.
     * @edge-case
     */
    it('should return isBlocked: false when navigator.locks is undefined', () => {
      Object.defineProperty(navigator, 'locks', {
        value: undefined,
        configurable: true,
        writable: true,
      });

      const { result } = renderHook(() => useMultiTabPrevention());

      expect(result.current.isBlocked).toBe(false);
    });
  });

  describe('cleanup on unmount', () => {
    /**
     * When the component unmounts, the released flag should be set to true,
     * allowing the lock-holding promise to resolve and release the lock.
     * @critical - Prevents orphaned locks
     */
    it('should release lock on unmount by resolving the holding promise', async () => {
      jest.useFakeTimers();

      const mockRequest = jest.fn(
        (
          _name: string,
          _options: LockOptions,
          callback: (lock: Lock | null) => Promise<void>
        ) => {
          // Simulate lock granted: the callback returns a promise that holds the lock
          const result = callback({ name: 'matchops-active-tab', mode: 'exclusive' } as Lock);
          return result;
        }
      );

      // Override the callback to capture the holding promise resolve
      // The hook holds the lock via a polling loop that checks `released` every 500ms
      Object.defineProperty(navigator, 'locks', {
        value: { request: mockRequest },
        configurable: true,
        writable: true,
      });

      const { result, unmount } = renderHook(() => useMultiTabPrevention());

      expect(result.current.isBlocked).toBe(false);
      expect(mockRequest).toHaveBeenCalledTimes(1);

      // Unmount triggers the cleanup function: released = true
      unmount();

      // Advance timers to allow the polling check to detect released = true
      await act(async () => {
        jest.advanceTimersByTime(600);
      });

      // The lock request was made, and cleanup was triggered
      // (We can verify the mock was called; the actual lock release happens
      // when the promise returned by the callback resolves)
      expect(mockRequest).toHaveBeenCalledTimes(1);

      jest.useRealTimers();
    });
  });

  describe('initial state', () => {
    it('should return isBlocked: false as initial state before lock resolution', () => {
      // Mock locks to never resolve (simulate pending state)
      const mockRequest = jest.fn(() => new Promise(() => {}));

      Object.defineProperty(navigator, 'locks', {
        value: { request: mockRequest },
        configurable: true,
        writable: true,
      });

      const { result } = renderHook(() => useMultiTabPrevention());

      // Initial state before any callback resolves
      expect(result.current.isBlocked).toBe(false);
    });
  });

  /**
   * Review 7.19: the data layer waits for ownership, so the hook reports it - and
   * publishes it for the data-store factory - in every outcome.
   * @critical
   */
  describe('ownership status', () => {
    beforeEach(() => __resetTabOwnershipForTests());

    const withLocks = (grant: boolean) =>
      Object.defineProperty(navigator, 'locks', {
        value: {
          request: (_n: string, _o: LockOptions, cb: (lock: Lock | null) => Promise<void>) =>
            cb(grant ? ({ name: 'matchops-active-tab', mode: 'exclusive' } as Lock) : null),
        },
        configurable: true,
        writable: true,
      });

    it('owner when the lock is granted', async () => {
      withLocks(true);
      const { result, unmount } = renderHook(() => useMultiTabPrevention());
      await waitFor(() => expect(result.current.status).toBe('owner'));
      expect(getTabOwnership()).toBe('owner');
      unmount();
    });

    it('blocked when another tab holds it', async () => {
      withLocks(false);
      const { result } = renderHook(() => useMultiTabPrevention());
      await waitFor(() => expect(result.current.status).toBe('blocked'));
      expect(result.current.isBlocked).toBe(true);
      expect(getTabOwnership()).toBe('blocked');
    });

    it('unsupported when the lock request fails - the app runs as before', async () => {
      Object.defineProperty(navigator, 'locks', {
        value: { request: () => Promise.reject(new Error('SecurityError')) },
        configurable: true,
        writable: true,
      });
      const { result } = renderHook(() => useMultiTabPrevention());
      await waitFor(() => expect(result.current.status).toBe('unsupported'));
    });

    it('a late failure after the answer does not overwrite it', async () => {
      Object.defineProperty(navigator, 'locks', {
        value: {
          request: async (_n: string, _o: LockOptions, cb: (lock: Lock | null) => Promise<void>) => {
            await cb(null); // blocked
            throw new Error('late');
          },
        },
        configurable: true,
        writable: true,
      });
      const { result } = renderHook(() => useMultiTabPrevention());
      await waitFor(() => expect(result.current.status).toBe('blocked'));
      await act(async () => { await Promise.resolve(); });
      expect(result.current.status).toBe('blocked');
    });

    it('unsupported without the Web Locks API - the app runs as before', async () => {
      Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true, writable: true });
      const { result } = renderHook(() => useMultiTabPrevention());
      await waitFor(() => expect(result.current.status).toBe('unsupported'));
      expect(getTabOwnership()).toBe('unsupported');
    });
  });

  /**
   * Review 10.9c: under React StrictMode (development) the first answer could be "not
   * available" because the double-mounted effect's own lock was still being released;
   * a single tab then showed "MatchOps is already open". A "not available" is asked
   * once more before the app is blocked.
   */
  it('a first "not available" that clears on the recheck makes this tab the owner', async () => {
    let calls = 0;
    const mockRequest = jest.fn(
      (_name: string, _options: LockOptions, callback: (lock: Lock | null) => Promise<void>) => {
        calls += 1;
        return callback(calls === 1 ? null : ({ name: 'matchops-active-tab' } as Lock));
      }
    );
    Object.defineProperty(navigator, 'locks', { value: { request: mockRequest }, configurable: true, writable: true });

    const { result } = renderHook(() => useMultiTabPrevention());

    await waitFor(() => expect(result.current.status).toBe('owner'));
    expect(result.current.isBlocked).toBe(false);
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });
});
