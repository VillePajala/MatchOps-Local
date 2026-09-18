 
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import NewGameSetupModal from './NewGameSetupModal';
import { getLastHomeTeamName, saveLastHomeTeamName } from '@/utils/appSettings';
import { getPlans } from '@/utils/playtimePlanner/storage';
import { ToastProvider } from '@/contexts/ToastProvider';
import { FIELD_SIZES } from '@/config/formationPresets';
import { setOnboardingUserId } from '@/components/setupWizardActive';

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
  'common.selectSeries': '-- Select level --',
  'newGameSetupModal.seriesLabel': 'Level',
  // The official Palloliitto competition, distinct from the league the coach
  // created and named.
  'seasonDetailsModal.leagueLabel': 'Official league',
  'seasonDetailsModal.selectLeague': '-- Select official league --',
  'seasonDetailsModal.customLeaguePlaceholder': 'Enter the official league name',
  'newGameSetupModal.leagueLabel': 'Official league',
  'newGameSetupModal.selectLeague': '-- Select official league --',
  'newGameSetupModal.customLeaguePlaceholder': 'Enter the official league name',
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
    { id: 'season1', name: 'Spring 2024', leagueId: 'sm-sarja', customLeagueName: '', gameType: 'soccer' as const, opponents: ['IPS', 'KuPS'] },
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
    const seasonTab = screen.getByRole('button', { name: /League/i });
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
      expect.any(String), '', '', undefined, undefined, undefined, '', null, null, 2, 15, 'home', 1, '', '', null, true, null,
      expect.arrayContaining([
        expect.objectContaining({ id: 'player1', name: 'John Doe' }),
        expect.objectContaining({ id: 'player2', name: 'Jane Smith' })
      ]),
      expect.arrayContaining([]),
      '', // leagueId
      '', // customLeagueName
      'soccer', // gameType
      undefined, // gender
      undefined, // prefill (Phase 2 planner)
      false, // isFriendly
      '3v3-1-1', // formationPresetId (2-player fixture -> 3v3 size default, owner round 4)
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
    const toggle = screen.getByRole('button', { name: translations['newGameSetupModal.unplayedToggle'] });
    fireEvent.click(toggle);
    const startButton = screen.getByRole('button', { name: /Create Game/i });
    await act(async () => {
        fireEvent.click(startButton);
    });
    await waitFor(() => {
      expect(mockOnStart).toHaveBeenCalledWith(
        expect.arrayContaining(['player1', 'player2']), 'Last Team', 'Opponent Team',
        expect.any(String), '', '', undefined, undefined, undefined, '', null, null, 2, 15, 'home', 1, '', '', null, false, null,
        expect.arrayContaining([
          expect.objectContaining({ id: 'player1', name: 'John Doe' }),
          expect.objectContaining({ id: 'player2', name: 'Jane Smith' })
        ]),
        expect.arrayContaining([]),
        '', // leagueId
        '', // customLeagueName
        'soccer', // gameType
      undefined, // gender
      undefined, // prefill (Phase 2 planner)
      false, // isFriendly
        '3v3-1-1', // formationPresetId (2-player fixture -> 3v3 size default, owner round 4)
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
          expect.any(String), // fieldNumber
          undefined,          // locationLat
          undefined,          // locationLng
          undefined,          // locationAddress (049)
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
      undefined, // prefill (Phase 2 planner)
      false, // isFriendly
          '3v3-1-1', // formationPresetId (2-player fixture -> 3v3 size default, owner round 4)
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
        expect(screen.getByText('-- Select level --')).toBeInTheDocument();
      });

      // Now switch to tournament WITHOUT series
      await act(async () => {
        fireEvent.change(tournamentSelect, { target: { value: 'tournament1' } });
      });

      // Series dropdown should be replaced with level dropdown
      // Check that the level dropdown (tournamentLevelInput) now shows level options instead of series
      await waitFor(() => {
        expect(screen.queryByText('-- Select level --')).not.toBeInTheDocument();
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
          expect.any(String), // fieldNumber
          undefined,          // locationLat
          undefined,          // locationLng
          undefined,          // locationAddress (049)
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
      undefined, // prefill (Phase 2 planner)
      false, // isFriendly
          '3v3-1-1', // formationPresetId (2-player fixture -> 3v3 size default, owner round 4)
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
        expect(screen.queryByText('-- Select level --')).not.toBeInTheDocument();
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
      const seasonTab = screen.getByRole('button', { name: /League/i });
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
      const seasonTab = screen.getByRole('button', { name: /League/i });
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
      const seasonTab = screen.getByRole('button', { name: /League/i });
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
      const seasonTab = screen.getByRole('button', { name: /League/i });
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
        expect(screen.getByPlaceholderText('Enter the official league name')).toBeInTheDocument();
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
      const seasonTab = screen.getByRole('button', { name: /League/i });
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
          expect.any(String), // fieldNumber
          undefined,          // locationLat
          undefined,          // locationLng
          undefined,          // locationAddress (049)
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
      undefined, // prefill (Phase 2 planner)
      false, // isFriendly
          '3v3-1-1', // formationPresetId (2-player fixture -> 3v3 size default, owner round 4)
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
      const seasonTab = screen.getByRole('button', { name: /League/i });
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
        expect(screen.getByPlaceholderText('Enter the official league name')).toBeInTheDocument();
      });
      const customInput = screen.getByPlaceholderText('Enter the official league name');
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
          expect.any(String), // fieldNumber
          undefined,          // locationLat
          undefined,          // locationLng
          undefined,          // locationAddress (049)
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
      undefined, // prefill (Phase 2 planner)
      false, // isFriendly
          '3v3-1-1', // formationPresetId (2-player fixture -> 3v3 size default, owner round 4)
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
      const seasonTab = screen.getByRole('button', { name: /League/i });
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
      const seasonTab = screen.getByRole('button', { name: /League/i });
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
      const seasonTab = screen.getByRole('button', { name: /League/i });
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

    it("the wizard's stored Pelimuoto drives the DEFAULT formation size (review #742)", async () => {
      // 2 players -> the count guess says 3v3, but the coach answered 8v8.
      setOnboardingUserId('user-1');
      localStorage.setItem('matchops_setup_format_user-1', '8v8');
      try {
        render(
          <ToastProvider>
            <NewGameSetupModal {...defaultProps} />
          </ToastProvider>
        );
        await waitFor(() => {
          expect(screen.getByRole('textbox', { name: /Your Team Name/i })).toBeInTheDocument();
        });
        expect((document.querySelector('#formationSelect') as HTMLSelectElement).value).toBe('8v8-2-1-2-1-1');
      } finally {
        setOnboardingUserId(undefined);
        localStorage.removeItem('matchops_setup_format_user-1');
      }
    });

    it('formation select offers ALL field sizes as groups (owner round 6b)', async () => {
      render(
        <ToastProvider>
          <NewGameSetupModal {...defaultProps} />
        </ToastProvider>
      );
      await waitFor(() => {
        expect(screen.getByRole('textbox', { name: /Your Team Name/i })).toBeInTheDocument();
      });
      const groups = document.querySelectorAll('#formationSelect optgroup');
      // "ALL" means the exported list, not a copy of it: restating the sizes
      // here made adding 4v4 fail in a modal test rather than saying anything
      // about the modal.
      expect(Array.from(groups).map((g) => g.getAttribute('label'))).toEqual([...FIELD_SIZES]);
    });

    it('a non-recommended-size preset SURVIVES to onStart (squad size never restricts)', async () => {
      render(
        <ToastProvider>
          <NewGameSetupModal {...defaultProps} />
        </ToastProvider>
      );
      await waitFor(() => {
        expect(screen.getByRole('textbox', { name: /Your Team Name/i })).toBeInTheDocument();
      });
      fireEvent.change(screen.getByRole('textbox', { name: /Opponent Name/i }), {
        target: { value: 'Test Opponent' },
      });
      // 2 players selected -> 3v3 recommended, but the coach picks an 8v8 shape.
      fireEvent.change(document.querySelector('#formationSelect')!, {
        target: { value: '8v8-2-3-2' },
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Create Game/i }));
      });
      await waitFor(() => {
        expect(mockOnStart).toHaveBeenCalled();
        const args = mockOnStart.mock.calls[0];
        expect(args[args.length - 1]).toBe('8v8-2-3-2');
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
      // Positional args: gameType is 5th from the end (gender, prefill,
      // isFriendly, formationPresetId follow it).
      await waitFor(() => {
        expect(mockOnStart).toHaveBeenCalled();
        const args = mockOnStart.mock.calls[0];
        const gameTypeArg = args[args.length - 5];
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
      const seasonTab = screen.getByRole('button', { name: /League/i });
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
      const prefillArg = call[call.length - 3]; // isFriendly + formationPresetId follow it
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
      expect(call[call.length - 3]).toBeUndefined(); // no prefill payload
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
        fireEvent.click(screen.getByRole('button', { name: /League/i }));
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
      // Positional onStart args: 0 playerIds, 1 homeTeam, 2 opponent, 3 date,
      // 4 venue, 5 pitch, 6 lat, 7 lng, 8 time, 9 seasonId, 10 tournamentId,
      // 12 numPeriods, 13 periodDuration. Everything past the venue shifted
      // when the pitch (047), the coordinates (048) and the pinned address
      // (049) became arguments.
      expect(call[10]).toBe('season1');          // the season binding itself is kept
      expect(call[12]).toBe(2);                  // numPeriods: the plan's...
      expect(call[13]).toBe(12);                 // ...and the plan's 12-minute periods
      expect(call[call.length - 3]).toBeDefined(); // prefill still rides along
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
      expect(call[call.length - 3]).toBeUndefined(); // no prefill payload rode along
    });
  });

  /**
   * @critical - the wiring between the competition's opponent list and the one
   * free-text field left on this form. The list existing is worthless if the
   * form never offers it, and the inline add is what stops the list staying
   * empty forever because adding a team meant leaving the form.
   */
  describe('opponents from the competition', () => {
    const selectSeason = async (id: string) => {
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /League/i }));
      });
      await waitFor(() => expect(document.getElementById('seasonSelect')).toBeInTheDocument());
      await act(async () => {
        fireEvent.change(document.getElementById('seasonSelect') as HTMLSelectElement, {
          target: { value: id },
        });
      });
    };

    it('offers the league’s teams once a league is chosen, and fills one on tap', async () => {
      render(
        <ToastProvider>
          <NewGameSetupModal {...defaultProps} />
        </ToastProvider>,
      );
      // Nothing to offer before a competition is chosen.
      expect(screen.queryByTestId('opponent-options')).not.toBeInTheDocument();

      await selectSeason('season1');
      const options = await screen.findByTestId('opponent-options');
      expect(options).toHaveTextContent('IPS');
      expect(options).toHaveTextContent('KuPS');

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'KuPS' }));
      });
      expect(screen.getByRole('textbox', { name: /Opponent Name/i })).toHaveValue('KuPS');
    });



    /**
     * @critical - owner-reported, and the reason competition-scoped
     * suggestions were not enough: the opponent field is the SECOND thing on
     * this form and the competition is picked a whole card later. Scoping
     * suggestions to the chosen competition meant they could never appear
     * until after the coach had already typed the name.
     */
    it('suggests from every team the coach knows, before any competition is picked', async () => {
      render(
        <ToastProvider>
          <NewGameSetupModal {...defaultProps} knownOpponents={['HJK', 'KuPS']} />
        </ToastProvider>,
      );
      // No competition selected, and the chips are already useful.
      const options = await screen.findByTestId('opponent-options');
      expect(options).toHaveTextContent('HJK');

      await act(async () => {
        fireEvent.change(screen.getByRole('textbox', { name: /Opponent Name/i }), {
          target: { value: 'hj' },
        });
      });
      expect(screen.getByTestId('opponent-options')).toHaveTextContent('HJK');
      expect(screen.getByTestId('opponent-options')).not.toHaveTextContent('KuPS');
    });

    it('puts the chosen competition’s own teams first', async () => {
      render(
        <ToastProvider>
          <NewGameSetupModal {...defaultProps} knownOpponents={['HJK']} />
        </ToastProvider>,
      );
      await selectSeason('season1');
      const chips = screen.getByTestId('opponent-options').textContent ?? '';
      // season1 lists IPS and KuPS; HJK is merely known from elsewhere.
      expect(chips.indexOf('IPS')).toBeLessThan(chips.indexOf('HJK'));
    });

    /**
     * @critical - the owner typed "Ip" expecting the list to narrow to IPS and
     * nothing happened. Static chips are not autocomplete. The datalist that
     * used to do this was removed (it re-roles the input to combobox), so the
     * filtering has to live in the chips.
     */
    it('narrows the chips as the coach types', async () => {
      render(
        <ToastProvider>
          <NewGameSetupModal {...defaultProps} />
        </ToastProvider>,
      );
      await selectSeason('season1');
      const opponentInput = screen.getByRole('textbox', { name: /Opponent Name/i });

      await act(async () => {
        fireEvent.change(opponentInput, { target: { value: 'Ip' } });
      });
      const options = screen.getByTestId('opponent-options');
      expect(options).toHaveTextContent('IPS');
      expect(options).not.toHaveTextContent('KuPS');

      // Case is ignored, like everywhere else. Partial, because typing a name
      // in FULL is an exact match and deliberately restores the whole list -
      // see the test below.
      await act(async () => {
        fireEvent.change(opponentInput, { target: { value: 'kup' } });
      });
      expect(screen.getByTestId('opponent-options')).toHaveTextContent('KuPS');
      expect(screen.getByTestId('opponent-options')).not.toHaveTextContent('IPS');
    });

    /**
     * Having picked one team must not strand the coach with a single chip when
     * they meant to pick a different one.
     */
    /**
     * REVERSED DELIBERATELY 2026-09-16. This used to assert that choosing a
     * team exactly brought the WHOLE list back, so a coach who tapped the
     * wrong chip was not stranded with only that chip. That was reasonable
     * while the list was uncapped, and became a visibly broken search once it
     * was capped at six: typing "Ips" against 69 known teams showed the first
     * six of the 69, none of them IPS. Reported from a real phone.
     *
     * Text in the field now always filters. Picking a different team costs an
     * edit to the field, which re-opens the list.
     */
    it('keeps the list filtered to the team that was chosen', async () => {
      render(
        <ToastProvider>
          <NewGameSetupModal {...defaultProps} />
        </ToastProvider>,
      );
      await selectSeason('season1');
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'IPS' }));
      });
      const options = screen.getByTestId('opponent-options');
      expect(options).toHaveTextContent('IPS');
      expect(options).not.toHaveTextContent('KuPS');
    });

    it('offers no chips for a name that matches none, leaving the add instead', async () => {
      render(
        <ToastProvider>
          <NewGameSetupModal {...defaultProps} onAddOpponentToSeason={jest.fn()} />
        </ToastProvider>,
      );
      await selectSeason('season1');
      await act(async () => {
        fireEvent.change(screen.getByRole('textbox', { name: /Opponent Name/i }), {
          target: { value: 'HJK' },
        });
      });
      expect(screen.queryByTestId('opponent-options')).not.toBeInTheDocument();
      expect(screen.getByTestId('opponent-add-to-season')).toBeInTheDocument();
    });

    it('offers to remember a newly typed team, and does not for one already listed', async () => {
      const onAddOpponentToSeason = jest.fn().mockResolvedValue(undefined);
      render(
        <ToastProvider>
          <NewGameSetupModal {...defaultProps} onAddOpponentToSeason={onAddOpponentToSeason} />
        </ToastProvider>,
      );
      await selectSeason('season1');

      const opponentInput = screen.getByRole('textbox', { name: /Opponent Name/i });
      await act(async () => {
        fireEvent.change(opponentInput, { target: { value: 'HJK' } });
      });
      await act(async () => {
        fireEvent.click(await screen.findByTestId('opponent-add-to-season'));
      });
      expect(onAddOpponentToSeason).toHaveBeenCalledWith('season1', 'HJK');

      // A spelling of a team already on the list is not "new".
      await act(async () => {
        fireEvent.change(opponentInput, { target: { value: 'ips' } });
      });
      expect(screen.queryByTestId('opponent-add-to-season')).not.toBeInTheDocument();
    });

    /**
     * The offer is wired to a callback, so a host that does not supply one
     * must not show a button that would do nothing.
     */
    it('hides the offer entirely when the host cannot persist it', async () => {
      render(
        <ToastProvider>
          <NewGameSetupModal {...defaultProps} />
        </ToastProvider>,
      );
      await selectSeason('season1');
      await act(async () => {
        fireEvent.change(screen.getByRole('textbox', { name: /Opponent Name/i }), {
          target: { value: 'HJK' },
        });
      });
      expect(screen.queryByTestId('opponent-add-to-season')).not.toBeInTheDocument();
    });
  });

  /**
   * Entry-time spelling. Prod carries 13 opponents with more than one
   * spelling, one of them seven, every variant differing only in case,
   * spacing or slash - so the field, not the cleanup tool, is where this has
   * to be stopped.
   * @critical
   */
  describe('adopts the spelling already in use', () => {
    const selectSeason = async (id: string) => {
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /League/i }));
      });
      await waitFor(() => expect(document.getElementById('seasonSelect')).toBeInTheDocument());
      await act(async () => {
        fireEvent.change(document.getElementById('seasonSelect') as HTMLSelectElement, {
          target: { value: id },
        });
      });
    };

    const startWithOpponent = async (typed: string, extraProps = {}) => {
      render(
        <ToastProvider>
          <NewGameSetupModal {...defaultProps} {...extraProps} />
        </ToastProvider>,
      );
      await selectSeason('season1'); // curated list: ['IPS', 'KuPS']
      const opponentInput = screen.getByRole('textbox', { name: /Opponent Name/i });
      await act(async () => {
        fireEvent.change(opponentInput, { target: { value: typed } });
      });
      await act(async () => {
        fireEvent.blur(opponentInput);
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Create Game/i }));
      });
      return opponentInput;
    };

    it('saves the existing spelling when a variant is typed', async () => {
      const opponentInput = await startWithOpponent('ips');
      // Visible to the coach, not only corrected on the way out.
      await waitFor(() => expect(opponentInput).toHaveValue('IPS'));
      await waitFor(() => expect(mockOnStart).toHaveBeenCalled());
      expect(mockOnStart.mock.calls[0][2]).toBe('IPS');
    });

    /**
     * The boundary, asserted so nobody later "improves" this into fuzzy
     * matching: separators and case collapse, but a space introduced INSIDE a
     * word does not. "ku ps" is a different string from "kups" and the module
     * requires an exact match after normalising - which is what guarantees it
     * can never merge two real squads.
     */
    it('does not reach for a name that only looks similar', async () => {
      await startWithOpponent('ku ps'); // stored spelling is "KuPS"
      await waitFor(() => expect(mockOnStart).toHaveBeenCalled());
      expect(mockOnStart.mock.calls[0][2]).toBe('ku ps');
    });

    /** Never fuzzy: a new name must survive exactly as typed. */
    it('leaves a genuinely new name alone', async () => {
      await startWithOpponent('HJK');
      await waitFor(() => expect(mockOnStart).toHaveBeenCalled());
      expect(mockOnStart.mock.calls[0][2]).toBe('HJK');
    });

    /**
     * The sibling-team trap the normaliser exists to avoid: these differ by
     * one word out of two and are two real squads.
     */
    it('does not adopt a sibling team as the same opponent', async () => {
      await startWithOpponent('IPS/Punainen', {
        knownOpponents: ['IPS/Sininen'],
      });
      await waitFor(() => expect(mockOnStart).toHaveBeenCalled());
      expect(mockOnStart.mock.calls[0][2]).toBe('IPS/Punainen');
    });

    /**
     * A prefilled name submitted without the field ever being focused never
     * fires blur, so the submit path has to canonicalise too.
     */
    it('canonicalises a name that was never focused', async () => {
      render(
        <ToastProvider>
          <NewGameSetupModal {...defaultProps} knownOpponents={['LauTP / Sininen']} />
        </ToastProvider>,
      );
      const opponentInput = screen.getByRole('textbox', { name: /Opponent Name/i });
      await act(async () => {
        fireEvent.change(opponentInput, { target: { value: 'LAUTP/Sininen' } });
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Create Game/i }));
      });
      await waitFor(() => expect(mockOnStart).toHaveBeenCalled());
      expect(mockOnStart.mock.calls[0][2]).toBe('LauTP / Sininen');
    });
  });

  /**
   * A competition's list builds itself from its own fixtures. Prod has 0 of 9
   * seasons with a curated list, so a design that only reads the curated one
   * shows an empty dropdown to everybody.
   * @critical
   */
  describe('offers the teams a competition has already played', () => {
    const selectSeason = async (id: string) => {
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /League/i }));
      });
      await waitFor(() => expect(document.getElementById('seasonSelect')).toBeInTheDocument());
      await act(async () => {
        fireEvent.change(document.getElementById('seasonSelect') as HTMLSelectElement, {
          target: { value: id },
        });
      });
    };

    it('lists an opponent met in this league even with no curated list', async () => {
      render(
        <ToastProvider>
          <NewGameSetupModal
            {...defaultProps}
            playedOpponentsByCompetition={{ season3: ['FC Lapa'] }}
          />
        </ToastProvider>,
      );
      await selectSeason('season3'); // season3 has no `opponents` at all
      expect(screen.getByRole('button', { name: 'FC Lapa' })).toBeInTheDocument();
    });

    it('does not offer a team from a different competition', async () => {
      render(
        <ToastProvider>
          <NewGameSetupModal
            {...defaultProps}
            playedOpponentsByCompetition={{ season2: ['FC Lapa'] }}
          />
        </ToastProvider>,
      );
      await selectSeason('season3');
      expect(screen.queryByRole('button', { name: 'FC Lapa' })).not.toBeInTheDocument();
    });

    /** One team, two spellings across two fixtures, must appear once. */
    it('shows a played team once when the curated list already has it', async () => {
      render(
        <ToastProvider>
          <NewGameSetupModal
            {...defaultProps}
            playedOpponentsByCompetition={{ season1: ['ips'] }}
          />
        </ToastProvider>,
      );
      await selectSeason('season1'); // curated: ['IPS', 'KuPS']
      expect(screen.getByRole('button', { name: 'IPS' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'ips' })).not.toBeInTheDocument();
    });
  });

  /**
   * The escape hatch. Without it, adoption is a one-way door: every entry gets
   * rewritten onto the first spelling, so a second spelling never appears,
   * "most used" can never shift, and the sweep tool - which only lists names
   * written two or more ways - never shows the name again. A name captured
   * wrongly on its first use would be uncorrectable.
   * @critical
   */
  describe('refusing an adopted spelling', () => {
    const typeAndBlur = async (value: string) => {
      const input = screen.getByRole('textbox', { name: /Opponent Name/i });
      await act(async () => {
        fireEvent.change(input, { target: { value } });
      });
      await act(async () => {
        fireEvent.blur(input);
      });
      return input;
    };

    it('says so when it changed what was typed, and offers the way out', async () => {
      render(
        <ToastProvider>
          <NewGameSetupModal
            {...defaultProps}
            knownOpponents={['ips musta']}
            onRenameOpponent={jest.fn().mockResolvedValue(undefined)}
          />
        </ToastProvider>,
      );
      const input = await typeAndBlur('IPS/Musta');
      expect(input).toHaveValue('ips musta');
      expect(screen.getByTestId('opponent-adopted-notice')).toBeInTheDocument();
      expect(screen.getByTestId('opponent-keep-typed')).toBeInTheDocument();
    });

    /** The whole point: the coach's spelling replaces the stored one everywhere. */
    it('renames every past use to the typed spelling', async () => {
      const onRenameOpponent = jest.fn().mockResolvedValue(undefined);
      render(
        <ToastProvider>
          <NewGameSetupModal
            {...defaultProps}
            knownOpponents={['ips musta']}
            onRenameOpponent={onRenameOpponent}
          />
        </ToastProvider>,
      );
      const input = await typeAndBlur('IPS/Musta');
      await act(async () => {
        fireEvent.click(screen.getByTestId('opponent-keep-typed'));
      });
      expect(onRenameOpponent).toHaveBeenCalledWith('ips musta', 'IPS/Musta');
      await waitFor(() => expect(input).toHaveValue('IPS/Musta'));
      expect(screen.queryByTestId('opponent-adopted-notice')).not.toBeInTheDocument();
    });

    /** The game being created must carry the refused spelling, not the old one. */
    it('starts the game with the spelling the coach kept', async () => {
      render(
        <ToastProvider>
          <NewGameSetupModal
            {...defaultProps}
            knownOpponents={['ips musta']}
            onRenameOpponent={jest.fn().mockResolvedValue(undefined)}
          />
        </ToastProvider>,
      );
      await typeAndBlur('IPS/Musta');
      await act(async () => {
        fireEvent.click(screen.getByTestId('opponent-keep-typed'));
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Create Game/i }));
      });
      await waitFor(() => expect(mockOnStart).toHaveBeenCalled());
      expect(mockOnStart.mock.calls[0][2]).toBe('IPS/Musta');
    });

    it('says nothing when the typed name was left alone', async () => {
      render(
        <ToastProvider>
          <NewGameSetupModal
            {...defaultProps}
            knownOpponents={['ips musta']}
            onRenameOpponent={jest.fn()}
          />
        </ToastProvider>,
      );
      await typeAndBlur('HJK');
      expect(screen.queryByTestId('opponent-adopted-notice')).not.toBeInTheDocument();
    });

    /** Editing again answers the question; the offer belonged to text now gone. */
    it('withdraws the offer once the coach types again', async () => {
      render(
        <ToastProvider>
          <NewGameSetupModal
            {...defaultProps}
            knownOpponents={['ips musta']}
            onRenameOpponent={jest.fn()}
          />
        </ToastProvider>,
      );
      await typeAndBlur('IPS/Musta');
      expect(screen.getByTestId('opponent-adopted-notice')).toBeInTheDocument();
      await act(async () => {
        fireEvent.change(screen.getByRole('textbox', { name: /Opponent Name/i }), {
          target: { value: 'HJ' },
        });
      });
      expect(screen.queryByTestId('opponent-adopted-notice')).not.toBeInTheDocument();
    });

    /** No host handler means no promise we cannot keep. */
    it('does not offer a rename the host cannot perform', async () => {
      render(
        <ToastProvider>
          <NewGameSetupModal {...defaultProps} knownOpponents={['ips musta']} />
        </ToastProvider>,
      );
      await typeAndBlur('IPS/Musta');
      expect(screen.queryByTestId('opponent-adopted-notice')).not.toBeInTheDocument();
    });
  });

  /**
   * The half of the wizard's age-group question that actually delivers.
   * Writing the answer onto the TEAM alone changes nothing a coach can see -
   * nothing reads teams.ageGroup. It has to become the default here.
   * @critical
   */
  describe('the wizard’s age group as a new-game default', () => {
    const withStoredAge = async (age: string, run: () => Promise<void> | void) => {
      setOnboardingUserId('user-1');
      localStorage.setItem('matchops_setup_age_group_user-1', age);
      try {
        await run();
      } finally {
        setOnboardingUserId(undefined);
        localStorage.removeItem('matchops_setup_age_group_user-1');
      }
    };

    const ageSelect = () => document.querySelector('#ageGroupSelect') as HTMLSelectElement;

    it('prefills the age group the coach answered', async () => {
      await withStoredAge('U10', async () => {
        render(
          <ToastProvider>
            <NewGameSetupModal {...defaultProps} />
          </ToastProvider>,
        );
        await waitFor(() => expect(ageSelect()).toBeInTheDocument());
        expect(ageSelect().value).toBe('U10');
      });
    });

    /**
     * Precedence, and it matters: a competition setting is a statement about
     * THIS fixture, the wizard answer is a guess about the coach.
     */
    it('lets a league’s own age group win', async () => {
      await withStoredAge('U10', async () => {
        render(
          <ToastProvider>
            <NewGameSetupModal
              {...defaultProps}
              seasons={[{ id: 'sA', name: 'Itä P13', ageGroup: 'U13' }]}
            />
          </ToastProvider>,
        );
        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: /League/i }));
        });
        await waitFor(() => expect(document.getElementById('seasonSelect')).toBeInTheDocument());
        await act(async () => {
          fireEvent.change(document.getElementById('seasonSelect') as HTMLSelectElement, {
            target: { value: 'sA' },
          });
        });
        await waitFor(() => expect(ageSelect().value).toBe('U13'));
      });
    });

    it('stays empty when the coach skipped the question', async () => {
      setOnboardingUserId('user-1');
      try {
        render(
          <ToastProvider>
            <NewGameSetupModal {...defaultProps} />
          </ToastProvider>,
        );
        await waitFor(() => expect(ageSelect()).toBeInTheDocument());
        expect(ageSelect().value).toBe('');
      } finally {
        setOnboardingUserId(undefined);
      }
    });

    /** localStorage is editable; an unrecognised value must not reach a game. */
    it('ignores a value that is not an age group', async () => {
      await withStoredAge('U99', async () => {
        render(
          <ToastProvider>
            <NewGameSetupModal {...defaultProps} />
          </ToastProvider>,
        );
        await waitFor(() => expect(ageSelect()).toBeInTheDocument());
        expect(ageSelect().value).toBe('');
      });
    });
  });

  /**
   * Tells a coach what their age group officially plays, when the chosen
   * formation disagrees. It never blocks the choice - a series may deviate
   * from the national default and the coach is the one who knows.
   * @critical
   */
  describe('official format nudge', () => {
    const openWith = async (props: Record<string, unknown>) => {
      render(
        <ToastProvider>
          <NewGameSetupModal {...defaultProps} {...props} />
        </ToastProvider>,
      );
      await waitFor(() =>
        expect(screen.getByRole('textbox', { name: /Your Team Name/i })).toBeInTheDocument(),
      );
    };
    const setAge = async (age: string) => {
      await act(async () => {
        fireEvent.change(document.querySelector('#ageGroupSelect') as HTMLSelectElement, {
          target: { value: age },
        });
      });
    };
    const setFormation = async (id: string) => {
      await act(async () => {
        fireEvent.change(document.querySelector('#formationSelect') as HTMLSelectElement, {
          target: { value: id },
        });
      });
    };

    /**
     * THE ONE THAT MATTERS MOST. Football's new formats start in season 2027.
     * Today a Finnish U10 team still plays 8v8, so saying "U10 plays 5v5" now
     * would tell a coach their own league is wrong.
     */
    it('says nothing about football before season 2027', async () => {
      await openWith({});
      await setAge('U10');
      await setFormation('5v5-2-2');
      expect(screen.queryByTestId('format-nudge')).not.toBeInTheDocument();
    });

    /** Futsal's formats are already in force, so futsal answers today. */
    it('flags a futsal format that disagrees with the age group', async () => {
      await openWith({});
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Futsal/i }));
      });
      await setAge('U10');
      await setFormation('5v5-2-2'); // U10 futsal is officially 4v4
      // Presence only: this suite's i18n mock does not interpolate, so the
      // rendered string is the raw template. WHICH format it names is covered
      // directly in config/officialFieldSize.test.ts.
      await waitFor(() => expect(screen.getByTestId('format-nudge')).toBeInTheDocument());
    });

    /** A hint that restates what you already picked is noise. */
    it('stays quiet when the choice already matches', async () => {
      await openWith({});
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Futsal/i }));
      });
      await setAge('U10');
      await setFormation('4v4-2-1');
      await waitFor(() =>
        expect(screen.queryByTestId('format-nudge')).not.toBeInTheDocument(),
      );
    });

    it('says nothing without an age group', async () => {
      await openWith({});
      await setFormation('5v5-2-2');
      expect(screen.queryByTestId('format-nudge')).not.toBeInTheDocument();
    });
  });
});