import React from 'react';
import { render, fireEvent, screen, act } from '@testing-library/react';
import { ToastProvider, useToast } from '../ToastProvider';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback ?? _key }),
}));

const TestComponent = () => {
  const { showToast } = useToast();
  return (
    <>
      <button onClick={() => showToast('Saved!', 'success')}>Success</button>
      <button onClick={() => showToast('Error!', 'error')}>Error</button>
    </>
  );
};

/** Helper that exposes showToast with configurable message/type */
const FlexibleTestComponent = ({ onMount }: { onMount: (showToast: (msg: string, type?: 'success' | 'error' | 'info') => void) => void }) => {
  const { showToast } = useToast();
  React.useEffect(() => { onMount(showToast); }, [onMount, showToast]);
  return null;
};

test('showToast displays and hides a toast message', () => {
  jest.useFakeTimers();
  try {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Success'));
    expect(screen.getByText('Saved!').closest('[role="status"]')).toHaveClass('bg-green-600');

    fireEvent.click(screen.getByText('Error'));
    expect(screen.getByText('Error!').closest('[role="alert"]')).toHaveClass('bg-red-600');

    // Success toast disappears after 3s
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(screen.queryByText('Saved!')).not.toBeInTheDocument();

    // Error toast stays longer (5s total), still visible at 3s
    expect(screen.getByText('Error!')).toBeInTheDocument();

    // Error toast disappears after remaining 2s (5s total)
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.queryByText('Error!')).not.toBeInTheDocument();
  } finally {
    jest.useRealTimers();
  }
});

test('deduplicates identical message+type toasts', () => {
  jest.useFakeTimers();
  try {
    let showToastFn!: (msg: string, type?: 'success' | 'error' | 'info') => void;
    const onMount = jest.fn((fn: typeof showToastFn) => { showToastFn = fn; });

    render(
      <ToastProvider>
        <FlexibleTestComponent onMount={onMount} />
      </ToastProvider>
    );

    // Show same toast twice
    act(() => {
      showToastFn('Duplicate message', 'error');
    });
    act(() => {
      showToastFn('Duplicate message', 'error');
    });

    // Only one toast should be visible
    const toasts = screen.getAllByText('Duplicate message');
    expect(toasts).toHaveLength(1);

    // Different type with same message should show separately
    act(() => {
      showToastFn('Duplicate message', 'success');
    });
    const allToasts = screen.getAllByText('Duplicate message');
    expect(allToasts).toHaveLength(2);
  } finally {
    jest.useRealTimers();
  }
});

test('caps visible toasts at 5, dropping oldest', () => {
  jest.useFakeTimers();
  try {
    let showToastFn!: (msg: string, type?: 'success' | 'error' | 'info') => void;
    const onMount = jest.fn((fn: typeof showToastFn) => { showToastFn = fn; });

    render(
      <ToastProvider>
        <FlexibleTestComponent onMount={onMount} />
      </ToastProvider>
    );

    // Show 7 distinct toasts rapidly
    for (let i = 1; i <= 7; i++) {
      act(() => {
        showToastFn(`Toast ${i}`, 'info');
      });
    }

    // Only 5 should be visible (the most recent 5)
    const log = screen.getByRole('log');
    const visibleToasts = log.querySelectorAll('[role="status"]');
    expect(visibleToasts).toHaveLength(5);

    // Oldest 2 should be dropped
    expect(screen.queryByText('Toast 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Toast 2')).not.toBeInTheDocument();

    // Most recent 5 should be visible
    for (let i = 3; i <= 7; i++) {
      expect(screen.getByText(`Toast ${i}`)).toBeInTheDocument();
    }
  } finally {
    jest.useRealTimers();
  }
});

test('dismiss button removes toast', () => {
  jest.useFakeTimers();
  try {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Success'));
    expect(screen.getByText('Saved!')).toBeInTheDocument();

    // Click the dismiss button
    const dismissBtn = screen.getByLabelText('Dismiss');
    fireEvent.click(dismissBtn);
    expect(screen.queryByText('Saved!')).not.toBeInTheDocument();
  } finally {
    jest.useRealTimers();
  }
});

test('useToast throws when used outside ToastProvider', () => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  const BadComponent = () => {
    useToast();
    return null;
  };

  expect(() => render(<BadComponent />)).toThrow('useToast must be used within ToastProvider');
  spy.mockRestore();
});
