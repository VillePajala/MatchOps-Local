import { renderHook, act } from '@testing-library/react';
import { usePrecisionTimer, useTimerRestore } from './usePrecisionTimer';

// Mock performance.now
const mockPerformanceNow = jest.fn();
Object.defineProperty(global, 'performance', {
  writable: true,
  value: {
    now: mockPerformanceNow,
  },
});

// Mock requestAnimationFrame and cancelAnimationFrame
const mockRequestAnimationFrame = jest.fn();
const mockCancelAnimationFrame = jest.fn();
Object.defineProperty(global, 'requestAnimationFrame', {
  writable: true,
  value: mockRequestAnimationFrame,
});
Object.defineProperty(global, 'cancelAnimationFrame', {
  writable: true,
  value: mockCancelAnimationFrame,
});

describe('usePrecisionTimer', () => {
  let mockOnTick: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockOnTick = jest.fn();
    mockPerformanceNow.mockReturnValue(0);
    
    // Setup requestAnimationFrame to call the callback immediately
    mockRequestAnimationFrame.mockImplementation((callback: FrameRequestCallback) => {
      const id = Math.random();
      setTimeout(() => callback(0), 0);
      return id;
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  it('should start and stop timer correctly', () => {
    const { result } = renderHook(() =>
      usePrecisionTimer({
        onTick: mockOnTick,
        isRunning: false,
      })
    );

    // Timer should not be running initially
    expect(mockRequestAnimationFrame).not.toHaveBeenCalled();

    // Start timer
    act(() => {
      result.current.start();
    });

    expect(mockRequestAnimationFrame).toHaveBeenCalled();
  });

  it('should call onTick when crossing second boundaries', async () => {
    mockPerformanceNow
      .mockReturnValueOnce(0)    // Initial call
      .mockReturnValueOnce(500)  // 0.5 seconds - should not tick
      .mockReturnValueOnce(1000) // 1 second - should tick
      .mockReturnValueOnce(1999) // 1.999 seconds - should not tick again
      .mockReturnValueOnce(2000); // 2 seconds - should tick again

    const { rerender } = renderHook( // eslint-disable-line @typescript-eslint/no-unused-vars
      ({ isRunning }) =>
        usePrecisionTimer({
          onTick: mockOnTick,
          isRunning,
          startTime: 0,
        }),
      { initialProps: { isRunning: true } }
    );

    // Wait for initial setup
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    // Simulate time passing and RAF callbacks
    await act(async () => {
      // At 0.5 seconds - should not call onTick
      const rafCallback = mockRequestAnimationFrame.mock.calls[0][0];
      rafCallback(500);
      
      // At 1 second - should call onTick with 1
      rafCallback(1000);
      
      // At 1.999 seconds - should not call onTick again
      rafCallback(1999);
      
      // At 2 seconds - should call onTick with 2
      rafCallback(2000);
    });

    // Should have been called twice - at 1 second and 2 seconds
    expect(mockOnTick).toHaveBeenCalledWith(1);
    expect(mockOnTick).toHaveBeenCalledWith(2);
  });

  it('should handle startTime correctly', async () => {
    const startTime = 10;
    mockPerformanceNow
      .mockReturnValueOnce(0)    // Timer start
      .mockReturnValueOnce(1000); // 1 second later

    renderHook(() =>
      usePrecisionTimer({
        onTick: mockOnTick,
        isRunning: true,
        startTime,
      })
    );

    await act(async () => {
      const rafCallback = mockRequestAnimationFrame.mock.calls[0][0];
      rafCallback(1000);
    });

    // Should call with startTime + elapsed (10 + 1 = 11)
    expect(mockOnTick).toHaveBeenCalledWith(11);
  });

  it('should provide accurate getCurrentTime', () => {
    mockPerformanceNow
      .mockReturnValueOnce(0)    // Timer start
      .mockReturnValueOnce(1500); // Current time call

    const { result } = renderHook(() =>
      usePrecisionTimer({
        onTick: mockOnTick,
        isRunning: true,
        startTime: 5,
      })
    );

    const currentTime = result.current.getCurrentTime();
    
    // Should be startTime + elapsed (5 + 1.5 = 6.5)
    expect(currentTime).toBe(6.5);
  });

  it('should reset timer correctly', () => {
    const { result } = renderHook(() =>
      usePrecisionTimer({
        onTick: mockOnTick,
        isRunning: true,
        startTime: 5,
      })
    );

    act(() => {
      result.current.reset(10);
    });

    // Should stop current timer and reset to new start time
    expect(mockCancelAnimationFrame).toHaveBeenCalled();
    
    // getCurrentTime should return the new start time when stopped
    const currentTime = result.current.getCurrentTime();
    expect(currentTime).toBe(10);
  });

  it('should cleanup on unmount', () => {
    const { unmount } = renderHook(() =>
      usePrecisionTimer({
        onTick: mockOnTick,
        isRunning: true,
      })
    );

    unmount();

    expect(mockCancelAnimationFrame).toHaveBeenCalled();
  });
});

describe('useTimerRestore', () => {
  it('should calculate correct restored time', () => {
    const { result } = renderHook(() => useTimerRestore());
    const mockOnRestore = jest.fn();
    
    const savedTimestamp = 1000;
    const currentElapsed = 30;
    const now = 3000; // 2 seconds later
    
    // Mock Date.now
    const originalDateNow = Date.now;
    Date.now = jest.fn(() => now);
    
    // Mock document.hidden
    Object.defineProperty(document, 'hidden', {
      writable: true,
      value: false,
    });

    act(() => {
      result.current.handleVisibilityChange(
        savedTimestamp,
        currentElapsed,
        mockOnRestore
      );
    });

    // Should restore to currentElapsed + timeDifference
    // 30 + ((3000 - 1000) / 1000) = 30 + 2 = 32
    expect(mockOnRestore).toHaveBeenCalledWith(32);
    
    // Cleanup
    Date.now = originalDateNow;
  });

  it('should not restore when document is hidden', () => {
    const { result } = renderHook(() => useTimerRestore());
    const mockOnRestore = jest.fn();
    
    // Mock document.hidden
    Object.defineProperty(document, 'hidden', {
      writable: true,
      value: true,
    });

    act(() => {
      result.current.handleVisibilityChange(
        1000,
        30,
        mockOnRestore
      );
    });

    expect(mockOnRestore).not.toHaveBeenCalled();
  });
});