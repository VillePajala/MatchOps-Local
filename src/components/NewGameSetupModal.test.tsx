 
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import NewGameSetupModal from './NewGameSetupModal';
import { getLastHomeTeamName, saveLastHomeTeamName } from '@/utils/appSettings';
import { getPlans } from '@/utils/playtimePlanner/storage';
import { ToastProvider } from '@/contexts/ToastProvider';

// Mock the utility functions
jest.mock('@/utils/appSettings', () => ({
  getLastHomeTeamName: jest.fn(),
  saveLastHomeTeamName: jest.fn(),
}));

// No plans by default; the prefill-from-plan picker stays hidden (its own tests
// provide plans). Keeps the modal off the real IndexedDB storage layer.
jest.mock('@/utils/playtimePlanner/storage', () => ({
  getPlans: jest.fn(async () => ({})),
}));

// Team selection loads the team roster through the storage layer - stub it so
// switching teams in tests never boots the real DataStore factory.
jest.mock('@/utils/teams', () => ({
  getTeamRoster: jest.fn(async () => [{ id: 'tp1', name: 'John Doe' }]),
  getTeamDisplayName: jest.fn((team: { name: string }) => team.name),
  getTeamBoundSeries: jest.fn(async () => []),
}));


// More robust i18n mock
const translations: { [key: string]: string } = {
  'newGameSetupModal.title': 'New Game Setup',
  'newGameSetupModal.loading': 'Loading setup data...',
  'newGameSetupModal.homeTeamLabel': 'Your Team Name',
  'newGameSetupModal.homeTeamPlaceholder': 'e.g., Galaxy U10',
  'newGameSetupModal.opponentNameLabel': 'Opponent Name: *',
  'newGameSetupModal.opponentNamePlaceholder': 'Enter opponent name',
  'newGameSetupModal.playersHeader': 'Select Players',
  'newGameSetupModal.playersSelected': 'selected',
  'newGameSetupModal.selectAll': 'Select All',
  'common.cancel': 'Cancel',
  'newGameSetupModal.createGame': 'Create Game',
  'newGameSetupModal.errorHomeTeamRequired': 'Home Team Name is required.',
  'newGameSetupModal.unplayedToggle': 'Not played yet',
  // Level translations for series
  'common.levelKilpa': 'Competition',
  'common.levelHarraste': 'Recreational',
  'common.levelElite': 'Elite',
  'common.levelHaaste': 'Challenger',
  'common.selectSeries': '-- Select Series --',
  'newGameSetupModal.seriesLabel': 'Series',
  // League translations
  'seasonDetailsModal.leagueLabel': 'League',
  'seasonDetailsModal.selectLeague': '-- Select League --',
  'seasonDetailsModal.customLeaguePlaceholder': 'Enter league name',
  // Game type translations
  'newGameSetupModal.gameTypeLabel': 'Game Type',
  'common.gameTypeLabel': 'Sport Type',
  'common.gameTypeSoccer': 'Soccer',
  'common.gameTypeFutsal': 'Futsal',
};

const mockT = jest.fn((key: string, fallback?: any) => {
    // If a specific translation exists in our map, return it.
    if (translations[key]) {
        return translations[key];
    }
    // If it's an object with a fallback (like for placeholders), use that.
    if (typeof fallback === 'object' && fallback !== null) {
        // A simple attempt to replace placeholders if any.
        let text = translations[key] || key;
        Object.keys(fallback).forEach(placeholder => {
            text = text.replace(`{{${placeholder}}}`, fallback[placeholder]);
        });
        return text;
    }
    // Otherwise, return the fallback string or the key itself.
    return fallback || key;
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: mockT,
  }),
}));

// Polyfill for setImmediate
if (typeof setImmediate === 'undefined') {
  global.setImmediate = ((fn: (...args: any[]) => void, ...args: any[]) => setTimeout(() => fn(...args), 0)) as any;
}

describe('NewGameSetupModal', () => {
  const mockOnStart = jest.fn();
  const mockOnCancel = jest.fn();

  const mockSeasonsData = [
    { id: 'season1', name: 'Spring 2024', leagueId: 'sm-sarja', customLeagueName: '', gameType: 'soccer' as const },
    { id: 'season2', name: 'Summer 2024', leagueId: 'muu', customLeagueName: 'Custom Summer League', gameType: 'futsal' as const },
    { id: 'season3', name: 'Fall 2024' }, // No league or gameType set
  ];
  const mockTournamentsData = [
    { id: 'tournament1', name: 'City Cup', gameType: 'soccer' as const },
    { id: 'tournament2', name: 'Regional Tournament', gameType: 'futsal' as const },
  ];
  const mockPlayersData = [{ id: 'player1', name: 'John Doe', jerseyNumber: '10' },{ id: 'player2', name: 'Jane Smith', jerseyNumber: '7' }];
  const mockTeamsData = [
    { id: 'team1', name: 'Team Alpha', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' },
    { id: 'team2', name: 'Team Beta', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }
  ];

  const defaultProps = {
    isOpen: true, initialPlayerSelection: ['player1', 'player2'], onStart: mockOnStart, onCancel: mockOnCancel,
    demandFactor: 1,
    onDemandFactorChange: jest.fn(),
    masterRoster: mockPlayersData,
    seasons: mockSeasonsData,
    tournaments: mockTournamentsData,
    teams: mockTeamsData,
    personnel: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockT.mockClear();

    (getLastHomeTeamName as jest.Mock).mockResolvedValue('Last Team');
    (saveLastHomeTeamName as jest.Mock).mockResolvedValue(true);
  });

  const renderModal = () => {
    render(
      <ToastProvider>
        <NewGameSetupModal {...defaultProps} />
      </ToastProvider>
    );
  };

  test('R1: inline add appends the saved player to the picker snapshot AND selects them', async () => {
    const saved = { id: 'new-9', name: 'Uusi', isGoalie: false, receivedFairPlayCard: false };
    const onAddPlayerToRoster = jest.fn().mockResolvedValue(saved);
    render(
      <ToastProvider>
        <NewGameSetupModal {...defaultProps} onAddPlayerToRoster={onAddPlayerToRoster} />
      </ToastProvider>
    );
    fireEvent.click(await screen.findByRole('button', { name: /Add new player/ }));
    fireEvent.change(screen.getByPlaceholderText('New player name'), { target: { value: 'Uusi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(onAddPlayerToRoster).toHaveBeenCalledWith('Uusi', undefined));
    // The picker renders the new player immediately (snapshot append) and
    // they are selected - the owner-walkthrough R1 regression.
    expect(await screen.findByText('Uusi')).toBeInTheDocument();
    const checkbox = screen.getByText('Uusi').closest('label')!.querySelector('input')!;
    expect(checkbox).toBeChecked();
  });

  test('R1: duplicate name is refused with an inline message, no club write', async () => {
    const onAddPlayerToRoster = jest.fn();
    render(
      <ToastProvider>
        <NewGameSetupModal {...defaultProps} onAddPlayerToRoster={onAddPlayerToRoster} />
      </ToastProvider>
    );
    fireEvent.click(await screen.findByRole('button', { name: /Add new player/ }));
    fireEvent.change(screen.getByPlaceholderText('New player name'),
      { target: { value: defaultProps.masterRoster[0].name.toUpperCase() } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(onAddPlayerToRoster).not.toHaveBeenCalled();
  });

  test('loads the last home team name from appSettings utility and populates input', async () => {
    renderModal();
    expect(getLastHomeTeamName).toHaveBeenCalled();
    // Use getByRole and wait for async load
    const homeTeamInput = screen.getByRole('textbox', { name: /Your Team Name/i });
    await waitFor(() => {
      expect(homeTeamInput).toHaveValue('Last Team');
    });
  });

  test('renders seasons and tournaments from props in tab-based UI', async () => {
    renderModal();

    // Seasons are hidden until the "Season" tab is clicked
    const seasonTab = screen.getByRole('button', { name: /Season/i });
    await act(async () => {
      fireEvent.click(seasonTab);
    });

    // Now season dropdown should be visible with options
    await waitFor(() => {
      expect(screen.getByText('Spring 2024')).toBeInTheDocument();
    });

    // Switch to tournament tab
    const tournamentTab = screen.getByRole('button', { name: /Tournament/i });
    await act(async () => {
      fireEvent.click(tournamentTab);
    });

    // Now tournament dropdown should be visible with options
    await waitFor(() => {
      expect(screen.getByText('City Cup')).toBeInTheDocument();
    });
  });

  test('saves last home team name using utility function on start', async () => {
    renderModal();

    // Wait for initial home team name to load
    const homeTeamInput = screen.getByRole('textbox', { name: /Your Team Name/i });
    await waitFor(() => {
      expect(homeTeamInput).toHaveValue('Last Team');
    });

    fireEvent.change(homeTeamInput, { target: { value: 'New Team Name' } });
    const opponentInput = screen.getByRole('textbox', { name: /Opponent Name/i });
    fireEvent.change(opponentInput, { target: { value: 'Opponent Team' } });
    const startButton = screen.getByRole('button', { name: /Create Game/i });
    
    await act(async () => {
        fireEvent.click(startButton);
    });
    
    await waitFor(() => {
      expect(saveLastHomeTeamName).toHaveBeenCalledWith('New Team Name');
    });
    expect(mockOnStart).toHaveBeenCalledWith(
      expect.arrayContaining(['player1', 'player2']), 'New Team Name', 'Opponent Team',
      expect.any(String), '', '', null, null, 2, 15, 'home', 1, '', '', null, true, null,
      expect.arrayContaining([
        expect.objectContaining({ id: 'player1', name: 'John Doe' }),
        expect.objectContaining({ id: 'player2', name: 'Jane Smith' })
      ]),
      expect.arrayContaining([]),
      '', // leagueId
      '', // customLeagueName
      'soccer', // gameType
      undefined, // gender
      undefined // prefill (Phase 2 planner)
    );
  });

  // Tests for inline season/tournament creation removed as this functionality
  // was replaced with tab-based UI. Seasons and tournaments should now be created
  // in the SeasonTournamentManagementModal.

  test('passes isPlayed false when not played toggle checked', async () => {
    renderModal();

    // Wait for home team name to load
    const homeTeamInput = screen.getByRole('textbox', { name: /Your Team Name/i });
    await waitFor(() => {
      expect(homeTeamInput).toHaveValue('Last Team');
    });

    const opponentInput = screen.getByRole('textbox', { name: /Opponent Name/i });
    fireEvent.change(opponentInput, { target: { value: 'Opponent Team' } });
    const toggle = screen.getByLabelText(translations['newGameSetupModal.unplayedToggle']);
    fireEvent.click(toggle);
    const startButton = screen.getByRole('button', { name: /Create Game/i });
    await act(async () => {
        fireEvent.click(startButton);
    });
    await waitFor(() => {
      expect(mockOnStart).toHaveBeenCalledWith(
        expect.arrayContaining(['player1', 'player2']), 'Last Team', 'Opponent Team',
        expect.any(String), '', '', null, null, 2, 15, 'home', 1, '', '', null, false, null,
        expect.arrayContaining([
          expect.objectContaining({ id: 'player1', name: 'John Doe' }),
          expect.objectContaining({ id: 'player2', name: 'Jane Smith' })
        ]),
        expect.arrayContaining([]),
        '', // leagueId
        '', // customLeagueName
        'soccer', // gameType
      undefined, // gender
      undefined // prefill (Phase 2 planner)
      );
    });
  });

  test('does not call onStart if home team name is empty, and saveLastHomeTeamName is not called', async () => {
    renderModal();

    // Wait for initial home team name to load
    const homeTeamInput = screen.getByRole('textbox', { name: /Your Team Name/i });
    await waitFor(() => {
      expect(homeTeamInput).toHaveValue('Last Team');
    });

    fireEvent.change(homeTeamInput, { target: { value: '' } });
    const opponentInput = screen.getByRole('textbox', { name: /Opponent Name/i });
    fireEvent.change(opponentInput, { target: { value: 'Opponent Team' } });
    const startButton = screen.getByRole('button', { name: /Create Game/i });

    await act(async () => {
        fireEvent.click(startButton);
    });

    await waitFor(() => {
      // Check for toast message
      expect(screen.getByText('Home Team Name is required.')).toBeInTheDocument();
    });
    expect(saveLastHomeTeamName).not.toHaveBeenCalled();
    expect(mockOnStart).not.toHaveBeenCalled();
  });

  test('calls onCancel when the header close (X) is clicked', async () => {
    renderModal();
    // Chrome slimming: Cancel is now the header X (aria-label = Cancel).
    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    await act(async () => {
        fireEvent.click(cancelButton);
    });
    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });

  describe('Tournament Series Selection', () => {
    const tournamentWithSeries = {
      id: 'tournament-series',
      name: 'League Cup',
      series: [
        { id: 'series-1', level: 'Kilpa' },
        { id: 'series-2', level: 'Harraste' },
      ],
    };

    const renderModalWithSeries = () => {
      render(
        <ToastProvider>
          <NewGameSetupModal
            {...defaultProps}
            tournaments={[...mockTournamentsData, tournamentWithSeries]}
          />
        </ToastProvider>
      );
    };

    test('shows series dropdown when tournament with series is selected', async () => {
      renderModalWithSeries();

      // Switch to tournament tab
      const tournamentTab = screen.getByRole('button', { name: /Tournament/i });
      await act(async () => {
        fireEvent.click(tournamentTab);
      });

      // Select the tournament with series (find by id since no associated label)
      await waitFor(() => {
        expect(document.getElementById('tournamentSelect')).toBeInTheDocument();
      });
      const tournamentSelect = document.getElementById('tournamentSelect') as HTMLSelectElement;
      await act(async () => {
        fireEvent.change(tournamentSelect, { target: { value: 'tournament-series' } });
      });

      // Series dropdown should appear with translated level options
      await waitFor(() => {
        expect(screen.getByText('Competition')).toBeInTheDocument(); // Kilpa translated
      });
      expect(screen.getByText('Recreational')).toBeInTheDocument(); // Harraste translated
    });

    test('passes selected series ID to onStart callback', async () => {
      renderModalWithSeries();

      // Wait for home team name to load
      const homeTeamInput = screen.getByRole('textbox', { name: /Your Team Name/i });
      await waitFor(() => {
        expect(homeTeamInput).toHaveValue('Last Team');
      });

      // Fill required opponent name
      const opponentInput = screen.getByRole('textbox', { name: /Opponent Name/i });
      fireEvent.change(opponentInput, { target: { value: 'Test Opponent' } });

      // Switch to tournament tab and select tournament with series
      const tournamentTab = screen.getByRole('button', { name: /Tournament/i });
      await act(async () => {
        fireEvent.click(tournamentTab);
      });

      await waitFor(() => {
        expect(document.getElementById('tournamentSelect')).toBeInTheDocument();
      });
      const tournamentSelect = document.getElementById('tournamentSelect') as HTMLSelectElement;
      await act(async () => {
        fireEvent.change(tournamentSelect, { target: { value: 'tournament-series' } });
      });

      // Wait for series dropdown to appear
      await waitFor(() => {
        expect(screen.getByText('Competition')).toBeInTheDocument();
      });

      // Find the series dropdown by id (shares id with level dropdown)
      const seriesSelect = document.getElementById('tournamentLevelInput') as HTMLSelectElement;
      await act(async () => {
        fireEvent.change(seriesSelect, { target: { value: 'series-1' } });
      });

      // Submit the form
      const startButton = screen.getByRole('button', { name: /Create Game/i });
      await act(async () => {
        fireEvent.click(startButton);
      });

      // Verify onStart was called with the series ID
      await waitFor(() => {
        expect(mockOnStart).toHaveBeenCalledWith(
          expect.any(Array), // selectedPlayerIds
          'Last Team', // homeTeamName
          'Test Opponent', // opponentName
          expect.any(String), // gameDate
          expect.any(String), // gameLocation
          expect.any(String), // gameTime
          null, // seasonId
          'tournament-series', // tournamentId
          expect.any(Number), // numPeriods
          expect.any(Number), // periodDuration
          expect.any(String), // homeOrAway
          expect.any(Number), // demandFactor
          expect.any(String), // ageGroup
          'Kilpa', // tournamentLevel (from series)
          'series-1', // tournamentSeriesId - THE KEY ASSERTION
          expect.any(Boolean), // isPlayed
          null, // teamId
          expect.any(Array), // availablePlayersForGame
          expect.any(Array), // selectedPersonnelIds
          expect.any(String), // leagueId
          expect.any(String), // customLeagueName
          'soccer', // gameType
      undefined, // gender
      undefined // prefill (Phase 2 planner)
        );
      });
    });

    test('shows level dropdown when switching from tournament with series to tournament without series', async () => {
      renderModalWithSeries();

      // Switch to tournament tab
      const tournamentTab = screen.getByRole('button', { name: /Tournament/i });
      await act(async () => {
        fireEvent.click(tournamentTab);
      });

      // Select tournament WITH series first
      await waitFor(() => {
        expect(document.getElementById('tournamentSelect')).toBeInTheDocument();
      });
      const tournamentSelect = document.getElementById('tournamentSelect') as HTMLSelectElement;
      await act(async () => {
        fireEvent.change(tournamentSelect, { target: { value: 'tournament-series' } });
      });

      // Verify series dropdown appears
      await waitFor(() => {
        expect(screen.getByText('-- Select Series --')).toBeInTheDocument();
      });

      // Now switch to tournament WITHOUT series
      await act(async () => {
        fireEvent.change(tournamentSelect, { target: { value: 'tournament1' } });
      });

      // Series dropdown should be replaced with level dropdown
      // Check that the level dropdown (tournamentLevelInput) now shows level options instead of series
      await waitFor(() => {
        expect(screen.queryByText('-- Select Series --')).not.toBeInTheDocument();
        // The level dropdown should have the standard level options (Elite, Competition, etc.)
        const levelSelect = document.getElementById('tournamentLevelInput') as HTMLSelectElement;
        expect(levelSelect).toBeInTheDocument();
        // Check that Elite option exists (standard level, not a series)
        expect(screen.getByText('Elite')).toBeInTheDocument();
      });
    });

    test('clears series selection when user selects placeholder option', async () => {
      renderModalWithSeries();

      // Wait for home team name to load
      const homeTeamInput = screen.getByRole('textbox', { name: /Your Team Name/i });
      await waitFor(() => {
        expect(homeTeamInput).toHaveValue('Last Team');
      });

      // Fill required opponent name
      const opponentInput = screen.getByRole('textbox', { name: /Opponent Name/i });
      fireEvent.change(opponentInput, { target: { value: 'Test Opponent' } });

      // Switch to tournament tab and select tournament with series
      const tournamentTab = screen.getByRole('button', { name: /Tournament/i });
      await act(async () => {
        fireEvent.click(tournamentTab);
      });

      await waitFor(() => {
        expect(document.getElementById('tournamentSelect')).toBeInTheDocument();
      });
      const tournamentSelect = document.getElementById('tournamentSelect') as HTMLSelectElement;
      await act(async () => {
        fireEvent.change(tournamentSelect, { target: { value: 'tournament-series' } });
      });

      // Wait for series dropdown and select a series
      await waitFor(() => {
        expect(screen.getByText('Competition')).toBeInTheDocument();
      });
      const seriesSelect = document.getElementById('tournamentLevelInput') as HTMLSelectElement;
      await act(async () => {
        fireEvent.change(seriesSelect, { target: { value: 'series-1' } });
      });

      // Now clear the selection by selecting placeholder
      await act(async () => {
        fireEvent.change(seriesSelect, { target: { value: '' } });
      });

      // Submit the form
      const startButton = screen.getByRole('button', { name: /Create Game/i });
      await act(async () => {
        fireEvent.click(startButton);
      });

      // Verify onStart was called with null series ID
      await waitFor(() => {
        expect(mockOnStart).toHaveBeenCalledWith(
          expect.any(Array), // selectedPlayerIds
          'Last Team', // homeTeamName
          'Test Opponent', // opponentName
          expect.any(String), // gameDate
          expect.any(String), // gameLocation
          expect.any(String), // gameTime
          null, // seasonId
          'tournament-series', // tournamentId
          expect.any(Number), // numPeriods
          expect.any(Number), // periodDuration
          expect.any(String), // homeOrAway
          expect.any(Number), // demandFactor
          expect.any(String), // ageGroup
          '', // tournamentLevel - cleared
          null, // tournamentSeriesId - cleared to null
          expect.any(Boolean), // isPlayed
          null, // teamId
          expect.any(Array), // availablePlayersForGame
          expect.any(Array), // selectedPersonnelIds
          expect.any(String), // leagueId
          expect.any(String), // customLeagueName
          'soccer', // gameType
      undefined, // gender
      undefined // prefill (Phase 2 planner)
        );
      });
    });

    test('falls back to legacy level when tournament has empty series array', async () => {
      const tournamentWithEmptySeries = {
        id: 'empty-series-tournament',
        name: 'Empty Series Cup',
        series: [], // Explicitly empty array
        level: 'Kilpa', // Should use this as fallback
      };

      render(
        <ToastProvider>
          <NewGameSetupModal
            {...defaultProps}
            tournaments={[...mockTournamentsData, tournamentWithEmptySeries]}
          />
        </ToastProvider>
      );

      // Switch to tournament tab
      const tournamentTab = screen.getByRole('button', { name: /Tournament/i });
      await act(async () => {
        fireEvent.click(tournamentTab);
      });

      // Select the tournament with empty series
      await waitFor(() => {
        expect(document.getElementById('tournamentSelect')).toBeInTheDocument();
      });
      const tournamentSelect = document.getElementById('tournamentSelect') as HTMLSelectElement;
      await act(async () => {
        fireEvent.change(tournamentSelect, { target: { value: 'empty-series-tournament' } });
      });

      // Should show level dropdown (not series dropdown) since series is empty
      await waitFor(() => {
        // Series placeholder should NOT be present
        expect(screen.queryByText('-- Select Series --')).not.toBeInTheDocument();
        // Standard level options should be available
        const levelSelect = document.getElementById('tournamentLevelInput') as HTMLSelectElement;
        expect(levelSelect).toBeInTheDocument();
        expect(screen.getByText('Elite')).toBeInTheDocument();
      });
    });
  });

  describe('League Selection', () => {
    const renderModalForLeague = () => {
      return render(
        <ToastProvider>
          <NewGameSetupModal {...defaultProps} />
        </ToastProvider>
      );
    };

    it('should show league dropdown when season is selected', async () => {
      renderModalForLeague();

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByRole('textbox', { name: /Your Team Name/i })).toHaveValue('Last Team');
      });

      // Switch to season tab
      const seasonTab = screen.getByRole('button', { name: /Season/i });
      await act(async () => {
        fireEvent.click(seasonTab);
      });

      // Select a season
      await waitFor(() => {
        expect(document.getElementById('seasonSelect')).toBeInTheDocument();
      });
      const seasonSelect = document.getElementById('seasonSelect') as HTMLSelectElement;
      await act(async () => {
        fireEvent.change(seasonSelect, { target: { value: 'season1' } });
      });

      // League dropdown should now be visible
      await waitFor(() => {
        expect(document.getElementById('leagueSelect')).toBeInTheDocument();
      });
    });

    it('should prefill league from selected season', async () => {
      renderModalForLeague();

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByRole('textbox', { name: /Your Team Name/i })).toHaveValue('Last Team');
      });

      // Switch to season tab and select season with league
      const seasonTab = screen.getByRole('button', { name: /Season/i });
      await act(async () => {
        fireEvent.click(seasonTab);
      });

      await waitFor(() => {
        expect(document.getElementById('seasonSelect')).toBeInTheDocument();
      });
      const seasonSelect = document.getElementById('seasonSelect') as HTMLSelectElement;
      await act(async () => {
        fireEvent.change(seasonSelect, { target: { value: 'season1' } }); // Has leagueId: 'sm-sarja'
      });

      // League should be prefilled with season's league
      await waitFor(() => {
        const leagueSelect = document.getElementById('leagueSelect') as HTMLSelectElement;
        expect(leagueSelect).toBeInTheDocument();
        expect(leagueSelect.value).toBe('sm-sarja');
      });
    });

    it('should allow overriding season league for individual game', async () => {
      renderModalForLeague();

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByRole('textbox', { name: /Your Team Name/i })).toHaveValue('Last Team');
      });

      // Switch to season tab and select season
      const seasonTab = screen.getByRole('button', { name: /Season/i });
      await act(async () => {
        fireEvent.click(seasonTab);
      });

      await waitFor(() => {
        expect(document.getElementById('seasonSelect')).toBeInTheDocument();
      });
      const seasonSelect = document.getElementById('seasonSelect') as HTMLSelectElement;
      await act(async () => {
        fireEvent.change(seasonSelect, { target: { value: 'season1' } });
      });

      // Change league to a different value
      await waitFor(() => {
        expect(document.getElementById('leagueSelect')).toBeInTheDocument();
      });
      const leagueSelect = document.getElementById('leagueSelect') as HTMLSelectElement;
      await act(async () => {
        fireEvent.change(leagueSelect, { target: { value: 'harrastesarja' } });
      });

      // Verify the override took effect
      await waitFor(() => {
        expect(leagueSelect.value).toBe('harrastesarja');
      });
    });

    it('should show custom name input when "Muu" selected', async () => {
      renderModalForLeague();

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByRole('textbox', { name: /Your Team Name/i })).toHaveValue('Last Team');
      });

      // Switch to season tab and select season
      const seasonTab = screen.getByRole('button', { name: /Season/i });
      await act(async () => {
        fireEvent.click(seasonTab);
      });

      await waitFor(() => {
        expect(document.getElementById('seasonSelect')).toBeInTheDocument();
      });
      const seasonSelect = document.getElementById('seasonSelect') as HTMLSelectElement;
      await act(async () => {
        fireEvent.change(seasonSelect, { target: { value: 'season1' } });
      });

      // Select "Muu" (Other) option
      await waitFor(() => {
        expect(document.getElementById('leagueSelect')).toBeInTheDocument();
      });
      const leagueSelect = document.getElementById('leagueSelect') as HTMLSelectElement;
      await act(async () => {
        fireEvent.change(leagueSelect, { target: { value: 'muu' } });
      });

      // Custom name input should appear
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter league name')).toBeInTheDocument();
      });
    });

    it('should pass league selection to onStart when creating game', async () => {
      renderModalForLeague();

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByRole('textbox', { name: /Your Team Name/i })).toHaveValue('Last Team');
      });

      // Fill opponent name
      const opponentInput = screen.getByRole('textbox', { name: /Opponent Name/i });
      fireEvent.change(opponentInput, { target: { value: 'Test Opponent' } });

      // Switch to season tab and select season with league
      const seasonTab = screen.getByRole('button', { name: /Season/i });
      await act(async () => {
        fireEvent.click(seasonTab);
      });

      await waitFor(() => {
        expect(document.getElementById('seasonSelect')).toBeInTheDocument();
      });
      const seasonSelect = document.getElementById('seasonSelect') as HTMLSelectElement;
      await act(async () => {
        fireEvent.change(seasonSelect, { target: { value: 'season1' } });
      });

      // Wait for league to be set
      await waitFor(() => {
        const leagueSelect = document.getElementById('leagueSelect') as HTMLSelectElement;
        expect(leagueSelect.value).toBe('sm-sarja');
      });

      // Submit the form
      const startButton = screen.getByRole('button', { name: /Create Game/i });
      await act(async () => {
        fireEvent.click(startButton);
      });

      // Verify onStart was called with league parameters
      await waitFor(() => {
        expect(mockOnStart).toHaveBeenCalledWith(
          expect.any(Array), // selectedPlayerIds
          'Last Team', // homeTeamName
          'Test Opponent', // opponentName
          expect.any(String), // gameDate
          expect.any(String), // gameLocation
          expect.any(String), // gameTime
          'season1', // seasonId
          null, // tournamentId
          expect.any(Number), // numPeriods
          expect.any(Number), // periodDuration
          expect.any(String), // homeOrAway
          expect.any(Number), // demandFactor
          expect.any(String), // ageGroup
          expect.any(String), // tournamentLevel
          null, // tournamentSeriesId
          expect.any(Boolean), // isPlayed
          null, // teamId
          expect.any(Array), // availablePlayersForGame
          expect.any(Array), // selectedPersonnelIds
          'sm-sarja', // leagueId - THE KEY ASSERTION
          '', // customLeagueName
          'soccer', // gameType
      undefined, // gender
      undefined // prefill (Phase 2 planner)
        );
      });
    });

    it('should pass custom league name when "Muu" is selected', async () => {
      renderModalForLeague();

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByRole('textbox', { name: /Your Team Name/i })).toHaveValue('Last Team');
      });

      // Fill opponent name
      const opponentInput = screen.getByRole('textbox', { name: /Opponent Name/i });
      fireEvent.change(opponentInput, { target: { value: 'Test Opponent' } });

      // Switch to season tab and select season
      const seasonTab = screen.getByRole('button', { name: /Season/i });
      await act(async () => {
        fireEvent.click(seasonTab);
      });

      await waitFor(() => {
        expect(document.getElementById('seasonSelect')).toBeInTheDocument();
      });
      const seasonSelect = document.getElementById('seasonSelect') as HTMLSelectElement;
      await act(async () => {
        fireEvent.change(seasonSelect, { target: { value: 'season1' } });
      });

      // Select "Muu" and enter custom name
      await waitFor(() => {
        expect(document.getElementById('leagueSelect')).toBeInTheDocument();
      });
      const leagueSelect = document.getElementById('leagueSelect') as HTMLSelectElement;
      await act(async () => {
        fireEvent.change(leagueSelect, { target: { value: 'muu' } });
      });

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter league name')).toBeInTheDocument();
      });
      const customInput = screen.getByPlaceholderText('Enter league name');
      await act(async () => {
        fireEvent.change(customInput, { target: { value: 'My Custom League' } });
      });

      // Submit the form
      const startButton = screen.getByRole('button', { name: /Create Game/i });
      await act(async () => {
        fireEvent.click(startButton);
      });

      // Verify onStart was called with custom league name
      await waitFor(() => {
        expect(mockOnStart).toHaveBeenCalledWith(
          expect.any(Array), // selectedPlayerIds
          'Last Team', // homeTeamName
          'Test Opponent', // opponentName
          expect.any(String), // gameDate
          expect.any(String), // gameLocation
          expect.any(String), // gameTime
          'season1', // seasonId
          null, // tournamentId
          expect.any(Number), // numPeriods
          expect.any(Number), // periodDuration
          expect.any(String), // homeOrAway
          expect.any(Number), // demandFactor
          expect.any(String), // ageGroup
          expect.any(String), // tournamentLevel
          null, // tournamentSeriesId
          expect.any(Boolean), // isPlayed
          null, // teamId
          expect.any(Array), // availablePlayersForGame
          expect.any(Array), // selectedPersonnelIds
          'muu', // leagueId
          'My Custom League', // customLeagueName - THE KEY ASSERTION
          'soccer', // gameType
      undefined, // gender
      undefined // prefill (Phase 2 planner)
        );
      });
    });

    it('should not show league dropdown when no season is selected', async () => {
      renderModalForLeague();

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByRole('textbox', { name: /Your Team Name/i })).toHaveValue('Last Team');
      });

      // League dropdown should not be visible in "None" mode
      expect(document.getElementById('leagueSelect')).not.toBeInTheDocument();
    });

    it('should clear league when switching from season to no-selection', async () => {
      renderModalForLeague();

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByRole('textbox', { name: /Your Team Name/i })).toHaveValue('Last Team');
      });

      // Switch to season tab and select season
      const seasonTab = screen.getByRole('button', { name: /Season/i });
      await act(async () => {
        fireEvent.click(seasonTab);
      });

      await waitFor(() => {
        expect(document.getElementById('seasonSelect')).toBeInTheDocument();
      });
      const seasonSelect = document.getElementById('seasonSelect') as HTMLSelectElement;
      await act(async () => {
        fireEvent.change(seasonSelect, { target: { value: 'season1' } });
      });

      // Verify league is set
      await waitFor(() => {
        const leagueSelect = document.getElementById('leagueSelect') as HTMLSelectElement;
        expect(leagueSelect.value).toBe('sm-sarja');
      });

      // Switch back to "None" tab
      const noneTab = screen.getByRole('button', { name: /None/i });
      await act(async () => {
        fireEvent.click(noneTab);
      });

      // League dropdown should no longer be visible
      await waitFor(() => {
        expect(document.getElementById('leagueSelect')).not.toBeInTheDocument();
      });
    });

    it('should show error when "Muu" selected but custom league name is empty', async () => {
      renderModalForLeague();

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByRole('textbox', { name: /Your Team Name/i })).toHaveValue('Last Team');
      });

      // Fill opponent name
      const opponentInput = screen.getByRole('textbox', { name: /Opponent Name/i });
      fireEvent.change(opponentInput, { target: { value: 'Test Opponent' } });

      // Switch to season tab and select season
      const seasonTab = screen.getByRole('button', { name: /Season/i });
      await act(async () => {
        fireEvent.click(seasonTab);
      });

      await waitFor(() => {
        expect(document.getElementById('seasonSelect')).toBeInTheDocument();
      });

      const seasonSelect = document.getElementById('seasonSelect') as HTMLSelectElement;
      await act(async () => {
        fireEvent.change(seasonSelect, { target: { value: 'season1' } });
      });

      // Select "Muu" (custom league) but leave custom name empty
      await waitFor(() => {
        expect(document.getElementById('leagueSelect')).toBeInTheDocument();
      });

      const leagueSelect = document.getElementById('leagueSelect') as HTMLSelectElement;
      await act(async () => {
        fireEvent.change(leagueSelect, { target: { value: 'muu' } });
      });

      // Submit without entering custom league name
      const startButton = screen.getByRole('button', { name: /Create Game/i });
      await act(async () => {
        fireEvent.click(startButton);
      });

      // Verify onStart was NOT called due to validation
      expect(mockOnStart).not.toHaveBeenCalled();
    });
  });

  /**
   * Tests for game type (Soccer/Futsal) prefill and toggle functionality
   * @integration
   */
  describe('Game Type Selection', () => {
    it('should default to Soccer when no season/tournament is selected', async () => {
      render(
        <ToastProvider>
          <NewGameSetupModal {...defaultProps} />
        </ToastProvider>
      );

      await waitFor(() => {
        expect(screen.getByRole('textbox', { name: /Your Team Name/i })).toBeInTheDocument();
      });

      // Find the Soccer button by text and verify it's selected (has active styling)
      const soccerButton = screen.getByRole('button', { name: /Soccer/i });
      expect(soccerButton).toHaveClass('bg-indigo-600');
    });

    it('should prefill game type from selected season', async () => {
      render(
        <ToastProvider>
          <NewGameSetupModal {...defaultProps} />
        </ToastProvider>
      );

      await waitFor(() => {
        expect(screen.getByRole('textbox', { name: /Your Team Name/i })).toBeInTheDocument();
      });

      // Switch to season tab
      const seasonTab = screen.getByRole('button', { name: /Season/i });
      await act(async () => {
        fireEvent.click(seasonTab);
      });

      // Select season2 which has gameType: 'futsal'
      await waitFor(() => {
        expect(document.getElementById('seasonSelect')).toBeInTheDocument();
      });

      const seasonSelect = document.getElementById('seasonSelect') as HTMLSelectElement;
      await act(async () => {
        fireEvent.change(seasonSelect, { target: { value: 'season2' } });
      });

      // Verify Futsal is now selected
      await waitFor(() => {
        const futsalButton = screen.getByRole('button', { name: /Futsal/i });
        expect(futsalButton).toHaveClass('bg-indigo-600');
      });
    });

    it('should prefill game type from selected tournament', async () => {
      render(
        <ToastProvider>
          <NewGameSetupModal {...defaultProps} />
        </ToastProvider>
      );

      await waitFor(() => {
        expect(screen.getByRole('textbox', { name: /Your Team Name/i })).toBeInTheDocument();
      });

      // Switch to tournament tab
      const tournamentTab = screen.getByRole('button', { name: /Tournament/i });
      await act(async () => {
        fireEvent.click(tournamentTab);
      });

      // Select tournament2 which has gameType: 'futsal'
      await waitFor(() => {
        expect(document.getElementById('tournamentSelect')).toBeInTheDocument();
      });

      const tournamentSelect = document.getElementById('tournamentSelect') as HTMLSelectElement;
      await act(async () => {
        fireEvent.change(tournamentSelect, { target: { value: 'tournament2' } });
      });

      // Verify Futsal is now selected
      await waitFor(() => {
        const futsalButton = screen.getByRole('button', { name: /Futsal/i });
        expect(futsalButton).toHaveClass('bg-indigo-600');
      });
    });

    it('should allow manual toggle from Soccer to Futsal', async () => {
      render(
        <ToastProvider>
          <NewGameSetupModal {...defaultProps} />
        </ToastProvider>
      );

      await waitFor(() => {
        expect(screen.getByRole('textbox', { name: /Your Team Name/i })).toBeInTheDocument();
      });

      // Initially Soccer should be selected
      const soccerButton = screen.getByRole('button', { name: /Soccer/i });
      expect(soccerButton).toHaveClass('bg-indigo-600');

      // Click Futsal button
      const futsalButton = screen.getByRole('button', { name: /Futsal/i });
      await act(async () => {
        fireEvent.click(futsalButton);
      });

      // Verify Futsal is now selected and Soccer is not
      await waitFor(() => {
        expect(futsalButton).toHaveClass('bg-indigo-600');
        expect(soccerButton).not.toHaveClass('bg-indigo-600');
      });
    });

    it('should pass gameType to onStart callback', async () => {
      render(
        <ToastProvider>
          <NewGameSetupModal {...defaultProps} />
        </ToastProvider>
      );

      await waitFor(() => {
        expect(screen.getByRole('textbox', { name: /Your Team Name/i })).toBeInTheDocument();
      });

      // Fill required fields
      const opponentInput = screen.getByRole('textbox', { name: /Opponent Name/i });
      fireEvent.change(opponentInput, { target: { value: 'Test Opponent' } });

      // Toggle to Futsal
      const futsalButton = screen.getByRole('button', { name: /Futsal/i });
      await act(async () => {
        fireEvent.click(futsalButton);
      });

      // Submit the form
      const startButton = screen.getByRole('button', { name: /Create Game/i });
      await act(async () => {
        fireEvent.click(startButton);
      });

      // Verify onStart was called with gameType: 'futsal'
      // Positional args: gameType is 3rd from the end (gender then optional prefill follow it).
      await waitFor(() => {
        expect(mockOnStart).toHaveBeenCalled();
        const args = mockOnStart.mock.calls[0];
        const gameTypeArg = args[args.length - 3];
        expect(gameTypeArg).toBe('futsal');
      });
    });

    it('should default to Soccer when season has no gameType set', async () => {
      render(
        <ToastProvider>
          <NewGameSetupModal {...defaultProps} />
        </ToastProvider>
      );

      await waitFor(() => {
        expect(screen.getByRole('textbox', { name: /Your Team Name/i })).toBeInTheDocument();
      });

      // Switch to season tab
      const seasonTab = screen.getByRole('button', { name: /Season/i });
      await act(async () => {
        fireEvent.click(seasonTab);
      });

      // Select season3 which has no gameType
      await waitFor(() => {
        expect(document.getElementById('seasonSelect')).toBeInTheDocument();
      });

      const seasonSelect = document.getElementById('seasonSelect') as HTMLSelectElement;
      await act(async () => {
        fireEvent.change(seasonSelect, { target: { value: 'season3' } });
      });

      // Verify Soccer remains selected (default)
      await waitFor(() => {
        const soccerButton = screen.getByRole('button', { name: /Soccer/i });
        expect(soccerButton).toHaveClass('bg-indigo-600');
      });
    });
  });

  describe('Repeat last game', () => {
    const savedGames: any = {
      g1: {
        opponentName: 'Old Foe', gameLocation: 'Old Field', periodDurationMinutes: 25,
        numberOfPeriods: 1, homeOrAway: 'away', gameType: 'futsal', demandFactor: 2,
        selectedPlayerIds: ['player1'], createdAt: '2024-05-01T10:00:00.000Z',
      },
      g2: {
        opponentName: 'Recent Rival', gameLocation: 'Recent Park', periodDurationMinutes: 30,
        numberOfPeriods: 2, homeOrAway: 'home', gameType: 'soccer', demandFactor: 3,
        selectedPlayerIds: ['player1', 'player2'], createdAt: '2024-06-01T10:00:00.000Z',
      },
    };

    test('pre-fills fields from the most recent saved game', async () => {
      const onDemandFactorChange = jest.fn();
      render(
        <ToastProvider>
          <NewGameSetupModal {...defaultProps} savedGames={savedGames} onDemandFactorChange={onDemandFactorChange} />
        </ToastProvider>
      );
      await waitFor(() => expect(getLastHomeTeamName).toHaveBeenCalled());

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Repeat last game/i }));
      });

      // g2 is the most recent (later createdAt), so its values win.
      expect(screen.getByRole('textbox', { name: /Opponent Name/i })).toHaveValue('Recent Rival');
      expect(onDemandFactorChange).toHaveBeenCalledWith(3);
    });

    test('button is hidden when there are no saved games', async () => {
      renderModal();
      await waitFor(() => expect(getLastHomeTeamName).toHaveBeenCalled());
      expect(screen.queryByRole('button', { name: /Repeat last game/i })).not.toBeInTheDocument();
    });
  });

  describe('prefill from plan (Phase 2)', () => {
    const planFixture = {
      id: 'plan1',
      name: 'My Plan',
      version: 1,
      createdAt: 'x',
      updatedAt: 'x',
      players: [
        { id: 'player1', name: 'John Doe' },
        { id: 'player2', name: 'Jane Smith' },
      ],
      games: [
        {
          id: 'pg1',
          label: 'Game 1',
          formationId: '5v5-2-2',
          numberOfPeriods: 2 as const,
          periodMinutes: 12,
          included: true,
          startingSlots: [
            { slotId: 'gk', playerId: 'player1' },
            { slotId: 's0', playerId: 'player2' },
          ],
          subs: [],
        },
      ],
    };

    test('threads the planned lineup to onStart when a plan game is chosen', async () => {
      (getPlans as jest.Mock).mockResolvedValueOnce({ plan1: planFixture });
      renderModal();

      const planSelect = await screen.findByLabelText('Prefill from plan (optional)');
      await act(async () => {
        fireEvent.change(planSelect, { target: { value: 'plan1' } });
      });
      const gameSelect = await screen.findByLabelText('Plan game');
      await act(async () => {
        fireEvent.change(gameSelect, { target: { value: 'pg1' } });
      });

      const opponentInput = screen.getByRole('textbox', { name: /Opponent Name/i });
      fireEvent.change(opponentInput, { target: { value: 'Opp' } });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Create Game/i }));
      });

      await waitFor(() => expect(mockOnStart).toHaveBeenCalled());
      const call = mockOnStart.mock.calls[0];
      const prefillArg = call[call.length - 1];
      expect(prefillArg).toBeDefined();
      expect(prefillArg.playersOnField).toHaveLength(2); // GK + one field player placed
      const gk = prefillArg.playersOnField.find((p: { id: string }) => p.id === 'player1');
      expect(gk.isGoalie).toBe(true);
    });

    test('"Repeat last game" clears an active plan prefill (no stale plan attaches)', async () => {
      // Both affordances are clickable at once; repeating the last game states
      // a new intent, so the plan's lineup/subs/link must not ride along.
      (getPlans as jest.Mock).mockResolvedValueOnce({ plan1: planFixture });
      const savedGames = {
        g1: {
          opponentName: 'Recent Rival', gameLocation: 'Recent Park', periodDurationMinutes: 30,
          numberOfPeriods: 2, homeOrAway: 'home', gameType: 'soccer', demandFactor: 3,
          selectedPlayerIds: ['player1'], createdAt: '2024-06-01T10:00:00.000Z',
        },
      } as never;
      render(
        <ToastProvider>
          <NewGameSetupModal {...defaultProps} savedGames={savedGames} />
        </ToastProvider>
      );

      const planSelect = await screen.findByLabelText('Prefill from plan (optional)');
      await act(async () => {
        fireEvent.change(planSelect, { target: { value: 'plan1' } });
      });
      const gameSelect = await screen.findByLabelText('Plan game');
      await act(async () => {
        fireEvent.change(gameSelect, { target: { value: 'pg1' } });
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Repeat last game/i }));
      });
      // The prefill picker resets to "no plan".
      expect((screen.getByLabelText('Prefill from plan (optional)') as HTMLSelectElement).value).toBe('');

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Create Game/i }));
      });
      await waitFor(() => expect(mockOnStart).toHaveBeenCalled());
      const call = mockOnStart.mock.calls[0];
      expect(call[call.length - 1]).toBeUndefined(); // no prefill payload
    });

    test('picker stays hidden when there are no plans', async () => {
      renderModal();
      await waitFor(() => expect(getLastHomeTeamName).toHaveBeenCalled());
      expect(screen.queryByLabelText('Prefill from plan (optional)')).not.toBeInTheDocument();
    });

    test('selecting a Season after a plan prefill keeps the PLAN\'s match format (sub times depend on it)', async () => {
      // The plan is 2x12; the season would default the form to 2x15. Planned
      // sub times are absolute seconds, so the season's format must not
      // silently overwrite the plan's - the half-time sub would fire mid-half.
      (getPlans as jest.Mock).mockResolvedValueOnce({ plan1: planFixture });
      renderModal();

      const planSelect = await screen.findByLabelText('Prefill from plan (optional)');
      await act(async () => {
        fireEvent.change(planSelect, { target: { value: 'plan1' } });
      });
      const gameSelect = await screen.findByLabelText('Plan game');
      await act(async () => {
        fireEvent.change(gameSelect, { target: { value: 'pg1' } });
      });

      // The season picker sits behind the Season tab.
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Season/i }));
      });
      await waitFor(() => expect(document.getElementById('seasonSelect')).toBeInTheDocument());
      const seasonSelect = document.getElementById('seasonSelect') as HTMLSelectElement;
      await act(async () => {
        fireEvent.change(seasonSelect, { target: { value: 'season1' } });
      });

      const opponentInput = screen.getByRole('textbox', { name: /Opponent Name/i });
      fireEvent.change(opponentInput, { target: { value: 'Opp' } });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Create Game/i }));
      });

      await waitFor(() => expect(mockOnStart).toHaveBeenCalled());
      const call = mockOnStart.mock.calls[0];
      expect(call[6]).toBe('season1');           // the season binding itself is kept
      expect(call[8]).toBe(2);                   // numPeriods: the plan's...
      expect(call[9]).toBe(12);                  // ...and the plan's 12-minute periods
      expect(call[call.length - 1]).toBeDefined(); // prefill still rides along
    });

    test('switching Team after a plan prefill clears the prefill (no cross-team lineup)', async () => {
      // The planned lineup belongs to the previous squad; carrying it into the
      // new team's game would silently field the wrong players.
      (getPlans as jest.Mock).mockResolvedValueOnce({ plan1: planFixture });
      renderModal();

      const planSelect = await screen.findByLabelText('Prefill from plan (optional)');
      await act(async () => {
        fireEvent.change(planSelect, { target: { value: 'plan1' } });
      });
      const gameSelect = await screen.findByLabelText('Plan game');
      await act(async () => {
        fireEvent.change(gameSelect, { target: { value: 'pg1' } });
      });

      // Now switch the team - the prefill picker resets to "no plan".
      const teamSelect = document.getElementById('teamSelectTop') as HTMLSelectElement;
      await act(async () => {
        fireEvent.change(teamSelect, { target: { value: 'team2' } });
      });
      await waitFor(() => {
        expect((screen.getByLabelText('Prefill from plan (optional)') as HTMLSelectElement).value).toBe('');
      });

      const opponentInput = screen.getByRole('textbox', { name: /Opponent Name/i });
      fireEvent.change(opponentInput, { target: { value: 'Opp' } });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Create Game/i }));
      });

      await waitFor(() => expect(mockOnStart).toHaveBeenCalled());
      const call = mockOnStart.mock.calls[0];
      expect(call[call.length - 1]).toBeUndefined(); // no prefill payload rode along
    });
  });
});