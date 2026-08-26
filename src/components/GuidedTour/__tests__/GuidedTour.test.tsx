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

// Number of surfaces registered with the hardware-back contract. The occluded
// stage's Continue button requires a MODAL above the screen's baseline (the
// match screen itself holds one page-level registration).
let mockLiftedSurfaceCount = 0;
jest.mock('@/hooks/useModalHardwareBack', () => ({
  ...jest.requireActual('@/hooks/useModalHardwareBack'),
  liftedSurfaceCount: () => mockLiftedSurfaceCount,
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
  teamsCount: 0,
  hasAppliedFormation: false,
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

    it('an offscreen (scrolled-away) target keeps guiding with its hint - no ring, no Continue', () => {
      // Center y = 2020, far below the viewport: present in the current view,
      // just scrolled out of sight (e.g. the game-setup team select after
      // scrolling down to the create button).
      const specific = mountAnchor('anchor-specific', 2000);
      mockLiftedSurfaceCount = 1; // the open form modal is registered
      try {
        render(
          <GuidedTourProvider>
            <StartButton steps={chainStep} />
          </GuidedTourProvider>,
        );
        fireEvent.click(screen.getByText('start-tour'));
        expect(screen.getByTestId('guided-tour-body')).toHaveTextContent('Do the specific thing');
        expect(screen.queryByTestId('guided-tour-ring')).not.toBeInTheDocument();
        // Crucially NOT the go-back escape: backing out would undo progress.
        expect(screen.queryByTestId('guided-tour-continue')).not.toBeInTheDocument();
      } finally {
        mockLiftedSurfaceCount = 0;
        specific.remove();
      }
    });

    it('an offscreen compact target shows a non-blocking pill pinned top', () => {
      const specific = mountAnchor('anchor-form', 2000);
      const steps: TourStep[] = [
        {
          id: 'form',
          titleKey: 'k.f',
          title: 'Form Step',
          bodyKey: 'k.fb',
          body: 'form body',
          targets: [
            { selector: '[data-testid="anchor-form"]', hintKey: 'h.f', hint: 'Fill and start', compact: true },
          ],
        },
      ];
      try {
        render(
          <GuidedTourProvider>
            <StartButton steps={steps} />
          </GuidedTourProvider>,
        );
        fireEvent.click(screen.getByText('start-tour'));
        const pill = screen.getByTestId('guided-tour-pill');
        expect(pill).toHaveTextContent('Fill and start');
        expect(pill.className).toContain('pointer-events-none');
        expect(screen.queryByTestId('guided-tour-ring')).not.toBeInTheDocument();
        expect(screen.queryByTestId('guided-tour-card')).not.toBeInTheDocument();
      } finally {
        specific.remove();
      }
    });

    it('a covered higher-priority stage wins over a visible later stage (no skipping ahead)', () => {
      // The team form case: Edit Roster scrolled under the sticky Create bar
      // (covered), Create itself visible - the guide must say Edit Roster's
      // hint (rect-less), NOT jump ahead to "Tap Create".
      const earlier = mountAnchor('anchor-earlier', 120);
      const later = mountAnchor('anchor-later', 300);
      const cover = document.createElement('div');
      document.body.appendChild(cover);
      const orig = document.elementFromPoint;
      // Cover ONLY the earlier target's center (y=140); the later one (y=320)
      // hit-tests as itself.
      document.elementFromPoint = jest.fn((x: number, y: number) => (y < 200 ? cover : later));
      const steps: TourStep[] = [
        {
          id: 'ordered',
          titleKey: 'k.o',
          title: 'Ordered Step',
          bodyKey: 'k.ob',
          body: 'ordered body',
          targets: [
            { selector: '[data-testid="anchor-earlier"]', hintKey: 'h.e', hint: 'Do the earlier thing' },
            { selector: '[data-testid="anchor-later"]', hintKey: 'h.l', hint: 'Do the later thing' },
          ],
        },
      ];
      try {
        render(
          <GuidedTourProvider>
            <StartButton steps={steps} />
          </GuidedTourProvider>,
        );
        fireEvent.click(screen.getByText('start-tour'));
        expect(screen.getByTestId('guided-tour-body')).toHaveTextContent('Do the earlier thing');
        expect(screen.queryByTestId('guided-tour-ring')).not.toBeInTheDocument();
        expect(screen.queryByTestId('guided-tour-continue')).not.toBeInTheDocument();
      } finally {
        document.elementFromPoint = orig;
        cover.remove();
        earlier.remove();
        later.remove();
      }
    });

    it('a covered higher-priority stage also wins over an OFFSCREEN later stage', () => {
      // Same skip-ahead class, offscreen combination (review #722): earlier
      // covered by a sticky bar, later merely scrolled below the viewport.
      const earlier = mountAnchor('anchor-earlier2', 120);
      const later = mountAnchor('anchor-later2', 2000); // center below viewport
      const cover = document.createElement('div');
      document.body.appendChild(cover);
      const orig = document.elementFromPoint;
      document.elementFromPoint = jest.fn(() => cover); // covers the on-screen earlier
      const steps: TourStep[] = [
        {
          id: 'ordered2',
          titleKey: 'k.o2',
          title: 'Ordered Step 2',
          bodyKey: 'k.o2b',
          body: 'ordered body 2',
          targets: [
            { selector: '[data-testid="anchor-earlier2"]', hintKey: 'h.e2', hint: 'Do the earlier thing' },
            { selector: '[data-testid="anchor-later2"]', hintKey: 'h.l2', hint: 'Do the later thing' },
          ],
        },
      ];
      try {
        render(
          <GuidedTourProvider>
            <StartButton steps={steps} />
          </GuidedTourProvider>,
        );
        fireEvent.click(screen.getByText('start-tour'));
        expect(screen.getByTestId('guided-tour-body')).toHaveTextContent('Do the earlier thing');
        expect(screen.queryByTestId('guided-tour-ring')).not.toBeInTheDocument();
        expect(screen.queryByTestId('guided-tour-continue')).not.toBeInTheDocument();
      } finally {
        document.elementFromPoint = orig;
        cover.remove();
        earlier.remove();
        later.remove();
      }
    });

    it('the pill carries a tiny skip control that dismisses the guide', () => {
      const specific = mountAnchor('anchor-form2', 120);
      const steps: TourStep[] = [
        {
          id: 'form2',
          titleKey: 'k.f2',
          title: 'Form Step 2',
          bodyKey: 'k.f2b',
          body: 'form body',
          targets: [
            { selector: '[data-testid="anchor-form2"]', hintKey: 'h.f2', hint: 'Fill it', compact: true },
          ],
        },
      ];
      try {
        render(
          <GuidedTourProvider>
            <StartButton steps={steps} />
          </GuidedTourProvider>,
        );
        fireEvent.click(screen.getByText('start-tour'));
        fireEvent.click(screen.getByTestId('guided-tour-pill-skip'));
        expect(screen.queryByTestId('guided-tour-overlay')).not.toBeInTheDocument();
        expect(localStorage.getItem(COMPLETED_KEY)).toBe('1');
      } finally {
        specific.remove();
      }
    });

    it('a compact goal stage carries the Next phase early-out inside the pill', () => {
      const specific = mountAnchor('anchor-form3', 300);
      const steps: TourStep[] = [
        {
          id: 'form3',
          titleKey: 'k.f3',
          title: 'Goal Pill Step',
          bodyKey: 'k.f3b',
          body: 'add things',
          targets: [
            { selector: '[data-testid="anchor-form3"]', hintKey: 'h.f3', hint: 'Keep adding', compact: true },
          ],
          manualAdvance: {
            labelKey: 'guidedTour.buttons.nextPhase',
            label: 'Next phase',
            when: (s) => s.playersCount > 0,
          },
          advanceWhen: (s) => s.playersCount >= 8,
        },
        { id: 'after', titleKey: 'k.n3', title: 'After Pill Goal', bodyKey: 'k.n3b', body: 'next body' },
      ];
      try {
        render(
          <GuidedTourProvider>
            <StartButton steps={steps} />
            <ReportButton signals={{ ...baseSignals, playersCount: 2 }} />
          </GuidedTourProvider>,
        );
        fireEvent.click(screen.getByText('start-tour'));
        // Gate unmet: pill shows, no advance control.
        expect(screen.queryByTestId('guided-tour-pill-advance')).not.toBeInTheDocument();
        fireEvent.click(screen.getByText('report'));
        // Two added: the coach can keep tapping the highlighted control OR
        // move on via the pill's explicit Next phase button.
        const advance = screen.getByTestId('guided-tour-pill-advance');
        expect(advance).toHaveTextContent('Next phase');
        fireEvent.click(advance);
        expect(screen.getByTestId('guided-tour-title')).toHaveTextContent('After Pill Goal');
        expect(screen.getByTestId('guided-tour-overlay')).toBeInTheDocument();
      } finally {
        specific.remove();
      }
    });

    it('occluded stage with an open lifted surface offers a Continue button that goes back', () => {
      const specific = mountAnchor('anchor-specific', 120);
      const cover = document.createElement('div');
      document.body.appendChild(cover);
      const origEfp = document.elementFromPoint;
      document.elementFromPoint = jest.fn(() => cover);
      mockLiftedSurfaceCount = 1; // a modal is open (start screen baseline is 0)
      const backSpy = jest.spyOn(window.history, 'back').mockImplementation(() => {});
      try {
        render(
          <GuidedTourProvider>
            <StartButton steps={chainStep} />
          </GuidedTourProvider>,
        );
        fireEvent.click(screen.getByText('start-tour'));
        expect(screen.getByTestId('guided-tour-body')).toHaveTextContent('All done here - tap Continue.');
        fireEvent.click(screen.getByTestId('guided-tour-continue'));
        expect(backSpy).toHaveBeenCalledTimes(1);
      } finally {
        backSpy.mockRestore();
        mockLiftedSurfaceCount = 0;
        document.elementFromPoint = origEfp;
        cover.remove();
        specific.remove();
      }
    });

    it('no Continue on the match screen when only its own page guard is registered', () => {
      const specific = mountAnchor('anchor-specific', 120);
      const cover = document.createElement('div');
      document.body.appendChild(cover);
      const origEfp = document.elementFromPoint;
      document.elementFromPoint = jest.fn(() => cover);
      // Match screen baseline: the page-level back-to-Home guard counts 1, but
      // NO modal is open - Continue here would back the coach out of the match.
      mockLiftedSurfaceCount = 1;
      try {
        const first = render(
          <GuidedTourProvider>
            <StartButton steps={chainStep} />
            <ReportButton signals={{ ...baseSignals, screen: 'home' }} />
          </GuidedTourProvider>,
        );
        fireEvent.click(screen.getByText('start-tour'));
        fireEvent.click(screen.getByText('report'));
        expect(screen.queryByTestId('guided-tour-continue')).not.toBeInTheDocument();
        first.unmount();
        // With a real modal ABOVE the baseline, Continue is offered again.
        mockLiftedSurfaceCount = 2;
        localStorage.clear(); // allow a fresh tour in the second render
        render(
          <GuidedTourProvider>
            <StartButton steps={chainStep} />
            <ReportButton signals={{ ...baseSignals, screen: 'home' }} />
          </GuidedTourProvider>,
        );
        fireEvent.click(screen.getByText('start-tour'));
        fireEvent.click(screen.getByText('report'));
        expect(screen.getByTestId('guided-tour-continue')).toBeInTheDocument();
      } finally {
        mockLiftedSurfaceCount = 0;
        document.elementFromPoint = origEfp;
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

  it('sequences coexisting form stages via `when` gates and step-scoped seen-memory', () => {
    // Simulates the create-team form: name input + roster button + create
    // button all exist at once; the roster editor's Done appears/disappears.
    const nameInput = document.createElement('input');
    nameInput.setAttribute('data-testid', 't-name');
    nameInput.getBoundingClientRect = () =>
      ({ top: 50, left: 50, width: 100, height: 40, right: 150, bottom: 90, x: 50, y: 50, toJSON() {} }) as DOMRect;
    document.body.appendChild(nameInput);
    const rosterBtn = mountAnchor('t-roster', 120);
    const createBtn = mountAnchor('t-create', 190);

    const steps: TourStep[] = [
      {
        id: 'team-form',
        titleKey: 'k.t',
        title: 'Team Form',
        bodyKey: 'k.tb',
        body: 'team form body',
        targets: [
          { selector: '[data-testid="t-done"]', hintKey: 'h.d', hint: 'Pick players then Done', compact: true },
          {
            selector: '[data-testid="t-name"]',
            hintKey: 'h.n',
            hint: 'Name it',
            compact: true,
            when: () => {
              const el = document.querySelector<HTMLInputElement>('[data-testid="t-name"]');
              return !!el && el.value.trim() === '';
            },
          },
          {
            selector: '[data-testid="t-roster"]',
            hintKey: 'h.r',
            hint: 'Pick players',
            compact: true,
            when: (seen) => !seen('[data-testid="t-done"]'),
          },
          { selector: '[data-testid="t-create"]', hintKey: 'h.c', hint: 'Tap Create', compact: true },
        ],
      },
    ];
    try {
      render(
        <GuidedTourProvider>
          <StartButton steps={steps} />
        </GuidedTourProvider>,
      );
      fireEvent.click(screen.getByText('start-tour'));
      // 1. Name empty -> name stage.
      expect(screen.getByTestId('guided-tour-pill')).toHaveTextContent('Name it');

      // 2. Name filled -> roster stage (Done not yet seen).
      nameInput.value = 'FC Test';
      fireEvent.input(nameInput);
      expect(screen.getByTestId('guided-tour-pill')).toHaveTextContent('Pick players');

      // 3. Roster editor opens (its Done appears) -> Done stage (and marks seen).
      const doneBtn = mountAnchor('t-done', 260);
      fireEvent.input(nameInput); // force a resolve pass deterministically
      expect(screen.getByTestId('guided-tour-pill')).toHaveTextContent('Pick players then Done');

      // 4. Editor closed (Done gone) -> Create stage (roster stage skipped: seen).
      doneBtn.remove();
      fireEvent.input(nameInput);
      expect(screen.getByTestId('guided-tour-pill')).toHaveTextContent('Tap Create');
    } finally {
      nameInput.remove();
      rosterBtn.remove();
      createBtn.remove();
      document.querySelector('[data-testid="t-done"]')?.remove();
    }
  });

  it('create-team advances live when the team exists (teamsCount)', () => {
    const steps: TourStep[] = [
      {
        id: 'team',
        titleKey: 'k.t',
        title: 'Team Step',
        bodyKey: 'k.tb',
        body: 'make a team',
        advanceWhen: (s) => s.teamsCount > 0 || s.hasTeam,
      },
      { id: 'after', titleKey: 'k.n', title: 'After Team', bodyKey: 'k.nb', body: 'next body' },
    ];
    render(
      <GuidedTourProvider>
        <StartButton steps={steps} />
        <ReportButton signals={{ ...baseSignals, teamsCount: 1 }} />
      </GuidedTourProvider>,
    );
    fireEvent.click(screen.getByText('start-tour'));
    fireEvent.click(screen.getByText('report'));
    expect(screen.getByTestId('guided-tour-title')).toHaveTextContent('After Team');
  });

  it('a goal step with manualAdvance offers a purpose-labeled early-out that advances ONE step', () => {
    const steps: TourStep[] = [
      {
        id: 'goal',
        titleKey: 'k.g',
        title: 'Goal Step',
        bodyKey: 'k.gb',
        body: 'add players',
        manualAdvance: {
          labelKey: 'guidedTour.buttons.nextPhase',
          label: 'Next phase',
          when: (s) => s.playersCount > 0,
        },
        advanceWhen: (s) => s.playersCount >= 8,
      },
      { id: 'after', titleKey: 'k.n', title: 'After Goal', bodyKey: 'k.nb', body: 'next body' },
    ];
    render(
      <GuidedTourProvider>
        <StartButton steps={steps} />
        <ReportButton signals={{ ...baseSignals, playersCount: 2 }} />
      </GuidedTourProvider>,
    );
    fireEvent.click(screen.getByText('start-tour'));
    // Gate not met yet (0 players): the early-out is hidden.
    expect(screen.queryByTestId('guided-tour-manual-advance')).not.toBeInTheDocument();
    // Two players added: the early-out appears...
    fireEvent.click(screen.getByText('report'));
    const btn = screen.getByTestId('guided-tour-manual-advance');
    expect(btn).toHaveTextContent('Next phase');
    // ...and advances one step (NOT a whole-tour skip).
    fireEvent.click(btn);
    expect(screen.getByTestId('guided-tour-title')).toHaveTextContent('After Goal');
    expect(screen.getByTestId('guided-tour-overlay')).toBeInTheDocument();
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
          hasAppliedFormation={p.hasAppliedFormation ?? false}
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

    // Entering the match -> set-formation step first (field stays visible).
    rerender(tree({ screen: 'home', hasPlayers: true, hasTeam: true }));
    expect(screen.getByTestId('guided-tour-title')).toHaveTextContent('Set your formation');

    // Formation applied -> start-timer step.
    rerender(tree({ screen: 'home', hasPlayers: true, hasTeam: true, hasAppliedFormation: true }));
    expect(screen.getByTestId('guided-tour-title')).toHaveTextContent('Start the clock');

    // Timer starts -> log-goal step.
    rerender(tree({ screen: 'home', hasPlayers: true, hasTeam: true, hasAppliedFormation: true, isTimerRunning: true }));
    expect(screen.getByTestId('guided-tour-title')).toHaveTextContent('Log a goal');

    // Goal logged -> done step.
    rerender(tree({ screen: 'home', hasPlayers: true, hasTeam: true, hasAppliedFormation: true, isTimerRunning: true, hasLoggedGoal: true }));
    expect(screen.getByTestId('guided-tour-title')).toHaveTextContent("You're all set");
  });
});

describe('GuidedTourMatchReporter', () => {
  it('renders nothing and does not throw without a provider', () => {
    const { container } = render(<GuidedTourMatchReporter isTimerRunning={false} hasLoggedGoal={false} hasAppliedFormation={false} />);
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
