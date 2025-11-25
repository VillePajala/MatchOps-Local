/* eslint-disable @typescript-eslint/no-explicit-any */
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

  const mockSeasonsData = [{ id: 'season1', name: 'Spring 2024' }, { id: 'season2', name: 'Summer 2024' }];
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
      expect.any(String), '', '', null, null, 2, 15, 'home', 1, '', '', true, null,
      expect.arrayContaining([
        expect.objectContaining({ id: 'player1', name: 'John Doe' }),
        expect.objectContaining({ id: 'player2', name: 'Jane Smith' })
      ]),
      expect.arrayContaining([])
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
        expect.any(String), '', '', null, null, 2, 15, 'home', 1, '', '', false, null,
        expect.arrayContaining([
          expect.objectContaining({ id: 'player1', name: 'John Doe' }),
          expect.objectContaining({ id: 'player2', name: 'Jane Smith' })
        ]),
        expect.arrayContaining([])
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
});