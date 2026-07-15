/**
 * L.2: Home taps for lifted modals must open ModalProvider state IN PLACE -
 * no handleAction, no screen switch, no game mount. This is the user-facing
 * half of the "open from Home with the game view unmounted" criterion.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import StartScreenLiftedBridge from './StartScreenLiftedBridge';
import ModalProvider, { useModalContext } from '@/contexts/ModalProvider';

jest.mock('@/components/StartScreen', () => ({
  __esModule: true,
  default: (props: Record<string, () => void>) => (
    <div>
      <button onClick={props.onManageRoster}>tap-roster</button>
      <button onClick={props.onManageTeams}>tap-teams</button>
      <button onClick={props.onManagePersonnel}>tap-personnel</button>
      <button onClick={props.onManageSeasons}>tap-seasons</button>
      <button onClick={props.onOpenTraining}>tap-training</button>
      <button onClick={props.onOpenRules}>tap-rules</button>
      <button onClick={props.onOpenBackup}>tap-backup</button>
      <button onClick={props.onOpenAccount}>tap-account</button>
      <button onClick={props.onOpenSettings}>tap-settings</button>
      <button onClick={props.onLoadGame}>tap-load</button>
      <button onClick={props.onNewGame}>tap-new</button>
      <button onClick={props.onOpenPlanner}>tap-planner</button>
      <button onClick={props.onGetStarted}>tap-get-started</button>
    </div>
  ),
}));

function Probe() {
  const ctx = useModalContext();
  const open = [
    ctx.isLoadGameModalOpen && 'loadGame',
    ctx.isNewGameSetupModalOpen && 'newGame',
    ctx.isPlaytimePlannerOpen && 'planner',
    ctx.isRosterModalOpen && 'roster',
    ctx.isTeamManagerOpen && 'teams',
    ctx.isPersonnelManagerOpen && 'personnel',
    ctx.isSeasonTournamentModalOpen && 'seasons',
    ctx.isTrainingResourcesOpen && 'training',
    ctx.isRulesDirectoryOpen && 'rules',
    ctx.isSettingsModalOpen && `settings(${ctx.settingsInitialTab ?? 'default'})`,
  ].filter(Boolean).join(',');
  return <div data-testid="probe">{open || 'none'}</div>;
}

describe('StartScreenLiftedBridge (L.2)', () => {
  const renderBridge = (onGetStarted = jest.fn()) => {
    render(
      <ModalProvider>
        <Probe />
        <StartScreenLiftedBridge
          onGetStarted={onGetStarted}
          onViewStats={jest.fn()}
        />
      </ModalProvider>,
    );
    return { onGetStarted };
  };

  it.each([
    ['tap-load', 'loadGame'],
    ['tap-new', 'newGame'],
    ['tap-planner', 'planner'],
    ['tap-roster', 'roster'],
    ['tap-teams', 'teams'],
    ['tap-personnel', 'personnel'],
    ['tap-seasons', 'seasons'],
    ['tap-training', 'training'],
    ['tap-rules', 'rules'],
    ['tap-settings', 'settings(default)'],
    ['tap-backup', 'settings(data)'],
    ['tap-account', 'settings(account)'],
  ])('%s opens the lifted modal in place', (button, expected) => {
    renderBridge();
    fireEvent.click(screen.getByText(button));
    expect(screen.getByTestId('probe')).toHaveTextContent(expected);
  });

  it('match-bound actions still pass through untouched', () => {
    const { onGetStarted } = renderBridge();
    fireEvent.click(screen.getByText('tap-get-started'));
    expect(onGetStarted).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('probe')).toHaveTextContent('none');
  });
});
