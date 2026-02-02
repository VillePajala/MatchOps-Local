import type { Dispatch, SetStateAction } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';

import { queryKeys } from '@/config/queryKeys';
import { CUSTOM_LEAGUE_ID } from '@/config/leagues';
import logger from '@/utils/logger';
import * as Sentry from '@sentry/nextjs';
import type { AppState, Player, SavedGamesCollection, GameType, Gender } from '@/types';
import type { GameSessionAction } from '@/hooks/useGameSessionReducer';
import type { ResourceType } from '@/config/premiumLimits';

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
  // Premium limit checking
  canCreate: (resource: ResourceType, currentCount: number) => boolean;
  showUpgradePrompt: (resource?: ResourceType, currentCount?: number) => void;
  // User-scoped storage
  userId?: string;
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
  gameType: GameType;
  gender: Gender | undefined;
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
    gameType,
    gender,
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
    canCreate,
    showUpgradePrompt,
    userId,
  } = deps;

  // Premium limit check: count games in the selected season or tournament
  // Limit applies per-competition (10 games per season OR 10 games per tournament)
  if (seasonId || tournamentId) {
    const competitionId = seasonId || tournamentId;
    const isSeasonGame = !!seasonId;

    // Count existing games in this competition
    const gamesInCompetition = Object.values(savedGames).filter(game => {
      if (isSeasonGame) {
        return game.seasonId === competitionId;
      } else {
        return game.tournamentId === competitionId;
      }
    }).length;

    if (!canCreate('game', gamesInCompetition)) {
      showUpgradePrompt('game', gamesInCompetition);
      return;
    }
  }

  const finalSelectedPlayerIds =
    initialSelectedPlayerIds && initialSelectedPlayerIds.length > 0
      ? initialSelectedPlayerIds
      : availablePlayers.map((player) => player.id);

  // Sentry breadcrumb: Game creation started
  const newGameId = `game_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  Sentry.addBreadcrumb({
    category: 'game',
    message: 'New game creation started',
    level: 'info',
    data: {
      gameId: newGameId,
      seasonId: seasonId || undefined,
      tournamentId: tournamentId || undefined,
      teamId: teamId || undefined,
      userId: userId || '(anonymous)',
      playersCount: finalSelectedPlayerIds.length,
    },
  });

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
    // gameType flows from modal → handler → AppState storage
    // It's also tracked in game session reducer for undo/redo history
    gameType,
    // gender flows from modal → handler → AppState storage (optional)
    gender,
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

  // newGameId is already defined above (with Sentry breadcrumb)

  let saveSucceeded = false;
  try {
    const updatedSavedGamesCollection: SavedGamesCollection = {
      ...savedGames,
      [newGameId]: newGameState,
    };

    setSavedGames(updatedSavedGamesCollection);

    await utilSaveGame(newGameId, newGameState, userId);
    await utilSaveCurrentGameIdSetting(newGameId, userId);
    await queryClient.invalidateQueries({ queryKey: [...queryKeys.savedGames, userId] });

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

  // CRITICAL: Update gameSessionState BEFORE setCurrentGameId to prevent auto-save race condition.
  // When setCurrentGameId triggers a re-render, auto-save may run and createGameSnapshot() reads
  // from gameSessionState. Without this dispatch, gameSessionState still has OLD game data,
  // causing auto-save to overwrite the new game with old data.
  // See: https://github.com/... (race condition investigation)
  dispatchGameSession({
    type: 'LOAD_GAME_SESSION_STATE',
    payload: {
      teamName: homeTeamName,
      opponentName,
      gameDate,
      gameLocation,
      gameTime,
      homeScore: 0,
      awayScore: 0,
      gameNotes: '',
      homeOrAway,
      numberOfPeriods: numPeriods,
      periodDurationMinutes: periodDuration,
      currentPeriod: 1,
      gameStatus: 'notStarted',
      selectedPlayerIds: finalSelectedPlayerIds,
      gamePersonnel: selectedPersonnelIds,
      seasonId: seasonId || '',
      tournamentId: tournamentId || '',
      leagueId: leagueId || undefined,
      customLeagueName: leagueId === CUSTOM_LEAGUE_ID ? customLeagueName || undefined : undefined,
      teamId: teamId || undefined,
      gameType,
      gender,
      ageGroup,
      tournamentLevel,
      tournamentSeriesId: tournamentSeriesId || undefined,
      demandFactor,
      gameEvents: [],
      // Timer state - fresh game starts with timer at zero
      timeElapsedInSeconds: 0,
      startTimestamp: null,
      isTimerRunning: false,
      subIntervalMinutes: defaultSubIntervalMinutes,
      nextSubDueTimeSeconds: defaultSubIntervalMinutes * 60,
      subAlertLevel: 'none',
      lastSubConfirmationTimeSeconds: 0,
      completedIntervalDurations: [],
      showPlayerNames: true,
    },
  });

  setIsPlayed(isPlayed);

  // Sentry breadcrumb: About to set current game ID (triggers auto-save)
  Sentry.addBreadcrumb({
    category: 'game',
    message: 'Setting currentGameId (may trigger auto-save)',
    level: 'info',
    data: { gameId: newGameId },
  });

  setCurrentGameId(newGameId);
  logger.log(`Set current game ID to: ${newGameId}. Loading useEffect will sync component state.`);

  // Sentry breadcrumb: Game creation completed
  Sentry.addBreadcrumb({
    category: 'game',
    message: 'New game creation completed',
    level: 'info',
    data: { gameId: newGameId },
  });

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
