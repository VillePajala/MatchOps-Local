import { renderHook } from '@testing-library/react';
import { usePrecisionTimer, useTimerRestore } from './usePrecisionTimer';

describe('usePrecisionTimer', () => {
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