/**
 * @deprecated DEAD CODE - This hook is not used anywhere in the application.
 * The actual new game flow logic lives in useGameOrchestration.ts (handleStartNewGame).
 * This was created for extraction but never wired up.
 *
 * TODO: Either delete this file and its tests, or complete the extraction by:
 * 1. Using this hook in useGameOrchestration
 * 2. Removing the duplicate handleStartNewGame from useGameOrchestration
 */
import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';

import { DEFAULT_GAME_ID } from '@/config/constants';
import type { AppState, Player, SavedGamesCollection } from '@/types';
import type { GameSessionAction } from '@/hooks/useGameSessionReducer';
import { saveGame as utilSaveGame } from '@/utils/savedGames';
import { saveCurrentGameIdSetting as utilSaveCurrentGameIdSetting } from '@/utils/appSettings';
import { startNewGameWithSetup, cancelNewGameSetup } from '../utils/newGameHandlers';

type ToastFn = (message: string, type?: 'success' | 'error' | 'info') => void;

interface GameFlowStateContext {
  availablePlayers: Player[];
  savedGames: SavedGamesCollection;
  currentGameId: string | null;
}

interface GameFlowUiContext {
  openNewGameSetupModal: () => void;
  closeNewGameSetupModal: () => void;
  openRosterModal: () => void;
  setHasSkippedInitialSetup: Dispatch<SetStateAction<boolean>>;
  setHighlightRosterButton: Dispatch<SetStateAction<boolean>>;
  setIsPlayed: Dispatch<SetStateAction<boolean>>;
}

interface GameFlowOrchestrationContext {
  resetHistory: (state: AppState) => void;
  dispatchGameSession: Dispatch<GameSessionAction>;
  setCurrentGameId: (id: string | null) => void;
  setSavedGames: Dispatch<SetStateAction<SavedGamesCollection>>;
}

interface GameFlowDependencies {
  queryClient: QueryClient;
  showToast: ToastFn;
  t: TFunction;
  defaultSubIntervalMinutes: number;
}

interface UseNewGameFlowOptions {
  gameState: GameFlowStateContext;
  ui: GameFlowUiContext;
  orchestration: GameFlowOrchestrationContext;
  dependencies: GameFlowDependencies;
}

/**
 * Coordinates the user journey for creating a new game.
 *
 * Groups the game state, UI setters, orchestration hooks, and infra dependencies
 * so all confirmation dialogs (no players, save-before-new, start-new) and the
 * reducer-driven modal helpers stay in sync while Layer 2 refactoring proceeds.
 */
export function useNewGameFlow({
  gameState,
  ui,
  orchestration,
  dependencies,
}: UseNewGameFlowOptions) {
  const { availablePlayers, savedGames, currentGameId } = gameState;
  const {
    openNewGameSetupModal,
    closeNewGameSetupModal,
    openRosterModal,
    setHasSkippedInitialSetup,
    setHighlightRosterButton,
    setIsPlayed,
  } = ui;
  const {
    setSavedGames,
    resetHistory,
    dispatchGameSession,
    setCurrentGameId,
  } = orchestration;
  const { queryClient, showToast, t, defaultSubIntervalMinutes } = dependencies;

  const [playerIdsForNewGame, setPlayerIdsForNewGame] = useState<string[] | null>(null);
  const [newGameDemandFactor, setNewGameDemandFactor] = useState(1);
  const [showNoPlayersConfirm, setShowNoPlayersConfirm] = useState(false);
  const [showSaveBeforeNewConfirm, setShowSaveBeforeNewConfirm] = useState(false);
  const [gameIdentifierForSave, setGameIdentifierForSave] = useState('');
  const [showStartNewConfirm, setShowStartNewConfirm] = useState(false);

  const handleInitialActionNewGame = useCallback(() => {
    if (availablePlayers.length === 0) {
      setShowNoPlayersConfirm(true);
      return;
    }
    openNewGameSetupModal();
  }, [availablePlayers, openNewGameSetupModal]);

  const handleStartNewGame = useCallback(async () => {
    if (availablePlayers.length === 0) {
      setShowNoPlayersConfirm(true);
      return;
    }

    // Only prompt to save for unsaved scratch games (DEFAULT_GAME_ID)
    // Saved games are auto-saved, so no prompt needed
    if (currentGameId === DEFAULT_GAME_ID) {
      setGameIdentifierForSave(t('controlBar.unsavedGame', 'Unsaved game'));
      setShowSaveBeforeNewConfirm(true);
      return;
    }

    // For saved games (auto-saved), go directly to new game setup modal
    setPlayerIdsForNewGame([]); // Start with no players pre-selected
    openNewGameSetupModal();
  }, [availablePlayers.length, currentGameId, t, openNewGameSetupModal]);

  const handleNoPlayersConfirmed = useCallback(() => {
    setShowNoPlayersConfirm(false);
    openRosterModal();
  }, [openRosterModal]);

  const handleSaveBeforeNewCancelled = useCallback(() => {
    setShowSaveBeforeNewConfirm(false);
    setShowStartNewConfirm(true);
  }, []);

  const handleStartNewConfirmed = useCallback(() => {
    setPlayerIdsForNewGame([]); // Start with no players pre-selected
    setShowStartNewConfirm(false);
    openNewGameSetupModal();
  }, [openNewGameSetupModal]);

  const openSetupAfterPreSave = useCallback(
    (selectedPlayerIds: string[]) => {
      setPlayerIdsForNewGame(selectedPlayerIds);
      setShowSaveBeforeNewConfirm(false);
      openNewGameSetupModal();
    },
    [openNewGameSetupModal],
  );

  const handleStartNewGameWithSetup = useCallback(
    async (
      initialSelectedPlayerIds: string[],
      homeTeamName: string,
      opponentName: string,
      gameDate: string,
      gameLocation: string,
      gameTime: string,
      seasonId: string | null,
      tournamentId: string | null,
      numPeriods: 1 | 2,
      periodDuration: number,
      homeOrAway: 'home' | 'away',
      demandFactor: number,
      ageGroup: string,
      tournamentLevel: string,
      tournamentSeriesId: string | null,
      isPlayed: boolean,
      teamId: string | null,
      availablePlayersForGame: Player[],
      selectedPersonnelIds: string[],
      leagueId: string,
      customLeagueName: string,
    ) => {
      await startNewGameWithSetup(
        {
          availablePlayers,
          savedGames,
          setSavedGames,
          resetHistory,
          dispatchGameSession,
          setCurrentGameId,
          closeNewGameSetupModal,
          setNewGameDemandFactor,
          setPlayerIdsForNewGame,
          setHighlightRosterButton,
          setIsPlayed,
          queryClient,
          showToast,
          t,
          utilSaveGame,
          utilSaveCurrentGameIdSetting,
          defaultSubIntervalMinutes,
        },
        {
          initialSelectedPlayerIds,
          homeTeamName,
          opponentName,
          gameDate,
          gameLocation,
          gameTime,
          seasonId,
          tournamentId,
          numPeriods,
          periodDuration,
          homeOrAway,
          demandFactor,
          ageGroup,
          tournamentLevel,
          tournamentSeriesId,
          isPlayed,
          teamId,
          availablePlayersForGame,
          selectedPersonnelIds,
          leagueId,
          customLeagueName,
        },
      );
    },
    [
      availablePlayers,
      savedGames,
      setSavedGames,
      resetHistory,
      dispatchGameSession,
      setCurrentGameId,
      closeNewGameSetupModal,
      setHighlightRosterButton,
      setIsPlayed,
      queryClient,
      showToast,
      t,
      defaultSubIntervalMinutes,
    ],
  );

  const handleCancelNewGameSetup = useCallback(() => {
    cancelNewGameSetup({
      setHasSkippedInitialSetup,
      closeNewGameSetupModal,
      setNewGameDemandFactor,
      setPlayerIdsForNewGame,
    });
  }, [setHasSkippedInitialSetup, closeNewGameSetupModal]);

  return {
    playerIdsForNewGame,
    newGameDemandFactor,
    setNewGameDemandFactor,
    showNoPlayersConfirm,
    showSaveBeforeNewConfirm,
    showStartNewConfirm,
    gameIdentifierForSave,
    handleStartNewGame,
    handleInitialActionNewGame,
    handleNoPlayersConfirmed,
    handleSaveBeforeNewCancelled,
    handleStartNewConfirmed,
    openSetupAfterPreSave,
    handleStartNewGameWithSetup,
    handleCancelNewGameSetup,
    setShowSaveBeforeNewConfirm,
    setShowStartNewConfirm,
    setShowNoPlayersConfirm,
  };
}

export type UseNewGameFlowReturn = ReturnType<typeof useNewGameFlow>;
