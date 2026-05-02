import React from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../i18n.test';
import PlanningUndoBanner from '../PlanningUndoBanner';
import { UNDO_WINDOW_MS } from '@/utils/applySnapshot';

const renderBanner = (
  overrides: Partial<React.ComponentProps<typeof PlanningUndoBanner>> = {},
) => {
  const props: React.ComponentProps<typeof PlanningUndoBanner> = {
    gameCount: 3,
    appliedAt: Date.now(),
    isUndoing: false,
    undoError: null,
    onUndo: jest.fn(),
    onDismiss: jest.fn(),
    onExpire: jest.fn(),
    ...overrides,
  };
  return {
    ...render(
      <I18nextProvider i18n={i18n}>
        <PlanningUndoBanner {...props} />
      </I18nextProvider>,
    ),
    props,
  };
};

describe('PlanningUndoBanner', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it('renders the title with the game count and an enabled Undo button', () => {
    renderBanner({ gameCount: 5 });
    expect(screen.getByTestId('planning-undo-banner')).toBeInTheDocument();
    // Plural pair isn't loaded in the test i18n stub, so the default
    // string ("Plan applied to {{count}} games.") fires.
    expect(
      screen.getByText(/Plan applied to 5 game|Suunnitelma sovellettu 5/i),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('planning-undo-banner-undo'),
    ).not.toBeDisabled();
  });

  it('Undo button calls onUndo', () => {
    const onUndo = jest.fn();
    renderBanner({ onUndo });
    fireEvent.click(screen.getByTestId('planning-undo-banner-undo'));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('Dismiss button calls onDismiss', () => {
    const onDismiss = jest.fn();
    renderBanner({ onDismiss });
    fireEvent.click(screen.getByTestId('planning-undo-banner-dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('Undo button is disabled while isUndoing and shows the in-flight label', () => {
    renderBanner({ isUndoing: true });
    const btn = screen.getByTestId(
      'planning-undo-banner-undo',
    ) as HTMLButtonElement;
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent(/Undoing|Peruutetaan/i);
  });

  it('renders an error message when undoError is set', () => {
    renderBanner({ undoError: 'Could not undo' });
    const err = screen.getByTestId('planning-undo-banner-error');
    expect(err).toBeInTheDocument();
    expect(err).toHaveTextContent('Could not undo');
  });

  it('countdown shows seconds remaining and decreases over time', () => {
    const appliedAt = Date.now();
    renderBanner({ appliedAt });
    expect(
      screen.getByTestId('planning-undo-banner-countdown'),
    ).toHaveTextContent(/30/);
    // Advance 5s — the interval fires, the component re-renders with
    // the new "now". 25s should remain.
    act(() => {
      jest.advanceTimersByTime(5_000);
    });
    expect(
      screen.getByTestId('planning-undo-banner-countdown'),
    ).toHaveTextContent(/25/);
  });

  it('fires onExpire once after UNDO_WINDOW_MS elapses, and disables Undo at 0s', () => {
    const onExpire = jest.fn();
    renderBanner({ onExpire });
    act(() => {
      jest.advanceTimersByTime(UNDO_WINDOW_MS + 1_000);
    });
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(
      screen.getByTestId('planning-undo-banner-undo'),
    ).toBeDisabled();
  });
});
