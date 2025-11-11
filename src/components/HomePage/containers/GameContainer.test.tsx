import { render, screen } from '@testing-library/react';
import React from 'react';
import { GameContainer } from './GameContainer';
import { DEFAULT_GAME_ID } from '@/config/constants';
import { initialGameSessionStatePlaceholder } from '@/hooks/useGameSessionReducer';
import type { FieldContainerProps } from './FieldContainer';
import type { GameContainerProps } from './GameContainer';

const PlayerBarMock = jest.fn();
const GameInfoBarMock = jest.fn();
const ControlBarMock = jest.fn();
const FieldContainerMock = jest.fn();

jest.mock('@/components/PlayerBar', () => ({
  __esModule: true,
  default: jest.fn((props) => {
    PlayerBarMock(props);
    return <div data-testid="player-bar" />;
  }),
}));

jest.mock('@/components/GameInfoBar', () => ({
  __esModule: true,
  default: jest.fn((props) => {
    GameInfoBarMock(props);
    return <div data-testid="game-info-bar" />;
  }),
}));

jest.mock('@/components/ControlBar', () => ({
  __esModule: true,
  default: jest.fn((props) => {
    ControlBarMock(props);
    return <div data-testid="control-bar" />;
  }),
}));

jest.mock('./FieldContainer', () => ({
  __esModule: true,
  FieldContainer: jest.fn((props) => {
    FieldContainerMock(props);
    return <div data-testid="field-container" />;
  }),
}));

const mockPlayerBarModule = jest.requireMock('@/components/PlayerBar').default as jest.Mock;

const createFieldProps = (overrides?: Partial<FieldContainerProps>): FieldContainerProps =>
  ({
    gameSessionState: initialGameSessionStatePlaceholder,
    ...overrides,
  } as FieldContainerProps);

const createProps = (overrides?: Partial<GameContainerProps>): GameContainerProps => ({
  gameSessionState: initialGameSessionStatePlaceholder,
  currentGameId: 'game_123',
  draggingPlayerFromBarInfo: null,
  showLargeTimerOverlay: false,
  initialLoadComplete: true,
  orphanedGameInfo: null,
  showFirstGameGuide: false,
  hasCheckedFirstGameGuide: false,
  firstGameGuideStep: 0,
  handlePlayerDragStartFromBar: jest.fn(),
  handleDeselectPlayer: jest.fn(),
  handlePlayerTapInBar: jest.fn(),
  handleToggleGoalieForModal: jest.fn(),
  handleTeamNameChange: jest.fn(),
  handleOpponentNameChange: jest.fn(),
  setIsTeamReassignModalOpen: jest.fn(),
  handleToggleLargeTimerOverlay: jest.fn(),
  handleToggleGoalLogModal: jest.fn(),
  handleLogOpponentGoal: jest.fn(),
  handlePlayerMove: jest.fn(),
  handlePlayerMoveEnd: jest.fn(),
  handlePlayerRemove: jest.fn(),
  handleDropOnField: jest.fn(),
  handlePlayerDropViaTouch: jest.fn(),
  handlePlayerDragCancelViaTouch: jest.fn(),
  setIsRosterModalOpen: jest.fn(),
  setIsNewGameSetupModalOpen: jest.fn(),
  handleOpenTeamManagerModal: jest.fn(),
  setIsSeasonTournamentModalOpen: jest.fn(),
  setShowFirstGameGuide: jest.fn(),
  setFirstGameGuideStep: jest.fn(),
  handleUndo: jest.fn(),
  handleRedo: jest.fn(),
  handleResetField: jest.fn(),
  handleClearDrawingsForView: jest.fn(),
  handlePlaceAllPlayers: jest.fn(),
  handleToggleTrainingResources: jest.fn(),
  handleToggleGameStatsModal: jest.fn(),
  handleOpenLoadGameModal: jest.fn(),
  handleStartNewGame: jest.fn(),
  openRosterModal: jest.fn(),
  handleQuickSaveGame: jest.fn(),
  handleOpenGameSettingsModal: jest.fn(),
  handleOpenSeasonTournamentModal: jest.fn(),
  handleToggleInstructionsModal: jest.fn(),
  handleOpenSettingsModal: jest.fn(),
  openPlayerAssessmentModal: jest.fn(),
  handleOpenPersonnelManager: jest.fn(),
  ...overrides,
});

describe('GameContainer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlayerBarModule.mockImplementation((props) => {
      PlayerBarMock(props);
      return <div data-testid="player-bar" />;
    });
  });

  it('returns null when no game session state', () => {
    const props = createProps({
      gameSessionState: null as unknown as GameContainerProps['gameSessionState'],
    });

    const { container } = render(<GameContainer {...props} />);
    expect(container.firstChild).toBeNull();
  });

  it('computes isGameLoaded for control bar', () => {
    const props = createProps();

    render(<GameContainer {...props} />);
    expect(ControlBarMock).toHaveBeenCalled();
    expect(ControlBarMock.mock.calls[0][0].isGameLoaded).toBe(true);

    jest.clearAllMocks();

    render(<GameContainer {...props} currentGameId={DEFAULT_GAME_ID} />);
    expect(ControlBarMock.mock.calls[0][0].isGameLoaded).toBe(false);
  });

  it('renders fallback UI when PlayerBar throws', () => {
    // Suppress expected React error boundary console errors
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {
      // Silently suppress all console.error calls during this test
      // React error boundaries generate expected errors that we want to ignore
    });

    // Mock PlayerBar to throw an error during render
    mockPlayerBarModule.mockImplementation(() => {
      throw new Error('boom');
    });

    render(<GameContainer {...createProps()} />);

    expect(
      screen.getByText('Player bar crashed. Please refresh the page.')
    ).toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });
});
