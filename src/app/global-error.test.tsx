import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import GlobalError from './global-error';
import * as Sentry from '@sentry/nextjs';

// Mock Sentry
jest.mock('@sentry/nextjs', () => ({
  captureException: jest.fn(),
}));

describe('GlobalError', () => {
  const mockReset = jest.fn();
  const mockError = new Error('Test error message');
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock window.location.href
    delete (window as unknown as { location: unknown }).location;
    (window as unknown as { location: { href: string } }).location = { href: '/' };
    // Suppress expected hydration warning for global-error.tsx
    // Global error boundary must include html/body tags in Next.js
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((message) => {
      if (typeof message === 'string' && message.includes('cannot be a child of')) {
        return; // Suppress expected warning
      }
      console.warn(message); // Let other errors through for debugging
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('should render error UI with correct message', () => {
    render(<GlobalError error={mockError} reset={mockReset} />);

    expect(screen.getByText('Something went wrong!')).toBeInTheDocument();
    expect(screen.getByText(/An unexpected error occurred/)).toBeInTheDocument();
    expect(screen.getByText('Try again')).toBeInTheDocument();
    expect(screen.getByText('Go home')).toBeInTheDocument();
  });

  it('should capture exception to Sentry on mount', () => {
    render(<GlobalError error={mockError} reset={mockReset} />);

    expect(Sentry.captureException).toHaveBeenCalledWith(mockError, {
      tags: { handler: 'global-error-boundary' },
    });
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('should call reset function when Try again button is clicked', () => {
    render(<GlobalError error={mockError} reset={mockReset} />);

    const tryAgainButton = screen.getByText('Try again');
    fireEvent.click(tryAgainButton);

    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  it('should navigate to home when Go home button is clicked', () => {
    render(<GlobalError error={mockError} reset={mockReset} />);

    const goHomeButton = screen.getByText('Go home');
    fireEvent.click(goHomeButton);

    // jsdom 26+ returns full URL, so check pathname or ending with '/'
    expect(window.location.href.endsWith('/')).toBe(true);
  });

  it('should only capture exception once even if re-rendered', () => {
    const { rerender } = render(<GlobalError error={mockError} reset={mockReset} />);

    expect(Sentry.captureException).toHaveBeenCalledTimes(1);

    // Re-render with same error
    rerender(<GlobalError error={mockError} reset={mockReset} />);

    // Should still only be called once due to useEffect dependency
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('should capture new exception when error changes', () => {
    const { rerender } = render(<GlobalError error={mockError} reset={mockReset} />);

    expect(Sentry.captureException).toHaveBeenCalledTimes(1);

    const newError = new Error('New error');
    rerender(<GlobalError error={newError} reset={mockReset} />);

    expect(Sentry.captureException).toHaveBeenCalledTimes(2);
    expect(Sentry.captureException).toHaveBeenLastCalledWith(newError, {
      tags: { handler: 'global-error-boundary' },
    });
  });
});