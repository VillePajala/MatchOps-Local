import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { FieldContainer } from './FieldContainer';
import { initialGameSessionStatePlaceholder } from '@/hooks/useGameSessionReducer';
import { DEFAULT_GAME_ID } from '@/config/constants';
import { TestFixtures } from '../../../../tests/fixtures';

jest.mock('@/components/TimerOverlay', () => {
  const TimerOverlay = () => <div data-testid="timer-overlay" />;
  TimerOverlay.displayName = 'TimerOverlay';
  return { __esModule: true, default: TimerOverlay };
});
jest.mock('@/components/SoccerField', () => {
  const React = require('react');
  const SoccerField = React.forwardRef((_props: unknown, ref: unknown) => {
    const mockCanvas = React.useRef(null);

    React.useImperativeHandle(ref, () => ({
      getCanvas: () => mockCanvas.current,
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
jest.mock('@/components/HomePage/components/FirstGameGuide', () => ({
  FirstGameGuide: () => <div data-testid="first-game-guide" />,
}));
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
jest.mock('@/utils/exportField', () => ({
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
  showFirstGameGuide: false,
  hasCheckedFirstGameGuide: false,
  firstGameGuideStep: 0,
  orphanedGameInfo: null,
  onOpenNewGameSetup: jest.fn(),
  onOpenRosterModal: jest.fn(),
  onOpenSeasonTournamentModal: jest.fn(),
  onOpenTeamManagerModal: jest.fn(),
  onGuideStepChange: jest.fn(),
  onGuideClose: jest.fn(),
  onOpenTeamReassignModal: jest.fn(),
  onTeamNameChange: jest.fn(),
  onOpponentNameChange: jest.fn(),
  interactions: {
    players: {
      move: jest.fn(),
      moveEnd: jest.fn(),
      remove: jest.fn(),
      drop: jest.fn(),
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
      discRemove: jest.fn(),
      discToggleType: jest.fn(),
      ballMove: jest.fn(),
    },
    touch: {
      playerDrop: jest.fn(),
      playerDragCancel: jest.fn(),
    },
  },
  timerInteractions: {
    toggleLargeOverlay: jest.fn(),
    toggleGoalLogModal: jest.fn(),
    logOpponentGoal: jest.fn(),
    substitutionMade: jest.fn(),
    setSubInterval: jest.fn(),
    startPauseTimer: jest.fn(),
    resetTimer: jest.fn(),
  },
});

describe('FieldContainer', () => {
  it('suggests roster creation when no players exist', () => {
    render(<FieldContainer {...baseProps()} />);
    expect(screen.getByText('Set Up Team Roster')).toBeInTheDocument();
  });

  it('shows first game guide when configured for non-default game', () => {
    render(
      <FieldContainer
        {...baseProps()}
        currentGameId="game-123"
        showFirstGameGuide
        hasCheckedFirstGameGuide
      />,
    );

    expect(screen.getByTestId('first-game-guide')).toBeInTheDocument();
  });

  it('invokes roster callback when CTA is used without a roster', () => {
    const props = baseProps();
    render(<FieldContainer {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /set up team roster/i }));
    expect(props.onOpenRosterModal).toHaveBeenCalledTimes(1);
  });

  it('invokes new game and season callbacks when roster exists', () => {
    const props = {
      ...baseProps(),
      availablePlayers: [TestFixtures.players.fieldPlayer()],
      seasons: [TestFixtures.seasons.current()],
    };
    render(<FieldContainer {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /create your first match/i }));
    expect(props.onOpenNewGameSetup).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /manage seasons & tournaments/i }));
    expect(props.onOpenSeasonTournamentModal).toHaveBeenCalledTimes(1);
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

    it('hides export button on default game ID', () => {
      render(<FieldContainer {...baseProps()} />);

      expect(screen.queryByRole('button', { name: /export field as image/i })).not.toBeInTheDocument();
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

      expect(mockShowToast).toHaveBeenCalledWith('Field exported successfully', 'success');
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
});
