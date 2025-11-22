import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { GameStateProvider, useGameState } from '../GameStateContext';

/**
 * Tests for GameStateContext (Week 2-3 PR1)
 *
 * Validates that the context provider renders correctly and
 * that the useGameState hook provides access to shared state.
 */

// Test component that uses the hook
function TestConsumer() {
  const { gameSessionState, currentGameId, availablePlayers } = useGameState();

  return (
    <div>
      <div data-testid="team-name">{gameSessionState.teamName}</div>
      <div data-testid="current-game-id">{currentGameId}</div>
      <div data-testid="players-count">{availablePlayers.length}</div>
    </div>
  );
}

describe('GameStateContext', () => {
  describe('GameStateProvider', () => {
    it('should render children without errors', () => {
      render(
        <GameStateProvider>
          <div data-testid="child">Test Child</div>
        </GameStateProvider>
      );

      expect(screen.getByTestId('child')).toBeInTheDocument();
      expect(screen.getByTestId('child')).toHaveTextContent('Test Child');
    });

    it('should provide default initial state', () => {
      render(
        <GameStateProvider>
          <TestConsumer />
        </GameStateProvider>
      );

      // Check that default values are provided
      expect(screen.getByTestId('team-name')).toBeInTheDocument();
      expect(screen.getByTestId('current-game-id')).toBeInTheDocument();
      expect(screen.getByTestId('players-count')).toHaveTextContent('0');
    });

    it('should accept custom initial state', () => {
      const customInitialState = {
        teamName: 'Custom Team',
      };

      render(
        <GameStateProvider initialState={customInitialState}>
          <TestConsumer />
        </GameStateProvider>
      );

      expect(screen.getByTestId('team-name')).toHaveTextContent('Custom Team');
    });
  });

  describe('useGameState', () => {
    it('should provide game state context values', () => {
      render(
        <GameStateProvider>
          <TestConsumer />
        </GameStateProvider>
      );

      // Verify that all expected elements are rendered
      expect(screen.getByTestId('team-name')).toBeInTheDocument();
      expect(screen.getByTestId('current-game-id')).toBeInTheDocument();
      expect(screen.getByTestId('players-count')).toBeInTheDocument();
    });

    it('should throw error when used outside provider', () => {
      // Suppress console.error for this test
      const originalError = console.error;
      console.error = jest.fn();

      expect(() => {
        render(<TestConsumer />);
      }).toThrow('useGameState must be used within a GameStateProvider');

      // Restore console.error
      console.error = originalError;
    });

    it('should provide dispatchGameSession function', () => {
      function DispatchTestConsumer() {
        const { dispatchGameSession } = useGameState();

        return (
          <button
            data-testid="dispatch-button"
            onClick={() => {
              dispatchGameSession({ type: 'SET_TEAM_NAME', payload: 'New Team' });
            }}
          >
            Dispatch
          </button>
        );
      }

      render(
        <GameStateProvider>
          <DispatchTestConsumer />
        </GameStateProvider>
      );

      expect(screen.getByTestId('dispatch-button')).toBeInTheDocument();
    });

    it('should provide setCurrentGameId function', () => {
      function SetGameIdConsumer() {
        const { currentGameId, setCurrentGameId } = useGameState();

        return (
          <div>
            <div data-testid="game-id">{currentGameId}</div>
            <button
              data-testid="set-id-button"
              onClick={() => setCurrentGameId('test-game-123')}
            >
              Set ID
            </button>
          </div>
        );
      }

      render(
        <GameStateProvider>
          <SetGameIdConsumer />
        </GameStateProvider>
      );

      const button = screen.getByTestId('set-id-button');

      act(() => {
        button.click();
      });

      expect(screen.getByTestId('game-id')).toHaveTextContent('test-game-123');
    });

    it('should provide setAvailablePlayers function', () => {
      function SetPlayersConsumer() {
        const { availablePlayers, setAvailablePlayers } = useGameState();

        return (
          <div>
            <div data-testid="players-count">{availablePlayers.length}</div>
            <button
              data-testid="add-player-button"
              onClick={() => {
                setAvailablePlayers([
                  {
                    id: 'player-1',
                    name: 'Test Player',
                    jerseyNumber: '10',
                    isGoalie: false,
                  },
                ]);
              }}
            >
              Add Player
            </button>
          </div>
        );
      }

      render(
        <GameStateProvider>
          <SetPlayersConsumer />
        </GameStateProvider>
      );

      expect(screen.getByTestId('players-count')).toHaveTextContent('0');

      const button = screen.getByTestId('add-player-button');

      act(() => {
        button.click();
      });

      expect(screen.getByTestId('players-count')).toHaveTextContent('1');
    });
  });
});
