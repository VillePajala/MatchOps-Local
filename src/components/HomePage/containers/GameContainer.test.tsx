import { render, screen } from '@testing-library/react';
import React from 'react';
import { GameContainer } from './GameContainer';
import type { GameContainerProps } from './GameContainer';
import { DEFAULT_GAME_ID } from '@/config/constants';
import { initialGameSessionStatePlaceholder } from '@/hooks/useGameSessionReducer';
import { TestFixtures } from '../../../../tests/fixtures';
import type { GameContainerViewModel } from '@/viewModels/gameContainer';

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

// Use shared fixture instead of local createProps
const { createGameContainerProps } = TestFixtures.gameContainer;

describe('GameContainer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlayerBarModule.mockImplementation((props) => {
      PlayerBarMock(props);
      return <div data-testid="player-bar" />;
    });
  });

  it('returns null when no game session state', () => {
    const props = createGameContainerProps({
      gameSessionState: null as unknown as GameContainerProps['gameSessionState'],
    });

    const { container } = render(<GameContainer {...props} />);
    expect(container.firstChild).toBeNull();
  });

  it('computes isGameLoaded for control bar', () => {
    const props = createGameContainerProps();

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

    render(<GameContainer {...createGameContainerProps()} />);

    expect(
      screen.getByText('Player bar crashed. Please refresh the page.')
    ).toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });

  it('uses view-model data when provided (parity with props)', () => {
    const props = createGameContainerProps({
      gameSessionState: {
        ...initialGameSessionStatePlaceholder,
        teamName: 'Team A',
        opponentName: 'Team B',
        homeScore: 2,
        awayScore: 1,
        gameEvents: [{ id: 'e1', type: 'goal', time: 10, scorerId: 'p1' }],
      },
      playersForCurrentGame: [
        { id: 'p1', name: 'Alice' },
        { id: 'p2', name: 'Bob' },
      ],
      draggingPlayerFromBarInfo: { id: 'p2', name: 'Bob' },
    });

    const vm: GameContainerViewModel = {
      playerBar: {
        players: [{ id: 'p3', name: 'VM-Player' }],
        selectedPlayerIdFromBar: 'p3',
        gameEvents: [{ id: 'e2', type: 'goal', time: 20, scorerId: 'p3' }],
      },
      gameInfo: {
        teamName: 'VM Team',
        opponentName: 'VM Opponent',
        homeScore: 9,
        awayScore: 8,
        homeOrAway: 'home',
      },
      timer: {
        timeElapsedInSeconds: 0,
        isTimerRunning: false,
        subAlertLevel: 'none',
        lastSubConfirmationTimeSeconds: 0,
        numberOfPeriods: 2,
        periodDurationMinutes: 10,
        currentPeriod: 1,
        gameStatus: 'notStarted',
      },
    };

    render(<GameContainer {...props} viewModel={vm} />);

    // PlayerBar should receive VM values
    const playerBarCall = PlayerBarMock.mock.calls[0][0];
    expect(playerBarCall.players).toEqual([{ id: 'p3', name: 'VM-Player' }]);
    expect(playerBarCall.selectedPlayerIdFromBar).toBe('p3');
    expect(playerBarCall.gameEvents).toEqual([{ id: 'e2', type: 'goal', time: 20, scorerId: 'p3' }]);

    // GameInfoBar should receive VM values
    const gameInfoBarCall = GameInfoBarMock.mock.calls[0][0];
    expect(gameInfoBarCall.teamName).toBe('VM Team');
    expect(gameInfoBarCall.opponentName).toBe('VM Opponent');
    expect(gameInfoBarCall.homeScore).toBe(9);
    expect(gameInfoBarCall.awayScore).toBe(8);
    expect(gameInfoBarCall.homeOrAway).toBe('home');
  });
});
