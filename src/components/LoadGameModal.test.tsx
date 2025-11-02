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
    onExportOneCsv: jest.fn(),
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

  it('calls onExportOneCsv when CSV export button is clicked', async () => {
    await renderModal();
    const gameCard = await screen.findByTestId('game-item-game_1659123456_abc');

    // Open actions menu
    const actionsButton = within(gameCard).getByLabelText('Game actions');
    await act(async () => {
      fireEvent.click(actionsButton);
    });

    // Click Export CSV
    const csvExportButton = await screen.findByText('Export CSV');
    await act(async () => {
      fireEvent.click(csvExportButton);
    });

    expect(mockHandlers.onExportOneCsv).toHaveBeenCalledWith('game_1659123456_abc');
    });

  it('displays current game indicator when loaded', async () => {
    await renderModal({ currentGameId: 'game_1659123456_abc' });
    const gameCard = await screen.findByTestId('game-item-game_1659123456_abc');

    // Check for the subtle left border indicator
    expect(gameCard).toHaveClass('border-l-4', 'border-indigo-500');
  });
});