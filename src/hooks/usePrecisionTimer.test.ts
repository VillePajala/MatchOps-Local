import { renderHook, act } from '@testing-library/react';
import { usePrecisionTimer, useTimerRestore } from './usePrecisionTimer';

describe('usePrecisionTimer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(performance, 'now').mockReturnValue(0);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('should initialize and provide getCurrentTime function', () => {
    const mockOnTick = jest.fn();
    
    const { result } = renderHook(() =>
      usePrecisionTimer({ 
        isRunning: false, 
        startTime: 0, 
        onTick: mockOnTick 
      })
    );

    // Should provide getCurrentTime function
    expect(typeof result.current.getCurrentTime).toBe('function');
    
    // Should return a number when called
    const currentTime = result.current.getCurrentTime();
    expect(typeof currentTime).toBe('number');
    expect(currentTime).toBeGreaterThanOrEqual(0);
  });

  it('should handle different start times', () => {
    const mockOnTick = jest.fn();
    
    const { result } = renderHook(() =>
      usePrecisionTimer({ 
        isRunning: false, 
        startTime: 10, 
        onTick: mockOnTick 
      })
    );

    const currentTime = result.current.getCurrentTime();
    
    // Should return at least the start time
    expect(currentTime).toBeGreaterThanOrEqual(10);
  });

  it('should accept onTick callback and call it when timer ticks', () => {
    const mockOnTick = jest.fn();

    renderHook(() =>
      usePrecisionTimer({
        isRunning: true,
        startTime: 0,
        onTick: mockOnTick
      })
    );

    // Simulate 1.5 seconds passing (cross a second boundary to trigger onTick)
    jest.spyOn(performance, 'now').mockReturnValue(1500);
    act(() => {
      jest.advanceTimersByTime(150); // Advance past at least one interval tick (default 100ms)
    });

    // onTick should have been called when crossing the 0→1 second boundary
    expect(mockOnTick).toHaveBeenCalledWith(1);
  });

  describe('Timer Precision and Accuracy', () => {
    it('should use performance.now for timing calculations', () => {
      const mockOnTick = jest.fn();
      const performanceNowSpy = jest.spyOn(performance, 'now');
      
      renderHook(() =>
        usePrecisionTimer({ 
          isRunning: true, 
          startTime: 0, 
          onTick: mockOnTick,
          interval: 100
        })
      );

      // Verify performance.now is called for precision timing
      expect(performanceNowSpy).toHaveBeenCalled();
      
      performanceNowSpy.mockRestore();
    });

    it('should reset timer correctly', () => {
      const mockOnTick = jest.fn();
      
      const { result } = renderHook(() =>
        usePrecisionTimer({ 
          isRunning: false, 
          startTime: 10, 
          onTick: mockOnTick 
        })
      );

      // Reset to 0
      act(() => {
        result.current.reset(0);
      });

      expect(result.current.getCurrentTime()).toBe(0);
      expect(mockOnTick).toHaveBeenCalledWith(0);

      // Reset to different time
      act(() => {
        result.current.reset(15);
      });

      expect(result.current.getCurrentTime()).toBe(15);
      expect(mockOnTick).toHaveBeenLastCalledWith(15);
    });

    it('should handle start and stop correctly', () => {
      const mockOnTick = jest.fn();

      const { result, rerender } = renderHook(
        ({ isRunning }) => usePrecisionTimer({
          isRunning,
          startTime: 0,
          onTick: mockOnTick
        }),
        { initialProps: { isRunning: false } }
      );

      // Should not be running initially
      expect(result.current.getCurrentTime()).toBe(0);

      // Start timer
      rerender({ isRunning: true });

      // Simulate 2.5 seconds of wall-clock time passing
      jest.spyOn(performance, 'now').mockReturnValue(2500);
      act(() => {
        jest.advanceTimersByTime(200); // Advance to trigger interval ticks
      });

      // Timer should report elapsed time > 0 after advancing
      expect(result.current.getCurrentTime()).toBeGreaterThan(0);

      // Stop timer
      rerender({ isRunning: false });

      // Record the stopped time
      const stoppedTime = result.current.getCurrentTime();
      expect(stoppedTime).toBeGreaterThanOrEqual(0);

      // Simulate more wall-clock time passing after stop
      jest.spyOn(performance, 'now').mockReturnValue(5000);
      act(() => {
        jest.advanceTimersByTime(200);
      });

      // Time should NOT advance further after stop
      expect(result.current.getCurrentTime()).toBe(stoppedTime);
    });

    it('should clean up on unmount', () => {
      const mockOnTick = jest.fn();
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      
      const { unmount } = renderHook(() =>
        usePrecisionTimer({ 
          isRunning: true, 
          startTime: 0, 
          onTick: mockOnTick 
        })
      );

      expect(setIntervalSpy).toHaveBeenCalled();

      unmount();

      expect(clearIntervalSpy).toHaveBeenCalled();
      
      setIntervalSpy.mockRestore();
      clearIntervalSpy.mockRestore();
    });
  });
});

describe('useTimerRestore', () => {
  it('should provide handleVisibilityChange function', () => {
    const { result } = renderHook(() =>
      useTimerRestore()
    );

    expect(typeof result.current.handleVisibilityChange).toBe('function');
  });

  it('should handle visibility change without errors', () => {
    const { result } = renderHook(() =>
      useTimerRestore()
    );

    const mockOnRestore = jest.fn();
    
    // Should not throw when calling handleVisibilityChange
    expect(() => {
      result.current.handleVisibilityChange(
        Date.now() - 5000, // 5 seconds ago
        10, // was at 10 seconds
        mockOnRestore
      );
    }).not.toThrow();

    // Should call the restore callback
    expect(mockOnRestore).toHaveBeenCalled();
  });
});