import React from 'react';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../i18n.test';
import type { ApplySnapshot } from '@/utils/applySnapshot';
import { UNDO_WINDOW_MS } from '@/utils/applySnapshot';

// Mock the planning-session hooks so the modal renders without a real
// QueryClientProvider. We only exercise the post-apply undo flow here,
// so list / save / setActive paths can return inert defaults.
jest.mock('@/hooks/usePlanningSessionQueries', () => ({
  usePlanningSessionsQuery: () => ({
    data: [],
    isLoading: false,
    isError: false,
  }),
  useDeletePlanningSessionMutation: () => ({
    mutate: jest.fn(),
    isPending: false,
    error: null,
  }),
  useSavePlanningSessionMutation: () => ({
    mutateAsync: jest.fn(),
  }),
  useSetActiveSessionMutation: () => ({
    mutate: jest.fn(),
  }),
}));

jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Replace the editor with a stub that exposes a button to invoke
// onApplied with a synthetic snapshot. This isolates the undo-flow
// state machine in PlanningModal from the editor's apply machinery
// (which has its own dedicated tests).
let lastEditorOnApplied:
  | ((snapshot?: ApplySnapshot, appliedDraft?: unknown) => void)
  | null = null;
jest.mock('../PlanningEditor', () => ({
  __esModule: true,
  default: (props: {
    onApplied: (snapshot?: ApplySnapshot, appliedDraft?: unknown) => void;
    onBack: () => void;
  }) => {
    lastEditorOnApplied = props.onApplied;
    return (
      <div data-testid="planning-editor-stub">
        <button onClick={props.onBack}>back</button>
      </div>
    );
  },
}));

// Import after mocks are set up so the modal picks up the stubs.
import PlanningModal from '../PlanningModal';

// `appliedAt` must be Date.now() so the 30s window hasn't expired by
// the time the test clicks Undo (a stale timestamp leaves the button
// disabled at seconds === 0).
const buildSnapshot = (): ApplySnapshot => ({
  appliedAt: Date.now(),
  games: [
    {
      gameId: 'g1',
      before: {
        playersOnField: [],
        selectedPlayerIds: ['p1', 'p2'],
        scheduledSubs: [],
      },
    },
    {
      gameId: 'g2',
      before: {
        playersOnField: [],
        selectedPlayerIds: ['p3'],
        scheduledSubs: [],
      },
    },
  ],
});

const renderModal = (
  overrides: Partial<React.ComponentProps<typeof PlanningModal>> = {},
) => {
  const props: React.ComponentProps<typeof PlanningModal> = {
    isOpen: true,
    onClose: jest.fn(),
    applyToGame: jest.fn().mockResolvedValue(undefined),
    roster: [],
    ...overrides,
  };
  return {
    ...render(
      <I18nextProvider i18n={i18n}>
        <PlanningModal {...props} />
      </I18nextProvider>,
    ),
    props,
  };
};

// Sentinel: pass NO_SNAPSHOT to drive the no-snapshot fallback path.
const NO_SNAPSHOT = Symbol('no snapshot');

// Drive the modal into the editor view, then trigger onApplied via the
// stub. Returns the rendered helpers so tests can drive the banner.
const driveToBanner = (
  overrides: Parameters<typeof renderModal>[0] = {},
  snapshot: ApplySnapshot | typeof NO_SNAPSHOT = buildSnapshot(),
) => {
  const helpers = renderModal({
    savedGames: {
      g1: { teamId: 'team_a' } as never,
    },
    currentTeamId: 'team_a',
    ...overrides,
  });
  // List → New plan → picker → continue → editor stub.
  fireEvent.click(
    screen.getByRole('button', { name: /New plan|Uusi suunnitelma/i }),
  );
  fireEvent.click(screen.getAllByRole('checkbox')[0]);
  fireEvent.click(screen.getByRole('button', { name: /continue|jatka/i }));
  expect(screen.getByTestId('planning-editor-stub')).toBeInTheDocument();
  // Stub captured the editor's onApplied prop — call it.
  const arg = snapshot === NO_SNAPSHOT ? undefined : snapshot;
  act(() => {
    lastEditorOnApplied?.(arg);
  });
  return { ...helpers, snapshot: arg };
};

beforeEach(() => {
  lastEditorOnApplied = null;
});

describe('PlanningModal — post-Apply undo banner (PR 8c)', () => {
  it('renders the undo banner with the snapshot game count after a successful apply', () => {
    driveToBanner();
    expect(screen.getByTestId('planning-undo-banner')).toBeInTheDocument();
    // 2 games in the fixture snapshot.
    expect(screen.getByTestId('planning-undo-banner')).toHaveTextContent(
      /2/,
    );
    // Editor stub is gone (we left the editor view).
    expect(
      screen.queryByTestId('planning-editor-stub'),
    ).not.toBeInTheDocument();
  });

  it('Undo replays applyToGame for each snapshot entry then closes the modal', async () => {
    const applyToGame = jest.fn().mockResolvedValue(undefined);
    const onClose = jest.fn();
    const { snapshot } = driveToBanner({ applyToGame, onClose });
    await act(async () => {
      fireEvent.click(screen.getByTestId('planning-undo-banner-undo'));
    });
    expect(applyToGame).toHaveBeenCalledTimes(2);
    expect(applyToGame).toHaveBeenNthCalledWith(
      1,
      'g1',
      snapshot!.games[0].before,
    );
    expect(applyToGame).toHaveBeenNthCalledWith(
      2,
      'g2',
      snapshot!.games[1].before,
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Undo failure surfaces an error and keeps the banner mounted', async () => {
    const applyToGame = jest
      .fn()
      .mockRejectedValueOnce(new Error('IDB fail'))
      .mockResolvedValue(undefined);
    const onClose = jest.fn();
    driveToBanner({ applyToGame, onClose });
    await act(async () => {
      fireEvent.click(screen.getByTestId('planning-undo-banner-undo'));
    });
    await waitFor(() => {
      expect(
        screen.getByTestId('planning-undo-banner-error'),
      ).toBeInTheDocument();
    });
    // Banner is still up and the modal hasn't closed; the user can retry.
    expect(screen.getByTestId('planning-undo-banner')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    // Undo button re-enables so retry is possible.
    expect(
      screen.getByTestId('planning-undo-banner-undo'),
    ).not.toBeDisabled();
  });

  it('mid-loop partial undo: retry resumes from the failed entry, not the start', async () => {
    // First-call sequence: g1 succeeds, g2 throws → partial state.
    // Retry: cursor sits at index 1, so applyToGame is called with g2
    // only (g1 not re-restored — it's already at its pre-apply state).
    const applyToGame = jest
      .fn<Promise<void>, [string, unknown]>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('IDB fail'))
      .mockResolvedValue(undefined);
    const onClose = jest.fn();
    const { snapshot } = driveToBanner({ applyToGame, onClose });
    // First Undo click: g1 ok, g2 fails.
    await act(async () => {
      fireEvent.click(screen.getByTestId('planning-undo-banner-undo'));
    });
    await waitFor(() => {
      expect(
        screen.getByTestId('planning-undo-banner-error'),
      ).toBeInTheDocument();
    });
    // Partial-undo error message includes the resume hint.
    expect(
      screen.getByTestId('planning-undo-banner-error'),
    ).toHaveTextContent(/Restored 1 of 2|Peruutettu 1\/2/i);
    expect(applyToGame).toHaveBeenCalledTimes(2);
    expect(applyToGame).toHaveBeenNthCalledWith(
      1,
      'g1',
      snapshot!.games[0].before,
    );
    expect(applyToGame).toHaveBeenNthCalledWith(
      2,
      'g2',
      snapshot!.games[1].before,
    );
    // Retry: g2 only — g1 is NOT replayed.
    applyToGame.mockClear();
    await act(async () => {
      fireEvent.click(screen.getByTestId('planning-undo-banner-undo'));
    });
    expect(applyToGame).toHaveBeenCalledTimes(1);
    expect(applyToGame).toHaveBeenCalledWith(
      'g2',
      snapshot!.games[1].before,
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Dismiss closes the modal without restoring', () => {
    const applyToGame = jest.fn().mockResolvedValue(undefined);
    const onClose = jest.fn();
    driveToBanner({ applyToGame, onClose });
    fireEvent.click(screen.getByTestId('planning-undo-banner-dismiss'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(applyToGame).not.toHaveBeenCalled();
  });

  it('timer expiry during in-flight Undo does NOT close the modal mid-restore', async () => {
    // Race Claude flagged: user clicks Undo near 29s; the parent
    // re-renders for setIsUndoing(true); the timer fires onExpire
    // shortly after; without the isUndoing guard, the modal would
    // tear down while applyToGame is still in flight.
    jest.useFakeTimers();
    try {
      // First call defers (we hold it pending while time advances);
      // subsequent calls resolve immediately so the loop can finish
      // once we release the first one.
      let resolveApply: () => void = () => {};
      const applyToGame = jest
        .fn<Promise<void>, [string, unknown]>()
        .mockImplementationOnce(
          () =>
            new Promise<void>((resolve) => {
              resolveApply = resolve;
            }),
        )
        .mockResolvedValue(undefined);
      const onClose = jest.fn();
      driveToBanner({ applyToGame, onClose });
      // Click Undo — applyToGame pends, isUndoing=true is now true.
      act(() => {
        fireEvent.click(screen.getByTestId('planning-undo-banner-undo'));
      });
      // Run past the 30s window while applyToGame is still pending.
      act(() => {
        jest.advanceTimersByTime(UNDO_WINDOW_MS + 2_000);
      });
      // Modal must still be open — onExpire should have been a no-op
      // because isUndoing=true.
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByTestId('planning-undo-banner')).toBeInTheDocument();
      // Now resolve the in-flight restore — modal closes via the
      // success path, exactly once.
      await act(async () => {
        resolveApply();
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      act(() => {
        jest.runOnlyPendingTimers();
      });
      jest.useRealTimers();
    }
  });

  it('auto-dismisses (closes the modal) after UNDO_WINDOW_MS elapses', () => {
    jest.useFakeTimers();
    try {
      const onClose = jest.fn();
      driveToBanner({ onClose });
      act(() => {
        jest.advanceTimersByTime(UNDO_WINDOW_MS + 1_000);
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      act(() => {
        jest.runOnlyPendingTimers();
      });
      jest.useRealTimers();
    }
  });

  it('clears undo state when the user closes the modal externally during the banner window', () => {
    // Closing the modal via Done (or any external close path that
    // routes through handleClose → resetEditorState) must clear the
    // undoSnapshot + isUndoing + cursor so the next open of the
    // mounted-across-opens modal doesn't leak stale undo state.
    const onClose = jest.fn();
    const applyToGame = jest.fn().mockResolvedValue(undefined);
    const { rerender } = renderModal({
      onClose,
      applyToGame,
      savedGames: { g1: { teamId: 'team_a' } as never },
      currentTeamId: 'team_a',
    });
    fireEvent.click(
      screen.getByRole('button', { name: /New plan|Uusi suunnitelma/i }),
    );
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.click(screen.getByRole('button', { name: /continue|jatka/i }));
    act(() => {
      lastEditorOnApplied?.(buildSnapshot());
    });
    expect(screen.getByTestId('planning-undo-banner')).toBeInTheDocument();
    // External close: click the modal-level Done button (NOT the
    // banner's own Dismiss — both close, but this asserts the
    // outer-chrome path also routes through resetEditorState).
    fireEvent.click(screen.getByTestId('planning-modal-done'));
    expect(onClose).toHaveBeenCalledTimes(1);
    // Reopen the same modal — the banner must NOT come back from
    // stale state. We simulate the reopen by toggling isOpen via a
    // rerender (the parent's state-driven flow).
    rerender(
      <I18nextProvider i18n={i18n}>
        <PlanningModal
          isOpen
          onClose={onClose}
          applyToGame={applyToGame}
          roster={[]}
          savedGames={{ g1: { teamId: 'team_a' } as never }}
          currentTeamId="team_a"
        />
      </I18nextProvider>,
    );
    expect(
      screen.queryByTestId('planning-undo-banner'),
    ).not.toBeInTheDocument();
  });

  it('skips the banner when the snapshot is undefined (no full-success apply)', () => {
    const onClose = jest.fn();
    driveToBanner({ onClose }, NO_SNAPSHOT);
    // No banner; modal closed via onApplied()'s fallback path.
    expect(
      screen.queryByTestId('planning-undo-banner'),
    ).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
