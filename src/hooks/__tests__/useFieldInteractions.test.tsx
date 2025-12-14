/**
 * Tests for useFieldInteractions hook
 * @critical - Manages drawing mode state persistence
 *
 * Tests cover:
 * - Initial state loading from IndexedDB
 * - Drawing mode toggle functionality
 * - Persistence to IndexedDB on change
 * - State resync on visibility change (app resume)
 * - Rollback on persistence failure
 * - Event listener cleanup
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useFieldInteractions } from '../useFieldInteractions';

// Mock appSettings
const mockGetDrawingModeEnabled = jest.fn();
const mockSaveDrawingModeEnabled = jest.fn();

jest.mock('@/utils/appSettings', () => ({
  getDrawingModeEnabled: () => mockGetDrawingModeEnabled(),
  saveDrawingModeEnabled: (value: boolean) => mockSaveDrawingModeEnabled(value),
}));

describe('useFieldInteractions', () => {
  // Store original document.hidden descriptor
  const originalHiddenDescriptor = Object.getOwnPropertyDescriptor(
    document,
    'hidden'
  );

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDrawingModeEnabled.mockResolvedValue(false);
    mockSaveDrawingModeEnabled.mockResolvedValue(true);

    // Reset document.hidden to false
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    });
  });

  afterEach(() => {
    // Restore original document.hidden
    if (originalHiddenDescriptor) {
      Object.defineProperty(document, 'hidden', originalHiddenDescriptor);
    }
  });

  /**
   * Tests initial state loading
   * @critical
   */
  it('should load initial drawing mode from IndexedDB on mount', async () => {
    mockGetDrawingModeEnabled.mockResolvedValue(true);

    const { result } = renderHook(() => useFieldInteractions());

    await waitFor(() => {
      expect(result.current.isDrawingEnabled).toBe(true);
    });

    expect(mockGetDrawingModeEnabled).toHaveBeenCalled();
  });

  /**
   * Tests toggle functionality
   * @critical
   */
  it('should toggle drawing mode', async () => {
    const { result } = renderHook(() => useFieldInteractions());

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.isDrawingEnabled).toBe(false);
    });

    act(() => {
      result.current.toggleDrawingMode();
    });

    expect(result.current.isDrawingEnabled).toBe(true);
  });

  /**
   * Tests enable/disable functions
   * @integration
   */
  it('should enable and disable drawing mode', async () => {
    const { result } = renderHook(() => useFieldInteractions());

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.isDrawingEnabled).toBe(false);
    });

    act(() => {
      result.current.enableDrawingMode();
    });

    expect(result.current.isDrawingEnabled).toBe(true);

    act(() => {
      result.current.disableDrawingMode();
    });

    expect(result.current.isDrawingEnabled).toBe(false);
  });

  /**
   * Tests persistence to IndexedDB
   * @critical
   */
  it('should persist drawing mode change to IndexedDB', async () => {
    const { result } = renderHook(() => useFieldInteractions());

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.isDrawingEnabled).toBe(false);
    });

    act(() => {
      result.current.toggleDrawingMode();
    });

    // Wait for persistence
    await waitFor(() => {
      expect(mockSaveDrawingModeEnabled).toHaveBeenCalledWith(true);
    });
  });

  /**
   * Tests rollback on persistence failure
   * @edge-case
   */
  it('should rollback on persistence failure', async () => {
    const onPersistError = jest.fn();
    mockSaveDrawingModeEnabled.mockResolvedValue(false); // Simulate failure

    const { result } = renderHook(() =>
      useFieldInteractions({ onPersistError })
    );

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.isDrawingEnabled).toBe(false);
    });

    act(() => {
      result.current.toggleDrawingMode();
    });

    // Should initially change to true
    expect(result.current.isDrawingEnabled).toBe(true);

    // Wait for rollback after persistence failure
    await waitFor(() => {
      expect(result.current.isDrawingEnabled).toBe(false);
    });

    expect(onPersistError).toHaveBeenCalled();
  });

  /**
   * Tests state resync on visibility change (app resume)
   * @critical - Addresses stale state after bfcache restoration
   */
  it('should resync drawing mode from IndexedDB when app resumes', async () => {
    // Initial value is false
    mockGetDrawingModeEnabled.mockResolvedValue(false);

    const { result } = renderHook(() => useFieldInteractions());

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.isDrawingEnabled).toBe(false);
    });

    // Simulate external change while app was in background
    mockGetDrawingModeEnabled.mockResolvedValue(true);

    // Simulate returning from background
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // State should resync with IndexedDB
    await waitFor(() => {
      expect(result.current.isDrawingEnabled).toBe(true);
    });
  });

  /**
   * Tests that going to background doesn't trigger resync
   * @edge-case
   */
  it('should NOT resync when going to background', async () => {
    mockGetDrawingModeEnabled.mockResolvedValue(false);

    const { result } = renderHook(() => useFieldInteractions());

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.isDrawingEnabled).toBe(false);
    });

    // Reset mock call count after initial load
    mockGetDrawingModeEnabled.mockClear();

    // Simulate going to background
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => true,
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Wait a bit for any potential async calls
    await new Promise((resolve) => setTimeout(resolve, 50));

    // getDrawingModeEnabled should NOT be called when going to background
    expect(mockGetDrawingModeEnabled).not.toHaveBeenCalled();
  });

  /**
   * Tests event listener cleanup on unmount
   * @critical - Prevents memory leaks
   */
  it('should cleanup event listeners on unmount', () => {
    const removeEventListenerSpy = jest.spyOn(document, 'removeEventListener');

    const { unmount } = renderHook(() => useFieldInteractions());

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function)
    );

    removeEventListenerSpy.mockRestore();
  });

  /**
   * Tests that visibility change listener is added on mount
   * @integration
   */
  it('should add visibilitychange listener on mount', () => {
    const addEventListenerSpy = jest.spyOn(document, 'addEventListener');

    renderHook(() => useFieldInteractions());

    expect(addEventListenerSpy).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function)
    );

    addEventListenerSpy.mockRestore();
  });

  /**
   * Tests previousValueRef is updated on resync
   * @integration
   */
  it('should update previousValueRef after resync', async () => {
    // Start with false
    mockGetDrawingModeEnabled.mockResolvedValue(false);
    mockSaveDrawingModeEnabled.mockResolvedValue(true);

    const { result } = renderHook(() => useFieldInteractions());

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.isDrawingEnabled).toBe(false);
    });

    // Resync with true
    mockGetDrawingModeEnabled.mockResolvedValue(true);

    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => {
      expect(result.current.isDrawingEnabled).toBe(true);
    });

    // Toggle back to false
    mockSaveDrawingModeEnabled.mockClear();
    act(() => {
      result.current.toggleDrawingMode();
    });

    // Should persist false (not true, which was the new previous value)
    await waitFor(() => {
      expect(mockSaveDrawingModeEnabled).toHaveBeenCalledWith(false);
    });
  });

  /**
   * Tests initial persistence is skipped (avoids redundant write)
   * @edge-case
   *
   * Note: This test uses false for both initial state and stored value to ensure
   * no state change occurs that would trigger the persistence effect.
   */
  it('should skip initial persistence on mount when stored value matches initial state', async () => {
    // Use false (matching the initial useState(false)) to avoid triggering persistence
    mockGetDrawingModeEnabled.mockResolvedValue(false);

    renderHook(() => useFieldInteractions());

    // Wait for initial load
    await waitFor(() => {
      expect(mockGetDrawingModeEnabled).toHaveBeenCalled();
    });

    // Wait a bit for any potential async persistence calls
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Should not persist on initial load (value just loaded from storage)
    expect(mockSaveDrawingModeEnabled).not.toHaveBeenCalled();
  });
});
