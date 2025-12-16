import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoadGameModal from '../LoadGameModal';
import { SavedGamesCollection } from '@/types';

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback: string) => fallback || key,
    i18n: { language: 'en' },
  }),
}));

// Helper to create mock games
const createMockGames = (count: number): SavedGamesCollection => {
  const games: SavedGamesCollection = {};
  for (let i = 0; i < count; i++) {
    games[`game-${i}`] = {
      playersOnField: [],
      opponents: [],
      drawings: [],
      availablePlayers: [],
      showPlayerNames: true,
      teamName: 'Test Team',
      gameEvents: [],
      opponentName: `Opponent ${i}`,
      gameDate: `2024-01-${String(i + 1).padStart(2, '0')}`,
      homeScore: i,
      awayScore: i + 1,
      gameNotes: '',
      homeOrAway: 'home',
      numberOfPeriods: 2,
      periodDurationMinutes: 20,
      currentPeriod: 1,
      gameStatus: 'gameEnd',
      isPlayed: true,
      selectedPlayerIds: [],
      seasonId: '',
      tournamentId: '',
      tacticalDiscs: [],
      tacticalDrawings: [],
      tacticalBallPosition: null,
    };
  }
  return games;
};

const defaultProps = {
  isOpen: true,
  onClose: jest.fn(),
  savedGames: createMockGames(10),
  onLoad: jest.fn(),
  onDelete: jest.fn(),
  onExportOneJson: jest.fn(),
  onExportOneExcel: jest.fn(),
  seasons: [],
  tournaments: [],
  teams: [],
};

describe('LoadGameModal dropdown positioning', () => {
  const originalInnerHeight = window.innerHeight;

  beforeEach(() => {
    jest.clearAllMocks();
    // Set consistent viewport height
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 800,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: originalInnerHeight,
    });
  });

  /**
   * Tests dropdown positioning in scrollable list
   * @integration
   */
  it('should open menu downward when item is near top of viewport', async () => {
    render(<LoadGameModal {...defaultProps} />);

    // Find first game's actions button
    const gameItems = screen.getAllByTestId(/^game-item-/);
    expect(gameItems.length).toBeGreaterThan(0);

    const firstGameItem = gameItems[0];
    const actionsButton = firstGameItem.querySelector('button[aria-label="Game actions"]');
    expect(actionsButton).toBeInTheDocument();

    // Mock getBoundingClientRect to simulate button near top of viewport
    const mockRect = {
      bottom: 100, // Near top, plenty of space below
      top: 80,
      left: 0,
      right: 100,
      width: 100,
      height: 20,
      x: 0,
      y: 80,
      toJSON: () => ({}),
    };
    jest.spyOn(actionsButton as Element, 'getBoundingClientRect').mockReturnValue(mockRect);

    // Click to open menu
    fireEvent.click(actionsButton!);

    // Wait for menu to appear
    await waitFor(() => {
      expect(screen.getByText('Export JSON')).toBeInTheDocument();
    });

    // Find the dropdown menu
    const menuContainer = screen.getByText('Export JSON').closest('div');
    expect(menuContainer).toHaveClass('top-full'); // Opens downward
    expect(menuContainer).not.toHaveClass('bottom-full');
  });

  /**
   * Tests dropdown positioning when item is near bottom
   * @integration
   */
  it('should open menu upward when item is near bottom of viewport', async () => {
    render(<LoadGameModal {...defaultProps} />);

    // Find last game's actions button
    const gameItems = screen.getAllByTestId(/^game-item-/);
    const lastGameItem = gameItems[gameItems.length - 1];
    const actionsButton = lastGameItem.querySelector('button[aria-label="Game actions"]');
    expect(actionsButton).toBeInTheDocument();

    // Mock getBoundingClientRect to simulate button near bottom of viewport
    const mockRect = {
      bottom: 750, // Near bottom (viewport is 800), little space below
      top: 730,
      left: 0,
      right: 100,
      width: 100,
      height: 20,
      x: 0,
      y: 730,
      toJSON: () => ({}),
    };
    jest.spyOn(actionsButton as Element, 'getBoundingClientRect').mockReturnValue(mockRect);

    // Click to open menu
    fireEvent.click(actionsButton!);

    // Wait for menu to appear
    await waitFor(() => {
      expect(screen.getByText('Export JSON')).toBeInTheDocument();
    });

    // Find the dropdown menu
    const menuContainer = screen.getByText('Export JSON').closest('div');
    expect(menuContainer).toHaveClass('bottom-full'); // Opens upward
    expect(menuContainer).not.toHaveClass('top-full');
  });

  /**
   * Tests that menu position is recalculated for different items
   * @integration
   */
  it('should calculate position independently for different game items', async () => {
    render(<LoadGameModal {...defaultProps} />);

    const gameItems = screen.getAllByTestId(/^game-item-/);
    const firstButton = gameItems[0].querySelector('button[aria-label="Game actions"]');
    const lastButton = gameItems[gameItems.length - 1].querySelector('button[aria-label="Game actions"]');

    // Mock first button near top
    jest.spyOn(firstButton as Element, 'getBoundingClientRect').mockReturnValue({
      bottom: 100, top: 80, left: 0, right: 100, width: 100, height: 20, x: 0, y: 80,
      toJSON: () => ({}),
    });

    // Mock last button near bottom
    jest.spyOn(lastButton as Element, 'getBoundingClientRect').mockReturnValue({
      bottom: 750, top: 730, left: 0, right: 100, width: 100, height: 20, x: 0, y: 730,
      toJSON: () => ({}),
    });

    // Open first menu (should open downward)
    fireEvent.click(firstButton!);
    await waitFor(() => {
      expect(screen.getByText('Export JSON')).toBeInTheDocument();
    });
    let menu = screen.getByText('Export JSON').closest('div');
    expect(menu).toHaveClass('top-full');

    // Close menu by clicking button again
    fireEvent.click(firstButton!);
    await waitFor(() => {
      expect(screen.queryByText('Export JSON')).not.toBeInTheDocument();
    });

    // Open last menu (should open upward)
    fireEvent.click(lastButton!);
    await waitFor(() => {
      expect(screen.getByText('Export JSON')).toBeInTheDocument();
    });
    menu = screen.getByText('Export JSON').closest('div');
    expect(menu).toHaveClass('bottom-full');
  });

  /**
   * Tests menu positioning at exact threshold boundary
   * @integration
   * @edge-case
   */
  it('should handle exact threshold boundary correctly', async () => {
    render(<LoadGameModal {...defaultProps} />);

    const gameItems = screen.getAllByTestId(/^game-item-/);
    const actionsButton = gameItems[0].querySelector('button[aria-label="Game actions"]');

    // Mock position exactly at threshold (150px space below = default menuHeight)
    // Viewport: 800, bottom: 650 → space below: 150 → should open downward
    jest.spyOn(actionsButton as Element, 'getBoundingClientRect').mockReturnValue({
      bottom: 650, top: 630, left: 0, right: 100, width: 100, height: 20, x: 0, y: 630,
      toJSON: () => ({}),
    });

    fireEvent.click(actionsButton!);
    await waitFor(() => {
      expect(screen.getByText('Export JSON')).toBeInTheDocument();
    });

    const menu = screen.getByText('Export JSON').closest('div');
    expect(menu).toHaveClass('top-full'); // Exactly at threshold opens downward
  });
});
