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
  default: (props: Record<string, (...args: unknown[]) => void>) => (
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
      <button onClick={props.onViewStats}>tap-stats</button>
      <button onClick={() => props.onViewStatsTab?.('player')}>tap-player-stats</button>
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
    ctx.isClubStatsOpen && `clubStats(${ctx.clubStatsInitialTab ?? 'default'})`,
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

/** Lets a test close modals via context (there is no Home tap that closes them). */
function Closer() {
  const ctx = useModalContext();
  return (
    <>
      <button onClick={() => ctx.setIsRosterModalOpen(false)}>close-roster</button>
      <button onClick={() => ctx.setIsTrainingResourcesOpen(false)}>close-training</button>
      <button onClick={() => ctx.setIsLoadGameModalOpen(false)}>close-load</button>
    </>
  );
}

describe('StartScreenLiftedBridge (L.2)', () => {
  const renderBridge = (onGetStarted = jest.fn()) => {
    render(
      <ModalProvider>
        <Probe />
        <StartScreenLiftedBridge
          onGetStarted={onGetStarted}
        />
      </ModalProvider>,
    );
    return { onGetStarted };
  };

  const renderBridgeWithCloser = (onSetupModalsClosed = jest.fn()) => {
    render(
      <ModalProvider>
        <Probe />
        <Closer />
        <StartScreenLiftedBridge
          onGetStarted={jest.fn()}
          onSetupModalsClosed={onSetupModalsClosed}
        />
      </ModalProvider>,
    );
    return { onSetupModalsClosed };
  };

  it.each([
    ['tap-load', 'loadGame'],
    ['tap-new', 'newGame'],
    ['tap-planner', 'planner'],
    ['tap-stats', 'clubStats(season)'],
    ['tap-player-stats', 'clubStats(player)'],
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

  // A first-time user who adds players in the roster modal must graduate off the
  // first-run panel when it closes - the bridge signals that via onSetupModalsClosed.
  describe('onSetupModalsClosed (setup-modal-close -> Home re-check)', () => {
    it('fires once when a setup modal transitions open -> closed', () => {
      const { onSetupModalsClosed } = renderBridgeWithCloser();

      // Opening a setup modal must NOT fire it (edge is close only).
      fireEvent.click(screen.getByText('tap-roster'));
      expect(screen.getByTestId('probe')).toHaveTextContent('roster');
      expect(onSetupModalsClosed).not.toHaveBeenCalled();

      // Closing it fires exactly once.
      fireEvent.click(screen.getByText('close-roster'));
      expect(screen.getByTestId('probe')).toHaveTextContent('none');
      expect(onSetupModalsClosed).toHaveBeenCalledTimes(1);
    });

    it('does NOT fire when a non-setup modal (training) closes', () => {
      const { onSetupModalsClosed } = renderBridgeWithCloser();

      fireEvent.click(screen.getByText('tap-training'));
      expect(screen.getByTestId('probe')).toHaveTextContent('training');
      fireEvent.click(screen.getByText('close-training'));
      expect(screen.getByTestId('probe')).toHaveTextContent('none');
      expect(onSetupModalsClosed).not.toHaveBeenCalled();
    });
  });
});

describe('Home is refreshed by every modal that can change what it shows', () => {
  /**
   * ModalProvider swallows a close that lands within 200ms of the open, to stop
   * a modal flashing. A test closes instantly, so time has to move for the
   * close to count - a real coach is never this fast.
   */
  let clock = 0;
  beforeEach(() => {
    clock = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => clock);
  });
  afterEach(() => jest.restoreAllMocks());
  const passTime = () => { clock += 1000; };

  const renderWithCloser = () => {
    const onSetupModalsClosed = jest.fn();
    render(
      <ModalProvider>
        <Probe />
        <Closer />
        <StartScreenLiftedBridge onGetStarted={jest.fn()} onSetupModalsClosed={onSetupModalsClosed} />
      </ModalProvider>,
    );
    return { onSetupModalsClosed };
  };

  /**
   * REGRESSION. The owner deleted the fixture Home was advertising as the next
   * match and Home went on advertising it: the summary is snapshotted in
   * checkAppState, which re-runs only on mount and on auth changes, and the
   * load-game modal - the ONLY place a game can be deleted - was not asking for
   * a refresh on its way out.
   */
  it('refreshes after the load-game modal closes, where games are deleted', () => {
    const { onSetupModalsClosed } = renderWithCloser();

    fireEvent.click(screen.getByText('tap-load'));
    expect(onSetupModalsClosed).not.toHaveBeenCalled();

    passTime();
    fireEvent.click(screen.getByText('close-load'));
    expect(onSetupModalsClosed).toHaveBeenCalledTimes(1);
  });

  it('still refreshes after a setup modal closes', () => {
    const { onSetupModalsClosed } = renderWithCloser();

    fireEvent.click(screen.getByText('tap-roster'));
    passTime();
    fireEvent.click(screen.getByText('close-roster'));

    expect(onSetupModalsClosed).toHaveBeenCalledTimes(1);
  });

  /** One refresh for the whole excursion, not one per modal. */
  it('does not refresh while another modal is still open', () => {
    const { onSetupModalsClosed } = renderWithCloser();

    fireEvent.click(screen.getByText('tap-load'));
    fireEvent.click(screen.getByText('tap-roster'));
    passTime();
    fireEvent.click(screen.getByText('close-load'));

    expect(onSetupModalsClosed).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('close-roster'));
    expect(onSetupModalsClosed).toHaveBeenCalledTimes(1);
  });
});
