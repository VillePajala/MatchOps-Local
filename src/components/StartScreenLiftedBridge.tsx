'use client';

/**
 * Bridges Home-screen taps for LIFTED modals straight to ModalProvider state
 * (two-level restructure, L.2). Before this, every StartScreen entry routed
 * through page.tsx's handleAction -> setScreen('home'), which mounted the
 * whole match view just to float a modal over it - the facade the L-waves
 * exist to remove. Match-bound actions (resume, planner, stats, the
 * first-time Get Started) still come in via props from page.tsx and switch
 * screens; New Game (L.3b) and Load Game (L.3a) open in place and only
 * enter the match once a game is actually picked/created.
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
  | 'onManageRoster'
  | 'onManageTeams'
  | 'onManagePersonnel'
  | 'onManageSeasons'
  | 'onOpenTraining'
  | 'onOpenBackup'
  | 'onOpenAccount'
  | 'onOpenRules'
  | 'onOpenSettings';

export type StartScreenLiftedBridgeProps = Omit<StartScreenProps, LiftedHandlerProps>;

export default function StartScreenLiftedBridge(props: StartScreenLiftedBridgeProps) {
  const {
    setIsLoadGameModalOpen,
    setIsNewGameSetupModalOpen,
    setPlayerIdsForNewGame,
    setIsRosterModalOpen,
    setIsTeamManagerOpen,
    setIsPersonnelManagerOpen,
    setIsSeasonTournamentModalOpen,
    setIsTrainingResourcesOpen,
    setIsRulesDirectoryOpen,
    setIsSettingsModalOpen,
    openSettingsToTab,
  } = useModalContext();

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
      onManageRoster={() => setIsRosterModalOpen(true)}
      onManageTeams={() => setIsTeamManagerOpen(true)}
      onManagePersonnel={() => setIsPersonnelManagerOpen(true)}
      onManageSeasons={() => setIsSeasonTournamentModalOpen(true)}
      onOpenTraining={() => setIsTrainingResourcesOpen(true)}
      onOpenRules={() => setIsRulesDirectoryOpen(true)}
      onOpenBackup={() => openSettingsToTab('data')}
      onOpenAccount={() => openSettingsToTab('account')}
      onOpenSettings={() => setIsSettingsModalOpen(true)}
    />
  );
}
