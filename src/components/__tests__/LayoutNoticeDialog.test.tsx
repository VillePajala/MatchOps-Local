/**
 * The basic-layout notice ("Aloitat kevennetyllä näkymällä"): the dialog's
 * buttons, its focus trap, and the Home host that decides and records it.
 * @critical
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LayoutNoticeDialog, LayoutNoticeHost } from '../LayoutNoticeDialog';
import { observeFinishedGames, resetLayoutNoticeSession } from '@/utils/layoutNotice';
import { setHomeShowing, setOnboardingUserId, markOnboardingJustFinished } from '@/components/setupWizardActive';
import type { AppLayout, OnboardingMilestones } from '@/types/settings';

let mockLayout: AppLayout | undefined = 'basic';
let mockMilestones: OnboardingMilestones | undefined = {};
jest.mock('@/hooks/useAppLayout', () => ({
  useAppLayout: () => mockLayout,
  useOnboardingMilestonesSetting: () => mockMilestones,
  useSetAppLayout: () => jest.fn(),
}));

const mockRecordAppState = jest.fn<Promise<boolean>, unknown[]>();
jest.mock('@/utils/onboardingMilestones', () => ({
  ...jest.requireActual('@/utils/onboardingMilestones'),
  recordAppStateMilestones: (...args: unknown[]) => mockRecordAppState(...args),
}));

const noop = () => {};

describe('LayoutNoticeDialog', () => {
  it('#1: title, body, the switch hint; no "Don\'t show again"', () => {
    render(<LayoutNoticeDialog notice={1} onAcknowledge={noop} onSwitchToFull={noop} onStop={noop} />);
    const dialog = screen.getByRole('dialog', { name: 'You are starting with the Basic view' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveTextContent('tournament-day planning');
    expect(dialog).toHaveTextContent('See the full app');
    expect(screen.queryByTestId('layout-notice-lead')).not.toBeInTheDocument();
    expect(screen.queryByTestId('layout-notice-stop')).not.toBeInTheDocument();
    // The acknowledgement is focused first.
    expect(screen.getByTestId('layout-notice-ok')).toHaveFocus();
  });

  it('reminders lead with what was recorded and offer "Don\'t show again"', () => {
    const { rerender } = render(
      <LayoutNoticeDialog notice={2} onAcknowledge={noop} onSwitchToFull={noop} onStop={noop} />,
    );
    expect(screen.getByTestId('layout-notice-lead')).toHaveTextContent('First match recorded ✓');
    expect(screen.getByTestId('layout-notice-stop')).toBeInTheDocument();
    rerender(<LayoutNoticeDialog notice={3} onAcknowledge={noop} onSwitchToFull={noop} onStop={noop} />);
    expect(screen.getByTestId('layout-notice-lead')).toHaveTextContent('Three matches recorded ✓');
  });

  it('each button calls its own action; Escape acknowledges', () => {
    const onAcknowledge = jest.fn();
    const onSwitchToFull = jest.fn();
    const onStop = jest.fn();
    render(<LayoutNoticeDialog notice={2} onAcknowledge={onAcknowledge} onSwitchToFull={onSwitchToFull} onStop={onStop} />);
    fireEvent.click(screen.getByTestId('layout-notice-ok'));
    expect(onAcknowledge).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('layout-notice-switch'));
    expect(onSwitchToFull).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('layout-notice-stop'));
    expect(onStop).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onAcknowledge).toHaveBeenCalledTimes(2);
  });

  it('traps Tab inside the dialog', () => {
    render(<LayoutNoticeDialog notice={2} onAcknowledge={noop} onSwitchToFull={noop} onStop={noop} />);
    const first = screen.getByTestId('layout-notice-ok');
    const last = screen.getByTestId('layout-notice-stop');
    last.focus();
    fireEvent.keyDown(document.activeElement ?? document, { key: 'Tab' });
    expect(first).toHaveFocus();
    first.focus();
    fireEvent.keyDown(document.activeElement ?? document, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });
});

describe('LayoutNoticeHost', () => {
  const facts = { finishedGames: 0, savedGames: 1, matchDayPending: false };
  const renderHost = (props: Partial<React.ComponentProps<typeof LayoutNoticeHost>> = {}) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onSwitchToFull = jest.fn();
    const utils = render(
      <QueryClientProvider client={client}>
        <LayoutNoticeHost facts={facts} blocked={false} onSwitchToFull={onSwitchToFull} {...props} />
      </QueryClientProvider>,
    );
    return { ...utils, onSwitchToFull };
  };

  beforeEach(() => {
    mockLayout = 'basic';
    mockMilestones = {};
    mockRecordAppState.mockReset().mockResolvedValue(true);
    resetLayoutNoticeSession();
    act(() => {
      setOnboardingUserId('user-1');
      setHomeShowing(true);
    });
  });

  afterEach(() => {
    act(() => setHomeShowing(false));
  });

  it('shows #1 on Home after the wizard, recording it as shown first', async () => {
    act(() => markOnboardingJustFinished());
    renderHost();
    expect(await screen.findByTestId('layout-notice')).toBeInTheDocument();
    expect(mockRecordAppState).toHaveBeenCalledWith(['layoutNotice1Shown'], 'user-1');
    fireEvent.click(screen.getByTestId('layout-notice-ok'));
    expect(screen.queryByTestId('layout-notice')).not.toBeInTheDocument();
  });

  it('"Switch to the Full view now" switches and closes', async () => {
    const { onSwitchToFull } = renderHost();
    fireEvent.click(await screen.findByTestId('layout-notice-switch'));
    expect(onSwitchToFull).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('layout-notice')).not.toBeInTheDocument();
  });

  it('"Don\'t show again" on a reminder records the stop', async () => {
    mockMilestones = { layoutNotice1Shown: '2026-01-01T10:00:00.000Z' };
    observeFinishedGames('user-1', 1);
    renderHost({ facts: { finishedGames: 1, savedGames: 1, matchDayPending: false } });
    fireEvent.click(await screen.findByTestId('layout-notice-stop'));
    expect(screen.queryByTestId('layout-notice')).not.toBeInTheDocument();
    await waitFor(() => expect(mockRecordAppState).toHaveBeenCalledWith(['layoutNoticeStopped'], 'user-1'));
  });

  it('nothing on the full layout, while blocked, or when the mark could not be stored', async () => {
    mockLayout = 'full';
    const { unmount } = renderHost();
    expect(mockRecordAppState).not.toHaveBeenCalled();
    unmount();

    mockLayout = 'basic';
    const blocked = renderHost({ blocked: true });
    expect(mockRecordAppState).not.toHaveBeenCalled();
    blocked.unmount();

    mockRecordAppState.mockResolvedValue(false);
    renderHost();
    await waitFor(() => expect(mockRecordAppState).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('layout-notice')).not.toBeInTheDocument();
  });

  it('at most one notice per app session', async () => {
    const first = renderHost();
    fireEvent.click(await screen.findByTestId('layout-notice-ok'));
    first.unmount();
    renderHost();
    expect(mockRecordAppState).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('layout-notice')).not.toBeInTheDocument();
  });
});
