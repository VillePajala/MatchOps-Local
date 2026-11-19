import { render, screen, fireEvent, act } from '@testing-library/react';
// The assessment setting is on here: these tests assert the handlers are wired.
jest.mock('@/hooks/useAssessmentsEnabled', () => ({ useAssessmentsEnabled: () => true }));
// The account's layout (Onboarding v3); 'full' unless a test says otherwise.
let mockAppLayout: 'basic' | 'full' | undefined = 'full';
jest.mock('@/hooks/useAppLayout', () => ({ useAppLayout: () => mockAppLayout }));
// Planned-sub markers for the plan-view toggle; none unless a test sets them.
let mockPlannedGhosts: unknown[] = [];
jest.mock('@/hooks/usePlannedGhosts', () => ({ usePlannedGhosts: () => mockPlannedGhosts }));
jest.mock('@/hooks/usePlannedChains', () => ({ usePlannedChains: () => [] }));
import type { ReactNode } from 'react';
import { FieldContainer, FIELD_TOOL_PILL_VISIBLE_MS, FIELD_TOOL_PILL_FADE_MS } from './FieldContainer';
import { initialGameSessionStatePlaceholder } from '@/hooks/useGameSessionReducer';
import { DEFAULT_GAME_ID } from '@/config/constants';
import { TestFixtures } from '../../../../tests/fixtures';

jest.mock('@/components/TimerOverlay', () => {
  const TimerOverlay = ({ showSubTimerReset }: { showSubTimerReset?: boolean }) => (
    <div data-testid="timer-overlay" data-sub-timer-reset={String(showSubTimerReset)} />
  );
  TimerOverlay.displayName = 'TimerOverlay';
  return { __esModule: true, default: TimerOverlay };
});
jest.mock('@/components/SoccerField', () => {
  const React = require('react');
  const SoccerField = React.forwardRef((_props: unknown, ref: unknown) => {
    const mockCanvas = React.useRef(null);

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
    mockPlannedGhosts = [];
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
   * The plan-view name pill is a brief confirmation of a tap, not a standing
   * label on the grass: shown when the tool switches on, gone after a moment.
   * @edge-case
   */
  describe('Plan view name pill', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      mockPlannedGhosts = [{ id: 'ghost-1' }];
    });
    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    const toggle = () => screen.getByTestId('toggle-planned-ghosts');
    const tap = () =>
      act(() => {
        fireEvent.click(toggle());
      });

    it('shows no pill on first render; the button carries the state', () => {
      render(<FieldContainer {...baseProps()} />);
      expect(screen.queryByTestId('field-tool-pill')).not.toBeInTheDocument();
      expect(toggle()).toHaveAttribute('aria-pressed', 'true');
      expect(toggle()).toHaveAccessibleName('Planned substitutions');
    });

    it('switching off shows nothing; switching on shows the name, then fades it out', () => {
      render(<FieldContainer {...baseProps()} />);

      tap(); // ghosts -> lineup (no chains in this game)
      expect(toggle()).toHaveAttribute('aria-pressed', 'false');
      expect(toggle()).toHaveAccessibleName('Lineup only');
      expect(screen.queryByTestId('field-tool-pill')).not.toBeInTheDocument();

      tap(); // lineup -> ghosts
      expect(toggle()).toHaveAttribute('aria-pressed', 'true');
      expect(toggle()).toHaveAccessibleName('Planned substitutions');
      expect(screen.getByTestId('field-tool-pill')).toHaveTextContent('Planned substitutions');

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
      expect(toggle()).toHaveAccessibleName('Planned substitutions');
    });

    it('toggling off mid-display hides the pill at once and leaves no timer running', () => {
      render(<FieldContainer {...baseProps()} />);
      tap(); // -> lineup
      tap(); // -> ghosts (pill up)
      expect(screen.getByTestId('field-tool-pill')).toBeInTheDocument();

      tap(); // -> lineup
      expect(screen.queryByTestId('field-tool-pill')).not.toBeInTheDocument();
      expect(jest.getTimerCount()).toBe(0);
    });

    it('re-toggling on restarts the display time', () => {
      render(<FieldContainer {...baseProps()} />);
      tap(); // -> lineup
      tap(); // -> ghosts
      act(() => {
        jest.advanceTimersByTime(FIELD_TOOL_PILL_VISIBLE_MS - 100);
      });
      tap(); // -> lineup
      tap(); // -> ghosts again: a fresh full display
      act(() => {
        jest.advanceTimersByTime(FIELD_TOOL_PILL_VISIBLE_MS - 100);
      });
      expect(screen.getByTestId('field-tool-pill').firstChild).toHaveClass('opacity-100');
    });

    it('clears its timers on unmount', () => {
      const { unmount } = render(<FieldContainer {...baseProps()} />);
      tap();
      tap();
      expect(jest.getTimerCount()).toBeGreaterThan(0);
      unmount();
      expect(jest.getTimerCount()).toBe(0);
    });
  });
});
