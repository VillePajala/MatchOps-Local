import { render, screen, fireEvent, act } from '@testing-library/react';
// The assessment setting is on here: these tests assert the handlers are wired.
jest.mock('@/hooks/useAssessmentsEnabled', () => ({ useAssessmentsEnabled: () => true }));
// The account's layout (Onboarding v3); 'full' unless a test says otherwise.
let mockAppLayout: 'basic' | 'full' | undefined = 'full';
jest.mock('@/hooks/useAppLayout', () => ({ useAppLayout: () => mockAppLayout }));
// The plan's chain view for the plan-view toggle; none unless a test sets it.
let mockPlannedChains: unknown[] = [];
jest.mock('@/hooks/usePlannedChains', () => ({ usePlannedChains: () => mockPlannedChains }));
// The planned-sub schedule the timer sees; no plan unless a test sets one.
let mockPlannedPrompts: { current: unknown; overdueEarlier: number; hasPlan: boolean | null } = {
  current: null, overdueEarlier: 0, hasPlan: false,
};
jest.mock('@/hooks/usePlannedSubPrompts', () => ({ usePlannedSubPrompts: () => mockPlannedPrompts }));
const mockSetIsPlaytimePlannerOpen = jest.fn();
// The props the field was last drawn with, for asserting what each view shows.
const mockSoccerFieldRender = jest.fn();
const fieldProps = (): Record<string, unknown> => mockSoccerFieldRender.mock.calls.at(-1)?.[0] ?? {};
import type { ReactNode } from 'react';
import { FieldContainer, FIELD_TOOL_PILL_VISIBLE_MS, FIELD_TOOL_PILL_FADE_MS } from './FieldContainer';
import { initialGameSessionStatePlaceholder } from '@/hooks/useGameSessionReducer';
import { DEFAULT_GAME_ID } from '@/config/constants';
import { TestFixtures } from '../../../../tests/fixtures';

jest.mock('@/components/TimerOverlay', () => {
  const TimerOverlay = ({
    showSubTimerReset, showSubTimer, hasPlan, subAlertLevel, onShowSubTimerChange, onOpenPlanner,
  }: {
    showSubTimerReset?: boolean;
    showSubTimer?: boolean;
    hasPlan?: boolean;
    subAlertLevel?: string;
    onShowSubTimerChange?: (show: boolean) => void;
    onOpenPlanner?: () => void;
  }) => (
    <div
      data-testid="timer-overlay"
      data-sub-timer-reset={String(showSubTimerReset)}
      data-show-sub-timer={String(showSubTimer)}
      data-has-plan={String(hasPlan)}
      data-sub-alert={subAlertLevel}
    >
      {onShowSubTimerChange && (
        <>
          <button type="button" onClick={() => onShowSubTimerChange(true)}>switch on</button>
          <button type="button" onClick={() => onShowSubTimerChange(false)}>switch off</button>
        </>
      )}
      {onOpenPlanner && <button type="button" onClick={onOpenPlanner}>make plan</button>}
    </div>
  );
  TimerOverlay.displayName = 'TimerOverlay';
  return { __esModule: true, default: TimerOverlay };
});
jest.mock('@/components/SoccerField', () => {
  const React = require('react');
  const SoccerField = React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
    const mockCanvas = React.useRef(null);
    mockSoccerFieldRender(props);

    React.useImperativeHandle(ref, () => ({
      getCanvas: () => mockCanvas.current,
      renderForExport: () => mockCanvas.current,
    }));

    return (
      <div data-testid="soccer-field">
        <canvas ref={mockCanvas} width={800} height={600} />
      </div>
    );
  });
  SoccerField.displayName = 'SoccerField';
  return { __esModule: true, default: SoccerField };
});
jest.mock('@/components/ErrorBoundary', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
    i18n: {
      language: 'en',
    },
  }),
}));

const mockShowToast = jest.fn();
jest.mock('@/contexts/ToastProvider', () => ({
  useToast: () => ({
    showToast: mockShowToast,
  }),
}));

const mockExportFieldAsImage = jest.fn();
const mockIsExportSupported = jest.fn(() => true);
jest.mock('@/utils/export', () => ({
  exportFieldAsImage: (...args: unknown[]) => mockExportFieldAsImage(...args),
  isExportSupported: () => mockIsExportSupported(),
}));

jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
  createLogger: jest.fn(() => ({
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
  })),
}));

// Mock AuthProvider context (required by useSyncStatus used in SyncStatusIndicator)
jest.mock('@/contexts/AuthProvider', () => ({
  useAuth: () => ({
    isAuthenticated: false,
    isLoading: false,
    mode: 'local' as const,
    user: null,
    isSigningOut: false,
    initTimedOut: false,
    retryAuthInit: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
    switchToLocalMode: jest.fn(),
    switchToCloudMode: jest.fn(),
  }),
}));

// Mock useSyncStatus hook (used by SyncStatusIndicator)
jest.mock('@/hooks/useSyncStatus', () => ({
  useSyncStatus: () => ({
    status: null,
    isInitialized: false,
  }),
}));

// Mock ModalProvider context (required by SyncStatusIndicator used in children)
jest.mock('@/contexts/ModalProvider', () => ({
  useModalContextOptional: () => ({ setIsPlaytimePlannerOpen: mockSetIsPlaytimePlannerOpen }),
  useModalContext: () => ({
    isGameSettingsModalOpen: false,
    setIsGameSettingsModalOpen: jest.fn(),
    isLoadGameModalOpen: false,
    setIsLoadGameModalOpen: jest.fn(),
    isRosterModalOpen: false,
    setIsRosterModalOpen: jest.fn(),
    isStatsModalOpen: false,
    setIsStatsModalOpen: jest.fn(),
    isNewGameSetupModalOpen: false,
    setIsNewGameSetupModalOpen: jest.fn(),
    isTeamModalOpen: false,
    setIsTeamModalOpen: jest.fn(),
    isSeasonTournamentModalOpen: false,
    setIsSeasonTournamentModalOpen: jest.fn(),
    isPersonnelModalOpen: false,
    setIsPersonnelModalOpen: jest.fn(),
    isSettingsModalOpen: false,
    setIsSettingsModalOpen: jest.fn(),
    openSettingsToTab: jest.fn(),
    settingsInitialTab: undefined,
    isPlayerAssessmentModalOpen: false,
    setIsPlayerAssessmentModalOpen: jest.fn(),
  }),
}));

const baseProps = () => ({
  gameSessionState: initialGameSessionStatePlaceholder,
  fieldVM: {
    playersOnField: [],
    opponents: [],
    drawings: [],
    isTacticsBoardView: false,
    tacticalDrawings: [],
    tacticalDiscs: [],
    tacticalBallPosition: { relX: 0.5, relY: 0.5 },
    draggingPlayerFromBarInfo: null,
    isDrawingEnabled: false,
  },
  timerVM: {
    timeElapsedInSeconds: 0,
    isTimerRunning: false,
    subAlertLevel: 'none' as const,
    lastSubConfirmationTimeSeconds: 0,
    showLargeTimerOverlay: false,
    initialLoadComplete: true,
  },
  currentGameId: DEFAULT_GAME_ID,
  availablePlayers: [],
  teams: [],
  seasons: [],
  tournaments: [],
  orphanedGameInfo: null,
  onOpenNewGameSetup: jest.fn(),
  onOpenRosterModal: jest.fn(),
  onOpenSeasonTournamentModal: jest.fn(),
  onOpenTeamManagerModal: jest.fn(),
  onOpenTeamReassignModal: jest.fn(),
  onTeamNameChange: jest.fn(),
  onOpponentNameChange: jest.fn(),
  interactions: {
      players: {
        move: jest.fn(),
        moveEnd: jest.fn(),
        remove: jest.fn(),
        drop: jest.fn(),
        swap: jest.fn(),
      },
    opponents: {
      move: jest.fn(),
      moveEnd: jest.fn(),
      remove: jest.fn(),
    },
    drawing: {
      start: jest.fn(),
      addPoint: jest.fn(),
      end: jest.fn(),
    },
    tactical: {
      drawingStart: jest.fn(),
      drawingAddPoint: jest.fn(),
      drawingEnd: jest.fn(),
      discMove: jest.fn(),
      discMoveEnd: jest.fn(),
      discRemove: jest.fn(),
      discToggleType: jest.fn(),
      ballMove: jest.fn(),
      ballMoveEnd: jest.fn(),
    },
    touch: {
      playerDrop: jest.fn(),
      playerDragCancel: jest.fn(),
    },
  },
  onTogglePositionLabels: jest.fn(),
  onWentToOvertimeChange: jest.fn(),
  onShootoutKicksChange: jest.fn(),
  onWentToPenaltiesChange: jest.fn(),
  timerInteractions: {
    toggleLargeOverlay: jest.fn(),
    quickGoal: jest.fn(),
    onOpenPlayerAssessmentModal: jest.fn(),
    logOpponentGoal: jest.fn(),
    substitutionMade: jest.fn(),
    setSubInterval: jest.fn(),
    startPauseTimer: jest.fn(),
    resetTimer: jest.fn(),
  },
});

describe('FieldContainer', () => {
  afterEach(() => {
    mockAppLayout = 'full';
    mockPlannedChains = [];
    mockPlannedPrompts = { current: null, overdueEarlier: 0, hasPlan: false };
    localStorage.clear();
  });

  describe('one sub mechanism by default, per game', () => {
    const liveGame = (gameId = 'game_1', subAlertLevel: 'none' | 'warning' | 'due' = 'due') => ({
      ...baseProps(),
      currentGameId: gameId,
      timerVM: { ...baseProps().timerVM, showLargeTimerOverlay: true, subAlertLevel },
    });
    const overlay = () => screen.getByTestId('timer-overlay');

    /**
     * The visibility matrix: plan / no plan x the per-game switch. The basic
     * layout only changes the reset button (D13), never which mechanism shows.
     * @critical
     */
    it.each([
      { layout: 'full' as const, plan: true, choice: undefined, shown: false },
      { layout: 'full' as const, plan: true, choice: true, shown: true },
      { layout: 'full' as const, plan: false, choice: undefined, shown: true },
      { layout: 'full' as const, plan: false, choice: false, shown: false },
      { layout: 'basic' as const, plan: true, choice: undefined, shown: false },
      { layout: 'basic' as const, plan: true, choice: true, shown: true },
      { layout: 'basic' as const, plan: false, choice: undefined, shown: true },
      { layout: 'basic' as const, plan: false, choice: false, shown: false },
    ])('$layout layout, plan $plan, switch $choice -> sub timer shown $shown', ({ layout, plan, choice, shown }) => {
      mockAppLayout = layout;
      mockPlannedPrompts = { current: null, overdueEarlier: 0, hasPlan: plan };
      if (choice !== undefined) {
        localStorage.setItem('matchops_sub_timer_visibility', JSON.stringify({ game_1: choice }));
      }
      render(<FieldContainer {...liveGame()} />);
      expect(overlay()).toHaveAttribute('data-show-sub-timer', String(shown));
      expect(overlay()).toHaveAttribute('data-has-plan', String(plan));
      expect(overlay()).toHaveAttribute('data-sub-timer-reset', String(layout === 'full'));
      // A hidden sub timer raises no sub alerts on the clock.
      expect(overlay()).toHaveAttribute('data-sub-alert', shown ? 'due' : 'none');
    });

    it('decides nothing while the schedule is still loading (no flash of either)', () => {
      mockPlannedPrompts = { current: null, overdueEarlier: 0, hasPlan: null };
      render(<FieldContainer {...liveGame()} />);
      expect(overlay()).toHaveAttribute('data-show-sub-timer', 'false');
      expect(overlay()).toHaveAttribute('data-has-plan', 'false');
    });

    /**
     * The switch is remembered with the game: a reload/resume (a fresh mount)
     * keeps it, and another game keeps its own default.
     * @critical
     */
    it('remembers the switch per game across a remount, and not for other games', () => {
      mockPlannedPrompts = { current: null, overdueEarlier: 0, hasPlan: true };
      const { unmount } = render(<FieldContainer {...liveGame()} />);
      expect(overlay()).toHaveAttribute('data-show-sub-timer', 'false');
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'switch on' }));
      });
      expect(overlay()).toHaveAttribute('data-show-sub-timer', 'true');
      unmount();

      const { rerender } = render(<FieldContainer {...liveGame()} />);
      expect(overlay()).toHaveAttribute('data-show-sub-timer', 'true');
      rerender(<FieldContainer {...liveGame('game_2')} />);
      expect(overlay()).toHaveAttribute('data-show-sub-timer', 'false');
      rerender(<FieldContainer {...liveGame()} />);
      expect(overlay()).toHaveAttribute('data-show-sub-timer', 'true');
    });

    it('opens the planner from the timer, and offers no switch without a saved game', () => {
      const { unmount } = render(<FieldContainer {...liveGame()} />);
      fireEvent.click(screen.getByRole('button', { name: 'make plan' }));
      expect(mockSetIsPlaytimePlannerOpen).toHaveBeenCalledWith(true);
      unmount();
      render(<FieldContainer {...liveGame(DEFAULT_GAME_ID)} />);
      expect(screen.queryByRole('button', { name: 'switch on' })).not.toBeInTheDocument();
    });
  });

  /** Onboarding v3 (D13): the basic layout has no "Nollaa vaihtoajastin". */
  it('hides the sub-timer reset on the timer in the basic layout only', () => {
    const withOverlay = () => ({ ...baseProps(), timerVM: { ...baseProps().timerVM, showLargeTimerOverlay: true } });
    const { unmount } = render(<FieldContainer {...withOverlay()} />);
    expect(screen.getByTestId('timer-overlay')).toHaveAttribute('data-sub-timer-reset', 'true');
    unmount();
    mockAppLayout = 'basic';
    render(<FieldContainer {...withOverlay()} />);
    expect(screen.getByTestId('timer-overlay')).toHaveAttribute('data-sub-timer-reset', 'false');
  });

  it('suggests roster creation when no players exist', () => {
    render(<FieldContainer {...baseProps()} />);
    expect(screen.getByText('Add players')).toBeInTheDocument();
  });

  it('invokes roster callback when CTA is used without a roster', () => {
    const props = baseProps();
    render(<FieldContainer {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /add players/i }));
    expect(props.onOpenRosterModal).toHaveBeenCalledTimes(1);
  });

  it('invokes new game callback when roster exists', () => {
    const props = {
      ...baseProps(),
      availablePlayers: [TestFixtures.players.fieldPlayer()],
    };
    render(<FieldContainer {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /Create Match/i }));
    expect(props.onOpenNewGameSetup).toHaveBeenCalledTimes(1);
  });

  it('allows dismissing the setup overlay', () => {
    const props = {
      ...baseProps(),
      availablePlayers: [TestFixtures.players.fieldPlayer()],
    };
    render(<FieldContainer {...props} />);

    // Overlay should be visible
    expect(screen.getByText(/Ready to create your first match/i)).toBeInTheDocument();

    // Click dismiss button
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));

    // Overlay should be gone. The on-field "Create Game" pill was removed - a new
    // game is started from the hamburger menu instead.
    expect(screen.queryByText(/Ready to create your first match/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Create Game/i)).not.toBeInTheDocument();
  });

  /**
   * Select-and-place: a player tapped in the bar waits for a tap on the pitch.
   * The amber ring on the picked disc names who; the pitch outline says where.
   * There is no notice pill over the pitch any more.
   * @critical
   */
  it('shows the amber pitch outline but no notice while a player waits to be placed', () => {
    const base = baseProps();
    const props = {
      ...base,
      fieldVM: { ...base.fieldVM, draggingPlayerFromBarInfo: TestFixtures.players.fieldPlayer({ name: 'Leo' }) },
    };
    render(<FieldContainer {...props} />);

    expect(screen.getByTestId('placement-outline')).toBeInTheDocument();
    expect(screen.queryByTestId('placement-hint')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancel selection/i })).not.toBeInTheDocument();
  });

  describe('Export Button', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockIsExportSupported.mockReturnValue(true);
    });

    it('shows export button when game is active and export is supported', () => {
      render(
        <FieldContainer
          {...baseProps()}
          currentGameId="game-123"
        />,
      );

      expect(screen.getByRole('button', { name: /export field as image/i })).toBeInTheDocument();
    });

    it('shows export button even on default game ID (always visible)', () => {
      render(<FieldContainer {...baseProps()} />);

      // Buttons are now always visible regardless of game state
      expect(screen.getByRole('button', { name: /export field as image/i })).toBeInTheDocument();
    });

    it('hides export button when export is not supported', () => {
      mockIsExportSupported.mockReturnValue(false);

      render(
        <FieldContainer
          {...baseProps()}
          currentGameId="game-123"
        />,
      );

      expect(screen.queryByRole('button', { name: /export field as image/i })).not.toBeInTheDocument();
    });

    it('calls exportFieldAsImage when export button is clicked', async () => {
      mockExportFieldAsImage.mockResolvedValue(undefined);

      render(
        <FieldContainer
          {...baseProps()}
          currentGameId="game-123"
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: /export field as image/i }));

      // Wait for async operation
      await screen.findByRole('button', { name: /export field as image/i });

      expect(mockExportFieldAsImage).toHaveBeenCalled();
    });

    it('shows error toast when export fails', async () => {
      mockExportFieldAsImage.mockRejectedValue(new Error('Export failed'));

      render(
        <FieldContainer
          {...baseProps()}
          currentGameId="game-123"
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: /export field as image/i }));

      // Wait for async operation
      await screen.findByRole('button', { name: /export field as image/i });

      expect(mockShowToast).toHaveBeenCalledWith('Failed to export field', 'error');
    });
  });

  describe('Rules Button', () => {
    it('shows rules button when onOpenRulesModal is provided', () => {
      const onOpenRulesModal = jest.fn();
      render(
        <FieldContainer
          {...baseProps()}
          onOpenRulesModal={onOpenRulesModal}
        />,
      );

      expect(screen.getByRole('button', { name: /view rules/i })).toBeInTheDocument();
    });

    it('hides rules button when onOpenRulesModal is not provided', () => {
      render(
        <FieldContainer
          {...baseProps()}
          onOpenRulesModal={undefined}
        />,
      );

      expect(screen.queryByRole('button', { name: /view rules/i })).not.toBeInTheDocument();
    });

    it('calls onOpenRulesModal when rules button is clicked', () => {
      const onOpenRulesModal = jest.fn();
      render(
        <FieldContainer
          {...baseProps()}
          onOpenRulesModal={onOpenRulesModal}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: /view rules/i }));
      expect(onOpenRulesModal).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * Two views, one toggle: the lineup (players plus the waiting subs as real
   * discs on the sideline) and "Substitutions and minutes" (the chains alone).
   * Not persisted: the field always opens on the lineup.
   * @critical
   */
  describe('Plan view toggle', () => {
    const CHAIN = {
      positionLabel: 'LM',
      relX: 0.25,
      relY: 0.52,
      starterName: 'Petja',
      entries: [{ id: 'a', minute: 10, name: 'Tomas', waveIndex: 0 }],
    };
    const SUB_SLOTS = [{ positionLabel: 'LM', relX: 0.96, relY: 0.5 }];
    const WAITING_SUB = TestFixtures.players.fieldPlayer({ name: 'Tomas', relX: 0.96, relY: 0.5 });
    const withLineup = () => {
      const base = baseProps();
      return {
        ...base,
        fieldVM: { ...base.fieldVM, playersOnField: [WAITING_SUB], subSlots: SUB_SLOTS },
      };
    };

    beforeEach(() => {
      jest.useFakeTimers();
      mockPlannedChains = [CHAIN];
    });
    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();
      mockSoccerFieldRender.mockClear();
    });

    const toggle = () => screen.getByTestId('toggle-plan-view');
    const tap = () =>
      act(() => {
        fireEvent.click(toggle());
      });

    it('is hidden when the game has no chain view to offer', () => {
      mockPlannedChains = [];
      render(<FieldContainer {...withLineup()} />);
      expect(screen.queryByTestId('toggle-plan-view')).not.toBeInTheDocument();
      expect(fieldProps().plannedChains).toBeUndefined();
    });

    it('opens on the lineup: players and waiting subs as discs, no chains, no pill', () => {
      render(<FieldContainer {...withLineup()} />);
      expect(toggle()).toHaveAttribute('aria-pressed', 'false');
      expect(toggle()).toHaveAccessibleName('Lineup');
      expect(screen.queryByTestId('field-tool-pill')).not.toBeInTheDocument();
      expect(fieldProps().players).toEqual([WAITING_SUB]);
      expect(fieldProps().subSlots).toEqual(SUB_SLOTS);
      expect(fieldProps().plannedChains).toBeUndefined();
      expect(fieldProps()).not.toHaveProperty('plannedGhosts');
    });

    it('toggles to the chains alone and back to the lineup', () => {
      render(<FieldContainer {...withLineup()} />);

      tap(); // lineup -> chains
      expect(toggle()).toHaveAttribute('aria-pressed', 'true');
      expect(toggle()).toHaveAccessibleName('Substitutions and minutes');
      expect(fieldProps().plannedChains).toEqual([CHAIN]);
      expect(fieldProps().players).toEqual([]);
      expect(fieldProps().subSlots).toEqual([]);

      tap(); // chains -> lineup
      expect(toggle()).toHaveAttribute('aria-pressed', 'false');
      expect(toggle()).toHaveAccessibleName('Lineup');
      expect(fieldProps().plannedChains).toBeUndefined();
      expect(fieldProps().players).toEqual([WAITING_SUB]);
      expect(fieldProps().subSlots).toEqual(SUB_SLOTS);
    });

    it('opens on the lineup again after a remount (not persisted)', () => {
      const { unmount } = render(<FieldContainer {...withLineup()} />);
      tap(); // -> chains
      unmount();
      render(<FieldContainer {...withLineup()} />);
      expect(toggle()).toHaveAttribute('aria-pressed', 'false');
      expect(fieldProps().plannedChains).toBeUndefined();
    });

    /** @edge-case - a brief confirmation of a tap, not a standing label. */
    it('names the view a tap switched to, then fades the pill out', () => {
      render(<FieldContainer {...withLineup()} />);

      tap(); // -> chains
      expect(screen.getByTestId('field-tool-pill')).toHaveTextContent('Substitutions and minutes');
      act(() => {
        jest.advanceTimersByTime(FIELD_TOOL_PILL_VISIBLE_MS);
      });
      expect(screen.getByTestId('field-tool-pill').firstChild).toHaveClass('opacity-0');
      act(() => {
        jest.advanceTimersByTime(FIELD_TOOL_PILL_FADE_MS);
      });
      expect(screen.queryByTestId('field-tool-pill')).not.toBeInTheDocument();
      // State persists on the button after the pill is gone.
      expect(toggle()).toHaveAttribute('aria-pressed', 'true');

      tap(); // -> lineup
      expect(screen.getByTestId('field-tool-pill')).toHaveTextContent('Lineup');
    });

    it('re-toggling restarts the display time', () => {
      render(<FieldContainer {...withLineup()} />);
      tap(); // -> chains
      act(() => {
        jest.advanceTimersByTime(FIELD_TOOL_PILL_VISIBLE_MS - 100);
      });
      tap(); // -> lineup: a fresh full display
      act(() => {
        jest.advanceTimersByTime(FIELD_TOOL_PILL_VISIBLE_MS - 100);
      });
      expect(screen.getByTestId('field-tool-pill').firstChild).toHaveClass('opacity-100');
      expect(screen.getByTestId('field-tool-pill')).toHaveTextContent('Lineup');
    });

    it('clears its timers on unmount', () => {
      const { unmount } = render(<FieldContainer {...withLineup()} />);
      tap();
      expect(jest.getTimerCount()).toBeGreaterThan(0);
      unmount();
      expect(jest.getTimerCount()).toBe(0);
    });
  });
});
