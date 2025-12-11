import React from 'react';
import { screen, waitFor, within, fireEvent, act } from '@testing-library/react';
import { render } from '../../tests/utils/test-utils';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import GameStatsModal from './GameStatsModal';
import { Player, Season, Tournament } from '@/types';
import { GameEvent, SavedGamesCollection, AppState } from '@/types';
import * as seasonsUtils from '@/utils/seasons';
import * as tournamentsUtils from '@/utils/tournaments';
import * as appSettingsUtils from '@/utils/appSettings';
import { I18nextProvider } from 'react-i18next';
import i18n from '../i18n.test';

// Mock ResizeObserver for headlessui components
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    value: 800,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    value: 600,
  });
  HTMLElement.prototype.getBoundingClientRect = function () {
    return {
      width: 800,
      height: 600,
      top: 0,
      left: 0,
      bottom: 600,
      right: 800,
      x: 0,
      y: 0,
      toJSON: () => {},
    } as DOMRect;
  };
});

// Mocks
jest.mock('@/utils/seasons');
jest.mock('@/utils/tournaments');
jest.mock('@/utils/appSettings');

const mockGetSeasons = seasonsUtils.getSeasons as jest.Mock;
const mockGetTournaments = tournamentsUtils.getTournaments as jest.Mock;
const mockGetAppSettings = appSettingsUtils.getAppSettings as jest.Mock;

// Sample Data
const samplePlayers: Player[] = [
  { id: 'p1', name: 'Alice', jerseyNumber: '10', isGoalie: false, notes: '', receivedFairPlayCard: false },
  { id: 'p2', name: 'Bob', jerseyNumber: '7', isGoalie: false, notes: '', receivedFairPlayCard: true }, // Fair play winner
  { id: 'p3', name: 'Charlie', jerseyNumber: '1', isGoalie: true, notes: '', receivedFairPlayCard: false },
];

const sampleGameEvents: GameEvent[] = [
  { id: 'g1', type: 'goal', time: 120, scorerId: 'p1', assisterId: 'p2' },
  { id: 'g2', type: 'opponentGoal', time: 300 },
  { id: 'g3', type: 'goal', time: 500, scorerId: 'p2' },
];

const sampleSeasonsData: Season[] = [
  { id: 's1', name: 'Spring 2024' },
  { id: 's2', name: 'Summer 2024' },
];

const sampleTournamentsData: Tournament[] = [
  { id: 't1', name: 'Cup Finals' },
  { id: 't2', name: 'Invitational' },
];

// Create a minimal AppState object for the mock
const minimalMockAppState: AppState = {
  playersOnField: [],
  opponents: [],
  drawings: [],
  availablePlayers: samplePlayers, // Use sample players for consistency
  showPlayerNames: true,
  teamName: "Test Team", // Match default props
  gameEvents: [],
  opponentName: "Rivals", // Match default props
  gameDate: "2024-08-02", // Match default props
  homeScore: 0,
  awayScore: 0,
  gameNotes: '',
  homeOrAway: 'home',
  numberOfPeriods: 2,
  periodDurationMinutes: 10,
  currentPeriod: 1,
  gameStatus: 'notStarted',
  selectedPlayerIds: [],
  assessments: {},
  seasonId: '',
  tournamentId: '',
  gameLocation: '',
  gameTime: '',
  subIntervalMinutes: 5,
  completedIntervalDurations: [],
  lastSubConfirmationTimeSeconds: 0,
  tacticalDiscs: [],
  tacticalDrawings: [],
  tacticalBallPosition: null,
};

// Use the minimal AppState object for the mockSavedGames collection
const mockSavedGames: SavedGamesCollection = {
   'game1': minimalMockAppState // Ensure the value conforms to AppState
};

// Define a proper interface for the props used in tests
interface TestProps {
  isOpen: boolean;
  onClose: jest.Mock;
  teamName: string;
  opponentName: string;
  gameDate: string;
  homeScore: number;
  awayScore: number;
  homeOrAway: 'home' | 'away';
  availablePlayers: Player[];
  gameEvents: GameEvent[];
  selectedPlayerIds: string[];
  savedGames: SavedGamesCollection;
  currentGameId: string | null;
  seasonId: string | null;
  tournamentId: string | null;
  onOpponentNameChange: jest.Mock;
  onGameDateChange: jest.Mock;
  onHomeScoreChange: jest.Mock;
  onAwayScoreChange: jest.Mock;
  onGameNotesChange: jest.Mock;
  onUpdateGameEvent: jest.Mock;
  onExportOneJson: jest.Mock;
  onExportOneCsv: jest.Mock;
  onDeleteGameEvent: jest.Mock;
  onExportAggregateJson: jest.Mock;
  onExportAggregateCsv: jest.Mock;
  gameLocation?: string;
  gameTime?: string;
  gameNotes?: string;
  masterRoster?: Player[]; // Full roster for tournament player award display
}

// Default Props function returning the specific type
const getDefaultProps = (): TestProps => ({
  isOpen: true,
  onClose: jest.fn(),
  teamName: 'Test Team',
  opponentName: 'Rivals',
  gameDate: '2024-08-02',
  homeScore: 2,
  awayScore: 1,
  homeOrAway: 'home',
  availablePlayers: samplePlayers,
  gameEvents: sampleGameEvents,
  selectedPlayerIds: ['p1', 'p2', 'p3'],
  savedGames: mockSavedGames,
  currentGameId: 'game1',
  seasonId: 's1',
  tournamentId: '',
  onOpponentNameChange: jest.fn(),
  onGameDateChange: jest.fn(),
  onHomeScoreChange: jest.fn(),
  onAwayScoreChange: jest.fn(),
  onGameNotesChange: jest.fn(),
  onUpdateGameEvent: jest.fn(),
  onExportOneJson: jest.fn(),
  onExportOneCsv: jest.fn(),
  onDeleteGameEvent: jest.fn(),
  onExportAggregateJson: jest.fn(),
  onExportAggregateCsv: jest.fn(),
});

// Helper to render with mocked context/providers
// Note: QueryClientProvider is automatically included from test-utils render
const renderComponent = (props: TestProps) => {
  return render(
    <div style={{ width: 800, height: 600 }}>
      <I18nextProvider i18n={i18n}>
        <GameStatsModal {...props} />
      </I18nextProvider>
    </div>
  );
};

describe('GameStatsModal', () => {
  beforeEach(async () => {
    mockGetSeasons.mockResolvedValue(sampleSeasonsData);
    mockGetTournaments.mockResolvedValue(sampleTournamentsData);
    mockGetAppSettings.mockResolvedValue({
      currentGameId: null,
      lastHomeTeamName: '',
      language: 'fi',
      hasSeenAppGuide: false,
      useDemandCorrection: false,
      clubSeasonStartDate: '2000-10-01',
      clubSeasonEndDate: '2000-05-01',
      hasConfiguredSeasonDates: false,
    });
    await i18n.changeLanguage('fi');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('renders modal title and basic game info when open', async () => {
    const props = getDefaultProps();
    await act(async () => {
      renderComponent(props);
    });
    
    expect(screen.getByRole('heading', { name: i18n.t('gameStatsModal.titleCurrentGame', 'Ottelutilastot') })).toBeInTheDocument();
    
    const gameInfoSection = screen.getByRole('heading', { name: i18n.t('gameStatsModal.gameInfoTitle', 'Game Information') });
    expect(gameInfoSection).toBeInTheDocument();

    const gameInfoContainer = gameInfoSection.parentElement as HTMLElement;
    
    // Check for team names and scores
    expect(within(gameInfoContainer).getByText(props.teamName)).toBeInTheDocument();
    expect(within(gameInfoContainer).getByText(props.opponentName)).toBeInTheDocument();
    expect(within(gameInfoContainer).getByText(`${props.homeScore} - ${props.awayScore}`)).toBeInTheDocument();
    
    // Check for date
    expect(within(gameInfoContainer).getByText(/2\.8\.2024/)).toBeInTheDocument();
  });

  test('loads seasons and tournaments using utility functions on mount', async () => {
    await act(async () => {
      renderComponent(getDefaultProps());
    });
    await waitFor(() => {
      expect(mockGetSeasons).toHaveBeenCalledTimes(1);
      expect(mockGetTournaments).toHaveBeenCalledTimes(1);
    });
  });

  test('displays current game stats by default', async () => {
    await act(async () => {
      renderComponent(getDefaultProps());
    });
    expect(screen.getByRole('button', { name: i18n.t('gameStatsModal.tabs.currentGame') })).toBeInTheDocument();

    const playerStatsSection = screen.getByRole('heading', { name: i18n.t('gameStatsModal.playerStatsTitle') });
    expect(playerStatsSection).toBeInTheDocument();
    const playerStatsContainer = playerStatsSection.closest('div') as HTMLElement;

    expect(within(playerStatsContainer).getByRole('columnheader', { name: i18n.t('common.player') })).toBeInTheDocument();
    expect(within(playerStatsContainer).getByRole('cell', { name: 'Alice' })).toBeInTheDocument();
    expect(within(playerStatsContainer).getByRole('cell', { name: /Bob/ })).toBeInTheDocument();
    
    const aliceRow = within(playerStatsContainer).getByRole('row', { name: /Alice/i });
    if (!aliceRow) throw new Error("Row for Alice not found");
    // Alice: 1 Goal, 0 Assists = 1 Point. GP is 1. FP is 0.
    expect(aliceRow).toHaveTextContent('Alice'); // Name
    expect(aliceRow).toHaveTextContent('1');    // GP
    expect(aliceRow).toHaveTextContent('1');    // Goals
    expect(aliceRow).toHaveTextContent('0');    // Assists
    expect(aliceRow).toHaveTextContent('1');    // Total Points
  });

  test('shows totals row with aggregated stats', async () => {
    await act(async () => {
      renderComponent(getDefaultProps());
    });

    const totalsRow = screen.getByText(i18n.t('playerStats.totalsRow'));
    const cells = totalsRow.closest('tr')!.querySelectorAll('td');
    expect(cells[1]).toHaveTextContent('3'); // games played total
    expect(cells[2]).toHaveTextContent('2'); // goals total
    expect(cells[3]).toHaveTextContent('1'); // assists total
    expect(cells[4]).toHaveTextContent('3'); // total score
    expect(cells[5]).toHaveTextContent('1.0'); // average points
  });

  test('displays game event log correctly', async () => {
    await act(async () => {
      renderComponent(getDefaultProps());
    });
    const goalLogSection = await screen.findByRole('heading', { name: i18n.t('gameStatsModal.goalLogTitle', 'Goal Log') });
    const goalLogContainer = goalLogSection.parentElement as HTMLElement;

    // Check for the first goal (Alice from Bob)
    const firstGoalCard = within(goalLogContainer).getByText('02:00').closest('div.p-3');
    expect(firstGoalCard).not.toBeNull();
    if (firstGoalCard) {
      expect(within(firstGoalCard as HTMLElement).getByText('Alice')).toBeInTheDocument();
      expect(within(firstGoalCard as HTMLElement).getByText(new RegExp(i18n.t('common.assist', 'Assist') + '.*Bob'))).toBeInTheDocument();
    }

    // Check for the opponent goal
    const opponentGoalCard = within(goalLogContainer).getByText('05:00').closest('div.p-3');
    expect(opponentGoalCard).not.toBeNull();
    if (opponentGoalCard) {
      expect(within(opponentGoalCard as HTMLElement).getByText('Rivals')).toBeInTheDocument();
    }

    // Check for the third goal (Bob, unassisted)
    const thirdGoalCard = within(goalLogContainer).getByText('08:20').closest('div.p-3');
    expect(thirdGoalCard).not.toBeNull();
    if (thirdGoalCard) {
      expect(within(thirdGoalCard as HTMLElement).getByText('Bob')).toBeInTheDocument();
      // Ensure no assister text is present
      expect(within(thirdGoalCard as HTMLElement).queryByText(new RegExp(i18n.t('common.assist', 'Assist')))).not.toBeInTheDocument();
    }
  });

  test('calls onDeleteGameEvent when delete button on an event is clicked and confirmed', async () => {
    const mockProps = getDefaultProps();
    await act(async () => {
      renderComponent(mockProps);
    });

    const goalLogSection = await screen.findByRole('heading', { name: i18n.t('gameStatsModal.goalLogTitle', 'Goal Log') });
    const goalLogContainer = goalLogSection.parentElement as HTMLElement;

    const firstGoalCard = within(goalLogContainer).getByText('02:00').closest('div.p-3');
    expect(firstGoalCard).not.toBeNull();

    if (firstGoalCard) {
      // Click the actions menu button (3-dot menu)
      const actionsButton = within(firstGoalCard as HTMLElement).getByRole('button', { name: i18n.t('common.actions', 'Actions') });
      await act(async () => {
        fireEvent.click(actionsButton);
      });

      // Wait for dropdown menu to appear, then click delete
      await waitFor(() => {
        const deleteButton = within(firstGoalCard as HTMLElement).getByRole('button', { name: i18n.t('common.delete', 'Delete') });
        expect(deleteButton).toBeInTheDocument();
      });

      const deleteButton = within(firstGoalCard as HTMLElement).getByRole('button', { name: i18n.t('common.delete', 'Delete') });
      await act(async () => {
        fireEvent.click(deleteButton);
      });
    }

    // Wait for confirmation modal to appear
    await waitFor(() => {
      expect(screen.getByText(i18n.t('gameStatsModal.confirmDeleteEvent'))).toBeInTheDocument();
    });

    // Click confirm button in modal (find the Delete button inside the dialog)
    const allDeleteButtons = screen.getAllByRole('button', { name: i18n.t('common.delete', 'Delete') });
    const modalConfirmButton = allDeleteButtons.find(btn => btn.closest('[role="dialog"]'));
    await act(async () => {
      fireEvent.click(modalConfirmButton!);
    });

    expect(mockProps.onDeleteGameEvent).toHaveBeenCalledWith('g1');
  });

  test('does not call onDeleteGameEvent if delete is cancelled', async () => {
    const mockProps = getDefaultProps();
    await act(async () => {
      renderComponent(mockProps);
    });

    const goalLogSection = await screen.findByRole('heading', { name: i18n.t('gameStatsModal.goalLogTitle', 'Goal Log') });
    const goalLogContainer = goalLogSection.parentElement as HTMLElement;

    const firstGoalCard = within(goalLogContainer).getByText('02:00').closest('div.p-3');
    expect(firstGoalCard).not.toBeNull();

    if (firstGoalCard) {
      // Click the actions menu button (3-dot menu)
      const actionsButton = within(firstGoalCard as HTMLElement).getByRole('button', { name: i18n.t('common.actions', 'Actions') });
      await act(async () => {
        fireEvent.click(actionsButton);
      });

      // Wait for dropdown menu to appear, then click delete
      await waitFor(() => {
        const deleteButton = within(firstGoalCard as HTMLElement).getByRole('button', { name: i18n.t('common.delete', 'Delete') });
        expect(deleteButton).toBeInTheDocument();
      });

      const deleteButton = within(firstGoalCard as HTMLElement).getByRole('button', { name: i18n.t('common.delete', 'Delete') });
      await act(async () => {
        fireEvent.click(deleteButton);
      });
    }

    // Wait for confirmation modal to appear
    await waitFor(() => {
      expect(screen.getByText(i18n.t('gameStatsModal.confirmDeleteEvent'))).toBeInTheDocument();
    });

    // Click cancel button in modal
    const cancelButton = screen.getByRole('button', { name: i18n.t('common.cancel', 'Cancel') });
    await act(async () => {
      fireEvent.click(cancelButton);
    });

    expect(mockProps.onDeleteGameEvent).not.toHaveBeenCalled();
  });

  test('enters edit mode when edit button on an event is clicked', async () => {
    const mockProps = getDefaultProps();
    await act(async () => {
      renderComponent(mockProps);
    });

    const goalLogSection = await screen.findByRole('heading', { name: i18n.t('gameStatsModal.goalLogTitle', 'Goal Log') });
    const goalLogContainer = goalLogSection.parentElement as HTMLElement;

    const firstGoalCard = within(goalLogContainer).getByText('02:00').closest('div.p-3');
    expect(firstGoalCard).not.toBeNull();

    if (firstGoalCard) {
      // Click the actions menu button (3-dot menu)
      const actionsButton = within(firstGoalCard as HTMLElement).getByRole('button', { name: i18n.t('common.actions', 'Actions') });
      await act(async () => {
        fireEvent.click(actionsButton);
      });

      // Wait for dropdown menu to appear, then click edit
      await waitFor(() => {
        const editButton = within(firstGoalCard as HTMLElement).getByRole('button', { name: i18n.t('common.edit', 'Edit') });
        expect(editButton).toBeInTheDocument();
      });

      const editButton = within(firstGoalCard as HTMLElement).getByRole('button', { name: i18n.t('common.edit', 'Edit') });
      fireEvent.click(editButton);

      // Check that edit mode is entered by looking for save/cancel buttons within the same card
      expect(await within(firstGoalCard as HTMLElement).findByRole('button', { name: i18n.t('common.save', 'Save Changes') })).toBeInTheDocument();
      expect(within(firstGoalCard as HTMLElement).getByRole('button', { name: i18n.t('common.cancel', 'Cancel') })).toBeInTheDocument();
    }

    // onUpdateGameEvent should NOT be called until save is clicked
    expect(mockProps.onUpdateGameEvent).not.toHaveBeenCalled();
  });

  test('displays correct data when switching tabs', async () => {
    const props = getDefaultProps();
    await act(async () => {
      renderComponent(props);
    });

    // Initial check (Current Game)
    expect(screen.getByRole('button', { name: i18n.t('gameStatsModal.tabs.currentGame') })).toBeInTheDocument();

    // Switch to Season tab and check for season-specific elements
    fireEvent.click(screen.getByRole('button', { name: i18n.t('gameStatsModal.tabs.season') }));
    await waitFor(() => {
      // With game type filter, we now have multiple comboboxes
      expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0);
      // Check for the fallback text since translations might not be loaded in tests
      // Use getAllByText since it appears in both the dropdown and heading
      const allSeasons = screen.getAllByText('All Seasons');
      expect(allSeasons.length).toBeGreaterThan(0);
    });

    // Switch to Tournament tab and check for tournament-specific elements
    // Note: Tournament tab uses CollapsibleFilters with tournament dropdown visible by default
    fireEvent.click(screen.getByRole('button', { name: i18n.t('gameStatsModal.tabs.tournament') }));

    await waitFor(() => {
      // Tournament dropdown is visible by default (not behind collapsible)
      expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0);
      // Check for the fallback text since translations might not be loaded in tests
      // "All Tournaments" appears in the dropdown and potentially in the stats heading
      const allTournaments = screen.getAllByText('All Tournaments');
      expect(allTournaments.length).toBeGreaterThan(0);
    });
  });

  test('deletes a goal when delete is confirmed', async () => {
    const mockProps = getDefaultProps();

    await act(async () => {
      renderComponent(mockProps);
    });

    // Find the goal log section
    const goalLogSection = await screen.findByRole('heading', { name: i18n.t('gameStatsModal.goalLogTitle', 'Goal Log') });
    const goalLogContainer = goalLogSection.parentElement as HTMLElement;

    // Find the first goal card
    const firstGoalCard = within(goalLogContainer).getByText('02:00').closest('div.p-3');
    expect(firstGoalCard).not.toBeNull();

    if (firstGoalCard) {
      // Click the actions menu button (3-dot menu)
      const actionsButton = within(firstGoalCard as HTMLElement).getByRole('button', { name: i18n.t('common.actions', 'Actions') });
      await act(async () => {
        fireEvent.click(actionsButton);
      });

      // Wait for dropdown menu to appear, then click delete
      await waitFor(() => {
        const deleteButton = within(firstGoalCard as HTMLElement).getByRole('button', { name: i18n.t('common.delete', 'Delete') });
        expect(deleteButton).toBeInTheDocument();
      });

      const deleteButton = within(firstGoalCard as HTMLElement).getByRole('button', { name: i18n.t('common.delete', 'Delete') });
      await act(async () => {
        fireEvent.click(deleteButton);
      });
    }

    // Wait for confirmation modal to appear
    await waitFor(() => {
      expect(screen.getByText(i18n.t('gameStatsModal.confirmDeleteEvent'))).toBeInTheDocument();
    });

    // Click confirm button in modal (find by role to get the specific delete button in modal)
    const confirmButtons = screen.getAllByRole('button', { name: i18n.t('common.delete', 'Delete') });
    const modalConfirmButton = confirmButtons.find(btn => btn.closest('[role="dialog"]'));
    await act(async () => {
      fireEvent.click(modalConfirmButton!);
    });

    // Check that onDeleteGameEvent was called with the correct goal ID
    expect(mockProps.onDeleteGameEvent).toHaveBeenCalledWith('g1');
  });

  test('filters player list and selects with mouse', async () => {
    const props = getDefaultProps();
    await act(async () => {
      renderComponent(props);
    });

    fireEvent.click(screen.getByRole('button', { name: i18n.t('gameStatsModal.tabs.player', 'Player') }));

    const user = userEvent.setup();
    const input = await screen.findByPlaceholderText(
      i18n.t('playerStats.selectPlayerLabel', 'Select Player')
    );
    await user.type(input, 'Bob');
    const bobOption = await screen.findByRole('option', { name: 'Bob' });
    await user.click(bobOption);

    const bobHeadings = await screen.findAllByRole('heading', { name: 'Bob' });
    expect(bobHeadings.length).toBeGreaterThan(0);
  });

  test('allows selecting player with keyboard', async () => {
    const props = getDefaultProps();
    await act(async () => {
      renderComponent(props);
    });

    fireEvent.click(screen.getByRole('button', { name: i18n.t('gameStatsModal.tabs.player', 'Player') }));

    const input = await screen.findByPlaceholderText(
      i18n.t('playerStats.selectPlayerLabel', 'Select Player')
    );
    fireEvent.change(input, { target: { value: 'Cha' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    const charlieHeadings = await screen.findAllByRole('heading', { name: 'Charlie' });
    expect(charlieHeadings.length).toBeGreaterThan(0);
  });

  test('player search uses master roster (not limited to available players)', async () => {
    const props = getDefaultProps();
    // Provide a master roster that includes a player not in availablePlayers
    const diana = { id: 'p4', name: 'Diana' } as Player;
    const withRoster = { ...props, masterRoster: [...props.availablePlayers, diana] };

    await act(async () => {
      renderComponent(withRoster);
    });

    // Go to Player tab and search for Diana
    fireEvent.click(screen.getByRole('button', { name: i18n.t('gameStatsModal.tabs.player', 'Player') }));
    const input = await screen.findByPlaceholderText(
      i18n.t('playerStats.selectPlayerLabel', 'Select Player')
    );
    fireEvent.change(input, { target: { value: 'Diana' } });

    // Option for Diana should be present even though not in availablePlayers
    const option = await screen.findByRole('option', { name: 'Diana' });
    expect(option).toBeInTheDocument();
  });

  /**
   * Tournament Player Award Tests
   * @critical - Tests tournament MVP award display functionality
   */
  describe('Tournament Player Award Display', () => {
    test('should handle deleted awarded player gracefully (no trophy displayed)', async () => {
      const tournamentWithDeletedPlayer: Tournament = {
        id: 't1',
        name: 'Championship Cup',
        awardedPlayerId: 'deleted-player-id', // Non-existent player
      };

      mockGetTournaments.mockResolvedValue([tournamentWithDeletedPlayer]);

      // Create a mock game with the tournament to ensure it appears in stats
      const tournamentGame: AppState = {
        playersOnField: [],
        opponents: [],
        drawings: [],
        availablePlayers: samplePlayers,
        showPlayerNames: true,
        teamName: "Test Team",
        gameEvents: [
          { id: 'tg1', type: 'goal', time: 100, scorerId: 'p1' },
          { id: 'tg2', type: 'goal', time: 200, scorerId: 'p2' },
          { id: 'tg3', type: 'goal', time: 300, scorerId: 'p1' },
        ],
        opponentName: "Tournament Opponent",
        gameDate: '2024-08-01',
        homeScore: 3,
        awayScore: 2,
        gameNotes: '',
        homeOrAway: 'home',
        numberOfPeriods: 2,
        periodDurationMinutes: 10,
        currentPeriod: 1,
        gameStatus: 'gameEnd',
        selectedPlayerIds: ['p1', 'p2'],
        assessments: {},
        seasonId: '',        // No season (empty string, not null)
        tournamentId: 't1',  // Tournament game
        gameLocation: '',
        gameTime: '',
        subIntervalMinutes: 5,
        completedIntervalDurations: [],
        lastSubConfirmationTimeSeconds: 0,
        tacticalDiscs: [],
        tacticalDrawings: [],
        tacticalBallPosition: null,
        isPlayed: true,      // Mark as played
      };

      const mockSavedGamesWithTournament: SavedGamesCollection = {
        ...mockSavedGames,
        'tournament-game-1': tournamentGame,
      };

      const props = {
        ...getDefaultProps(),
        tournamentId: 't1',
        masterRoster: samplePlayers,
        savedGames: mockSavedGamesWithTournament,
      };

      await act(async () => {
        renderComponent(props);
      });

      // Wait for tournaments to load
      await waitFor(() => {
        expect(mockGetTournaments).toHaveBeenCalled();
      });

      // Switch to tournament tab and wait for stats to update
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: i18n.t('gameStatsModal.tabs.tournament') }));
      });

      // Wait for tournament stats to render
      // Tournament dropdown is visible by default (not behind collapsible)
      await waitFor(
        () => {
          // The tournament should appear in the visible filter dropdown
          const tournamentElements = screen.getAllByText('Championship Cup');
          expect(tournamentElements.length).toBeGreaterThan(0);
        },
        { timeout: 3000 }
      );

      // Trophy should NOT be displayed for deleted player
      expect(screen.queryByText('🏆')).not.toBeInTheDocument();
    });

    test('should not display trophy when tournament tab is not active', async () => {
      const tournamentWithAward: Tournament = {
        id: 't1',
        name: 'Championship Cup',
        awardedPlayerId: 'p1',
      };

      mockGetTournaments.mockResolvedValue([tournamentWithAward]);

      const props = {
        ...getDefaultProps(),
        tournamentId: 't1',
        masterRoster: samplePlayers,
      };

      await act(async () => {
        renderComponent(props);
      });

      // Stay on Current Game tab (default)
      expect(screen.getByRole('button', { name: i18n.t('gameStatsModal.tabs.currentGame') })).toBeInTheDocument();

      // Trophy should not be visible on current game tab
      expect(screen.queryByText('🏆')).not.toBeInTheDocument();
    });
  });

  // Add more tests for:
  // - Filtering stats table
  // - Sorting stats table
  // - Editing game notes
  // - Export functionalities
}); 
