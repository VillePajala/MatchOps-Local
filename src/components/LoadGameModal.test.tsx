import React from 'react';
import { render, screen, fireEvent, within, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import LoadGameModal from './LoadGameModal';
import { SavedGamesCollection, AppState, PlayerAssessment } from '@/types';
import { Season, Tournament } from '@/types';
import { ToastProvider } from '@/contexts/ToastProvider';

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { replace?: Record<string, string> }) => {
      let translation = key;
      if (options?.replace) {
        Object.entries(options.replace).forEach(([k, v]) => {
          translation = translation.replace(`{{${k}}}`, v);
          });
        }
        return translation;
      },
      i18n: {
        changeLanguage: () => new Promise(() => {}),
      },
  }),
}));

// Mock utility modules
jest.mock('@/utils/seasons');
jest.mock('@/utils/tournaments');

import * as seasonsUtils from '@/utils/seasons';
import * as tournamentsUtils from '@/utils/tournaments';

// Sample Data
const sampleSeasons: Season[] = [{ id: 'season_1', name: 'Spring League' }];
const sampleTournaments: Tournament[] = [{ id: 'tourn_1', name: 'Summer Cup' }];

const createSampleGames = (): SavedGamesCollection => ({
  'game_1659123456_abc': {
    teamName: 'Lions',
    opponentName: 'Tigers',
    gameDate: '2023-05-15',
    homeOrAway: 'home',
    seasonId: 'season_1',
    tournamentId: '',
    isPlayed: true,
    selectedPlayerIds: ['p1', 'p2'],
    assessments: { p1: {} as unknown as PlayerAssessment },
  } as unknown as AppState,
  'game_1659223456_def': {
    teamName: 'Eagles',
    opponentName: 'Hawks',
    gameDate: '2023-07-22',
    homeOrAway: 'away',
    seasonId: '',
    tournamentId: 'tourn_1',
    isPlayed: false,
    selectedPlayerIds: ['p1'],
    assessments: { p1: {} as unknown as PlayerAssessment },
  } as unknown as AppState,
});

describe('LoadGameModal', () => {
  const mockHandlers = {
    onClose: jest.fn(),
    onLoad: jest.fn(),
    onDelete: jest.fn(),
    onExportOneJson: jest.fn(),
    onExportOneExcel: jest.fn(),
  };

  beforeEach(() => {
    (seasonsUtils.getSeasons as jest.Mock).mockResolvedValue(sampleSeasons);
    (tournamentsUtils.getTournaments as jest.Mock).mockResolvedValue(sampleTournaments);
    (window.confirm as jest.Mock) = jest.fn();
    Object.values(mockHandlers).forEach(mock => mock.mockClear());
  });

  const renderModal = async (props = {}) => {
    const defaultProps = {
      isOpen: true,
      savedGames: createSampleGames(),
      ...mockHandlers,
      seasons: [],
      tournaments: [],
      teams: [],
      ...props,
    };
    let result;
    await act(async () => {
      result = render(
        <ToastProvider>
          <LoadGameModal {...defaultProps} />
        </ToastProvider>
      );
    });
    return result!;
  };

  it('shows live session score for current game when provided', async () => {
    const saved = createSampleGames();
    // Explicitly set saved score to 0-0 to simulate stale persisted state
    (saved['game_1659123456_abc'] as unknown as AppState).homeScore = 0;
    (saved['game_1659123456_abc'] as unknown as AppState).awayScore = 0;

    await renderModal({
      savedGames: saved,
      currentGameId: 'game_1659123456_abc',
      currentSessionHomeScore: 2,
      currentSessionAwayScore: 1,
    });

    const card = await screen.findByTestId('game-item-game_1659123456_abc');
    expect(within(card).getByText('2 - 1')).toBeInTheDocument();
  });
  
  it('renders correctly and displays games', async () => {
    await renderModal();
    expect(await screen.findByText('Lions')).toBeInTheDocument();
    expect(screen.getByText('Tigers')).toBeInTheDocument();
    expect(screen.getByText('Hawks')).toBeInTheDocument();
    expect(screen.getByText('Eagles')).toBeInTheDocument();
  });

  it('filters games by search input', async () => {
    await renderModal();
    await screen.findByText('Lions'); // wait for load
    
    const searchInput = screen.getByPlaceholderText('loadGameModal.filterPlaceholder');
      fireEvent.change(searchInput, { target: { value: 'Lions' } });

    expect(await screen.findByText('Lions')).toBeInTheDocument();
    expect(screen.getByText('Tigers')).toBeInTheDocument();
    expect(screen.queryByText('Hawks')).not.toBeInTheDocument();
    });

  it('shows a NOT PLAYED badge for unplayed games', async () => {
    await renderModal();
    const badge = await screen.findByText('loadGameModal.unplayedBadge');
    expect(badge).toBeInTheDocument();
  });

  it('filters to only unplayed games when toggle checked', async () => {
    await renderModal();
    await screen.findByText('Lions');

    const toggle = screen.getByLabelText('loadGameModal.showUnplayedOnly');
    fireEvent.click(toggle);

    expect(screen.queryByText('Lions')).not.toBeInTheDocument();
    expect(screen.getByText('Hawks')).toBeInTheDocument();
    expect(screen.getByText('Eagles')).toBeInTheDocument();
  });

  it('calls onLoad and onClose when a game is loaded', async () => {
    await renderModal();
    const gameCard = await screen.findByTestId('game-item-game_1659123456_abc');

    await act(async () => {
      fireEvent.click(gameCard);
    });

    expect(mockHandlers.onLoad).toHaveBeenCalledWith('game_1659123456_abc');
    expect(mockHandlers.onClose).toHaveBeenCalled();
  });

  it('calls onDelete when delete is confirmed', async () => {
    await renderModal();

    // Find the game card for Eagles vs Hawks
    const gameCard = await screen.findByTestId('game-item-game_1659223456_def');

    // Open the actions menu
    const actionsButton = within(gameCard).getByLabelText('Game actions');
    await act(async () => {
      fireEvent.click(actionsButton);
    });

    // Click the delete button in the dropdown
    const deleteButton = await screen.findByText('common.delete');
    await act(async () => {
      fireEvent.click(deleteButton);
    });

    // Wait for confirmation modal to appear
    await waitFor(() => {
      expect(screen.getByText('loadGameModal.deleteConfirmTitle')).toBeInTheDocument();
    });

    // Find and click the Delete confirm button in the modal
    const deleteButtons = screen.getAllByText('common.delete');
    const confirmButton = deleteButtons[deleteButtons.length - 1]; // Last one is in the modal
    await act(async () => {
      fireEvent.click(confirmButton);
    });

    await waitFor(() => {
      expect(mockHandlers.onDelete).toHaveBeenCalledWith('game_1659223456_def');
    });
  });

  it('calls onExportOneJson when JSON export button is clicked', async () => {
    await renderModal();
    const gameCard = await screen.findByTestId('game-item-game_1659123456_abc');

    // Open actions menu
    const actionsButton = within(gameCard).getByLabelText('Game actions');
    await act(async () => {
      fireEvent.click(actionsButton);
    });

    // Click Export JSON
    const exportButton = await screen.findByText('Export JSON');
    await act(async () => {
      fireEvent.click(exportButton);
    });

    expect(mockHandlers.onExportOneJson).toHaveBeenCalledWith('game_1659123456_abc');
    });

  it('calls onExportOneExcel when Excel export button is clicked', async () => {
    await renderModal();
    const gameCard = await screen.findByTestId('game-item-game_1659123456_abc');

    // Open actions menu
    const actionsButton = within(gameCard).getByLabelText('Game actions');
    await act(async () => {
      fireEvent.click(actionsButton);
    });

    // Click Export Excel
    const excelExportButton = await screen.findByText('Export Excel');
    await act(async () => {
      fireEvent.click(excelExportButton);
    });

    expect(mockHandlers.onExportOneExcel).toHaveBeenCalledWith('game_1659123456_abc');
    });

  it('displays current game indicator when loaded', async () => {
    await renderModal({ currentGameId: 'game_1659123456_abc' });
    const gameCard = await screen.findByTestId('game-item-game_1659123456_abc');

    // Check for the subtle left border indicator
    expect(gameCard).toHaveClass('border-l-4', 'border-indigo-500');
  });

  describe('orphaned tournamentSeriesId handling', () => {
    /**
     * Tests that games with orphaned tournamentSeriesId references
     * (series was deleted from tournament) still display and load correctly.
     *
     * This is important for data integrity when:
     * - Tournament has series A, B, C
     * - Game is created referencing series A
     * - User later deletes series A from tournament
     * - Game should still work (series is optional metadata)
     */
    it('handles game with orphaned tournamentSeriesId gracefully', async () => {
      // Tournament with only series B (series A was deleted)
      const tournamentWithDeletedSeries: Tournament[] = [{
        id: 'tourn_orphan',
        name: 'Tournament With Deleted Series',
        series: [{ id: 'series_b', level: 'Kilpa' }], // series_a no longer exists
      }];

      // Game still references the deleted series_a
      const gameWithOrphanedSeries: SavedGamesCollection = {
        'game_orphaned_series': {
          teamName: 'Orphan Team',
          opponentName: 'Other Team',
          gameDate: '2024-01-15',
          homeOrAway: 'home',
          seasonId: '',
          tournamentId: 'tourn_orphan',
          tournamentSeriesId: 'series_a', // This series no longer exists!
          tournamentLevel: 'Elite', // Fallback value still present
          isPlayed: true,
          selectedPlayerIds: ['p1'],
          assessments: {},
        } as unknown as AppState,
      };

      (tournamentsUtils.getTournaments as jest.Mock).mockResolvedValue(tournamentWithDeletedSeries);

      await renderModal({
        savedGames: gameWithOrphanedSeries,
        tournaments: tournamentWithDeletedSeries,
      });

      // Game should render correctly
      const gameCard = await screen.findByTestId('game-item-game_orphaned_series');
      expect(gameCard).toBeInTheDocument();

      // Tournament name should still display (lookup by tournamentId works)
      expect(within(gameCard).getByText('Tournament With Deleted Series')).toBeInTheDocument();

      // Team names should display
      expect(within(gameCard).getByText('Orphan Team')).toBeInTheDocument();

      // Click on card to load game
      await act(async () => {
        fireEvent.click(gameCard);
      });

      // onLoad should be called with the game ID
      expect(mockHandlers.onLoad).toHaveBeenCalledWith('game_orphaned_series');
    });

    it('handles game referencing completely deleted tournament gracefully', async () => {
      // Tournament was completely deleted
      const emptyTournaments: Tournament[] = [];

      // Game still references the deleted tournament
      const gameWithDeletedTournament: SavedGamesCollection = {
        'game_deleted_tournament': {
          teamName: 'Deleted Tournament Team',
          opponentName: 'Opponent',
          gameDate: '2024-02-20',
          homeOrAway: 'away',
          seasonId: '',
          tournamentId: 'tourn_deleted', // Tournament no longer exists
          tournamentSeriesId: 'series_deleted', // Series also doesn't exist
          tournamentLevel: 'Harraste',
          isPlayed: true,
          selectedPlayerIds: ['p1'],
          assessments: {},
        } as unknown as AppState,
      };

      (tournamentsUtils.getTournaments as jest.Mock).mockResolvedValue(emptyTournaments);

      await renderModal({
        savedGames: gameWithDeletedTournament,
        tournaments: emptyTournaments,
      });

      // Game should still render
      const gameCard = await screen.findByTestId('game-item-game_deleted_tournament');
      expect(gameCard).toBeInTheDocument();

      // Team names should display
      expect(within(gameCard).getByText('Deleted Tournament Team')).toBeInTheDocument();

      // Tournament badge should NOT appear (tournament lookup returns null)
      expect(within(gameCard).queryByText('tourn_deleted')).not.toBeInTheDocument();

      // Click on card to load game
      await act(async () => {
        fireEvent.click(gameCard);
      });

      expect(mockHandlers.onLoad).toHaveBeenCalledWith('game_deleted_tournament');
    });
  });

  /**
   * Tests for league and series badge display
   * @integration - Tests component interactions with domain logic
   */
  describe('league and series badge display', () => {
    it('displays league badge for season games with leagueId', async () => {
      const seasonsWithLeague: Season[] = [{
        id: 'season_with_league',
        name: 'Spring Season',
        leagueId: 'sm-sarja', // National league
      }];

      const gameWithLeague: SavedGamesCollection = {
        'game_with_league': {
          teamName: 'League Team',
          opponentName: 'Opponent',
          gameDate: '2024-03-15',
          homeOrAway: 'home',
          seasonId: 'season_with_league',
          tournamentId: '',
          isPlayed: true,
          selectedPlayerIds: ['p1'],
          assessments: {},
        } as unknown as AppState,
      };

      await renderModal({
        savedGames: gameWithLeague,
        seasons: seasonsWithLeague,
      });

      const gameCard = await screen.findByTestId('game-item-game_with_league');

      // Season name badge should display
      expect(within(gameCard).getByText('Spring Season')).toBeInTheDocument();

      // League badge should display with full league name
      expect(within(gameCard).getByText('Valtakunnallinen SM-sarja')).toBeInTheDocument();
    });

    it('does not display league badge when season has no leagueId', async () => {
      const seasonWithoutLeague: Season[] = [{
        id: 'season_no_league',
        name: 'Casual Season',
        // No leagueId set
      }];

      const gameWithoutLeague: SavedGamesCollection = {
        'game_no_league': {
          teamName: 'Casual Team',
          opponentName: 'Opponent',
          gameDate: '2024-04-10',
          homeOrAway: 'home',
          seasonId: 'season_no_league',
          tournamentId: '',
          isPlayed: true,
          selectedPlayerIds: ['p1'],
          assessments: {},
        } as unknown as AppState,
      };

      await renderModal({
        savedGames: gameWithoutLeague,
        seasons: seasonWithoutLeague,
      });

      const gameCard = await screen.findByTestId('game-item-game_no_league');

      // Season name should display
      expect(within(gameCard).getByText('Casual Season')).toBeInTheDocument();

      // League badge should NOT appear (no sm-sarja or similar text)
      expect(within(gameCard).queryByText(/Valtakunnallinen/)).not.toBeInTheDocument();
      expect(within(gameCard).queryByText(/Aluesarja/)).not.toBeInTheDocument();
    });

    it('displays series level badge for tournament games with valid tournamentSeriesId', async () => {
      const tournamentsWithSeries: Tournament[] = [{
        id: 'tourn_with_series',
        name: 'Championship Cup',
        series: [
          { id: 'series_elite', level: 'Elite' },
          { id: 'series_kilpa', level: 'Kilpa' },
        ],
      }];

      const gameWithSeries: SavedGamesCollection = {
        'game_with_series': {
          teamName: 'Elite Team',
          opponentName: 'Opponent',
          gameDate: '2024-05-20',
          homeOrAway: 'away',
          seasonId: '',
          tournamentId: 'tourn_with_series',
          tournamentSeriesId: 'series_elite',
          isPlayed: true,
          selectedPlayerIds: ['p1'],
          assessments: {},
        } as unknown as AppState,
      };

      await renderModal({
        savedGames: gameWithSeries,
        tournaments: tournamentsWithSeries,
      });

      const gameCard = await screen.findByTestId('game-item-game_with_series');

      // Tournament name badge should display
      expect(within(gameCard).getByText('Championship Cup')).toBeInTheDocument();

      // Series level badge should display (translation key pattern: common.levelElite)
      expect(within(gameCard).getByText('common.levelElite')).toBeInTheDocument();
    });

    it('does not display series badge when tournament game has no tournamentSeriesId', async () => {
      const tournamentsWithSeries: Tournament[] = [{
        id: 'tourn_has_series',
        name: 'Multi-Level Tournament',
        series: [
          { id: 'series_a', level: 'Elite' },
          { id: 'series_b', level: 'Kilpa' },
        ],
      }];

      const gameWithoutSeries: SavedGamesCollection = {
        'game_no_series_id': {
          teamName: 'No Series Team',
          opponentName: 'Opponent',
          gameDate: '2024-06-15',
          homeOrAway: 'home',
          seasonId: '',
          tournamentId: 'tourn_has_series',
          // No tournamentSeriesId set
          isPlayed: true,
          selectedPlayerIds: ['p1'],
          assessments: {},
        } as unknown as AppState,
      };

      await renderModal({
        savedGames: gameWithoutSeries,
        tournaments: tournamentsWithSeries,
      });

      const gameCard = await screen.findByTestId('game-item-game_no_series_id');

      // Tournament name should display
      expect(within(gameCard).getByText('Multi-Level Tournament')).toBeInTheDocument();

      // Series level badge should NOT appear
      expect(within(gameCard).queryByText(/common\.level/)).not.toBeInTheDocument();
    });

    it('does not display series badge when tournamentSeriesId references non-existent series', async () => {
      const tournamentsWithSeries: Tournament[] = [{
        id: 'tourn_missing_series',
        name: 'Tournament Missing Series',
        series: [
          { id: 'series_exists', level: 'Kilpa' },
        ],
      }];

      const gameWithOrphanSeries: SavedGamesCollection = {
        'game_orphan_series': {
          teamName: 'Orphan Series Team',
          opponentName: 'Opponent',
          gameDate: '2024-07-10',
          homeOrAway: 'home',
          seasonId: '',
          tournamentId: 'tourn_missing_series',
          tournamentSeriesId: 'series_deleted', // This series doesn't exist
          isPlayed: true,
          selectedPlayerIds: ['p1'],
          assessments: {},
        } as unknown as AppState,
      };

      await renderModal({
        savedGames: gameWithOrphanSeries,
        tournaments: tournamentsWithSeries,
      });

      const gameCard = await screen.findByTestId('game-item-game_orphan_series');

      // Tournament name should display
      expect(within(gameCard).getByText('Tournament Missing Series')).toBeInTheDocument();

      // Series level badge should NOT appear (orphaned reference)
      expect(within(gameCard).queryByText(/common\.level/)).not.toBeInTheDocument();
    });

    it('displays correct translation key format for series level badge', async () => {
      // Test all level types to verify translation key pattern
      const levels = ['Elite', 'Kilpa', 'Haaste', 'Harraste'];

      for (const level of levels) {
        const tournaments: Tournament[] = [{
          id: `tourn_${level.toLowerCase()}`,
          name: `${level} Tournament`,
          series: [{ id: `series_${level.toLowerCase()}`, level }],
        }];

        const games: SavedGamesCollection = {
          [`game_${level.toLowerCase()}`]: {
            teamName: `${level} Team`,
            opponentName: 'Opponent',
            gameDate: '2024-08-01',
            homeOrAway: 'home',
            seasonId: '',
            tournamentId: `tourn_${level.toLowerCase()}`,
            tournamentSeriesId: `series_${level.toLowerCase()}`,
            isPlayed: true,
            selectedPlayerIds: ['p1'],
            assessments: {},
          } as unknown as AppState,
        };

        const { unmount } = await renderModal({
          savedGames: games,
          tournaments,
        });

        const gameCard = await screen.findByTestId(`game-item-game_${level.toLowerCase()}`);

        // Verify translation key format: common.level${Level}
        expect(within(gameCard).getByText(`common.level${level}`)).toBeInTheDocument();

        unmount();
      }
    });
  });
});
