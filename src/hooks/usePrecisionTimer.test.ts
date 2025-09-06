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

  it('should accept onTick callback', () => {
    const mockOnTick = jest.fn();
    
    expect(() => {
      renderHook(() =>
        usePrecisionTimer({ 
          isRunning: true, 
          startTime: 0, 
          onTick: mockOnTick 
        })
      );
    }).not.toThrow();
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
      
      // Should start correctly
      expect(result.current.getCurrentTime()).toBeGreaterThanOrEqual(0);

      // Stop timer
      rerender({ isRunning: false });
      
      // Should stop correctly
      const stoppedTime = result.current.getCurrentTime();
      expect(typeof stoppedTime).toBe('number');
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