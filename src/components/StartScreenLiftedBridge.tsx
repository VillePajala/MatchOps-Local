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
import StartScreen from '@/components/StartScreen';
import { useModalContext } from '@/contexts/ModalProvider';

type StartScreenProps = React.ComponentProps<typeof StartScreen>;

/** The entries whose modals render in ClubModalsHost - opened in place. */
type LiftedHandlerProps =
  | 'onLoadGame'
  | 'onNewGame'
  | 'onOpenPlanner'
  | 'onViewStats'
  | 'onViewStatsTab'
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
  | 'onOpenSettings';

export type StartScreenLiftedBridgeProps = Omit<StartScreenProps, LiftedHandlerProps> & {
  /** Called after a setup-relevant modal (roster/teams/competitions/new game)
      closes, so page.tsx can re-check its Home flags - adding players there must
      graduate a first-time user off the first-run panel to the normal Home. */
  onSetupModalsClosed?: () => void;
};

export default function StartScreenLiftedBridge({ onSetupModalsClosed, ...props }: StartScreenLiftedBridgeProps) {
  const {
    setIsLoadGameModalOpen,
    setIsNewGameSetupModalOpen,
    setPlayerIdsForNewGame,
    setIsPlaytimePlannerOpen,
    openClubStatsToTab,
    setIsRosterModalOpen,
    setIsTeamManagerOpen,
    setIsPersonnelManagerOpen,
    setIsSeasonTournamentModalOpen,
    setCompetitionManagerKind,
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
  } = useModalContext();

  // The page's Home flags (hasPlayers -> isFirstTimeUser, the setup tracker) are
  // snapshotted in checkAppState and don't refresh when a club modal closes.
  // After a setup modal closes, ask page to re-check so the Home reflects the
  // change (e.g. added players -> not a first-time user anymore).
  const anySetupOpen = isRosterModalOpen || isNewGameSetupModalOpen ||
    isSeasonTournamentModalOpen || isTeamManagerOpen || isPersonnelManagerOpen;
  const prevAnySetupOpen = React.useRef(anySetupOpen);
  React.useEffect(() => {
    if (prevAnySetupOpen.current && !anySetupOpen) onSetupModalsClosed?.();
    prevAnySetupOpen.current = anySetupOpen;
  }, [anySetupOpen, onSetupModalsClosed]);

  return (
    <StartScreen
      {...props}
      onLoadGame={() => setIsLoadGameModalOpen(true)}
      onNewGame={() => {
        // From Home there is no live selection to carry over - null lets the
        // modal default to the full roster. (Match-side openers prefill the
        // current game's selection through the same shared state.)
        setPlayerIdsForNewGame(null);
        setIsNewGameSetupModalOpen(true);
      }}
      onOpenPlanner={() => setIsPlaytimePlannerOpen(true)}
      onViewStats={() => openClubStatsToTab('season')}
      onViewStatsTab={(tab) => openClubStatsToTab(tab)}
      onManageRoster={() => setIsRosterModalOpen(true)}
      onManageTeams={() => setIsTeamManagerOpen(true)}
      onManagePersonnel={() => setIsPersonnelManagerOpen(true)}
      onManageSeasons={() => {
        setCompetitionManagerKind('season');
        setIsSeasonTournamentModalOpen(true);
      }}
      onManageTournaments={() => {
        setCompetitionManagerKind('tournament');
        setIsSeasonTournamentModalOpen(true);
      }}
      onOpenTraining={() => setIsTrainingResourcesOpen(true)}
      onOpenRules={() => setIsRulesDirectoryOpen(true)}
      onOpenGuide={() => setIsInstructionsModalOpen(true)}
      onOpenBackup={() => openSettingsToTab('data')}
      onOpenAccount={() => openSettingsToTab('account')}
      onOpenSettings={() => setIsSettingsModalOpen(true)}
    />
  );
}
