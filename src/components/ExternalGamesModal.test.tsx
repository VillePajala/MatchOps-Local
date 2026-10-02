import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import ExternalGamesModal from './ExternalGamesModal';
import type { Player } from '@/types';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValueOrOptions?: string | { defaultValue?: string }) =>
      typeof defaultValueOrOptions === 'string'
        ? defaultValueOrOptions
        : defaultValueOrOptions?.defaultValue || '',
    i18n: { language: 'en', changeLanguage: jest.fn() },
  }),
}));
jest.mock('@/hooks/useDataStore', () => ({ useDataStore: () => ({ userId: 'u1' }) }));
jest.mock('@/contexts/ToastProvider', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock('@/utils/playerAdjustments', () => ({
  getAdjustmentsForPlayer: jest.fn().mockResolvedValue([]),
  addPlayerAdjustment: jest.fn(),
  updatePlayerAdjustment: jest.fn(),
  deletePlayerAdjustment: jest.fn(),
}));

const players: Player[] = [
  { id: 'p2', name: 'Ville', isGoalie: false },
  { id: 'p1', name: 'Aino', isGoalie: false },
] as Player[];

const baseProps = { isOpen: true, onClose: jest.fn(), players, seasons: [], tournaments: [], teams: [] };

/** Phase 3 entry point from Home: the coach picks the player first, then the add form is already open. */
describe('ExternalGamesModal', () => {
  it('shows the section with the add form open once a player is picked', async () => {
    render(<ExternalGamesModal {...baseProps} />);
    expect(screen.queryByTestId('add-external-game')).not.toBeInTheDocument();
    const options = screen.getAllByRole('option').map(o => o.textContent);
    expect(options).toEqual(['Select a player', 'Aino', 'Ville']);
    await act(async () => {
      fireEvent.change(screen.getByTestId('external-games-player'), { target: { value: 'p1' } });
    });
    await waitFor(() => expect(screen.getByTestId('adj-team-select')).toBeInTheDocument());
  });

  /** From the roster menu the player is known, so the list shows and the form waits for Add. */
  it('opens on the given player with the list expanded and the form closed', async () => {
    render(<ExternalGamesModal {...baseProps} initialPlayerId="p2" />);
    expect((screen.getByTestId('external-games-player') as HTMLSelectElement).value).toBe('p2');
    await waitFor(() => expect(screen.getByTestId('add-external-game')).toBeInTheDocument());
    expect(screen.queryByTestId('adj-team-select')).not.toBeInTheDocument();
  });

  it('starts the section fresh when the coach switches player', async () => {
    render(<ExternalGamesModal {...baseProps} />);
    await act(async () => {
      fireEvent.change(screen.getByTestId('external-games-player'), { target: { value: 'p1' } });
    });
    await waitFor(() => expect(screen.getByTestId('adj-team-select')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('adj-sport-futsal'));
    expect(screen.getByTestId('adj-sport-futsal')).toHaveAttribute('aria-pressed', 'true');
    await act(async () => {
      fireEvent.change(screen.getByTestId('external-games-player'), { target: { value: 'p2' } });
    });
    await waitFor(() => expect(screen.getByTestId('adj-sport-futsal')).toHaveAttribute('aria-pressed', 'false'));
  });

  it('shows the nickname in the picker and closes on Done', () => {
    const onClose = jest.fn();
    render(<ExternalGamesModal {...baseProps} onClose={onClose} players={[{ id: 'p1', name: 'Aino', nickname: 'Ai', isGoalie: false } as Player]} />);
    expect(screen.getByRole('option', { name: 'Aino (Ai)' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('tells the coach to add players first when the roster is empty', () => {
    render(<ExternalGamesModal {...baseProps} players={[]} />);
    expect(screen.getByText('Add your players on the Club tab first.')).toBeInTheDocument();
    expect(screen.queryByTestId('external-games-player')).not.toBeInTheDocument();
  });

  it('shows neither the hint nor the picker while the roster is still loading', () => {
    render(<ExternalGamesModal {...baseProps} players={[]} playersLoading />);
    expect(screen.queryByText('Add your players on the Club tab first.')).not.toBeInTheDocument();
    expect(screen.queryByTestId('external-games-player')).not.toBeInTheDocument();
  });

  it('falls back to the picker when the preselected player is gone', () => {
    render(<ExternalGamesModal {...baseProps} initialPlayerId="ghost" />);
    expect((screen.getByTestId('external-games-player') as HTMLSelectElement).value).toBe('');
    expect(screen.queryByTestId('add-external-game')).not.toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    const { container } = render(<ExternalGamesModal {...baseProps} isOpen={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});
