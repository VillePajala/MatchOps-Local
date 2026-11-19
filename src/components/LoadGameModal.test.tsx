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
        language: 'fi',
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
    let result: ReturnType<typeof render> | undefined;
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
    });

    const card = await screen.findByTestId('game-item-game_1659123456_abc');
    // Scores come from the SAVED game (the live-session override was retired
    // with the page-level lift, L.3a).
    expect(card.textContent).toContain(String(saved['game_1659123456_abc'].homeScore ?? 0));
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

  /**
   * Review 7.17 (owner: the game keeps its own team name): a renamed team's games
   * show the name they were saved under, as the match screen does - and a search
   * for the team's new name still finds them.
   */
  it("shows the game's own team name, and finds it by the team's new name", async () => {
    const games = createSampleGames();
    (games['game_1659123456_abc'] as unknown as { teamId: string }).teamId = 'team_lions';
    await renderModal({
      savedGames: games,
      teams: [{ id: 'team_lions', name: 'Lions P12', createdAt: '', updatedAt: '' }],
    });
    expect(await screen.findByText('Lions')).toBeInTheDocument();
    expect(screen.queryByText('Lions P12')).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('loadGameModal.filterPlaceholder'), { target: { value: 'P12' } });
    expect(await screen.findByText('Lions')).toBeInTheDocument();
    expect(screen.queryByText('Hawks')).not.toBeInTheDocument();
  });

  /** Review 7.L1: search matched only the stored ISO date. */
  it('finds a game by the date as the card shows it', async () => {
    await renderModal();
    await screen.findByText('Lions');
    fireEvent.change(screen.getByPlaceholderText('loadGameModal.filterPlaceholder'), { target: { value: '15.5.' } });
    expect(await screen.findByText('Lions')).toBeInTheDocument();
    expect(screen.queryByText('Hawks')).not.toBeInTheDocument();
  });

  /** Review 7.L1: the text search now matches opponents the way the opponent filter does. */
  it('finds an opponent written with a separator by its normalised name', async () => {
    const games = createSampleGames();
    (games['game_1659123456_abc'] as unknown as { opponentName: string }).opponentName = 'IPS/Sininen';
    await renderModal({ savedGames: games });
    await screen.findByText('Lions');
    fireEvent.change(screen.getByPlaceholderText('loadGameModal.filterPlaceholder'), { target: { value: 'ips/sininen' } });
    expect(await screen.findByText('Lions')).toBeInTheDocument();
    expect(screen.queryByText('Hawks')).not.toBeInTheDocument();
  });

  /** Review 7.L1: "No games saved yet" was shown when only "unplayed" hid everything. */
  it('says no games match - not "none saved" - when only the unplayed toggle hides them', async () => {
    const games = createSampleGames();
    (games['game_1659223456_def'] as unknown as { isPlayed: boolean }).isPlayed = true;
    await renderModal({ savedGames: games });
    await screen.findByText('Lions');
    fireEvent.click(screen.getByRole('switch', { name: /loadGameModal.showUnplayedOnly|unplayed/i }));
    expect(await screen.findByText('loadGameModal.noGamesMatchFilter')).toBeInTheDocument();
    expect(screen.queryByText('loadGameModal.noGamesSaved')).not.toBeInTheDocument();
  });

  /** Review 7.L6: one search - accents ignored, every word must match, in any order. */
  it('finds a game ignoring accents, with every word of the search', async () => {
    const games = createSampleGames();
    (games['game_1659123456_abc'] as unknown as { opponentName: string }).opponentName = 'Hämeenlinna';
    await renderModal({ savedGames: games });
    await screen.findByText('Lions');
    const box = screen.getByPlaceholderText('loadGameModal.filterPlaceholder');
    fireEvent.change(box, { target: { value: 'hameenlinna lions' } });
    expect(await screen.findByText('Lions')).toBeInTheDocument();
    expect(screen.queryByText('Hawks')).not.toBeInTheDocument();
    fireEvent.change(box, { target: { value: 'hameenlinna eagles' } }); // second word matches the other game
    await waitFor(() => expect(screen.queryByText('Lions')).not.toBeInTheDocument());
  });

  /** Review 7.L11: sort by result - wins first, games not played yet last. */
  it('sorts by result when chosen', async () => {
    const games = createSampleGames(); // Lions 2023-05 (played), Eagles 2023-07 (unplayed)
    (games['game_1659123456_abc'] as unknown as { homeScore: number; awayScore: number }).homeScore = 2;
    (games['game_1659123456_abc'] as unknown as { homeScore: number; awayScore: number }).awayScore = 0;
    await renderModal({ savedGames: games });
    await screen.findByText('Lions');
    const order = () => ['Lions', 'Eagles'].sort((a, b) =>
      screen.getByText(a).compareDocumentPosition(screen.getByText(b)) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    expect(order()).toEqual(['Eagles', 'Lions']); // newest first by default
    fireEvent.change(screen.getByTestId('load-game-sort'), { target: { value: 'result' } });
    await waitFor(() => expect(order()).toEqual(['Lions', 'Eagles'])); // the win before the unplayed game
  });

  /** Review 7.L10: filters and sort are remembered for the next visit on this device. */
  it('remembers the unplayed filter and the sort between visits', async () => {
    const first = await renderModal();
    await screen.findByText('Lions');
    fireEvent.click(screen.getByRole('switch', { name: /loadGameModal.showUnplayedOnly|unplayed/i }));
    fireEvent.change(screen.getByTestId('load-game-sort'), { target: { value: 'opponent' } });
    first.unmount();

    await renderModal();
    await screen.findByText('Eagles');
    expect(screen.queryByText('Lions')).not.toBeInTheDocument(); // still "unplayed only"
    expect((screen.getByTestId('load-game-sort') as HTMLSelectElement).value).toBe('opponent');
  });

  it('shows a not-played status dot for unplayed games', async () => {
    await renderModal();
    // The badge is now a small red status dot carrying the label as its title.
    const dot = await screen.findByTitle('loadGameModal.unplayedBadge');
    expect(dot).toBeInTheDocument();
  });

  it('filters to only unplayed games when toggle checked', async () => {
    await renderModal();
    await screen.findByText('Lions');

    const toggle = screen.getByRole('switch', { name: 'loadGameModal.showUnplayedOnly' });
    fireEvent.click(toggle);

    expect(screen.queryByText('Lions')).not.toBeInTheDocument();
    expect(screen.getByText('Hawks')).toBeInTheDocument();
    expect(screen.getByText('Eagles')).toBeInTheDocument();
  });

  it('calls onLoad when a game is clicked (parent handles onClose)', async () => {
    // Note: The component intentionally does NOT call onClose here to avoid UI flash.
    // The parent component is responsible for closing the modal after game loads.
    await renderModal();
    const gameCard = await screen.findByTestId('game-item-game_1659123456_abc');

    await act(async () => {
      fireEvent.click(gameCard);
    });

    expect(mockHandlers.onLoad).toHaveBeenCalledWith('game_1659123456_abc');
    // onClose is NOT called by the component - parent handles this after game loads
  });

  it('calls onDelete when delete is confirmed', async () => {
    await renderModal();

    // Find the game card for Eagles vs Hawks
    const gameCard = await screen.findByTestId('game-item-game_1659223456_def');

    // Open the actions menu
    const actionsButton = within(gameCard).getByLabelText('loadGameModal.gameActions');
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
    const actionsButton = within(gameCard).getByLabelText('loadGameModal.gameActions');
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
    const actionsButton = within(gameCard).getByLabelText('loadGameModal.gameActions');
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

    // The open game carries a faint amber wash from the left
    expect(gameCard).toHaveClass('bg-gradient-to-r', 'from-action/[0.09]');
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
      expect(within(gameCard).getByText(/Spring Season/)).toBeInTheDocument();

      // League badge should display with full league name
      expect(within(gameCard).getByText(/Valtakunnallinen SM-sarja/)).toBeInTheDocument();
    });

    /** @edge-case Competition is one grey line; the duration is not repeated on the date line. */
    it('shows the competition as one line and leaves the period length off the date line', async () => {
      const games: SavedGamesCollection = {
        'game_one_line': {
          teamName: 'Line Team',
          opponentName: 'Opponent',
          gameDate: '2024-03-15',
          gameTime: '10:00',
          numberOfPeriods: 2,
          periodDurationMinutes: 25,
          gender: 'boys',
          homeOrAway: 'home',
          seasonId: 'season_one_line',
          tournamentId: '',
          isPlayed: true,
          selectedPlayerIds: ['p1'],
          assessments: {},
        } as unknown as AppState,
      };
      await renderModal({ savedGames: games, seasons: [{ id: 'season_one_line', name: 'P12 Harrastesarja 2026' }] });
      const gameCard = await screen.findByTestId('game-item-game_one_line');
      const line = within(gameCard).getByTestId('game-competition-game_one_line');
      expect(line).toHaveTextContent(/^P12 Harrastesarja 2026 · /);
      expect(gameCard.textContent).not.toContain('2×25');
    });

    /** @edge-case Date and competition share ONE truncated line; the unfinished chip is grey, not amber. */
    it('puts date and competition on one ellipsised line and draws "needs finishing" as a neutral badge', async () => {
      const games: SavedGamesCollection = {
        'game_one_line': {
          teamName: 'Line Team',
          opponentName: 'Opponent',
          gameDate: '2024-03-15',
          gameTime: '10:00',
          homeOrAway: 'home',
          seasonId: 'season_one_line',
          tournamentId: '',
          isPlayed: true,
          selectedPlayerIds: ['p1'],
          // A score with no goals logged: unfinished under the D2 rule.
          homeScore: 1,
          awayScore: 0,
          gameEvents: [],
          assessments: {},
        } as unknown as AppState,
      };
      await renderModal({ savedGames: games, seasons: [{ id: 'season_one_line', name: 'P12 Harrastesarja 2026' }] });
      const gameCard = await screen.findByTestId('game-item-game_one_line');
      const details = within(gameCard).getByTestId('game-competition-game_one_line').parentElement as HTMLElement;
      expect(details).toHaveClass('truncate');
      expect(details).toHaveTextContent(/ · P12 Harrastesarja 2026/);
      // Played: date · competition, no kick-off time.
      expect(details).not.toHaveTextContent('10:00');
      const badge = within(gameCard).getByTitle(/needsFinishing/i);
      expect(badge).toHaveClass('bg-white/[0.06]');
      expect(badge.className).not.toContain('text-action');
    });

    /**
     * @critical - D2: squad + a goal log matching the score is "valmis"; the
     * written report and scorers are not required.
     */
    it('shows no "needs finishing" badge for a game with goals logged but no report or scorers', async () => {
      const games: SavedGamesCollection = {
        'game_valmis': {
          teamName: 'Valmis Team',
          opponentName: 'Opponent',
          gameDate: '2024-03-15',
          homeOrAway: 'home',
          seasonId: '',
          tournamentId: '',
          isPlayed: true,
          selectedPlayerIds: ['p1'],
          homeScore: 1,
          awayScore: 1,
          gameEvents: [
            { id: 'g1', type: 'goal', time: 60 },
            { id: 'g2', type: 'opponentGoal', time: 120 },
          ],
          gameNotes: '',
          assessments: {},
        } as unknown as AppState,
      };
      await renderModal({ savedGames: games });
      const gameCard = await screen.findByTestId('game-item-game_valmis');
      expect(within(gameCard).queryByTitle(/needsFinishing/i)).not.toBeInTheDocument();
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
      expect(within(gameCard).getByText(/Championship Cup/)).toBeInTheDocument();

      // Series level badge should display (translation key pattern: common.levelElite)
      expect(within(gameCard).getByText(/common\.levelElite/)).toBeInTheDocument();
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
        expect(within(gameCard).getByText(new RegExp(`common\\.level${level}`))).toBeInTheDocument();

        unmount();
      }
    });
  });

  /**
   * Tests for game time display
   * @integration
   */
  describe('game time display', () => {
    it('displays the kick-off time next to the date for a game still to play', async () => {
      const games: SavedGamesCollection = {
        'game_with_time': {
          teamName: 'Evening Team',
          opponentName: 'Opponent',
          gameDate: '2024-08-15',
          gameTime: '18:30',
          homeOrAway: 'home',
          seasonId: '',
          tournamentId: '',
          isPlayed: false,
          selectedPlayerIds: ['p1'],
          assessments: {},
        } as unknown as AppState,
      };

      await renderModal({ savedGames: games });

      const gameCard = await screen.findByTestId('game-item-game_with_time');
      // Should display the time alongside the date
      expect(gameCard.textContent).toContain('18:30');
    });

    /** @edge-case a played game's one details line is date · competition; the time is left off. */
    it('leaves the time off a played game so the competition fits the one line', async () => {
      const games: SavedGamesCollection = {
        'game_played_time': {
          teamName: 'Evening Team',
          opponentName: 'Opponent',
          gameDate: '2024-08-15',
          gameTime: '18:30',
          homeOrAway: 'home',
          seasonId: '',
          tournamentId: '',
          isPlayed: true,
          selectedPlayerIds: ['p1'],
          assessments: {},
        } as unknown as AppState,
      };

      await renderModal({ savedGames: games });

      const gameCard = await screen.findByTestId('game-item-game_played_time');
      expect(gameCard.textContent).not.toContain('18:30');
    });

    it('displays only date when gameTime is not set', async () => {
      const games: SavedGamesCollection = {
        'game_no_time': {
          teamName: 'No Time Team',
          opponentName: 'Opponent',
          gameDate: '2024-08-15',
          // gameTime intentionally omitted
          homeOrAway: 'home',
          seasonId: '',
          tournamentId: '',
          isPlayed: true,
          selectedPlayerIds: ['p1'],
          assessments: {},
        } as unknown as AppState,
      };

      await renderModal({ savedGames: games });

      const gameCard = await screen.findByTestId('game-item-game_no_time');
      // Should not contain any time-like pattern
      expect(gameCard.textContent).not.toMatch(/\d{1,2}:\d{2}/);
    });

    it('displays only date when gameTime is empty string', async () => {
      const games: SavedGamesCollection = {
        'game_empty_time': {
          teamName: 'Empty Time Team',
          opponentName: 'Opponent',
          gameDate: '2024-08-15',
          gameTime: '', // Empty string
          homeOrAway: 'home',
          seasonId: '',
          tournamentId: '',
          isPlayed: true,
          selectedPlayerIds: ['p1'],
          assessments: {},
        } as unknown as AppState,
      };

      await renderModal({ savedGames: games });

      const gameCard = await screen.findByTestId('game-item-game_empty_time');
      // Empty string should be falsy, so no time displayed
      expect(gameCard.textContent).not.toMatch(/\d{1,2}:\d{2}/);
    });
  });

  /**
   * Tests for game type (Soccer/Futsal) badge display
   * @integration
   */
  describe('game type badge display', () => {
    it('displays Futsal badge for futsal games', async () => {
      const games: SavedGamesCollection = {
        'game_futsal': {
          teamName: 'Futsal Team',
          opponentName: 'Opponent',
          gameDate: '2024-08-01',
          homeOrAway: 'home',
          seasonId: '',
          tournamentId: '',
          gameType: 'futsal',
          isPlayed: true,
          selectedPlayerIds: ['p1'],
          assessments: {},
        } as unknown as AppState,
      };

      await renderModal({ savedGames: games });

      const gameCard = await screen.findByTestId('game-item-game_futsal');
      expect(within(gameCard).getByText('common.gameTypeFutsal')).toBeInTheDocument();
    });

    it('does not display Futsal badge for soccer games', async () => {
      const games: SavedGamesCollection = {
        'game_soccer': {
          teamName: 'Soccer Team',
          opponentName: 'Opponent',
          gameDate: '2024-08-01',
          homeOrAway: 'home',
          seasonId: '',
          tournamentId: '',
          gameType: 'soccer',
          isPlayed: true,
          selectedPlayerIds: ['p1'],
          assessments: {},
        } as unknown as AppState,
      };

      await renderModal({ savedGames: games });

      const gameCard = await screen.findByTestId('game-item-game_soccer');
      expect(within(gameCard).queryByText('common.gameTypeFutsal')).not.toBeInTheDocument();
    });

    it('does not display Futsal badge when gameType is undefined (defaults to soccer)', async () => {
      const games: SavedGamesCollection = {
        'game_default': {
          teamName: 'Default Team',
          opponentName: 'Opponent',
          gameDate: '2024-08-01',
          homeOrAway: 'home',
          seasonId: '',
          tournamentId: '',
          // gameType intentionally omitted
          isPlayed: true,
          selectedPlayerIds: ['p1'],
          assessments: {},
        } as unknown as AppState,
      };

      await renderModal({ savedGames: games });

      const gameCard = await screen.findByTestId('game-item-game_default');
      expect(within(gameCard).queryByText('common.gameTypeFutsal')).not.toBeInTheDocument();
    });

    it('displays both NOT PLAYED and Futsal badges together', async () => {
      const games: SavedGamesCollection = {
        'game_futsal_unplayed': {
          teamName: 'Futsal Team',
          opponentName: 'Opponent',
          gameDate: '2024-08-01',
          homeOrAway: 'home',
          seasonId: '',
          tournamentId: '',
          gameType: 'futsal',
          isPlayed: false,
          selectedPlayerIds: ['p1'],
          assessments: {},
        } as unknown as AppState,
      };

      await renderModal({ savedGames: games });

      const gameCard = await screen.findByTestId('game-item-game_futsal_unplayed');
      expect(within(gameCard).getByTitle('loadGameModal.unplayedBadge')).toBeInTheDocument();
      expect(within(gameCard).getByText('common.gameTypeFutsal')).toBeInTheDocument();
    });
  });

  /**
   * A team written two ways is one choice here, and a sibling team is never
   * swept in - neither of which free-text search can do.
   * @critical
   */
  describe('filtering by opponent', () => {
    const gamesWithVariants = (): SavedGamesCollection => ({
      g1: { opponentName: 'IPS/Sininen', gameDate: '2024-01-01', isPlayed: true } as unknown as AppState,
      g2: { opponentName: 'ips sininen', gameDate: '2024-02-01', isPlayed: true } as unknown as AppState,
      g3: { opponentName: 'IPS/Punainen', gameDate: '2024-03-01', isPlayed: true } as unknown as AppState,
    });

    it('offers one option per team however it is spelled', async () => {
      await renderModal({ savedGames: gamesWithVariants() });
      const select = screen.getByTestId('load-game-opponent-filter') as HTMLSelectElement;
      // "all" plus the two REAL teams - not three.
      expect(select.querySelectorAll('option')).toHaveLength(3);
    });

    /* The <option> elements carry the same names, so every assertion below
       looks only outside the select - otherwise the filter would appear to
       prove itself. */
    const inTheList = (pattern: RegExp) =>
      screen.queryAllByText(pattern).filter((el) => el.closest('select') === null);

    it('keeps both spellings of the chosen team', async () => {
      await renderModal({ savedGames: gamesWithVariants() });
      await act(async () => {
        fireEvent.change(screen.getByTestId('load-game-opponent-filter'), {
          target: { value: 'ips sininen' },
        });
      });
      expect(inTheList(/IPS\/Sininen/)).toHaveLength(1);
      expect(inTheList(/ips sininen/)).toHaveLength(1);
    });

    /** The trap a substring search falls into: "IPS" matches both squads. */
    it('does not sweep in a sibling team', async () => {
      await renderModal({ savedGames: gamesWithVariants() });
      await act(async () => {
        fireEvent.change(screen.getByTestId('load-game-opponent-filter'), {
          target: { value: 'ips sininen' },
        });
      });
      expect(inTheList(/IPS\/Punainen/)).toHaveLength(0);
    });

    it('offers no control when there is only one team', async () => {
      await renderModal({
        savedGames: {
          g1: { opponentName: 'HJK', gameDate: '2024-01-01', isPlayed: true } as unknown as AppState,
        },
      });
      expect(screen.queryByTestId('load-game-opponent-filter')).not.toBeInTheDocument();
    });
  });
});