import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import GuidedTourProvider, { useGuidedTour } from '@/contexts/GuidedTourProvider';
import GuidedTourController from '../GuidedTourController';
import { FIRST_RUN_TOUR_ID, firstRunTourSteps } from '../firstRunTour';
import type { TourSignals, TourStep } from '../tourTypes';
import { __resetModalHardwareBackForTests } from '@/hooks/useModalHardwareBack';

// The provider reads the user id from useAuth for the per-user completion flag.
jest.mock('@/contexts/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'test-user' } }),
}));

const COMPLETED_KEY = 'matchops_tour_completed_first-run_test-user';

const baseSignals: TourSignals = {
  hasPlayers: false,
  hasTeam: false,
  hasTeamLinkedGame: false,
  screen: 'start',
  isTimerRunning: false,
  hasLoggedGoal: false,
};

function StartButton({ steps = firstRunTourSteps }: { steps?: TourStep[] }) {
  const { startTour } = useGuidedTour();
  return <button onClick={() => startTour(FIRST_RUN_TOUR_ID, steps)}>start-tour</button>;
}

function ReportButton({ signals }: { signals: TourSignals }) {
  const { reportSignals } = useGuidedTour();
  return <button onClick={() => reportSignals(signals)}>report</button>;
}

beforeEach(() => {
  localStorage.clear();
  __resetModalHardwareBackForTests();
});

describe('GuidedTour engine', () => {
  it('starts a tour and shows the first step', () => {
    render(
      <GuidedTourProvider>
        <StartButton />
      </GuidedTourProvider>,
    );
    expect(screen.queryByTestId('guided-tour-overlay')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('start-tour'));
    expect(screen.getByTestId('guided-tour-overlay')).toBeInTheDocument();
    expect(screen.getByTestId('guided-tour-title')).toHaveTextContent('Welcome to MatchOps');
    expect(screen.getByTestId('guided-tour-next')).toHaveTextContent('Next');
  });

  it('advances with Next and finishes (marking completed) on the last step', () => {
    render(
      <GuidedTourProvider>
        <StartButton />
      </GuidedTourProvider>,
    );
    fireEvent.click(screen.getByText('start-tour'));
    fireEvent.click(screen.getByTestId('guided-tour-next'));
    expect(screen.getByTestId('guided-tour-title')).toHaveTextContent("You're all set");
    expect(screen.getByTestId('guided-tour-next')).toHaveTextContent('Done');
    fireEvent.click(screen.getByTestId('guided-tour-next'));
    expect(screen.queryByTestId('guided-tour-overlay')).not.toBeInTheDocument();
    expect(localStorage.getItem(COMPLETED_KEY)).toBe('1');
  });

  it('skip ends the tour and marks it completed', () => {
    render(
      <GuidedTourProvider>
        <StartButton />
      </GuidedTourProvider>,
    );
    fireEvent.click(screen.getByText('start-tour'));
    fireEvent.click(screen.getByTestId('guided-tour-skip'));
    expect(screen.queryByTestId('guided-tour-overlay')).not.toBeInTheDocument();
    expect(localStorage.getItem(COMPLETED_KEY)).toBe('1');
  });

  it('auto-advances when a step advanceWhen predicate is satisfied', () => {
    const steps: TourStep[] = [
      { id: 'a', titleKey: 'k.a', title: 'Step A', bodyKey: 'k.ab', body: 'body a', advanceWhen: (s) => s.hasPlayers },
      { id: 'b', titleKey: 'k.b', title: 'Step B', bodyKey: 'k.bb', body: 'body b' },
    ];
    render(
      <GuidedTourProvider>
        <StartButton steps={steps} />
        <ReportButton signals={{ ...baseSignals, hasPlayers: true }} />
      </GuidedTourProvider>,
    );
    fireEvent.click(screen.getByText('start-tour'));
    expect(screen.getByTestId('guided-tour-title')).toHaveTextContent('Step A');
    fireEvent.click(screen.getByText('report'));
    expect(screen.getByTestId('guided-tour-title')).toHaveTextContent('Step B');
  });

  it('renders a spotlight ring when the step targets a visible element', () => {
    const target = document.createElement('button');
    target.setAttribute('data-testid', 'tour-target');
    target.getBoundingClientRect = () =>
      ({ top: 50, left: 50, width: 100, height: 40, right: 150, bottom: 90, x: 50, y: 50, toJSON() {} }) as DOMRect;
    document.body.appendChild(target);

    const steps: TourStep[] = [
      { id: 's', titleKey: 'k', title: 'Spotlight', bodyKey: 'kb', body: 'b', targetSelector: '[data-testid="tour-target"]' },
    ];
    render(
      <GuidedTourProvider>
        <StartButton steps={steps} />
      </GuidedTourProvider>,
    );
    fireEvent.click(screen.getByText('start-tour'));
    expect(screen.getByTestId('guided-tour-ring')).toBeInTheDocument();

    document.body.removeChild(target);
  });
});

describe('GuidedTourController first-run trigger', () => {
  it('starts the first-run tour when ready, first-time, and not completed', () => {
    render(
      <GuidedTourProvider>
        <GuidedTourController ready isFirstTimeUser />
      </GuidedTourProvider>,
    );
    expect(screen.getByTestId('guided-tour-title')).toHaveTextContent('Welcome to MatchOps');
  });

  it('does not start when already completed', () => {
    localStorage.setItem(COMPLETED_KEY, '1');
    render(
      <GuidedTourProvider>
        <GuidedTourController ready isFirstTimeUser />
      </GuidedTourProvider>,
    );
    expect(screen.queryByTestId('guided-tour-overlay')).not.toBeInTheDocument();
  });

  it('does not start for a returning (non-first-time) user', () => {
    render(
      <GuidedTourProvider>
        <GuidedTourController ready isFirstTimeUser={false} />
      </GuidedTourProvider>,
    );
    expect(screen.queryByTestId('guided-tour-overlay')).not.toBeInTheDocument();
  });

  it('does not start until ready', () => {
    render(
      <GuidedTourProvider>
        <GuidedTourController ready={false} isFirstTimeUser />
      </GuidedTourProvider>,
    );
    expect(screen.queryByTestId('guided-tour-overlay')).not.toBeInTheDocument();
  });
});
