import React from 'react';
import { render, screen, act, renderHook } from '@testing-library/react';
import { GameStateProvider, useGameState } from '../GameStateContext';
import { DEFAULT_GAME_ID } from '@/config/constants';

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
      const customInitialState: import('@/types').AppState = {
        playersOnField: [],
        opponents: [],
        drawings: [],
        availablePlayers: [],
        showPlayerNames: true,
        teamName: 'Custom Team', // Custom value
        gameEvents: [],
        opponentName: 'Opponent',
        gameDate: new Date().toISOString().split('T')[0],
        homeScore: 0,
        awayScore: 0,
        gameNotes: '',
        homeOrAway: 'home',
        numberOfPeriods: 2,
        periodDurationMinutes: 15,
        currentPeriod: 1,
        gameStatus: 'notStarted',
        demandFactor: 1,
        selectedPlayerIds: [],
        gamePersonnel: [],
        seasonId: '',
        tournamentId: '',
        ageGroup: '',
        tournamentLevel: '',
        gameLocation: '',
        gameTime: '',
        subIntervalMinutes: 5,
        completedIntervalDurations: [],
        lastSubConfirmationTimeSeconds: 0,
        tacticalDiscs: [],
        tacticalDrawings: [],
        tacticalBallPosition: { relX: 0.5, relY: 0.5 },
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

    it('should provide handlers object with all session coordination handlers', () => {
      function HandlersTestConsumer() {
        const { handlers } = useGameState();

        return (
          <div>
            <div data-testid="has-team-name">{typeof handlers.setTeamName === 'function' ? 'yes' : 'no'}</div>
            <div data-testid="has-opponent-name">{typeof handlers.setOpponentName === 'function' ? 'yes' : 'no'}</div>
            <div data-testid="has-game-date">{typeof handlers.setGameDate === 'function' ? 'yes' : 'no'}</div>
            <div data-testid="has-game-location">{typeof handlers.setGameLocation === 'function' ? 'yes' : 'no'}</div>
            <div data-testid="has-game-time">{typeof handlers.setGameTime === 'function' ? 'yes' : 'no'}</div>
            <div data-testid="has-game-notes">{typeof handlers.setGameNotes === 'function' ? 'yes' : 'no'}</div>
            <div data-testid="has-age-group">{typeof handlers.setAgeGroup === 'function' ? 'yes' : 'no'}</div>
            <div data-testid="has-tournament-level">{typeof handlers.setTournamentLevel === 'function' ? 'yes' : 'no'}</div>
            <div data-testid="has-periods">{typeof handlers.setNumberOfPeriods === 'function' ? 'yes' : 'no'}</div>
            <div data-testid="has-duration">{typeof handlers.setPeriodDuration === 'function' ? 'yes' : 'no'}</div>
            <div data-testid="has-demand">{typeof handlers.setDemandFactor === 'function' ? 'yes' : 'no'}</div>
            <div data-testid="has-home-away">{typeof handlers.setHomeOrAway === 'function' ? 'yes' : 'no'}</div>
            <div data-testid="has-season">{typeof handlers.setSeasonId === 'function' ? 'yes' : 'no'}</div>
            <div data-testid="has-tournament">{typeof handlers.setTournamentId === 'function' ? 'yes' : 'no'}</div>
            <div data-testid="has-personnel">{typeof handlers.setGamePersonnel === 'function' ? 'yes' : 'no'}</div>
          </div>
        );
      }

      render(
        <GameStateProvider>
          <HandlersTestConsumer />
        </GameStateProvider>
      );

      // Verify all 15 handlers are present and are functions
      expect(screen.getByTestId('has-team-name')).toHaveTextContent('yes');
      expect(screen.getByTestId('has-opponent-name')).toHaveTextContent('yes');
      expect(screen.getByTestId('has-game-date')).toHaveTextContent('yes');
      expect(screen.getByTestId('has-game-location')).toHaveTextContent('yes');
      expect(screen.getByTestId('has-game-time')).toHaveTextContent('yes');
      expect(screen.getByTestId('has-game-notes')).toHaveTextContent('yes');
      expect(screen.getByTestId('has-age-group')).toHaveTextContent('yes');
      expect(screen.getByTestId('has-tournament-level')).toHaveTextContent('yes');
      expect(screen.getByTestId('has-periods')).toHaveTextContent('yes');
      expect(screen.getByTestId('has-duration')).toHaveTextContent('yes');
      expect(screen.getByTestId('has-demand')).toHaveTextContent('yes');
      expect(screen.getByTestId('has-home-away')).toHaveTextContent('yes');
      expect(screen.getByTestId('has-season')).toHaveTextContent('yes');
      expect(screen.getByTestId('has-tournament')).toHaveTextContent('yes');
      expect(screen.getByTestId('has-personnel')).toHaveTextContent('yes');
    });

    it('should allow handlers to update game session state', () => {
      function HandlerUpdateConsumer() {
        const { gameSessionState, handlers } = useGameState();

        return (
          <div>
            <div data-testid="team-name">{gameSessionState.teamName}</div>
            <div data-testid="opponent-name">{gameSessionState.opponentName}</div>
            <button
              data-testid="update-team-button"
              onClick={() => handlers.setTeamName('New Team Name')}
            >
              Update Team
            </button>
            <button
              data-testid="update-opponent-button"
              onClick={() => handlers.setOpponentName('New Opponent')}
            >
              Update Opponent
            </button>
          </div>
        );
      }

      render(
        <GameStateProvider>
          <HandlerUpdateConsumer />
        </GameStateProvider>
      );

      // Check initial values
      expect(screen.getByTestId('team-name')).toHaveTextContent('My Team');
      expect(screen.getByTestId('opponent-name')).toHaveTextContent('Opponent');

      // Update team name
      act(() => {
        screen.getByTestId('update-team-button').click();
      });

      expect(screen.getByTestId('team-name')).toHaveTextContent('New Team Name');

      // Update opponent name
      act(() => {
        screen.getByTestId('update-opponent-button').click();
      });

      expect(screen.getByTestId('opponent-name')).toHaveTextContent('New Opponent');
    });

    /**
     * Integration test: Verifies GameStateProvider properly wires up context
     * @integration
     */
    it('should provide context to HomePage component', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <GameStateProvider>{children}</GameStateProvider>
      );

      const { result } = renderHook(() => useGameState(), { wrapper });

      expect(result.current.gameSessionState).toBeDefined();
      expect(result.current.currentGameId).toBe(DEFAULT_GAME_ID);
    });
  });
});
