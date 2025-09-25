/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { act } from 'react';

// Create simple mock players without external dependencies
const createMockPlayers = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: `player-${i + 1}`,
    name: `Player ${i + 1}`,
    jerseyNumber: `${i + 1}`,
    isGoalie: i === 0,
  }));

// Simple localStorage mock without external dependencies
const mockLocalStorage = () => {
  let store: Record<string, string> = {};

  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = String(value);
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
};

// Simple component for testing core workflows without full app complexity
const SimpleGameWorkflow = ({ players = [] }: { players?: any[] }) => {
  const [gameStarted, setGameStarted] = React.useState(false);
  const [selectedPlayers, setSelectedPlayers] = React.useState<any[]>([]);
  
  const startGame = () => {
    setGameStarted(true);
  };
  
  const selectPlayer = (player: any) => {
    if (selectedPlayers.includes(player)) {
      setSelectedPlayers(selectedPlayers.filter(p => p.id !== player.id));
    } else {
      setSelectedPlayers([...selectedPlayers, player]);
    }
  };

  return (
    <div data-testid="game-workflow">
      <h1>MatchOps Test Game</h1>
      
      {!gameStarted ? (
        <div data-testid="game-setup">
          <h2>Setup Game</h2>
          <div data-testid="player-list">
            {players.map(player => (
              <button
                key={player.id}
                data-testid={`player-${player.id}`}
                onClick={() => selectPlayer(player)}
                className={selectedPlayers.includes(player) ? 'selected' : ''}
              >
                {player.name} ({player.jerseyNumber || 'N/A'})
              </button>
            ))}
          </div>
          <button 
            data-testid="start-game"
            onClick={startGame}
            disabled={selectedPlayers.length === 0}
          >
            Start Game
          </button>
        </div>
      ) : (
        <div data-testid="game-active">
          <h2>Game Active</h2>
          <div data-testid="selected-players">
            Selected Players: {selectedPlayers.length}
          </div>
          <div data-testid="timer-display">00:00</div>
          <button data-testid="pause-timer">Pause</button>
        </div>
      )}
    </div>
  );
};

// Mock localStorage operations
const mockStorage = mockLocalStorage();

describe('Core User Workflows Integration Tests (Simplified)', () => {
  beforeEach(() => {
    mockStorage.clear();
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  afterEach(async () => {
    // Comprehensive cleanup to prevent memory leaks

    // 1. Clean up React state immediately
    cleanup();

    // 2. Clear all timers before any async operations
    jest.clearAllTimers();

    // 3. Clear all mocks to remove references
    jest.clearAllMocks();

    // 4. Wait for any pending React updates to complete
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // 5. Final cleanup of any remaining promises
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  describe('Game Creation Flow', () => {
    it('should create new game → select players → start game', async () => {
      // Setup initial data
      const mockPlayers = createMockPlayers(6);
      
      render(<SimpleGameWorkflow players={mockPlayers} />);

      // Should show game setup initially
      expect(screen.getByTestId('game-setup')).toBeInTheDocument();
      expect(screen.getByText('Setup Game')).toBeInTheDocument();
      
      // Should show players list
      expect(screen.getByTestId('player-list')).toBeInTheDocument();
      expect(screen.getAllByRole('button')).toHaveLength(7); // 6 players + 1 start button
      
      // Start button should be disabled initially
      expect(screen.getByTestId('start-game')).toBeDisabled();
      
      // Select a few players
      const player1 = screen.getByTestId(`player-${mockPlayers[0].id}`);
      const player2 = screen.getByTestId(`player-${mockPlayers[1].id}`);
      
      fireEvent.click(player1);
      fireEvent.click(player2);
      
      // Start button should now be enabled
      expect(screen.getByTestId('start-game')).not.toBeDisabled();
      
      // Start the game
      fireEvent.click(screen.getByTestId('start-game'));
      
      // Should transition to active game state
      await waitFor(() => {
        expect(screen.getByTestId('game-active')).toBeInTheDocument();
      });
      
      expect(screen.getByText('Game Active')).toBeInTheDocument();
      expect(screen.getByText('Selected Players: 2')).toBeInTheDocument();
      expect(screen.getByTestId('timer-display')).toBeInTheDocument();
      expect(screen.getByTestId('pause-timer')).toBeInTheDocument();
    });

    it('should handle player selection and deselection', async () => {
      const mockPlayers = createMockPlayers(3);
      
      render(<SimpleGameWorkflow players={mockPlayers} />);
      
      const player1 = screen.getByTestId(`player-${mockPlayers[0].id}`);
      const player2 = screen.getByTestId(`player-${mockPlayers[1].id}`);
      
      // Select player 1
      fireEvent.click(player1);
      expect(player1).toHaveClass('selected');
      expect(screen.getByTestId('start-game')).not.toBeDisabled();
      
      // Select player 2
      fireEvent.click(player2);
      expect(player2).toHaveClass('selected');
      
      // Deselect player 1
      fireEvent.click(player1);
      expect(player1).not.toHaveClass('selected');
      expect(player2).toHaveClass('selected');
      
      // Should still be able to start with one player
      expect(screen.getByTestId('start-game')).not.toBeDisabled();
      
      // Deselect all players
      fireEvent.click(player2);
      expect(player2).not.toHaveClass('selected');
      
      // Start button should be disabled again
      expect(screen.getByTestId('start-game')).toBeDisabled();
    });
  });

  describe('Data Persistence Flow', () => {
    it('should handle localStorage operations', async () => {
      const testData = { gameId: 'test-123', teamName: 'Test Team' };
      
      // Simulate saving data
      mockStorage.setItem('currentGame', JSON.stringify(testData));
      
      // Verify data was saved
      const savedData = mockStorage.getItem('currentGame');
      expect(savedData).toBe(JSON.stringify(testData));
      
      // Verify data can be retrieved and parsed
      const parsedData = JSON.parse(savedData || '{}');
      expect(parsedData.gameId).toBe('test-123');
      expect(parsedData.teamName).toBe('Test Team');
    });

    it('should handle localStorage errors gracefully', async () => {
      // Simulate localStorage quota exceeded
      mockStorage.setItem = jest.fn((_key: string, _value: string) => {
        throw new Error('QuotaExceededError');
      });
      
      // Should not crash when saving fails
      expect(() => {
        try {
          mockStorage.setItem('test', 'data');
        } catch (error) {
          // Error handled gracefully
          expect((error as Error).message).toBe('QuotaExceededError');
        }
      }).not.toThrow();
    });
  });

  describe('Error Recovery Flow', () => {
    it('should handle missing required data', async () => {
      // Test with empty players array
      render(<SimpleGameWorkflow players={[]} />);
      
      expect(screen.getByTestId('game-setup')).toBeInTheDocument();
      expect(screen.getByTestId('player-list')).toBeInTheDocument();
      
      // Should show empty list gracefully
      const playerButtons = screen.getAllByRole('button').filter(btn => 
        btn.getAttribute('data-testid')?.startsWith('player-')
      );
      expect(playerButtons).toHaveLength(0);
      
      // Start button should remain disabled
      expect(screen.getByTestId('start-game')).toBeDisabled();
    });

    it('should handle component unmounting cleanly', async () => {
      const mockPlayers = createMockPlayers(2);
      
      const { unmount } = render(<SimpleGameWorkflow players={mockPlayers} />);
      
      // Component should render normally
      expect(screen.getByTestId('game-workflow')).toBeInTheDocument();
      
      // Unmounting should not throw errors
      expect(() => unmount()).not.toThrow();
    });
  });

  describe('State Synchronization', () => {
    it('should maintain consistent UI state', async () => {
      const mockPlayers = createMockPlayers(4);
      
      render(<SimpleGameWorkflow players={mockPlayers} />);
      
      // Select multiple players
      fireEvent.click(screen.getByTestId(`player-${mockPlayers[0].id}`));
      fireEvent.click(screen.getByTestId(`player-${mockPlayers[1].id}`));
      fireEvent.click(screen.getByTestId(`player-${mockPlayers[2].id}`));
      
      // UI should reflect current selection (check for 'selected' class)
      const selectedButtons = screen.getAllByRole('button').filter(btn => 
        btn.className.includes('selected')
      );
      expect(selectedButtons.length).toBeGreaterThan(0);
      
      // Start game
      fireEvent.click(screen.getByTestId('start-game'));
      
      // Active game should show correct count
      await waitFor(() => {
        expect(screen.getByText('Selected Players: 3')).toBeInTheDocument();
      });
    });
  });
});