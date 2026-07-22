/**
 * Roster bridge (3.2) - the inline add-form's serialization gate. The whole
 * section serializes against the modal's in-flight mutations via `disabled`
 * (= GameSettingsModal's isProcessing); the OPEN add-form must respect it
 * too, not just the trigger button (review regression test).
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import PlayerSelectionSection from './PlayerSelectionSection';
import type { Player } from '@/types';

const players: Player[] = [{ id: 'p1', name: 'Pelaaja 1', isGoalie: false } as Player];

const baseProps = {
  availablePlayers: players,
  selectedPlayerIds: [] as string[],
  onSelectedPlayersChange: jest.fn(),
  title: 'Select Players',
  playersSelectedText: 'selected',
  selectAllText: 'Select All',
  noPlayersText: 'No players',
  addPlayerLabel: 'Add to club roster',
  addPlayerPlaceholder: 'New player name',
};

describe('PlayerSelectionSection - inline add-form disabled gate (3.2)', () => {
  it('the OPEN form is fully non-interactive while disabled (isProcessing)', () => {
    const onAddPlayer = jest.fn().mockResolvedValue(true);
    const { rerender } = render(
      <PlayerSelectionSection {...baseProps} onAddPlayer={onAddPlayer} disabled={false} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '+ Add to club roster' }));
    fireEvent.change(screen.getByPlaceholderText('New player name'), { target: { value: 'Uusi' } });

    // The modal enters a mutation (isProcessing -> disabled): every control
    // of the open form locks, and submit is a no-op.
    rerender(<PlayerSelectionSection {...baseProps} onAddPlayer={onAddPlayer} disabled={true} />);
    expect(screen.getByPlaceholderText('New player name')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add to club roster' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add to club roster - cancel' })).toBeDisabled();
    fireEvent.submit(screen.getByPlaceholderText('New player name').closest('form')!);
    expect(onAddPlayer).not.toHaveBeenCalled();
  });
});
