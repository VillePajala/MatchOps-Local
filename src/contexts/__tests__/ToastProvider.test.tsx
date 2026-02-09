import React from 'react';
import { render, fireEvent, screen, act } from '@testing-library/react';
import { ToastProvider, useToast } from '../ToastProvider';

const TestComponent = () => {
  const { showToast } = useToast();
  return (
    <>
      <button onClick={() => showToast('Saved!', 'success')}>Success</button>
      <button onClick={() => showToast('Error!', 'error')}>Error</button>
    </>
  );
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
