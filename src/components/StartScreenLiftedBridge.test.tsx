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

jest.mock('@/hooks/useAppLayout', () => ({ useAppLayout: () => 'full', useSetAppLayout: () => jest.fn() }));
jest.mock('@/contexts/ToastProvider', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
// Basic Home's own writes need the data layer; these taps never reach them.
jest.mock('@/hooks/useBasicHomeActions', () => ({
  useBasicHomeActions: () => ({ moveGameDate: jest.fn(), deleteGame: jest.fn(), addPlayers: jest.fn() }),
}));

// The player deep-link reads the roster to hand the stats surface a Player.
jest.mock('@/utils/masterRosterManager', () => ({
  getMasterRoster: jest.fn().mockResolvedValue([{ id: 'p1', name: 'Aho' }]),
}));

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
      <button onClick={() => props.onOpenAttendance?.('g1', 'start')}>tap-attendance</button>
      <button onClick={() => props.onOpenCompetition?.('tournament', 't1')}>tap-open-tournament</button>
      <button onClick={() => props.onAddCompetition?.('season')}>tap-add-season</button>
      <button onClick={() => props.onViewPlayerStats?.('p1')}>tap-player-p1</button>
      <button onClick={() => props.onViewPlayerStats?.('gone')}>tap-player-gone</button>
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
    ctx.isSeasonTournamentModalOpen && `kind(${ctx.competitionManagerKind})`,
    ctx.competitionManagerTarget && `target(${JSON.stringify(ctx.competitionManagerTarget)})`,
    ctx.selectedPlayerForStats && `player(${ctx.selectedPlayerForStats.id})`,
    ctx.isTrainingResourcesOpen && 'training',
    ctx.isRulesDirectoryOpen && 'rules',
    ctx.isSettingsModalOpen && `settings(${ctx.settingsInitialTab ?? 'default'})`,
    ctx.attendanceRequest && `attendance(${ctx.attendanceRequest.gameId},${ctx.attendanceRequest.mode})`,
  ].filter(Boolean).join(',');
  return <div data-testid="probe">{open || 'none'}</div>;
}

/** Lets a test close modals via context (there is no Home tap that closes them). */
function Closer() {
  const ctx = useModalContext();
  return (
    <>
      <button onClick={() => ctx.setIsRosterModalOpen(false)}>close-roster</button>
      <button onClick={() => ctx.setIsExternalGamesOpen(true)}>open-external</button>
      <button onClick={() => ctx.setIsExternalGamesOpen(false)}>close-external</button>
      <button onClick={() => ctx.setIsTrainingResourcesOpen(false)}>close-training</button>
      <button onClick={() => ctx.setIsLoadGameModalOpen(false)}>close-load</button>
      <button onClick={() => ctx.setIsSettingsModalOpen(false)}>close-settings</button>
      <button onClick={() => ctx.setIsClubStatsOpen(true)}>open-club-stats</button>
      <button onClick={() => ctx.setIsClubStatsOpen(false)}>close-club-stats</button>
      <button onClick={() => ctx.setIsSeasonTournamentModalOpen(false)}>close-seasons</button>
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

  /**
   * Home's Kilpailut cards and add rows open the manager straight onto that
   * sheet; closing the manager drops the target so the next open is the list.
   */
  it('a competition card opens the manager on that item; the target clears on close', () => {
    renderBridgeWithCloser();
    fireEvent.click(screen.getByText('tap-open-tournament'));
    expect(screen.getByTestId('probe')).toHaveTextContent('seasons,kind(tournament),target({"itemId":"t1"})');
    fireEvent.click(screen.getByText('close-seasons'));
    expect(screen.getByTestId('probe')).toHaveTextContent('none');
    fireEvent.click(screen.getByText('tap-seasons'));
    expect(screen.getByTestId('probe')).toHaveTextContent(/^seasons,kind\(season\)$/);
  });

  it('an add row opens the manager onto adding one', () => {
    renderBridge();
    fireEvent.click(screen.getByText('tap-add-season'));
    expect(screen.getByTestId('probe')).toHaveTextContent('seasons,kind(season),target({"create":true})');
  });

  /** Tilastot's scorer tile and list open that player's stats. */
  it('a player deep-link opens club stats on the player tab with that player', async () => {
    renderBridge();
    fireEvent.click(screen.getByText('tap-player-p1'));
    expect(await screen.findByText(/player\(p1\)/)).toHaveTextContent('clubStats(player),player(p1)');
  });

  it('a player the roster no longer has still lands on the player tab', async () => {
    renderBridge();
    fireEvent.click(screen.getByText('tap-player-gone'));
    expect(await screen.findByText('clubStats(player)')).toBeInTheDocument();
  });

  /** Onboarding v3: the next-game card's "Aloita ottelu" opens the attendance sheet in start mode. */
  it('attendance opens in place for the game, in the requested mode', () => {
    renderBridge();
    fireEvent.click(screen.getByText('tap-attendance'));
    expect(screen.getByTestId('probe')).toHaveTextContent('attendance(g1,start)');
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

    /** Review 5.8: an external game added from Home counts toward the top scorer. */
    it('fires when the external-games window closes', () => {
      const { onSetupModalsClosed } = renderBridgeWithCloser();
      fireEvent.click(screen.getByText('open-external'));
      expect(onSetupModalsClosed).not.toHaveBeenCalled();
      fireEvent.click(screen.getByText('close-external'));
      expect(onSetupModalsClosed).toHaveBeenCalledTimes(1);
    });

    /** Review 7.18: "Check team names" in the stats renames games Home shows. */
    it('fires when team statistics close', () => {
      const { onSetupModalsClosed } = renderBridgeWithCloser();
      fireEvent.click(screen.getByText('open-club-stats'));
      expect(onSetupModalsClosed).not.toHaveBeenCalled();
      fireEvent.click(screen.getByText('close-club-stats'));
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

  /**
   * REGRESSION. The starting point and the arrival buffer both feed the
   * departure time on the card, and setting them left Home showing what it had
   * worked out before they existed.
   */
  it('refreshes after settings closes, where the journey is configured', () => {
    const { onSetupModalsClosed } = renderWithCloser();

    fireEvent.click(screen.getByText('tap-settings'));
    passTime();
    fireEvent.click(screen.getByText('close-settings'));

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
