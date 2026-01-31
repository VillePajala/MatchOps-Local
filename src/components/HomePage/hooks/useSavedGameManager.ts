import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';

import { DEFAULT_GAME_ID } from '@/config/constants';
import { queryKeys } from '@/config/queryKeys';
import { useDataStore } from '@/hooks/useDataStore';
import type { AppState, Player, SavedGamesCollection, Team } from '@/types';
import type { GameSessionAction, GameSessionState } from '@/hooks/useGameSessionReducer';
import { saveGame as utilSaveGame, deleteGame as utilDeleteGame, getLatestGameId } from '@/utils/savedGames';
import { saveCurrentGameIdSetting as utilSaveCurrentGameIdSetting } from '@/utils/appSettings';
import { getTeam, getTeams } from '@/utils/teams';
import { clearTimerState } from '@/utils/timerStateManager';
import logger from '@/utils/logger';

interface UseSavedGameManagerOptions {
  savedGames: SavedGamesCollection;
  setSavedGames: Dispatch<SetStateAction<SavedGamesCollection>>;
  currentGameId: string | null;
  setCurrentGameId: (id: string | null) => void;
  availablePlayers: Player[];
  setAvailablePlayers: Dispatch<SetStateAction<Player[]>>;
  masterRoster: Player[] | undefined;
  setPlayersOnField: Dispatch<SetStateAction<AppState['playersOnField']>>;
  setOpponents: Dispatch<SetStateAction<AppState['opponents']>>;
  setDrawings: Dispatch<SetStateAction<AppState['drawings']>>;
  setTacticalDiscs: Dispatch<SetStateAction<AppState['tacticalDiscs']>>;
  setTacticalDrawings: Dispatch<SetStateAction<AppState['tacticalDrawings']>>;
  setTacticalBallPosition: Dispatch<SetStateAction<AppState['tacticalBallPosition']>>;
  setIsPlayed: Dispatch<SetStateAction<boolean>>;
  dispatchGameSession: Dispatch<GameSessionAction>;
  resetHistory: (state: AppState) => void;
  initialState: AppState;
  initialGameSessionData: GameSessionState;
  queryClient: QueryClient;
  t: TFunction;
  onCloseLoadGameModal: () => void;
}

export function useSavedGameManager({
  savedGames,
  setSavedGames,
  currentGameId,
  setCurrentGameId,
  availablePlayers,
  setAvailablePlayers,
  masterRoster,
  setPlayersOnField,
  setOpponents,
  setDrawings,
  setTacticalDiscs,
  setTacticalDrawings,
  setTacticalBallPosition,
  setIsPlayed,
  dispatchGameSession,
  resetHistory,
  initialState,
  initialGameSessionData,
  queryClient,
  t,
  onCloseLoadGameModal,
}: UseSavedGameManagerOptions) {
  const { userId } = useDataStore();
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const [isLoadingGamesList, setIsLoadingGamesList] = useState(false);
  const [loadGamesListError, setLoadGamesListError] = useState<string | null>(null);
  const [isGameLoading, setIsGameLoading] = useState(false);
  const [gameLoadError, setGameLoadError] = useState<string | null>(null);
  const [isGameDeleting, setIsGameDeleting] = useState(false);
  const [gameDeleteError, setGameDeleteError] = useState<string | null>(null);
  const [processingGameId, setProcessingGameId] = useState<string | null>(null);
  const [orphanedGameInfo, setOrphanedGameInfo] = useState<{ teamId: string; teamName?: string } | null>(null);
  const [isTeamReassignModalOpen, setIsTeamReassignModalOpen] = useState(false);
  const [availableTeams, setAvailableTeams] = useState<Team[]>([]);
  const [teamLoadError, setTeamLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!orphanedGameInfo) {
      return;
    }

    // P2-4 fix: Prevent race condition if orphanedGameInfo changes during async operation
    let cancelled = false;

    setTeamLoadError(null); // Clear previous errors
    getTeams(userId)
      .then((teams) => {
        if (!cancelled) {
          setAvailableTeams(teams);
          setTeamLoadError(null); // Success
        }
      })
      .catch((error) => {
        logger.error('[ORPHANED GAME] Error loading teams:', error);
        if (!cancelled) {
          setAvailableTeams([]);
          // Provide user feedback instead of silent failure
          setTeamLoadError(
            t(
              'teamReassignModal.errors.loadFailed',
              'Failed to load teams. Please try refreshing the page or contact support if the problem persists.'
            )
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [orphanedGameInfo, t, userId]);

  const loadGameStateFromData = useCallback(
    async (gameData: AppState | null, isInitialDefaultLoad = false) => {
      logger.log('[LOAD GAME STATE] Called', { hasGameData: !!gameData, isInitialDefaultLoad });

      if (gameData?.teamId) {
        try {
          const team = await getTeam(gameData.teamId, userId);
          if (!team) {
            setOrphanedGameInfo({
              teamId: gameData.teamId,
              teamName: gameData.teamName,
            });
          } else {
            setOrphanedGameInfo(null);
          }
        } catch (error) {
          logger.error('[LOAD GAME] Error checking team existence:', error);
          setOrphanedGameInfo({ teamId: gameData.teamId, teamName: gameData.teamName });
        }
      } else {
        setOrphanedGameInfo(null);
      }

      if (gameData) {
        dispatchGameSession({
          type: 'LOAD_PERSISTED_GAME_DATA',
          payload: {
            teamName: gameData.teamName,
            opponentName: gameData.opponentName,
            gameDate: gameData.gameDate,
            homeScore: gameData.homeScore,
            awayScore: gameData.awayScore,
            gameNotes: gameData.gameNotes,
            homeOrAway: gameData.homeOrAway,
            numberOfPeriods: gameData.numberOfPeriods,
            periodDurationMinutes: gameData.periodDurationMinutes,
            currentPeriod: gameData.currentPeriod,
            gameStatus: gameData.gameStatus,
            selectedPlayerIds: gameData.selectedPlayerIds,
            gamePersonnel: Array.isArray(gameData.gamePersonnel) ? gameData.gamePersonnel : [],
            seasonId: gameData.seasonId ?? undefined,
            tournamentId: gameData.tournamentId ?? undefined,
            teamId: gameData.teamId,
            gameLocation: gameData.gameLocation,
            gameTime: gameData.gameTime,
            demandFactor: gameData.demandFactor,
            gameEvents: gameData.gameEvents,
            subIntervalMinutes: gameData.subIntervalMinutes,
            completedIntervalDurations: gameData.completedIntervalDurations,
            lastSubConfirmationTimeSeconds: gameData.lastSubConfirmationTimeSeconds,
            showPlayerNames: gameData.showPlayerNames,
            timeElapsedInSeconds: gameData.timeElapsedInSeconds,
          },
        });
      } else {
        dispatchGameSession({ type: 'RESET_TO_INITIAL_STATE', payload: initialGameSessionData });
        setIsPlayed(true);
      }

      setPlayersOnField(gameData?.playersOnField || (isInitialDefaultLoad ? initialState.playersOnField : []));
      setOpponents(gameData?.opponents || (isInitialDefaultLoad ? initialState.opponents : []));
      setDrawings(gameData?.drawings || (isInitialDefaultLoad ? initialState.drawings : []));
      setTacticalDiscs(gameData?.tacticalDiscs || (isInitialDefaultLoad ? initialState.tacticalDiscs : []));
      setTacticalDrawings(gameData?.tacticalDrawings || (isInitialDefaultLoad ? initialState.tacticalDrawings : []));
      setTacticalBallPosition(gameData?.tacticalBallPosition || { relX: 0.5, relY: 0.5 });
      setIsPlayed(gameData?.isPlayed === false ? false : true);
      setAvailablePlayers(gameData?.availablePlayers || masterRoster || availablePlayers);

      // CRITICAL: Reset undo/redo history to match loaded game state
      // Without this, pressing Undo after loading will revert to the previous game's state
      if (gameData) {
        resetHistory(gameData);
      } else {
        resetHistory(initialState);
      }
    },
    [
      dispatchGameSession,
      initialGameSessionData,
      initialState,
      masterRoster,
      availablePlayers,
      setAvailablePlayers,
      setDrawings,
      setOpponents,
      setPlayersOnField,
      setTacticalBallPosition,
      setTacticalDiscs,
      setTacticalDrawings,
      setIsPlayed,
      resetHistory,
      userId,
    ],
  );

  const handleLoadGame = useCallback(
    async (gameId: string) => {
      logger.log('[LOAD GAME] Attempting to load game', gameId);

      // Clear any existing timer state before loading a new game (user-scoped)
      // Note: clearTimerState() handles errors internally (non-critical), so no try/catch needed
      await clearTimerState(userId);

      if (!isMountedRef.current) return;

      setProcessingGameId(gameId);
      setIsGameLoading(true);
      setGameLoadError(null);

      const gameDataToLoad = savedGames[gameId] as AppState | undefined;

      if (!gameDataToLoad) {
        if (isMountedRef.current) {
          setGameLoadError(
            t('loadGameModal.errors.notFound', 'Could not find saved game: {gameId}', {
              gameId,
            }),
          );
          setIsGameLoading(false);
          setProcessingGameId(null);
        }
        return;
      }

      try {
        await loadGameStateFromData(gameDataToLoad);
        if (!isMountedRef.current) return;

        setCurrentGameId(gameId);
        await utilSaveCurrentGameIdSetting(gameId, userId);
        onCloseLoadGameModal();
      } catch (error) {
        logger.error('[LOAD GAME] Error processing game load:', error);
        if (isMountedRef.current) {
          setGameLoadError(t('loadGameModal.errors.loadFailed', 'Error loading game state. Please try again.'));
        }
      } finally {
        if (isMountedRef.current) {
          setIsGameLoading(false);
          setProcessingGameId(null);
        }
      }
    },
    [loadGameStateFromData, savedGames, setCurrentGameId, t, onCloseLoadGameModal, userId],
  );

  const handleDeleteGame = useCallback(
    async (gameId: string) => {
      logger.log('[DELETE GAME] Request for game', gameId);
      if (gameId === DEFAULT_GAME_ID) {
        setGameDeleteError(
          t('loadGameModal.errors.cannotDeleteDefault', 'Cannot delete the current unsaved game progress.'),
        );
        return;
      }

      setGameDeleteError(null);
      setIsGameDeleting(true);
      setProcessingGameId(gameId);

      try {
        const deletedGameId = await utilDeleteGame(gameId, userId);

        if (!deletedGameId) {
          setGameDeleteError(
            t('loadGameModal.errors.deleteFailedNotFound', 'Error deleting game: {gameId}.', { gameId }),
          );
          return;
        }

        const updatedSavedGames = { ...savedGames };
        delete updatedSavedGames[gameId];
        setSavedGames(updatedSavedGames);
        await queryClient.invalidateQueries({ queryKey: [...queryKeys.savedGames, userId] });

        if (currentGameId === gameId) {
          const latestId = getLatestGameId(updatedSavedGames);
          if (latestId) {
            setCurrentGameId(latestId);
            await utilSaveCurrentGameIdSetting(latestId, userId);
          } else {
            dispatchGameSession({ type: 'RESET_TO_INITIAL_STATE', payload: initialGameSessionData });
            setPlayersOnField(initialState.playersOnField || []);
            setOpponents(initialState.opponents || []);
            setDrawings(initialState.drawings || []);
            setTacticalDiscs(initialState.tacticalDiscs || []);
            setTacticalDrawings(initialState.tacticalDrawings || []);
            setTacticalBallPosition(initialState.tacticalBallPosition || { relX: 0.5, relY: 0.5 });
            resetHistory(initialState);
            setCurrentGameId(DEFAULT_GAME_ID);
            await utilSaveCurrentGameIdSetting(DEFAULT_GAME_ID, userId);
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        setGameDeleteError(
          t('loadGameModal.errors.deleteFailedCatch', 'Error deleting saved game: {gameId}. Details: {errorMessage}', {
            gameId,
            errorMessage,
          }),
        );
      } finally {
        setIsGameDeleting(false);
        setProcessingGameId(null);
      }
    },
    [
      currentGameId,
      dispatchGameSession,
      initialGameSessionData,
      initialState,
      queryClient,
      resetHistory,
      savedGames,
      setCurrentGameId,
      setDrawings,
      setOpponents,
      setPlayersOnField,
      setSavedGames,
      setTacticalBallPosition,
      setTacticalDiscs,
      setTacticalDrawings,
      t,
      userId,
    ],
  );

  const handleTeamReassignment = useCallback(
    async (newTeamId: string | null) => {
      if (!currentGameId || currentGameId === DEFAULT_GAME_ID) {
        logger.error('[TEAM REASSIGN] No current game to reassign');
        return;
      }

      try {
        const currentGame = savedGames[currentGameId];
        if (!currentGame) {
          logger.error('[TEAM REASSIGN] Current game not found');
          return;
        }

        const updatedGame: AppState = {
          ...currentGame,
          teamId: newTeamId || undefined,
        };

        await utilSaveGame(currentGameId, updatedGame, userId);
        setSavedGames((prev) => ({ ...prev, [currentGameId]: updatedGame }));
        await queryClient.invalidateQueries({ queryKey: [...queryKeys.savedGames, userId] });

        if (newTeamId) {
          setOrphanedGameInfo(null);
        }
        setIsTeamReassignModalOpen(false);
        logger.log('[TEAM REASSIGN] Game reassigned to team:', newTeamId);
      } catch (error) {
        logger.error('[TEAM REASSIGN] Error reassigning team:', error);
      }
    },
    [currentGameId, queryClient, savedGames, setSavedGames, userId],
  );

  return {
    isLoadingGamesList,
    setIsLoadingGamesList,
    loadGamesListError,
    setLoadGamesListError,
    isGameLoading,
    gameLoadError,
    isGameDeleting,
    gameDeleteError,
    processingGameId,
    orphanedGameInfo,
    isTeamReassignModalOpen,
    setIsTeamReassignModalOpen,
    availableTeams,
    teamLoadError, // P0-2 fix: Expose team loading error for user feedback
    loadGameStateFromData,
    handleLoadGame,
    handleDeleteGame,
    handleTeamReassignment,
  };
}

export type UseSavedGameManagerReturn = ReturnType<typeof useSavedGameManager>;
