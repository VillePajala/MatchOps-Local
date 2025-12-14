import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom';

import RosterSettingsModal from './RosterSettingsModal';
import type { Player } from '@/types';
import { ToastProvider } from '@/contexts/ToastProvider';
import { PremiumProvider } from '@/contexts/PremiumContext';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | undefined) => fallback || key,
  }),
}));

// Mock usePremium to enable limit testing
// Default mock allows all operations (checkAndPrompt returns true)
jest.mock('@/hooks/usePremium', () => ({
  usePremium: () => ({
    isPremium: false,
    isLoading: false,
    hasLimits: true,
    grantPremiumAccess: jest.fn(),
    revokePremiumAccess: jest.fn(),
    PREMIUM_PRICE: '9,99 €',
  }),
  useResourceLimit: () => ({
    canAdd: true,
    remaining: 10,
    limit: 18,
    current: 2,
    checkAndPrompt: jest.fn().mockReturnValue(true),
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

// Test wrapper with required providers
const createTestQueryClient = () => new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={createTestQueryClient()}>
    <PremiumProvider>
      <ToastProvider>
        {children}
      </ToastProvider>
    </PremiumProvider>
  </QueryClientProvider>
);

describe('<RosterSettingsModal />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders the modal when isOpen is true', () => {
    render(
      <TestWrapper>
        <RosterSettingsModal {...defaultProps} />
      </TestWrapper>
    );
    expect(screen.getByText('Manage Roster')).toBeInTheDocument();
    expect(screen.getByText('Player One')).toBeInTheDocument();
    expect(screen.getByText('Player Two')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add Player/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Done/i })).toBeInTheDocument();
  });

  test('does not render when isOpen is false', () => {
    render(
      <TestWrapper>
        <RosterSettingsModal {...defaultProps} isOpen={false} />
      </TestWrapper>
    );
    expect(screen.queryByText('Manage Roster')).not.toBeInTheDocument();
  });

  test('calls onClose when Done button is clicked', () => {
    render(
      <TestWrapper>
        <RosterSettingsModal {...defaultProps} />
      </TestWrapper>
    );
    const doneButton = screen.getByRole('button', { name: /Done/i });
    fireEvent.click(doneButton);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  test('shows add player form when Add Player button is clicked', async () => {
    render(
      <TestWrapper>
        <RosterSettingsModal {...defaultProps} />
      </TestWrapper>
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
      <TestWrapper>
        <RosterSettingsModal {...defaultProps} />
      </TestWrapper>
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
      <TestWrapper>
        <RosterSettingsModal {...defaultProps} />
      </TestWrapper>
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
      <TestWrapper>
        <RosterSettingsModal {...defaultProps} />
      </TestWrapper>
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
      <TestWrapper>
        <RosterSettingsModal {...defaultProps} />
      </TestWrapper>
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
      <TestWrapper>
        <RosterSettingsModal {...defaultProps} />
      </TestWrapper>
    );
    const searchInput = screen.getByPlaceholderText('Search players...');
    fireEvent.change(searchInput, { target: { value: 'Two' } });
    expect(screen.queryByText('Player One')).not.toBeInTheDocument();
    expect(screen.getByText('Player Two')).toBeInTheDocument();
  });

});

/**
 * Premium limit enforcement tests
 * @critical - Tests that free users are blocked when hitting player limit
 */
describe('RosterSettingsModal - Premium Limit Enforcement', () => {
  let mockCheckAndPrompt: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckAndPrompt = jest.fn();
  });

  /**
   * Tests player creation blocked when limit reached
   * @critical - Monetization: free users cannot exceed 18 player limit
   */
  test('blocks player creation when free limit is reached', async () => {
    mockCheckAndPrompt.mockReturnValue(false);

    // Re-mock usePremium for this specific test
    const usePremiumModule = require('@/hooks/usePremium');
    const originalUseResourceLimit = usePremiumModule.useResourceLimit;

    usePremiumModule.useResourceLimit = jest.fn(() => ({
      canAdd: false,
      remaining: 0,
      limit: 18,
      current: 18,
      checkAndPrompt: mockCheckAndPrompt,
    }));

    // Create 18 players to hit the limit
    const playersAtLimit: Player[] = Array.from({ length: 18 }, (_, i) => ({
      id: `p${i + 1}`,
      name: `Player ${i + 1}`,
      nickname: `P${i + 1}`,
      jerseyNumber: `${i + 1}`,
      notes: '',
    }));

    render(
      <TestWrapper>
        <RosterSettingsModal {...defaultProps} availablePlayers={playersAtLimit} />
      </TestWrapper>
    );

    // The Add Player button should still be visible
    const addButton = screen.getByRole('button', { name: /Add Player/i });
    expect(addButton).toBeInTheDocument();

    // Click the button
    fireEvent.click(addButton);

    // checkAndPrompt should have been called
    expect(mockCheckAndPrompt).toHaveBeenCalled();

    // Modal should NOT open (no player name input visible)
    expect(screen.queryByPlaceholderText(/Enter player name/i)).not.toBeInTheDocument();

    // Restore original mock
    usePremiumModule.useResourceLimit = originalUseResourceLimit;
  });

  /**
   * Tests player creation allowed when under limit
   */
  test('allows player creation when under limit', async () => {
    // With only 2 players, we're well under the 18 player limit
    render(
      <TestWrapper>
        <RosterSettingsModal {...defaultProps} availablePlayers={mockPlayers} />
      </TestWrapper>
    );

    const addButton = screen.getByRole('button', { name: /Add Player/i });
    fireEvent.click(addButton);

    // Should open PlayerDetailsModal since we're under limit
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Enter player name/i)).toBeInTheDocument();
    });
  });

  /**
   * Tests player count display
   */
  test('displays correct player count', () => {
    render(
      <TestWrapper>
        <RosterSettingsModal {...defaultProps} />
      </TestWrapper>
    );

    // Should show "2 Total Players" for our mock data
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Total Players')).toBeInTheDocument();
  });
});