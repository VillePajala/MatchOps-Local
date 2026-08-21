import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import GuidedTourProvider, { useGuidedTour } from '@/contexts/GuidedTourProvider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import GuidedTourController from '../GuidedTourController';
import GuidedTourMatchReporter from '../GuidedTourMatchReporter';
import GuidedTourRosterReporter from '../GuidedTourRosterReporter';
import { FIRST_RUN_TOUR_ID, firstRunTourSteps } from '../firstRunTour';
import type { TourSignals, TourStep } from '../tourTypes';

// The provider reads the user id from useAuth for the per-user completion flag.
jest.mock('@/contexts/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'test-user' } }),
}));

// Controls the occluded hint's platform branch: true = desktop (modal X shown,
// "close this view"), false = phone (X hidden, "press back").
let mockModalCloseVisible = true;
jest.mock('@/styles/modalStyles', () => ({
  ...jest.requireActual('@/styles/modalStyles'),
  useModalCloseVisible: () => mockModalCloseVisible,
}));

const COMPLETED_KEY = 'matchops_tour_completed_first-run_test-user';

const baseSignals: TourSignals = {
  hasPlayers: false,
  hasTeam: false,
  hasTeamLinkedGame: false,
  screen: 'start',
  isTimerRunning: false,
  hasLoggedGoal: false,
  playersCount: 0,
  targetPlayers: 8,
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

    it('does NOT treat the tour card itself as cover (no self-occlusion loop)', () => {
      const specific = mountAnchor('anchor-specific', 120);
      const orig = document.elementFromPoint;
      // Emulate the tour's own card sitting over the target's center - the
      // resolver must still consider the target visible (the placement rule
      // moves the card to the opposite half), not fall back and park on it.
      document.elementFromPoint = jest.fn(() =>
        document.querySelector('[data-testid="guided-tour-card"]'),
      );
      try {
        render(
          <GuidedTourProvider>
            <StartButton steps={chainStep} />
          </GuidedTourProvider>,
        );
        fireEvent.click(screen.getByText('start-tour'));
        // The initial resolve runs before the card is committed (mock returns
        // null there), so the meaningful check is the RECOMPUTE below, where
        // elementFromPoint really returns the now-mounted card node - the exact
        // self-occlusion scenario. Without the overlay-exclusion fix this
        // recompute would mark the target covered and drop the ring.
        expect(screen.getByTestId('guided-tour-card')).toBeInTheDocument();
        fireEvent(window, new Event('resize'));
        expect(screen.getByTestId('guided-tour-ring')).toBeInTheDocument();
        expect(screen.getByTestId('guided-tour-body')).toHaveTextContent('Do the specific thing');
      } finally {
        document.elementFromPoint = orig;
        specific.remove();
      }
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
        // Covered target is skipped (no ring), and because the way forward is
        // merely covered by an open view, the card names the literal next tap
        // (desktop branch: the modal X is visible).
        expect(screen.queryByTestId('guided-tour-ring')).not.toBeInTheDocument();
        expect(screen.getByTestId('guided-tour-body')).toHaveTextContent('Close this view (X) to continue.');
      } finally {
        document.elementFromPoint = orig;
        cover.remove();
        specific.remove();
      }
    });

    it('occluded hint on phones (no modal X) names the device back button', () => {
      const specific = mountAnchor('anchor-specific', 120);
      const cover = document.createElement('div');
      document.body.appendChild(cover);
      const orig = document.elementFromPoint;
      document.elementFromPoint = jest.fn(() => cover);
      mockModalCloseVisible = false; // phone: modal X hidden, back closes views
      try {
        render(
          <GuidedTourProvider>
            <StartButton steps={chainStep} />
          </GuidedTourProvider>,
        );
        fireEvent.click(screen.getByText('start-tour'));
        expect(screen.getByTestId('guided-tour-body')).toHaveTextContent(
          "Press your device's back button to continue.",
        );
      } finally {
        mockModalCloseVisible = true;
        document.elementFromPoint = orig;
        cover.remove();
        specific.remove();
      }
    });

    it('hardware back never touches the tour (guidance layer owns no history)', () => {
      render(
        <GuidedTourProvider>
          <StartButton steps={chainStep} />
        </GuidedTourProvider>,
      );
      fireEvent.click(screen.getByText('start-tour'));
      expect(screen.getByTestId('guided-tour-overlay')).toBeInTheDocument();
      // A back navigation must not skip the tour (it operates on the app's own
      // surfaces - e.g. closing an open modal - never on the guidance layer).
      fireEvent(window, new PopStateEvent('popstate'));
      expect(screen.getByTestId('guided-tour-overlay')).toBeInTheDocument();
    });
  });

  it('compact stages render a non-blocking pill: ring + text only, no card, no dim', () => {
    const specific = mountAnchor('anchor-specific', 120);
    const steps: TourStep[] = [
      {
        id: 'form',
        titleKey: 'k.f',
        title: 'Form Step',
        bodyKey: 'k.fb',
        body: 'form body',
        targets: [
          { selector: '[data-testid="anchor-specific"]', hintKey: 'h.f', hint: 'Fill the form', compact: true },
        ],
        progress: {
          key: 'guidedTour.progress.playersAdded',
          fallback: '{{done}} / {{target}} players added',
          compute: (s) => ({ done: s.playersCount, target: 8 }),
        },
      },
    ];
    try {
      render(
        <GuidedTourProvider>
          <StartButton steps={steps} />
          <ReportButton signals={{ ...baseSignals, playersCount: 3 }} />
        </GuidedTourProvider>,
      );
      fireEvent.click(screen.getByText('start-tour'));
      fireEvent.click(screen.getByText('report'));
      expect(screen.getByTestId('guided-tour-ring')).toBeInTheDocument();
      const pill = screen.getByTestId('guided-tour-pill');
      expect(pill).toHaveTextContent('Fill the form');
      // Live progress stays visible even mid-form (terse counter in the pill).
      expect(pill).toHaveTextContent('3/8');
      expect(pill.className).toContain('pointer-events-none');
      // No interactive card, no buttons, nothing that could cover the form.
      expect(screen.queryByTestId('guided-tour-card')).not.toBeInTheDocument();
      expect(screen.queryByTestId('guided-tour-skip')).not.toBeInTheDocument();
    } finally {
      specific.remove();
    }
  });

  it('shows live progress and auto-advances at the players goal', () => {
    const steps: TourStep[] = [
      {
        id: 'goal',
        titleKey: 'k.g',
        title: 'Goal Step',
        bodyKey: 'k.gb',
        body: 'add players',
        progress: {
          key: 'guidedTour.progress.playersAdded',
          fallback: '{{done}} / {{target}} players added',
          compute: (s) => ({ done: s.playersCount, target: 8 }),
        },
        advanceWhen: (s) => s.playersCount >= 8,
      },
      { id: 'after', titleKey: 'k.n', title: 'After Goal', bodyKey: 'k.nb', body: 'next body' },
    ];
    render(
      <GuidedTourProvider>
        <StartButton steps={steps} />
        <ReportButton signals={{ ...baseSignals, playersCount: 3 }} />
      </GuidedTourProvider>,
    );
    fireEvent.click(screen.getByText('start-tour'));
    fireEvent.click(screen.getByText('report'));
    expect(screen.getByTestId('guided-tour-progress')).toHaveTextContent('3 / 8');
    expect(screen.getByTestId('guided-tour-title')).toHaveTextContent('Goal Step');
  });

  it('format chips change the goal: picking 5v5 sets the target and the advance threshold', () => {
    const steps: TourStep[] = [
      {
        id: 'goal',
        titleKey: 'k.g',
        title: 'Goal Step',
        bodyKey: 'k.gb',
        body: 'add players',
        choices: [
          { id: '5v5', label: '5v5', apply: { targetPlayers: 5 } },
          { id: '8v8', label: '8v8', apply: { targetPlayers: 8 } },
        ],
        progress: {
          key: 'guidedTour.progress.playersAdded',
          fallback: '{{done}} / {{target}} players added',
          compute: (s) => ({ done: s.playersCount, target: s.targetPlayers }),
        },
        advanceWhen: (s) => s.playersCount >= s.targetPlayers,
      },
      { id: 'after', titleKey: 'k.n', title: 'After Goal', bodyKey: 'k.nb', body: 'next body' },
    ];
    render(
      <GuidedTourProvider>
        <StartButton steps={steps} />
        <ReportButton signals={{ ...baseSignals, playersCount: 5, targetPlayers: 8 }} />
      </GuidedTourProvider>,
    );
    fireEvent.click(screen.getByText('start-tour'));
    // 5 players against the default 8 target: not advanced, progress shows 5 / 8.
    fireEvent.click(screen.getByText('report'));
    expect(screen.getByTestId('guided-tour-progress')).toHaveTextContent('5 / 8');
    // Pick 5v5: target becomes 5 - the 5 players now satisfy it and advance.
    fireEvent.click(screen.getByTestId('guided-tour-choice-5v5'));
    expect(screen.getByTestId('guided-tour-title')).toHaveTextContent('After Goal');
  });

  it('reaching the players goal advances the step', () => {
    const steps: TourStep[] = [
      {
        id: 'goal',
        titleKey: 'k.g',
        title: 'Goal Step',
        bodyKey: 'k.gb',
        body: 'add players',
        advanceWhen: (s) => s.playersCount >= 8,
      },
      { id: 'after', titleKey: 'k.n', title: 'After Goal', bodyKey: 'k.nb', body: 'next body' },
    ];
    render(
      <GuidedTourProvider>
        <StartButton steps={steps} />
        <ReportButton signals={{ ...baseSignals, playersCount: 8 }} />
      </GuidedTourProvider>,
    );
    fireEvent.click(screen.getByText('start-tour'));
    fireEvent.click(screen.getByText('report'));
    expect(screen.getByTestId('guided-tour-title')).toHaveTextContent('After Goal');
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

describe('GuidedTourRosterReporter', () => {
  it('renders nothing and stays idle without a tour provider (query disabled)', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={client}>
        <GuidedTourRosterReporter />
      </QueryClientProvider>,
    );
    expect(container).toBeEmptyDOMElement();
    client.clear();
  });
});
