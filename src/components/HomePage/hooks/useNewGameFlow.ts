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

interface UseNewGameFlowOptions {
  availablePlayers: Player[];
  savedGames: SavedGamesCollection;
  setSavedGames: Dispatch<SetStateAction<SavedGamesCollection>>;
  currentGameId: string | null;
  setIsNewGameSetupModalOpen: (open: boolean) => void;
  setIsRosterModalOpen: (open: boolean) => void;
  setHasSkippedInitialSetup: Dispatch<SetStateAction<boolean>>;
  setHighlightRosterButton: Dispatch<SetStateAction<boolean>>;
  setIsPlayed: Dispatch<SetStateAction<boolean>>;
  resetHistory: (state: AppState) => void;
  dispatchGameSession: Dispatch<GameSessionAction>;
  setCurrentGameId: (id: string | null) => void;
  queryClient: QueryClient;
  showToast: ToastFn;
  t: TFunction;
  defaultSubIntervalMinutes: number;
}

export function useNewGameFlow({
  availablePlayers,
  savedGames,
  setSavedGames,
  currentGameId,
  setIsNewGameSetupModalOpen,
  setIsRosterModalOpen,
  setHasSkippedInitialSetup,
  setHighlightRosterButton,
  setIsPlayed,
  resetHistory,
  dispatchGameSession,
  setCurrentGameId,
  queryClient,
  showToast,
  t,
  defaultSubIntervalMinutes,
}: UseNewGameFlowOptions) {
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

  const handleStartNewGame = useCallback(() => {
    if (availablePlayers.length === 0) {
      setShowNoPlayersConfirm(true);
      return;
    }

    if (currentGameId && currentGameId !== DEFAULT_GAME_ID) {
      const gameData = savedGames[currentGameId];
      const identifier = gameData?.teamName
        ? `${gameData.teamName} vs ${gameData.opponentName}`
        : `ID: ${currentGameId}`;
      setGameIdentifierForSave(identifier);
      setShowSaveBeforeNewConfirm(true);
      return;
    }

    setShowStartNewConfirm(true);
  }, [availablePlayers, currentGameId, savedGames]);

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
