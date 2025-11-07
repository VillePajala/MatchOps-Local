import { useCallback, useEffect } from 'react';
import { useModalContext } from '@/contexts/ModalProvider';

type InitialAction =
  | 'newGame'
  | 'loadGame'
  | 'resumeGame'
  | 'explore'
  | 'season'
  | 'stats'
  | 'roster'
  | 'teams'
  | 'settings';

interface UseHomeModalControlsOptions {
  initialAction?: InitialAction;
  onRequestNewGameFromShortcut?: () => void;
  onOpenTeamManager?: () => void;
  modalContextOverride?: ReturnType<typeof useModalContext>;
}

export function useHomeModalControls({
  initialAction,
  onRequestNewGameFromShortcut,
  onOpenTeamManager,
  modalContextOverride,
}: UseHomeModalControlsOptions) {
  const modalContextFromProvider = useModalContext();
  const modalContext = modalContextOverride ?? modalContextFromProvider;
  const {
    isGameSettingsModalOpen,
    setIsGameSettingsModalOpen,
    isLoadGameModalOpen,
    setIsLoadGameModalOpen,
    isRosterModalOpen,
    setIsRosterModalOpen,
    isSeasonTournamentModalOpen,
    setIsSeasonTournamentModalOpen,
    isTrainingResourcesOpen,
    setIsTrainingResourcesOpen,
    isGoalLogModalOpen,
    setIsGoalLogModalOpen,
    isGameStatsModalOpen,
    setIsGameStatsModalOpen,
    isNewGameSetupModalOpen,
    setIsNewGameSetupModalOpen,
    isSettingsModalOpen,
    setIsSettingsModalOpen,
    isPlayerAssessmentModalOpen,
    setIsPlayerAssessmentModalOpen,
  } = modalContext;

  const openLoadGameModal = useCallback(() => setIsLoadGameModalOpen(true), [setIsLoadGameModalOpen]);
  const closeLoadGameModal = useCallback(() => setIsLoadGameModalOpen(false), [setIsLoadGameModalOpen]);

  const openSeasonTournamentModal = useCallback(
    () => setIsSeasonTournamentModalOpen(true),
    [setIsSeasonTournamentModalOpen],
  );
  const closeSeasonTournamentModal = useCallback(
    () => setIsSeasonTournamentModalOpen(false),
    [setIsSeasonTournamentModalOpen],
  );

  const openRosterModal = useCallback(() => setIsRosterModalOpen(true), [setIsRosterModalOpen]);
  const closeRosterModal = useCallback(() => setIsRosterModalOpen(false), [setIsRosterModalOpen]);

  const openGameSettingsModal = useCallback(() => setIsGameSettingsModalOpen(true), [setIsGameSettingsModalOpen]);
  const closeGameSettingsModal = useCallback(() => setIsGameSettingsModalOpen(false), [setIsGameSettingsModalOpen]);

  const openSettingsModal = useCallback(() => setIsSettingsModalOpen(true), [setIsSettingsModalOpen]);
  const closeSettingsModal = useCallback(() => setIsSettingsModalOpen(false), [setIsSettingsModalOpen]);

  const openPlayerAssessmentModal = useCallback(
    () => setIsPlayerAssessmentModalOpen(true),
    [setIsPlayerAssessmentModalOpen],
  );
  const closePlayerAssessmentModal = useCallback(
    () => setIsPlayerAssessmentModalOpen(false),
    [setIsPlayerAssessmentModalOpen],
  );

  const openGameStatsModal = useCallback(() => setIsGameStatsModalOpen(true), [setIsGameStatsModalOpen]);

  useEffect(() => {
    if (!initialAction) {
      return;
    }

    switch (initialAction) {
      case 'newGame':
        onRequestNewGameFromShortcut?.();
        break;
      case 'loadGame':
        openLoadGameModal();
        break;
      case 'season':
        openSeasonTournamentModal();
        break;
      case 'stats':
        openGameStatsModal();
        break;
      case 'roster':
        openRosterModal();
        break;
      case 'teams':
        onOpenTeamManager?.();
        break;
      case 'settings':
        openSettingsModal();
        break;
      default:
        break;
    }
  }, [
    initialAction,
    onRequestNewGameFromShortcut,
    onOpenTeamManager,
    openLoadGameModal,
    openSeasonTournamentModal,
    openGameStatsModal,
    openRosterModal,
    openSettingsModal,
  ]);

  return {
    modalState: {
      isGameSettingsModalOpen,
      setIsGameSettingsModalOpen,
      isLoadGameModalOpen,
      setIsLoadGameModalOpen,
      isRosterModalOpen,
      setIsRosterModalOpen,
      isSeasonTournamentModalOpen,
      setIsSeasonTournamentModalOpen,
      isTrainingResourcesOpen,
      setIsTrainingResourcesOpen,
      isGoalLogModalOpen,
      setIsGoalLogModalOpen,
      isGameStatsModalOpen,
      setIsGameStatsModalOpen,
      isNewGameSetupModalOpen,
      setIsNewGameSetupModalOpen,
      isSettingsModalOpen,
      setIsSettingsModalOpen,
      isPlayerAssessmentModalOpen,
      setIsPlayerAssessmentModalOpen,
    },
    openLoadGameModal,
    closeLoadGameModal,
    openSeasonTournamentModal,
    closeSeasonTournamentModal,
    openRosterModal,
    closeRosterModal,
    openGameSettingsModal,
    closeGameSettingsModal,
    openSettingsModal,
    closeSettingsModal,
    openPlayerAssessmentModal,
    closePlayerAssessmentModal,
  };
}
