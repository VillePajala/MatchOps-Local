import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../i18n.test';
import ScheduledSubBanner from '../ScheduledSubBanner';
import type { ScheduledSub } from '@/types/game';

const samplePrompt: ScheduledSub = {
  id: 'sub_1',
  timeSeconds: 600,
  outPlayer: 'p1',
  inPlayer: 'p2',
  positionRole: 'CDM',
  status: 'pending',
};

const renderBanner = (props: Partial<React.ComponentProps<typeof ScheduledSubBanner>> = {}) => {
  const finalProps = {
    prompt: samplePrompt,
    onApply: jest.fn(),
    onSkip: jest.fn(),
    ...props,
  };
  return {
    ...render(
      <I18nextProvider i18n={i18n}>
        <ScheduledSubBanner {...finalProps} />
      </I18nextProvider>,
    ),
    props: finalProps,
  };
};

describe('ScheduledSubBanner', () => {
  it('renders nothing when prompt is null', () => {
    const { container } = renderBanner({ prompt: null });
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when prompt is undefined', () => {
    const { container } = renderBanner({ prompt: undefined });
    expect(container).toBeEmptyDOMElement();
  });

  it('renders Apply and Skip buttons when prompted', () => {
    renderBanner();
    expect(screen.getByRole('button', { name: /apply|toteuta/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /skip|ohita/i })).toBeInTheDocument();
  });

  it('falls back to player ids when names are not provided', () => {
    renderBanner();
    // The banner summary contains the resolved names; with no resolution
    // the raw ids surface so the coach still sees something actionable.
    expect(screen.getByText(/p1/)).toBeInTheDocument();
    expect(screen.getByText(/p2/)).toBeInTheDocument();
  });

  it('shows resolved player names when provided', () => {
    renderBanner({ outPlayerName: 'Roope', inPlayerName: 'Tomas' });
    expect(screen.getByText(/Roope/)).toBeInTheDocument();
    expect(screen.getByText(/Tomas/)).toBeInTheDocument();
  });

  it('shows the position role text', () => {
    renderBanner();
    expect(screen.getByText(/CDM/)).toBeInTheDocument();
  });

  it('calls onApply when Apply is clicked', () => {
    const { props } = renderBanner();
    fireEvent.click(screen.getByRole('button', { name: /apply|toteuta/i }));
    expect(props.onApply).toHaveBeenCalledTimes(1);
    expect(props.onSkip).not.toHaveBeenCalled();
  });

  it('calls onSkip when Skip is clicked', () => {
    const { props } = renderBanner();
    fireEvent.click(screen.getByRole('button', { name: /skip|ohita/i }));
    expect(props.onSkip).toHaveBeenCalledTimes(1);
    expect(props.onApply).not.toHaveBeenCalled();
  });

  it('uses role=alert with assertive aria-live for screen-reader visibility', () => {
    renderBanner();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
  });
});
