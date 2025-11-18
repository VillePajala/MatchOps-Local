/**
 * @unit
 * @edge-case
 * Validates GameContainer rendering paths and VM parity before extraction.
 */
import { render, screen } from '@testing-library/react';
import React from 'react';
import { GameContainer } from './GameContainer';
import { TestFixtures } from '../../../../tests/fixtures';

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

  it('renders even when no game session state (renders shell)', () => {
    const props = createGameContainerProps();
    // GameSessionState is now in fieldProps
    props.fieldProps.gameSessionState = null as unknown as typeof props.fieldProps.gameSessionState;

    const { container } = render(<GameContainer {...props} />);
    // GameContainer always renders the shell, even with null state
    expect(container.firstChild).not.toBeNull();
    expect(container.querySelector('[data-testid="home-page"]')).toBeInTheDocument();
  });

  it('computes isGameLoaded for control bar', () => {
    const props = createGameContainerProps();
    props.controlBarProps.isGameLoaded = true;

    render(<GameContainer {...props} />);
    expect(ControlBarMock).toHaveBeenCalled();
    expect(ControlBarMock.mock.calls[0][0].isGameLoaded).toBe(true);

    jest.clearAllMocks();

    props.controlBarProps.isGameLoaded = false;
    render(<GameContainer {...props} />);
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
      playerBar: {
        players: [{ id: 'p3', name: 'VM-Player' } as unknown as (typeof props)['playerBar']['players'][0]],
        selectedPlayerIdFromBar: 'p3',
        gameEvents: [{ id: 'e2', type: 'goal', time: 20, scorerId: 'p3' } as unknown as (typeof props)['playerBar']['gameEvents'][0]],
      },
      gameInfo: {
        teamName: 'VM Team',
        opponentName: 'VM Opponent',
        homeScore: 9,
        awayScore: 8,
        homeOrAway: 'home',
      },
    });

    render(<GameContainer {...props} />);

    // PlayerBar should receive the provided values
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
