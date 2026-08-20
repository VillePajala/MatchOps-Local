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

/** Put a laid-out element with the given testid into the DOM (jsdom reports a
 *  zero rect by default, which the chain treats as "not visible"). */
function mountAnchor(testid: string, top = 50): HTMLButtonElement {
  const el = document.createElement('button');
  el.setAttribute('data-testid', testid);
  el.getBoundingClientRect = () =>
    ({ top, left: 50, width: 100, height: 40, right: 150, bottom: top + 40, x: 50, y: top, toJSON() {} }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

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

  it('never blocks the app: the overlay root passes pointer events through', () => {
    render(
      <GuidedTourProvider>
        <StartButton />
      </GuidedTourProvider>,
    );
    fireEvent.click(screen.getByText('start-tour'));
    const overlay = screen.getByTestId('guided-tour-overlay');
    expect(overlay.className).toContain('pointer-events-none');
    // Only the card itself is interactive.
    expect(screen.getByTestId('guided-tour-card').className).toContain('pointer-events-auto');
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

  it('Escape key (within the card) skips the tour', () => {
    render(
      <GuidedTourProvider>
        <StartButton />
      </GuidedTourProvider>,
    );
    fireEvent.click(screen.getByText('start-tour'));
    fireEvent.keyDown(screen.getByTestId('guided-tour-card'), { key: 'Escape' });
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

  describe('tap-chain resolution', () => {
    const chainStep: TourStep[] = [
      {
        id: 'chain',
        titleKey: 'k.c',
        title: 'Chain Step',
        bodyKey: 'k.cb',
        body: 'fallback body copy',
        targets: [
          { selector: '[data-testid="anchor-specific"]', hintKey: 'h.s', hint: 'Do the specific thing' },
          { selector: '[data-testid="anchor-opener"]', hintKey: 'h.o', hint: 'Open the thing' },
        ],
      },
    ];

    it('spotlights the most specific on-screen target and shows its hint', () => {
      const opener = mountAnchor('anchor-opener');
      const specific = mountAnchor('anchor-specific', 120);
      render(
        <GuidedTourProvider>
          <StartButton steps={chainStep} />
        </GuidedTourProvider>,
      );
      fireEvent.click(screen.getByText('start-tour'));
      expect(screen.getByTestId('guided-tour-ring')).toBeInTheDocument();
      expect(screen.getByTestId('guided-tour-body')).toHaveTextContent('Do the specific thing');
      specific.remove();
      opener.remove();
    });

    it('falls through to the opener when the specific target is absent', () => {
      const opener = mountAnchor('anchor-opener');
      render(
        <GuidedTourProvider>
          <StartButton steps={chainStep} />
        </GuidedTourProvider>,
      );
      fireEvent.click(screen.getByText('start-tour'));
      expect(screen.getByTestId('guided-tour-ring')).toBeInTheDocument();
      expect(screen.getByTestId('guided-tour-body')).toHaveTextContent('Open the thing');
      opener.remove();
    });

    it('shows the step body with no ring when no target is on screen', () => {
      render(
        <GuidedTourProvider>
          <StartButton steps={chainStep} />
        </GuidedTourProvider>,
      );
      fireEvent.click(screen.getByText('start-tour'));
      expect(screen.queryByTestId('guided-tour-ring')).not.toBeInTheDocument();
      expect(screen.getByTestId('guided-tour-body')).toHaveTextContent('fallback body copy');
    });

    it('treats a target covered by another surface (e.g. a modal) as not visible', () => {
      const specific = mountAnchor('anchor-specific', 120);
      const cover = document.createElement('div'); // unrelated element on top
      document.body.appendChild(cover);
      const orig = document.elementFromPoint;
      // jsdom has no layout, so emulate a modal covering the target's center.
      document.elementFromPoint = jest.fn(() => cover);
      try {
        render(
          <GuidedTourProvider>
            <StartButton steps={chainStep} />
          </GuidedTourProvider>,
        );
        fireEvent.click(screen.getByText('start-tour'));
        // Covered target is skipped; nothing else on screen -> body fallback, no ring.
        expect(screen.queryByTestId('guided-tour-ring')).not.toBeInTheDocument();
        expect(screen.getByTestId('guided-tour-body')).toHaveTextContent('fallback body copy');
      } finally {
        document.elementFromPoint = orig;
        cover.remove();
        specific.remove();
      }
    });
  });

  it('action steps (advanceWhen) show only Skip - the highlighted control is the way forward', () => {
    const steps: TourStep[] = [
      {
        id: 'action',
        titleKey: 'k.a',
        title: 'Action Step',
        bodyKey: 'k.ab',
        body: 'do the thing in the app',
        advanceWhen: (s) => s.hasPlayers,
      },
    ];
    render(
      <GuidedTourProvider>
        <StartButton steps={steps} />
      </GuidedTourProvider>,
    );
    fireEvent.click(screen.getByText('start-tour'));
    expect(screen.queryByTestId('guided-tour-next')).not.toBeInTheDocument();
    expect(screen.getByTestId('guided-tour-skip')).toBeInTheDocument();
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

  it('does not start until ready (e.g. the marketing prompt is still up)', () => {
    render(
      <GuidedTourProvider>
        <GuidedTourController ready={false} isFirstTimeUser {...baseSignals} />
      </GuidedTourProvider>,
    );
    expect(screen.queryByTestId('guided-tour-overlay')).not.toBeInTheDocument();
  });

  it('auto-advances through Home and match steps as signals flip', () => {
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
