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

const createProps = (): GameContainerProps => ({
  gameInfoBarProps: { teamName: 'Team', opponentName: 'Opponent' } as GameContainerProps['gameInfoBarProps'],
  playerBarProps: { players: [] } as GameContainerProps['playerBarProps'],
  controlBarProps: { onSaveGame: jest.fn() } as GameContainerProps['controlBarProps'],
  fieldProps: createFieldProps(),
  currentGameId: 'game_123',
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
    const props = createProps();
    props.fieldProps = createFieldProps({
      gameSessionState: null as unknown as FieldContainerProps['gameSessionState'],
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
    mockPlayerBarModule.mockImplementationOnce(() => {
      throw new Error('boom');
    });

    render(<GameContainer {...createProps()} />);

    expect(
      screen.getByText('Player bar crashed. Please refresh the page.')
    ).toBeInTheDocument();
  });
});
