import type { Dispatch, SetStateAction } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';

import { queryKeys } from '@/config/queryKeys';
import { CUSTOM_LEAGUE_ID } from '@/config/leagues';
import logger from '@/utils/logger';
import type { AppState, Player, SavedGamesCollection } from '@/types';
import type { GameSessionAction } from '@/hooks/useGameSessionReducer';

type ToastFn = (message: string, type?: 'success' | 'error' | 'info') => void;
type SaveGameFn = typeof import('@/utils/savedGames').saveGame;
type SaveCurrentGameIdSettingFn = typeof import('@/utils/appSettings').saveCurrentGameIdSetting;

export interface StartNewGameDependencies {
  availablePlayers: Player[];
  savedGames: SavedGamesCollection;
  setSavedGames: Dispatch<SetStateAction<SavedGamesCollection>>;
  resetHistory: (state: AppState) => void;
  dispatchGameSession: Dispatch<GameSessionAction>;
  setCurrentGameId: (gameId: string | null) => void;
  closeNewGameSetupModal: () => void;
  setNewGameDemandFactor: (value: number) => void;
  setPlayerIdsForNewGame: (ids: string[] | null) => void;
  setHighlightRosterButton: (isHighlighted: boolean) => void;
  setIsPlayed: (isPlayed: boolean) => void;
  queryClient: QueryClient;
  showToast: ToastFn;
  t: TFunction;
  utilSaveGame: SaveGameFn;
  utilSaveCurrentGameIdSetting: SaveCurrentGameIdSettingFn;
  defaultSubIntervalMinutes: number;
}

export interface StartNewGameRequest {
  initialSelectedPlayerIds: string[];
  homeTeamName: string;
  opponentName: string;
  gameDate: string;
  gameLocation: string;
  gameTime: string;
  seasonId: string | null;
  tournamentId: string | null;
  numPeriods: 1 | 2;
  periodDuration: number;
  homeOrAway: 'home' | 'away';
  demandFactor: number;
  ageGroup: string;
  tournamentLevel: string;
  tournamentSeriesId: string | null;
  isPlayed: boolean;
  teamId: string | null;
  availablePlayersForGame: Player[];
  selectedPersonnelIds: string[];
  leagueId: string;
  customLeagueName: string;
}

export async function startNewGameWithSetup(
  deps: StartNewGameDependencies,
  request: StartNewGameRequest
): Promise<void> {
  const {
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
  } = request;
  const {
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
  } = deps;

  const finalSelectedPlayerIds =
    initialSelectedPlayerIds && initialSelectedPlayerIds.length > 0
      ? initialSelectedPlayerIds
      : availablePlayers.map((player) => player.id);

  const newGameState: AppState = {
    opponentName,
    gameDate,
    gameLocation,
    gameTime,
    seasonId: seasonId || '',
    tournamentId: tournamentId || '',
    ageGroup,
    tournamentLevel,
    tournamentSeriesId: tournamentSeriesId || undefined,
    numberOfPeriods: numPeriods,
    periodDurationMinutes: periodDuration,
    homeScore: 0,
    awayScore: 0,
    gameNotes: '',
    teamName: homeTeamName,
    homeOrAway,
    demandFactor,
    isPlayed,
    teamId: teamId || undefined,
    leagueId: leagueId || undefined,
    customLeagueName: leagueId === CUSTOM_LEAGUE_ID ? customLeagueName || undefined : undefined,
    availablePlayers: availablePlayersForGame,
    selectedPlayerIds: finalSelectedPlayerIds,
    playersOnField: [],
    opponents: [],
    showPlayerNames: true,
    drawings: [],
    gameEvents: [],
    currentPeriod: 1,
    gameStatus: 'notStarted',
    tacticalDiscs: [],
    tacticalDrawings: [],
    subIntervalMinutes: defaultSubIntervalMinutes,
    completedIntervalDurations: [],
    lastSubConfirmationTimeSeconds: 0,
    tacticalBallPosition: { relX: 0.5, relY: 0.5 },
    gamePersonnel: selectedPersonnelIds,
  };

  const newGameId = `game_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  let saveSucceeded = false;
  try {
    const updatedSavedGamesCollection: SavedGamesCollection = {
      ...savedGames,
      [newGameId]: newGameState,
    };

    setSavedGames(updatedSavedGamesCollection);

    await utilSaveGame(newGameId, newGameState);
    await utilSaveCurrentGameIdSetting(newGameId);
    await queryClient.invalidateQueries({ queryKey: queryKeys.savedGames });

    logger.log(`Saved new game ${newGameId} and settings via utility functions.`);
    saveSucceeded = true;
  } catch (error) {
    logger.error('Error explicitly saving new game state:', error);
    showToast(
      t('newGameSetupModal.saveGameFailed', 'Failed to save the new game. Please try again.'),
      'error'
    );

    setSavedGames((prev) => {
      const reverted = { ...prev };
      delete reverted[newGameId];
      return reverted;
    });
  }

  if (!saveSucceeded) {
    return;
  }

  resetHistory(newGameState);
  dispatchGameSession({ type: 'SET_GAME_PERSONNEL', payload: selectedPersonnelIds });
  setIsPlayed(isPlayed);
  setCurrentGameId(newGameId);
  logger.log(`Set current game ID to: ${newGameId}. Loading useEffect will sync component state.`);

  closeNewGameSetupModal();
  setNewGameDemandFactor(1);
  setPlayerIdsForNewGame(null);
  setHighlightRosterButton(true);
}

export interface CancelNewGameDependencies {
  setHasSkippedInitialSetup: (value: boolean) => void;
  closeNewGameSetupModal: () => void;
  setNewGameDemandFactor: (value: number) => void;
  setPlayerIdsForNewGame: (ids: string[] | null) => void;
}

export function cancelNewGameSetup(deps: CancelNewGameDependencies): void {
  const { setHasSkippedInitialSetup, closeNewGameSetupModal, setNewGameDemandFactor, setPlayerIdsForNewGame } =
    deps;

  logger.log('New game setup skipped/cancelled.');
  setHasSkippedInitialSetup(true);
  closeNewGameSetupModal();
  setNewGameDemandFactor(1);
  setPlayerIdsForNewGame(null);
}
