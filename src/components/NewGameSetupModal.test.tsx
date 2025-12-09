 
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import NewGameSetupModal from './NewGameSetupModal';
import { getLastHomeTeamName, saveLastHomeTeamName } from '@/utils/appSettings';
import { ToastProvider } from '@/contexts/ToastProvider';

// Mock the utility functions
jest.mock('@/utils/appSettings', () => ({
  getLastHomeTeamName: jest.fn(),
  saveLastHomeTeamName: jest.fn(),
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
  'newGameSetupModal.confirmButton': 'Confirm & Start Game',
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
    { id: 'season1', name: 'Spring 2024', leagueId: 'sm-sarja', customLeagueName: '' },
    { id: 'season2', name: 'Summer 2024', leagueId: 'muu', customLeagueName: 'Custom Summer League' },
    { id: 'season3', name: 'Fall 2024' }, // No league set
  ];
  const mockTournamentsData = [{ id: 'tournament1', name: 'City Cup' }, { id: 'tournament2', name: 'Regional Tournament' }];
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
    const startButton = screen.getByRole('button', { name: /Confirm & Start Game/i });
    
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
      '' // customLeagueName
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
    const startButton = screen.getByRole('button', { name: /Confirm & Start Game/i });
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
        '' // customLeagueName
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
    const startButton = screen.getByRole('button', { name: /Confirm & Start Game/i });

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

  test('calls onCancel when cancel button is clicked', async () => {
    renderModal();
    // Use translation key for button text
    const cancelButton = screen.getByText(translations['common.cancel']);
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
      const startButton = screen.getByRole('button', { name: /Confirm & Start Game/i });
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
          expect.any(String) // customLeagueName
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
      const startButton = screen.getByRole('button', { name: /Confirm & Start Game/i });
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
          expect.any(String) // customLeagueName
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
      const startButton = screen.getByRole('button', { name: /Confirm & Start Game/i });
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
          '' // customLeagueName
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
      const startButton = screen.getByRole('button', { name: /Confirm & Start Game/i });
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
          'My Custom League' // customLeagueName - THE KEY ASSERTION
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
  });
});