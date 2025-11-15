import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';

import { DEFAULT_GAME_ID } from '@/config/constants';
import type { AppState, Player, SavedGamesCollection } from '@/types';
import type { GameSessionAction } from '@/hooks/useGameSessionReducer';
import { saveGame as utilSaveGame, getSavedGames as utilGetSavedGames } from '@/utils/savedGames';
import { saveCurrentGameIdSetting as utilSaveCurrentGameIdSetting } from '@/utils/appSettings';
import { startNewGameWithSetup, cancelNewGameSetup } from '../utils/newGameHandlers';
import logger from '@/utils/logger';

type ToastFn = (message: string, type?: 'success' | 'error' | 'info') => void;

interface GameFlowStateContext {
  availablePlayers: Player[];
  savedGames: SavedGamesCollection;
  currentGameId: string | null;
}

interface GameFlowUiContext {
  setIsNewGameSetupModalOpen: (open: boolean) => void;
  setIsRosterModalOpen: (open: boolean) => void;
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

export function useNewGameFlow({
  gameState,
  ui,
  orchestration,
  dependencies,
}: UseNewGameFlowOptions) {
  const { availablePlayers, savedGames, currentGameId } = gameState;
  const {
    setIsNewGameSetupModalOpen,
    setIsRosterModalOpen,
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
    setIsNewGameSetupModalOpen(true);
  }, [availablePlayers, setIsNewGameSetupModalOpen]);

  const handleStartNewGame = useCallback(async () => {
    if (availablePlayers.length === 0) {
      setShowNoPlayersConfirm(true);
      return;
    }

    if (currentGameId && currentGameId !== DEFAULT_GAME_ID) {
      let identifier = `ID: ${currentGameId}`;

      try {
        const freshGames = await utilGetSavedGames();
        const snapshotGame = freshGames?.[currentGameId] ?? savedGames[currentGameId];
        if (snapshotGame?.teamName) {
          identifier = `${snapshotGame.teamName} vs ${snapshotGame.opponentName || t('common.unknownOpponent', 'Opponent')}`;
        }
      } catch (error) {
        logger.warn('[useNewGameFlow] Failed to refresh latest saved game snapshot before starting new game', error);
        showToast(
          t(
            'newGameSetupModal.snapshotFallback',
            'Unable to refresh latest save info. Using last stored names.'
          ),
          'info'
        );
        const fallbackGame = savedGames[currentGameId];
        if (fallbackGame?.teamName) {
          identifier = `${fallbackGame.teamName} vs ${fallbackGame.opponentName || t('common.unknownOpponent', 'Opponent')}`;
        } else {
          // Missing both fresh and fallback snapshots – keep generic identifier and log once for diagnostics
          logger.warn('[useNewGameFlow] No snapshot found for currentGameId; using generic identifier', { currentGameId, hasFallback: !!fallbackGame });
        }
      }

      setGameIdentifierForSave(identifier);
      setShowSaveBeforeNewConfirm(true);
      return;
    }

    setShowStartNewConfirm(true);
  }, [availablePlayers, currentGameId, savedGames, showToast, t]);

  const handleNoPlayersConfirmed = useCallback(() => {
    setShowNoPlayersConfirm(false);
    setIsRosterModalOpen(true);
  }, [setIsRosterModalOpen]);

  const handleSaveBeforeNewCancelled = useCallback(() => {
    setShowSaveBeforeNewConfirm(false);
    setShowStartNewConfirm(true);
  }, []);

  const handleStartNewConfirmed = useCallback(() => {
    setPlayerIdsForNewGame(availablePlayers.map((player) => player.id));
    setShowStartNewConfirm(false);
    setIsNewGameSetupModalOpen(true);
  }, [availablePlayers, setIsNewGameSetupModalOpen]);

  const openSetupAfterPreSave = useCallback(
    (selectedPlayerIds: string[]) => {
      setPlayerIdsForNewGame(selectedPlayerIds);
      setShowSaveBeforeNewConfirm(false);
      setIsNewGameSetupModalOpen(true);
    },
    [setIsNewGameSetupModalOpen],
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
      isPlayed: boolean,
      teamId: string | null,
      availablePlayersForGame: Player[],
      selectedPersonnelIds: string[],
    ) => {
      await startNewGameWithSetup(
        {
          availablePlayers,
          savedGames,
          setSavedGames,
          resetHistory,
          dispatchGameSession,
          setCurrentGameId,
          setIsNewGameSetupModalOpen,
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
          isPlayed,
          teamId,
          availablePlayersForGame,
          selectedPersonnelIds,
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
      setIsNewGameSetupModalOpen,
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
      setIsNewGameSetupModalOpen,
      setNewGameDemandFactor,
      setPlayerIdsForNewGame,
    });
  }, [setHasSkippedInitialSetup, setIsNewGameSetupModalOpen]);

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
