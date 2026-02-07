import React from 'react';
import { render, screen, fireEvent, waitFor } from '../../utils/test-utils';
import LoadGameModal from '@/components/LoadGameModal';
import SettingsModal from '@/components/SettingsModal';

describe('R0 Baseline: Core modals render and close', () => {
  test('LoadGameModal opens with title and calls onClose on Done', async () => {
    const onClose = jest.fn();
    render(
      <LoadGameModal
        isOpen={true}
        onClose={onClose}
        savedGames={{}}
        onLoad={jest.fn()}
        onDelete={jest.fn()}
        onExportOneJson={jest.fn()}
        onExportOneExcel={jest.fn()}
        currentGameId={undefined}
        seasons={[]}
        tournaments={[]}
        teams={[]}
      />
    );

    expect(await screen.findByText(/Load Game/i)).toBeInTheDocument();
    const done = screen.getByRole('button', { name: /Done/i });
    fireEvent.click(done);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  test('SettingsModal opens with title and calls onClose on Done', async () => {
    const onClose = jest.fn();
    const onLang = jest.fn();
    const onTeam = jest.fn();
    const onHardReset = jest.fn();
    const onBackup = jest.fn();

    render(
      <SettingsModal
        isOpen={true}
        onClose={onClose}
        language={'en'}
        onLanguageChange={onLang}
        defaultTeamName={''}
        onDefaultTeamNameChange={onTeam}
        onHardResetApp={onHardReset}
        onCreateBackup={onBackup}
      />
    );

    expect(await screen.findByText(/App Settings/i)).toBeInTheDocument();
    const done = screen.getByRole('button', { name: /Done/i });
    fireEvent.click(done);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
