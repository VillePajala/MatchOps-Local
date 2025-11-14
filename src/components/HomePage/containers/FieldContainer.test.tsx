import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { FieldContainer } from './FieldContainer';
import { initialGameSessionStatePlaceholder } from '@/hooks/useGameSessionReducer';
import { DEFAULT_GAME_ID } from '@/config/constants';

jest.mock('@/components/TimerOverlay', () => {
  const TimerOverlay = () => <div data-testid="timer-overlay" />;
  TimerOverlay.displayName = 'TimerOverlay';
  return { __esModule: true, default: TimerOverlay };
});
jest.mock('@/components/SoccerField', () => {
  const SoccerField = () => <div data-testid="soccer-field" />;
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
  handlePlayerMove: jest.fn(),
  handlePlayerMoveEnd: jest.fn(),
  handlePlayerRemove: jest.fn(),
  handleOpponentMove: jest.fn(),
  handleOpponentMoveEnd: jest.fn(),
  handleOpponentRemove: jest.fn(),
  handleDropOnField: jest.fn(),
  handleDrawingStart: jest.fn(),
  handleDrawingAddPoint: jest.fn(),
  handleDrawingEnd: jest.fn(),
  handleTacticalDrawingStart: jest.fn(),
  handleTacticalDrawingAddPoint: jest.fn(),
  handleTacticalDrawingEnd: jest.fn(),
  handleTacticalDiscMove: jest.fn(),
  handleTacticalDiscRemove: jest.fn(),
  handleToggleTacticalDiscType: jest.fn(),
  handleTacticalBallMove: jest.fn(),
  handlePlayerDropViaTouch: jest.fn(),
  handlePlayerDragCancelViaTouch: jest.fn(),
  handleToggleLargeTimerOverlay: jest.fn(),
  handleToggleGoalLogModal: jest.fn(),
  handleLogOpponentGoal: jest.fn(),
  handleSubstitutionMade: jest.fn(),
  handleSetSubInterval: jest.fn(),
  handleStartPauseTimer: jest.fn(),
  handleResetTimer: jest.fn(),
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
});
