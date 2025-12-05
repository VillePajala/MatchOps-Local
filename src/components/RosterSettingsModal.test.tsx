import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import RosterSettingsModal from './RosterSettingsModal';
import type { Player } from '@/types';
import { ToastProvider } from '@/contexts/ToastProvider';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | undefined) => fallback || key,
  }),
}));

const mockOnClose = jest.fn();
const mockOnAddPlayer = jest.fn();
const mockOnRemovePlayer = jest.fn();
const mockOnRenamePlayer = jest.fn();
const mockOnSetJerseyNumber = jest.fn();
const mockOnSetPlayerNotes = jest.fn();
const mockOnOpenPlayerStats = jest.fn();
const mockOnUpdatePlayer = jest.fn();

const mockPlayers: Player[] = [
  { id: 'p1', name: 'Player One', nickname: 'P1', jerseyNumber: '10', notes: 'Note 1' },
  { id: 'p2', name: 'Player Two', nickname: 'P2', jerseyNumber: '20', notes: 'Note 2' },
];

const defaultProps = {
  isOpen: true,
  onClose: mockOnClose,
  availablePlayers: mockPlayers,
  onUpdatePlayer: mockOnUpdatePlayer,
  onRenamePlayer: mockOnRenamePlayer,
  onSetJerseyNumber: mockOnSetJerseyNumber,
  onSetPlayerNotes: mockOnSetPlayerNotes,
  onRemovePlayer: mockOnRemovePlayer,
  onAddPlayer: mockOnAddPlayer,
  selectedPlayerIds: [],
  onOpenPlayerStats: mockOnOpenPlayerStats,
};

describe('<RosterSettingsModal />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders the modal when isOpen is true', () => {
    render(
      <ToastProvider>
        <RosterSettingsModal {...defaultProps} />
      </ToastProvider>
    );
    expect(screen.getByText('Manage Roster')).toBeInTheDocument();
    expect(screen.getByText('Player One')).toBeInTheDocument();
    expect(screen.getByText('Player Two')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add Player/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Done/i })).toBeInTheDocument();
  });

  test('does not render when isOpen is false', () => {
    render(
      <ToastProvider>
        <RosterSettingsModal {...defaultProps} isOpen={false} />
      </ToastProvider>
    );
    expect(screen.queryByText('Manage Roster')).not.toBeInTheDocument();
  });

  test('calls onClose when Done button is clicked', () => {
    render(
      <ToastProvider>
        <RosterSettingsModal {...defaultProps} />
      </ToastProvider>
    );
    const doneButton = screen.getByRole('button', { name: /Done/i });
    fireEvent.click(doneButton);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  test('shows add player form when Add Player button is clicked', async () => {
    render(
      <ToastProvider>
        <RosterSettingsModal {...defaultProps} />
      </ToastProvider>
    );
    const addButton = screen.getByRole('button', { name: /Add Player/i });
    fireEvent.click(addButton);

    // Should open PlayerDetailsModal
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Enter player name/i)).toBeInTheDocument();
    });
  });

  test('adds a new player when form is submitted', async () => {
    render(
      <ToastProvider>
        <RosterSettingsModal {...defaultProps} />
      </ToastProvider>
    );

    // Open modal
    const addButton = screen.getByRole('button', { name: /Add Player/i });
    fireEvent.click(addButton);

    // Wait for modal to open
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Enter player name/i)).toBeInTheDocument();
    });

    // Fill form in modal
    const newPlayer = {
      name: 'New Player',
      nickname: 'NP',
      jerseyNumber: '99',
      notes: 'Test notes',
    };

    fireEvent.change(screen.getByPlaceholderText(/Enter player name/i), { target: { value: newPlayer.name }});
    fireEvent.change(screen.getByPlaceholderText(/Optional nickname/i), { target: { value: newPlayer.nickname }});
    fireEvent.change(screen.getByPlaceholderText(/e\.g\., 10/i), { target: { value: newPlayer.jerseyNumber }});
    fireEvent.change(screen.getByPlaceholderText(/Optional notes about this player/i), { target: { value: newPlayer.notes }});

    // Submit - click the Add button in the modal footer
    const submitButtons = screen.getAllByRole('button', { name: /Add/i });
    const addButton2 = submitButtons.find(btn => btn.textContent === 'Add');
    if (!addButton2) throw new Error('Add button not found in modal');
    fireEvent.click(addButton2);

    await waitFor(() => {
      expect(mockOnAddPlayer).toHaveBeenCalledWith(newPlayer);
    });
  });

  test('edits player when edit form is submitted', async () => {
    render(
      <ToastProvider>
        <RosterSettingsModal {...defaultProps} />
      </ToastProvider>
    );

    // Click on player name to open edit modal
    const playerName = screen.getByText('Player One');
    fireEvent.click(playerName);

    // Wait for edit modal to open
    await waitFor(() => {
      expect(screen.getByText(/Player Details/i)).toBeInTheDocument();
    });

    // Fill edit form in modal
    const updatedData = {
      name: 'Updated Name',
      nickname: 'UN',
      jerseyNumber: '11',
      notes: 'Updated notes'
    };

    fireEvent.change(screen.getByDisplayValue('Player One'), { target: { value: updatedData.name }});
    fireEvent.change(screen.getByDisplayValue('P1'), { target: { value: updatedData.nickname }});
    fireEvent.change(screen.getByDisplayValue('10'), { target: { value: updatedData.jerseyNumber }});
    fireEvent.change(screen.getByDisplayValue('Note 1'), { target: { value: updatedData.notes }});

    // Save - click the Save button in the modal footer
    const saveButton = screen.getByRole('button', { name: /^Save$/i });
    fireEvent.click(saveButton);

    // Should call unified update with all changed fields
    await waitFor(() => {
      expect(mockOnUpdatePlayer).toHaveBeenCalledWith('p1', {
        name: updatedData.name,
        nickname: updatedData.nickname,
        jerseyNumber: updatedData.jerseyNumber,
        notes: updatedData.notes
      });
    });
  });

  test('removes player when remove button is clicked', async () => {
    render(
      <ToastProvider>
        <RosterSettingsModal {...defaultProps} />
      </ToastProvider>
    );

    // Open the actions menu for first player (P1)
    const actionsButtons = screen.getAllByTitle('Actions');
    fireEvent.click(actionsButtons[0]);

    // Click Delete in the dropdown
    const deleteButton = screen.getByRole('button', { name: /Delete/i });
    fireEvent.click(deleteButton);

    // Wait for confirmation modal to appear
    await waitFor(() => {
      expect(screen.getByText(/Are you sure/i)).toBeInTheDocument();
    });

    // Click Remove in the confirmation modal (not the Delete buttons)
    const allButtons = screen.getAllByRole('button');
    const removeButton = allButtons.find(btn =>
      btn.textContent === 'Remove' && btn.className.includes('bg-gradient-to-b')
    );
    fireEvent.click(removeButton!);

    await waitFor(() => {
      expect(mockOnRemovePlayer).toHaveBeenCalledWith('p1');
    });
  });



  test('opens player stats', () => {
    render(
      <ToastProvider>
        <RosterSettingsModal {...defaultProps} />
      </ToastProvider>
    );

    // Open the actions menu for first player (P1)
    const actionsButtons = screen.getAllByTitle('Actions');
    fireEvent.click(actionsButtons[0]);

    // Click Stats in the dropdown
    const statsButton = screen.getByRole('button', { name: /Stats/i });
    fireEvent.click(statsButton);

    expect(mockOnOpenPlayerStats).toHaveBeenCalledWith('p1');
  });

  test('filters players by search input', () => {
    render(
      <ToastProvider>
        <RosterSettingsModal {...defaultProps} />
      </ToastProvider>
    );
    const searchInput = screen.getByPlaceholderText('Search players...');
    fireEvent.change(searchInput, { target: { value: 'Two' } });
    expect(screen.queryByText('Player One')).not.toBeInTheDocument();
    expect(screen.getByText('Player Two')).toBeInTheDocument();
  });

});