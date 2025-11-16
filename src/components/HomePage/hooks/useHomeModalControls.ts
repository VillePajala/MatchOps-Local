import { useCallback, useEffect, useRef } from 'react';
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

  // Track processed initialAction to prevent infinite loops
  // (modal setters from ModalProvider are recreated on each render)
  const processedActionRef = useRef<InitialAction | undefined>(undefined);

  // Handle initialAction routing (close all modals first to ensure exclusivity)
  useEffect(() => {
    // Reset tracking if initialAction is cleared
    if (!initialAction) {
      processedActionRef.current = undefined;
      return;
    }

    // Only process if initialAction changed
    if (processedActionRef.current === initialAction) {
      return;
    }

    // Mark this action as processed
    processedActionRef.current = initialAction;

    // Close all modals inline (avoids circular dependency through closeAllModals)
    setIsGameSettingsModalOpen(false);
    setIsLoadGameModalOpen(false);
    setIsRosterModalOpen(false);
    setIsSeasonTournamentModalOpen(false);
    setIsTrainingResourcesOpen(false);
    setIsGoalLogModalOpen(false);
    setIsGameStatsModalOpen(false);
    setIsNewGameSetupModalOpen(false);
    setIsSettingsModalOpen(false);
    setIsPlayerAssessmentModalOpen(false);

    // Open the requested modal/action
    switch (initialAction) {
      case 'newGame':
        onRequestNewGameFromShortcut?.();
        break;
      case 'loadGame':
        setIsLoadGameModalOpen(true);
        break;
      case 'season':
        setIsSeasonTournamentModalOpen(true);
        break;
      case 'stats':
        setIsGameStatsModalOpen(true);
        break;
      case 'roster':
        setIsRosterModalOpen(true);
        break;
      case 'teams':
        onOpenTeamManager?.();
        break;
      case 'settings':
        setIsSettingsModalOpen(true);
        break;
      default:
        break;
    }
    // Only depend on initialAction to avoid infinite loops from recreated setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAction]);

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
