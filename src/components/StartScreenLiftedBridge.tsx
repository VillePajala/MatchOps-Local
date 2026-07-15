'use client';

/**
 * Bridges Home-screen taps for LIFTED modals straight to ModalProvider state
 * (two-level restructure, L.2). Before this, every StartScreen entry routed
 * through page.tsx's handleAction -> setScreen('home'), which mounted the
 * whole match view just to float a modal over it - the facade the L-waves
 * exist to remove. Match-bound actions (resume, new game, load, planner,
 * stats) still come in via props from page.tsx and switch screens.
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
