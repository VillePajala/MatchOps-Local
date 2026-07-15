/**
 * New-game controller for the page-level ClubModalsHost (two-level
 * restructure, L.3b - the create-side level crossing).
 *
 * NewGameSetupModal renders in the host, so the setup form works WITHOUT the
 * match view mounted. Confirming is the level crossing: build + persist the
 * game as current (buildAndPersistNewGame), then hand over to the page's
 * `enterMatch` contract - a FRESH match mount whose existing boot path loads
 * the persisted id. This replaces the old match-side session apply (field
 * clearing, reducer LOAD_GAME_SESSION_STATE, setCurrentGameId) entirely; the
 * in-match "new game" flows open this same host modal and get the same fresh
 * mount. (One deliberate retirement: the post-create roster-button highlight,
 * which cannot survive a remount and predates the roster CTA redesign.)
 */
import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/config/queryKeys';
import { useDataStore } from '@/hooks/useDataStore';
import { useToast } from '@/contexts/ToastProvider';
import { usePremium } from '@/hooks/usePremium';
import { getSavedGames, saveGame as utilSaveGame } from '@/utils/savedGames';
import { saveCurrentGameIdSetting as utilSaveCurrentGameIdSetting } from '@/utils/appSettings';
import { getMasterRoster } from '@/utils/masterRosterManager';
import { clearTimerState } from '@/utils/timerStateManager';
import { clearTimerAnchor } from '@/utils/timerAnchor';
import {
  buildAndPersistNewGame,
  type StartNewGameRequest,
} from '@/components/HomePage/utils/newGameHandlers';
import type { SavedGamesCollection } from '@/types';

/** Matches initialState.subIntervalMinutes on the match side. */
const DEFAULT_SUB_INTERVAL_MINUTES = 5;

export interface UseNewGameSetupControllerArgs {
  /** The page's level-crossing: the game is persisted as current - close the
   *  modal and freshly mount the match view (which boots it). NOT called when
   *  creation was blocked (premium limit) or the save failed. */
  onGameCreated: (gameId: string) => void;
}

export function useNewGameSetupController({ onGameCreated }: UseNewGameSetupControllerArgs) {
  const { t } = useTranslation();
  const { userId } = useDataStore();
  const { showToast } = useToast();
  const { canCreate, showUpgradePrompt } = usePremium();
  const queryClient = useQueryClient();

  // Shared query keys - same cache as the game side.
  const savedGamesQuery = useQuery<SavedGamesCollection | null, Error>({
    queryKey: [...queryKeys.savedGames, userId],
    queryFn: () => getSavedGames(userId),
  });
  const masterRosterQuery = useQuery({
    queryKey: [...queryKeys.masterRoster, userId],
    queryFn: () => getMasterRoster(userId),
  });

  const savedGamesData = savedGamesQuery.data;
  const savedGames = useMemo(() => savedGamesData ?? {}, [savedGamesData]);
  const masterRosterData = masterRosterQuery.data;
  const masterRoster = useMemo(() => masterRosterData ?? [], [masterRosterData]);

  const [isCreatingGame, setIsCreatingGame] = useState(false);
  // The modal's difficulty slider state - lives here since the modal renders
  // only at host level now. Reset to neutral whenever the modal closes.
  const [newGameDemandFactor, setNewGameDemandFactor] = useState(1);

  // The level crossing. Signature matches NewGameSetupModal's onStart.
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
      availablePlayersForGame: StartNewGameRequest['availablePlayersForGame'],
      selectedPersonnelIds: string[],
      leagueId: string,
      customLeagueName: string,
      gameType: StartNewGameRequest['gameType'],
      gender: StartNewGameRequest['gender'],
      prefill?: StartNewGameRequest['prefill'],
    ) => {
      setIsCreatingGame(true);
      try {
        // Same pre-switch hygiene as picking a saved game (L.3a): stale timer
        // state or a wall-clock anchor from the previous game must not replay
        // onto the fresh mount that boots the new one.
        await clearTimerState(userId);
        clearTimerAnchor();

        const result = await buildAndPersistNewGame(
          {
            availablePlayers: masterRoster,
            savedGames,
            queryClient,
            showToast,
            t,
            utilSaveGame,
            utilSaveCurrentGameIdSetting,
            defaultSubIntervalMinutes: DEFAULT_SUB_INTERVAL_MINUTES,
            canCreate,
            showUpgradePrompt,
            userId,
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
            gameType,
            gender,
            prefill,
          },
        );

        // Blocked (premium) or failed (toast shown) - keep the modal open so
        // nothing the coach typed is lost.
        if (!result) return;

        setNewGameDemandFactor(1);
        onGameCreated(result.gameId);
      } finally {
        setIsCreatingGame(false);
      }
    },
    [masterRoster, savedGames, queryClient, showToast, t, canCreate, showUpgradePrompt, userId, onGameCreated],
  );

  // Cancel/close housekeeping (the host also clears the shared prefill and
  // the open flag). No setHasSkippedInitialSetup: the auto-open trigger it
  // served is inert - the page always mounts HomePage with skipInitialSetup.
  const handleCancelNewGameSetup = useCallback(() => {
    setNewGameDemandFactor(1);
  }, []);

  return {
    savedGames,
    masterRoster,
    isRosterLoading: masterRosterQuery.isLoading,
    isCreatingGame,
    newGameDemandFactor,
    setNewGameDemandFactor,
    handleStartNewGameWithSetup,
    handleCancelNewGameSetup,
  };
}

export default useNewGameSetupController;
