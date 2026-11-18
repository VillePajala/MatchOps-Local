import React from 'react';
import { render, screen } from '@testing-library/react';
import { LoadingScreen } from './LoadingScreen';

describe('LoadingScreen', () => {
  /** @critical the splash continuation: badge + announced status */
  it('renders the splash badge and announces the message', () => {
    const { container } = render(<LoadingScreen message="Ladataan..." />);
    expect(screen.getByRole('status')).toHaveTextContent('Ladataan...');
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', '/icons/icon-512x512.png');
    expect(img).toHaveAttribute('alt', '');
    expect(screen.getByText('Ladataan...')).not.toHaveClass('sr-only');
  });

  it('keeps a hidden message available to screen readers only', () => {
    render(<LoadingScreen message="Loading..." hideMessage />);
    expect(screen.getByText('Loading...')).toHaveClass('sr-only');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  /** @edge-case the exit overlay must never block or be announced */
  it('becomes a non-interactive, hidden overlay while exiting', () => {
    render(<LoadingScreen exiting />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    const root = screen.getByTestId('loading-screen');
    expect(root).toHaveClass('pointer-events-none', 'loading-screen--exit');
    expect(root).toHaveAttribute('aria-hidden', 'true');
  });
});
