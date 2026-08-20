import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import GuidedTourProvider, { useGuidedTour } from '@/contexts/GuidedTourProvider';
import GuidedTourController from '../GuidedTourController';
import GuidedTourMatchReporter from '../GuidedTourMatchReporter';
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

// A minimal two-step tour for testing finish/persistence independent of the
// real tour's length.
const twoStep: TourStep[] = [
  { id: 'one', titleKey: 'k.1', title: 'Step One', bodyKey: 'k.1b', body: 'body one' },
  { id: 'two', titleKey: 'k.2', title: 'Step Two', bodyKey: 'k.2b', body: 'body two' },
];

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
  });

  it('Next advances from welcome to the first action step', () => {
    render(
      <GuidedTourProvider>
        <StartButton />
      </GuidedTourProvider>,
    );
    fireEvent.click(screen.getByText('start-tour'));
    fireEvent.click(screen.getByTestId('guided-tour-next'));
    expect(screen.getByTestId('guided-tour-title')).toHaveTextContent('Add your players');
  });

  it('Next on the last step finishes and marks the tour completed', () => {
    render(
      <GuidedTourProvider>
        <StartButton steps={twoStep} />
      </GuidedTourProvider>,
    );
    fireEvent.click(screen.getByText('start-tour'));
    expect(screen.getByTestId('guided-tour-next')).toHaveTextContent('Next');
    fireEvent.click(screen.getByTestId('guided-tour-next'));
    expect(screen.getByTestId('guided-tour-title')).toHaveTextContent('Step Two');
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

  it('Escape key skips the tour', () => {
    render(
      <GuidedTourProvider>
        <StartButton />
      </GuidedTourProvider>,
    );
    fireEvent.click(screen.getByText('start-tour'));
    fireEvent.keyDown(screen.getByTestId('guided-tour-overlay'), { key: 'Escape' });
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

  it('spotlights via a multi-selector target, using whichever is present', () => {
    // Only the fallback ("opener") selector is in the DOM.
    const opener = document.createElement('button');
    opener.setAttribute('data-testid', 'tour-opener');
    opener.getBoundingClientRect = () =>
      ({ top: 50, left: 50, width: 100, height: 40, right: 150, bottom: 90, x: 50, y: 50, toJSON() {} }) as DOMRect;
    document.body.appendChild(opener);

    const steps: TourStep[] = [
      {
        id: 's',
        titleKey: 'k',
        title: 'Spotlight',
        bodyKey: 'kb',
        body: 'b',
        targetSelector: ['[data-testid="tour-inner"]', '[data-testid="tour-opener"]'],
      },
    ];
    render(
      <GuidedTourProvider>
        <StartButton steps={steps} />
      </GuidedTourProvider>,
    );
    fireEvent.click(screen.getByText('start-tour'));
    expect(screen.getByTestId('guided-tour-ring')).toBeInTheDocument();

    document.body.removeChild(opener);
  });
});

describe('GuidedTourController', () => {
  it('starts the first-run tour when ready, first-time, and not completed', () => {
    render(
      <GuidedTourProvider>
        <GuidedTourController ready isFirstTimeUser {...baseSignals} />
      </GuidedTourProvider>,
    );
    expect(screen.getByTestId('guided-tour-title')).toHaveTextContent('Welcome to MatchOps');
  });

  it('does not start when already completed', () => {
    localStorage.setItem(COMPLETED_KEY, '1');
    render(
      <GuidedTourProvider>
        <GuidedTourController ready isFirstTimeUser {...baseSignals} />
      </GuidedTourProvider>,
    );
    expect(screen.queryByTestId('guided-tour-overlay')).not.toBeInTheDocument();
  });

  it('does not start for a returning (non-first-time) user', () => {
    render(
      <GuidedTourProvider>
        <GuidedTourController ready isFirstTimeUser={false} {...baseSignals} />
      </GuidedTourProvider>,
    );
    expect(screen.queryByTestId('guided-tour-overlay')).not.toBeInTheDocument();
  });

  it('does not start until ready', () => {
    render(
      <GuidedTourProvider>
        <GuidedTourController ready={false} isFirstTimeUser {...baseSignals} />
      </GuidedTourProvider>,
    );
    expect(screen.queryByTestId('guided-tour-overlay')).not.toBeInTheDocument();
  });

  it('auto-advances through Home and match steps as signals flip', () => {
    // The controller owns Home signals; the match reporter owns timer/goal.
    const tree = (p: Partial<TourSignals>) => (
      <GuidedTourProvider>
        <GuidedTourController
          ready
          isFirstTimeUser
          hasPlayers={p.hasPlayers}
          hasTeam={p.hasTeam}
          hasTeamLinkedGame={p.hasTeamLinkedGame}
          screen={p.screen}
        />
        <GuidedTourMatchReporter
          isTimerRunning={p.isTimerRunning ?? false}
          hasLoggedGoal={p.hasLoggedGoal ?? false}
        />
      </GuidedTourProvider>
    );
    const { rerender } = render(tree({ screen: 'start' }));

    // Welcome -> tap Next to reach the first action step.
    fireEvent.click(screen.getByTestId('guided-tour-next'));
    expect(screen.getByTestId('guided-tour-title')).toHaveTextContent('Add your players');

    rerender(tree({ screen: 'start', hasPlayers: true }));
    expect(screen.getByTestId('guided-tour-title')).toHaveTextContent('Create your team');

    rerender(tree({ screen: 'start', hasPlayers: true, hasTeam: true }));
    expect(screen.getByTestId('guided-tour-title')).toHaveTextContent('Start your first game');

    // Entering the match -> start-timer step.
    rerender(tree({ screen: 'home', hasPlayers: true, hasTeam: true }));
    expect(screen.getByTestId('guided-tour-title')).toHaveTextContent('Start the clock');

    // Timer starts -> log-goal step.
    rerender(tree({ screen: 'home', hasPlayers: true, hasTeam: true, isTimerRunning: true }));
    expect(screen.getByTestId('guided-tour-title')).toHaveTextContent('Log a goal');

    // Goal logged -> done step.
    rerender(tree({ screen: 'home', hasPlayers: true, hasTeam: true, isTimerRunning: true, hasLoggedGoal: true }));
    expect(screen.getByTestId('guided-tour-title')).toHaveTextContent("You're all set");
  });
});

describe('GuidedTourMatchReporter', () => {
  it('renders nothing and does not throw without a provider', () => {
    const { container } = render(<GuidedTourMatchReporter isTimerRunning={false} hasLoggedGoal={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});
