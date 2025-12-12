import React from 'react';
import { render, screen } from '@testing-library/react';
import ErrorBoundary from '../ErrorBoundary';

// Component that throws an error
const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <div>No error</div>;
};

// Mock console.error to avoid cluttering test output
const originalError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});
afterAll(() => {
  console.error = originalError;
});

describe('ErrorBoundary', () => {
  it('should render children when there is no error', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );

    expect(screen.getByText('No error')).toBeInTheDocument();
  });

  it('should render fallback UI when there is an error', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByText(/an unexpected error occurred/i)).toBeInTheDocument();
  });

  it('should display custom fallback UI when provided', () => {
    const customFallback = <div>Custom error message</div>;
    
    render(
      <ErrorBoundary fallback={customFallback}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Custom error message')).toBeInTheDocument();
  });

  it('should show error details in development mode', () => {
    const originalEnv = process.env.NODE_ENV;
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'development',
      configurable: true,
    });

    render(
      <ErrorBoundary showErrorDetails={true}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getAllByText(/test error/i)[0]).toBeInTheDocument();
    
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: originalEnv,
      configurable: true,
    });
  });

  it('should call onError callback when error occurs', () => {
    const onError = jest.fn();

    render(
      <ErrorBoundary onError={onError}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(onError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        componentStack: expect.any(String)
      })
    );
  });

  it('should reset error state when children change', () => {
    const { rerender } = render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    // Error boundary should show fallback
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();

    // Re-render with different children (simulates route change or prop change)
    rerender(
      <ErrorBoundary>
        <div key="new">New content</div>
      </ErrorBoundary>
    );

    // Should reset and show new content
    expect(screen.getByText('New content')).toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  /**
   * Tests auto-recovery on app visibility change (Android TWA resume fix)
   * @critical
   */
  it('should auto-recover from error when app becomes visible', async () => {
    // Store original document.hidden descriptor
    const originalHiddenDescriptor = Object.getOwnPropertyDescriptor(
      document,
      'hidden'
    );

    // Start with document visible
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    });

    const { rerender } = render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    // Error boundary should show fallback
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();

    // Simulate visibility change (app returning from background)
    // First simulate going to background (document.hidden = true)
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event('visibilitychange'));

    // Then simulate returning to foreground (document.hidden = false)
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    });
    document.dispatchEvent(new Event('visibilitychange'));

    // Re-render with non-throwing component to see if recovery worked
    rerender(
      <ErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );

    // Should have recovered and show normal content
    expect(screen.getByText('No error')).toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();

    // Restore original document.hidden
    if (originalHiddenDescriptor) {
      Object.defineProperty(document, 'hidden', originalHiddenDescriptor);
    }
  });

  /**
   * Tests max recovery limit to prevent infinite loops
   * @critical
   */
  it('should stop auto-recovering after max attempts', async () => {
    const originalHiddenDescriptor = Object.getOwnPropertyDescriptor(
      document,
      'hidden'
    );

    // Suppress expected warning about max recovery attempts
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    });

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    // Error boundary should show fallback
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();

    // Simulate multiple visibility changes (exceeding max recoveries of 3)
    for (let i = 0; i < 4; i++) {
      // Go to background
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => true,
      });
      document.dispatchEvent(new Event('visibilitychange'));

      // Return to foreground
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => false,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    }

    // After 4 attempts (exceeding max of 3), should stay in error state
    // Note: The component will still show error state because ThrowError keeps throwing
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();

    // Verify the warning was called (max recoveries exceeded)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Max auto-recovery attempts reached')
    );

    warnSpy.mockRestore();

    if (originalHiddenDescriptor) {
      Object.defineProperty(document, 'hidden', originalHiddenDescriptor);
    }
  });

  /**
   * Tests cleanup of event listeners on unmount
   * @critical - Prevents memory leaks
   */
  it('should cleanup visibility change listener on unmount', () => {
    const removeEventListenerSpy = jest.spyOn(document, 'removeEventListener');

    const { unmount } = render(
      <ErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function)
    );

    removeEventListenerSpy.mockRestore();
  });
});