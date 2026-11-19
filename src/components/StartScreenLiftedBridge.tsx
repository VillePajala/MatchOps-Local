'use client';

/**
 * Bridges Home-screen taps for LIFTED modals straight to ModalProvider state
 * (two-level restructure, L.2). Before this, every StartScreen entry routed
 * through page.tsx's handleAction -> setScreen('home'), which mounted the
 * whole match view just to float a modal over it - the facade the L-waves
 * exist to remove. Match-bound actions (resume, the first-time Get Started)
 * still come in via props from page.tsx and switch screens; New Game (L.3b)
 * and Load Game (L.3a) open in place and only enter the match once a game
 * is actually picked/created; the planner (L.3c) and team stats (L.4) open
 * in place with no game mount at all.
 *
 * Lives as its own component because the page component renders OUTSIDE
 * ModalProvider and cannot call useModalContext itself.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import StartScreen from '@/components/StartScreen';
import { lazyModal } from '@/components/lazyModal';
import { useBasicHomeActions } from '@/hooks/useBasicHomeActions';
import { useOnboardingUserId } from '@/components/setupWizardActive';
import { readNextGameStepDraft } from '@/utils/nextGameStepDraft';
import { Z_LAYER } from '@/styles/modalStyles';
import { useModalContext } from '@/contexts/ModalProvider';
import { useAppLayout, useSetAppLayout } from '@/hooks/useAppLayout';
import { useToast } from '@/contexts/ToastProvider';
import { useTranslation } from 'react-i18next';
import { getMasterRoster } from '@/utils/masterRosterManager';
import logger from '@/utils/logger';

/** "Milloin seuraava peli?" + the plan screen (basic Home's "Uusi ottelu", R1). */
const NextGameFlow = lazyModal(() => import('@/components/NextGameFlow'));

type StartScreenProps = React.ComponentProps<typeof StartScreen>;

/** The entries whose modals render in ClubModalsHost - opened in place. */
type LiftedHandlerProps =
  | 'onLoadGame'
  | 'onAddExternalGame'
  | 'onNewGame'
  | 'onOpenPlanner'
  | 'onViewStats'
  | 'onViewStatsTab'
  | 'onViewPlayerStats'
  | 'onOpenCompetition'
  | 'onAddCompetition'
  | 'onManageRoster'
  | 'onManageTeams'
  | 'onManagePersonnel'
  | 'onManageSeasons'
  | 'onManageTournaments'
  | 'onOpenTraining'
  | 'onOpenBackup'
  | 'onOpenAccount'
  | 'onOpenRules'
  | 'onOpenGuide'
  | 'onOpenSettings'
  | 'appLayout'
  | 'onSwitchToFullLayout'
  | 'onOpenAttendance'
  | 'onShowPlan'
  | 'onOpenPlannerAt'
  | 'onMoveGameDate'
  | 'onDeleteGame'
  | 'onAddPlayers';

export type StartScreenLiftedBridgeProps = Omit<StartScreenProps, LiftedHandlerProps> & {
  /** Called after a setup-relevant modal (roster/teams/competitions/new game)
      closes, so page.tsx can re-check its Home flags - adding players there must
      graduate a first-time user off the first-run panel to the normal Home. */
  onSetupModalsClosed?: () => void;
};

export default function StartScreenLiftedBridge({ onSetupModalsClosed, ...props }: StartScreenLiftedBridgeProps) {
  const {
    setIsLoadGameModalOpen,
    setIsExternalGamesOpen,
    setExternalGamesPlayerId,
    setIsNewGameSetupModalOpen,
    setPlayerIdsForNewGame,
    setIsPlaytimePlannerOpen,
    openClubStatsToTab,
    setIsRosterModalOpen,
    setIsTeamManagerOpen,
    setIsPersonnelManagerOpen,
    setIsSeasonTournamentModalOpen,
    setCompetitionManagerKind,
    setCompetitionManagerTarget,
    setSelectedPlayerForStats,
    setIsTrainingResourcesOpen,
    setIsRulesDirectoryOpen,
    setIsInstructionsModalOpen,
    setIsSettingsModalOpen,
    openSettingsToTab,
    isRosterModalOpen,
    isNewGameSetupModalOpen,
    isSeasonTournamentModalOpen,
    isTeamManagerOpen,
    isPersonnelManagerOpen,
    isLoadGameModalOpen,
    isSettingsModalOpen,
    isExternalGamesOpen,
    isClubStatsOpen,
    setPlannerTarget,
    attendanceRequest,
    setAttendanceRequest,
    planQuickViewTarget,
    setPlanQuickViewTarget,
    isPlaytimePlannerOpen,
  } = useModalContext();
  const { t } = useTranslation();
  const { showToast } = useToast();
  // The account's layout (Onboarding v3); undefined while settings load.
  const layout = useAppLayout();
  const setAppLayout = useSetAppLayout();
  const isBasic = layout === 'basic';
  // The settled account id (undefined while auth resolves) - the key the
  // next-game step's answers are kept under.
  const accountId = useOnboardingUserId();

  /**
   * Basic Home's "Uusi ottelu" (R1): the short next-game step, not the full
   * form. Open while its answers are kept on the device, so a reload or an
   * app kill brings the coach back to it (R3).
   */
  const [nextGameFlowOpen, setNextGameFlowOpen] = React.useState(false);
  const reopenCheckedForRef = React.useRef<string | null | undefined>(undefined);
  React.useEffect(() => {
    if (!isBasic || accountId === undefined || reopenCheckedForRef.current === accountId) return;
    reopenCheckedForRef.current = accountId;
    // Reading a device store after mount (it is client-only), once per account.
    if (readNextGameStepDraft(accountId)) setNextGameFlowOpen(true);
  }, [isBasic, accountId]);
  const basicActions = useBasicHomeActions(onSetupModalsClosed);

  // The page's Home flags (hasPlayers -> isFirstTimeUser, the setup tracker) and
  // its summary are snapshotted in checkAppState, which re-runs only on mount
  // and on auth changes - not when a modal closes. So every modal that can
  // change what Home shows has to say so on its way out.
  //
  // THE LOAD-GAME MODAL IS IN THIS LIST because it is the only place a game can
  // be DELETED, and leaving it out was a real bug: the owner deleted the
  // fixture Home was advertising as the next match and Home went on advertising
  // it, because the summary still held the copy fetched before the deletion.
  // Deleting is not the only reason either - loading a different game moves the
  // Jatka card, and both are invisible until something asks for fresh data.
  //
  // SO IS SETTINGS, for the same reason and found the same way: the starting
  // point and the arrival buffer both feed the departure time on the card, and
  // setting them left Home showing what it had worked out before they existed.
  //
  // AND THE EXTERNAL GAMES WINDOW (review 5.8): its goals count toward the Home top
  // scorer, so a game added from "Täydennä pelaajan tilastoja" must show on closing.
  //
  // AND TEAM STATISTICS (review 7.18): its "Check team names" renames opponents in
  // games, and Home's recent-results strip and last-opened card kept the old spelling.
  //
  // AND THE ATTENDANCE SHEET, THE PLAN SCREEN AND THE PLANNER (Onboarding v3):
  // each can change the next game's squad or plan, which the basic card shows.
  const anyHomeAffectingModalOpen = isRosterModalOpen || isNewGameSetupModalOpen ||
    isSeasonTournamentModalOpen || isTeamManagerOpen || isPersonnelManagerOpen ||
    isLoadGameModalOpen || isSettingsModalOpen || isExternalGamesOpen || isClubStatsOpen ||
    !!attendanceRequest || !!planQuickViewTarget || isPlaytimePlannerOpen || nextGameFlowOpen;
  const prevOpen = React.useRef(anyHomeAffectingModalOpen);
  React.useEffect(() => {
    if (prevOpen.current && !anyHomeAffectingModalOpen) onSetupModalsClosed?.();
    prevOpen.current = anyHomeAffectingModalOpen;
  }, [anyHomeAffectingModalOpen, onSetupModalsClosed]);

  const openFullNewGame = () => {
    // From Home there is no live selection to carry over - null lets the
    // modal default to the full roster. (Match-side openers prefill the
    // current game's selection through the same shared state.)
    setPlayerIdsForNewGame(null);
    setIsNewGameSetupModalOpen(true);
  };

  return (
    <>
    <StartScreen
      {...props}
      onLoadGame={() => setIsLoadGameModalOpen(true)}
      onAddExternalGame={() => {
        setExternalGamesPlayerId(null);
        setIsExternalGamesOpen(true);
      }}
      // Basic: the short next-game step; full: the New Game form as before.
      onNewGame={isBasic ? () => setNextGameFlowOpen(true) : openFullNewGame}
      onOpenPlanner={() => setIsPlaytimePlannerOpen(true)}
      onViewStats={() => openClubStatsToTab('season')}
      onViewStatsTab={(tab) => openClubStatsToTab(tab)}
      onViewPlayerStats={(playerId) => {
        // The stats surface deep-links by Player (the roster's per-player
        // shortcut uses the same pair). A player the roster no longer has, or
        // a failed read, still lands on the player tab - never on nothing.
        // accountId is page.tsx's userId (setOnboardingUserId), the key every
        // other Home read uses.
        void getMasterRoster(accountId ?? undefined)
          .then((roster) => roster.find((p) => p.id === playerId) ?? null)
          .catch((err) => {
            logger.warn('Failed to read roster for player stats', { error: err });
            return null;
          })
          .then((player) => {
            setSelectedPlayerForStats(player);
            openClubStatsToTab('player');
          });
      }}
      onManageRoster={() => setIsRosterModalOpen(true)}
      onManageTeams={() => setIsTeamManagerOpen(true)}
      onManagePersonnel={() => setIsPersonnelManagerOpen(true)}
      onManageSeasons={() => {
        setCompetitionManagerKind('season');
        setCompetitionManagerTarget(null);
        setIsSeasonTournamentModalOpen(true);
      }}
      onManageTournaments={() => {
        setCompetitionManagerKind('tournament');
        setCompetitionManagerTarget(null);
        setIsSeasonTournamentModalOpen(true);
      }}
      // Kilpailut's cards and add rows: the manager opens straight onto that
      // sheet, and closing the sheet comes back here.
      onOpenCompetition={(kind, id) => {
        setCompetitionManagerKind(kind);
        setCompetitionManagerTarget({ itemId: id });
        setIsSeasonTournamentModalOpen(true);
      }}
      onAddCompetition={(kind) => {
        setCompetitionManagerKind(kind);
        setCompetitionManagerTarget({ create: true });
        setIsSeasonTournamentModalOpen(true);
      }}
      onOpenTraining={() => setIsTrainingResourcesOpen(true)}
      onOpenRules={() => setIsRulesDirectoryOpen(true)}
      onOpenGuide={() => setIsInstructionsModalOpen(true)}
      onOpenBackup={() => openSettingsToTab('data')}
      onOpenAccount={() => openSettingsToTab('account')}
      onOpenSettings={() => setIsSettingsModalOpen(true)}
      appLayout={layout ?? 'loading'}
      onSwitchToFullLayout={() => {
        void setAppLayout('full').then((ok) => {
          if (!ok) showToast(t('settingsModal.saveSettingError', 'Failed to save setting. Please try again.'), 'error');
          // Home's summary depends on the layout (R2): rebuild it.
          else onSetupModalsClosed?.();
        });
      }}
      onOpenAttendance={(gameId, mode) =>
        setAttendanceRequest({
          gameId,
          mode,
          // "Aloita": the game opens on the pitch once the sheet is saved.
          onStart: mode === 'start' ? () => props.onOpenGameById?.(gameId) : undefined,
        })
      }
      onShowPlan={(planId, gameId) => setPlanQuickViewTarget({ planId, gameId })}
      onOpenPlannerAt={(planId, planGameId) => {
        setPlannerTarget({ planId, planGameId });
        setIsPlaytimePlannerOpen(true);
      }}
      onMoveGameDate={basicActions.moveGameDate}
      onDeleteGame={basicActions.deleteGame}
      onAddPlayers={async (names) => {
        const created = await basicActions.addPlayers(names);
        // All in: straight on to "Milloin seuraava peli?" (R12).
        if (created === names.length) setNextGameFlowOpen(true);
        return created;
      }}
    />
    {nextGameFlowOpen &&
      typeof document !== 'undefined' &&
      createPortal(
        <div className={`fixed inset-0 ${Z_LAYER.modal}`} data-testid="next-game-flow-layer">
          <NextGameFlow
            userId={accountId ?? undefined}
            onClose={() => setNextGameFlowOpen(false)}
            onMoreSettings={() => {
              setNextGameFlowOpen(false);
              openFullNewGame();
            }}
          />
        </div>,
        document.body,
      )}
    </>
  );
}
