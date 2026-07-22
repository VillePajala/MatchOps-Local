/**
 * Club-roster editing handlers for RosterSettingsModal, extracted from
 * useGameOrchestration for L.2 of the two-level restructure: the modal
 * renders in the page-level ClubModalsHost, so its data and handlers must
 * work WITHOUT the match view mounted.
 *
 * Owns its own useRoster instance, kept in sync with the shared masterRoster
 * query (same key as useGameDataQueries - React Query dedupes). Mutations go
 * through useRoster's optimistic-update path, which invalidates the query on
 * settle; the game side (useGameDataManagement's sync effect) picks changes
 * up from the cache, and useGameOrchestration prunes deleted players from
 * the live field/selection (the cascade that used to live in the modal's
 * remove handler).
 *
 * Handler bodies are moved near-verbatim from useGameOrchestration.
 */
import { useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/config/queryKeys';
import { useDataStore } from '@/hooks/useDataStore';
import { useRoster } from '@/hooks/useRoster';
import { getMasterRoster } from '@/utils/masterRosterManager';
import type { Player } from '@/types';
import logger from '@/utils/logger';

const NO_SELECTION: string[] = [];

export interface UseRosterSettingsControllerReturn {
  availablePlayers: Player[];
  isRosterUpdating: boolean;
  rosterError: string | null;
  handleUpdatePlayerForModal: (playerId: string, updates: Partial<Omit<Player, 'id'>>) => Promise<void>;
  handleRenamePlayerForModal: (playerId: string, playerData: { name: string; nickname?: string }) => void;
  handleSetJerseyNumberForModal: (playerId: string, jerseyNumber: string) => void;
  handleSetPlayerNotesForModal: (playerId: string, notes: string) => void;
  handleRemovePlayerForModal: (playerId: string) => void;
  handleAddPlayerForModal: (playerData: { name: string; jerseyNumber: string; notes: string; nickname: string }) => void;
  /** Raw club-write returning the saved player (W1: the new-game picker's
   *  inline add needs the id to select). Callers do their own dup-check. */
  handleAddPlayerReturning: (data: { name: string; nickname?: string }) => Promise<import('@/types').Player | null>;
}

export function useRosterSettingsController(): UseRosterSettingsControllerReturn {
  const { t } = useTranslation();
  const { userId } = useDataStore();

  // Same query key as useGameDataQueries - shared cache, no double fetch.
  const masterRosterQuery = useQuery<Player[], Error>({
    queryKey: [...queryKeys.masterRoster, userId],
    queryFn: () => getMasterRoster(userId),
  });
  const masterRoster = masterRosterQuery.data;

  const {
    availablePlayers,
    setAvailablePlayers,
    isRosterUpdating,
    rosterError,
    setRosterError,
    handleAddPlayer,
    handleUpdatePlayer,
    handleRemovePlayer,
  } = useRoster({ initialPlayers: [], selectedPlayerIds: NO_SELECTION });

  // Adopt the shared query data (plain replace - no per-game goalie merge at
  // club level). useRoster's optimistic updates run between refetches.
  useEffect(() => {
    if (masterRoster) {
      setAvailablePlayers(masterRoster);
    }
  }, [masterRoster, setAvailablePlayers]);

  const handleRenamePlayerForModal = useCallback(async (playerId: string, playerData: { name: string; nickname?: string }) => {
    logger.log(`[useRosterSettingsController] rename attempting mutation for ID: ${playerId}, new name: ${playerData.name}`);
    setRosterError(null); // Clear previous specific errors
    try {
      await handleUpdatePlayer(playerId, { name: playerData.name, nickname: playerData.nickname });
      logger.log(`[useRosterSettingsController] rename player success for ${playerId}.`);
    } catch (error) {
      logger.error(`[useRosterSettingsController] Exception during rename of ${playerId}:`, error);
    }
  }, [handleUpdatePlayer, setRosterError]);

  const handleSetJerseyNumberForModal = useCallback(async (playerId: string, jerseyNumber: string) => {
    logger.log(`[useRosterSettingsController] jersey number mutation for ID: ${playerId}, new number: ${jerseyNumber}`);
    setRosterError(null);
    try {
      await handleUpdatePlayer(playerId, { jerseyNumber });
      logger.log(`[useRosterSettingsController] jersey number update successful for ${playerId}.`);
    } catch (error) {
      logger.error(`[useRosterSettingsController] Exception during jersey number update of ${playerId}:`, error);
    }
  }, [handleUpdatePlayer, setRosterError]);

  const handleSetPlayerNotesForModal = useCallback(async (playerId: string, notes: string) => {
    logger.log(`[useRosterSettingsController] notes mutation for ID: ${playerId}`);
    setRosterError(null);
    try {
      await handleUpdatePlayer(playerId, { notes });
      logger.log(`[useRosterSettingsController] notes update successful for ${playerId}.`);
    } catch (error) {
      logger.error(`[useRosterSettingsController] Exception during notes update of ${playerId}:`, error);
    }
  }, [handleUpdatePlayer, setRosterError]);

  // Unified update handler for RosterSettingsModal (prevents race conditions)
  const handleUpdatePlayerForModal = useCallback(async (playerId: string, updates: Partial<Omit<Player, 'id'>>) => {
    logger.log(`[useRosterSettingsController] update mutation for ID: ${playerId}, updates:`, updates);
    setRosterError(null);
    try {
      await handleUpdatePlayer(playerId, updates);
      logger.log(`[useRosterSettingsController] player update successful for ${playerId}.`);
    } catch (error) {
      logger.error(`[useRosterSettingsController] Exception during update of ${playerId}:`, error);
    }
  }, [handleUpdatePlayer, setRosterError]);

  const handleRemovePlayerForModal = useCallback(async (playerId: string) => {
    logger.log(`[useRosterSettingsController] remove mutation for ID: ${playerId}`);
    setRosterError(null);
    try {
      await handleRemovePlayer(playerId);
      logger.log(`[useRosterSettingsController] player removed: ${playerId}.`);
      // NOTE: pruning the removed player from a LIVE game's field/selection is
      // handled by useGameOrchestration's roster-removal effect (it observes
      // the masterRoster query) - this controller has no game in scope.
    } catch (error) {
      logger.error(`[useRosterSettingsController] Exception during removal of ${playerId}:`, error);
    }
  }, [handleRemovePlayer, setRosterError]);

  const handleAddPlayerForModal = useCallback(async (playerData: { name: string; jerseyNumber: string; notes: string; nickname: string }) => {
    logger.log('[useRosterSettingsController] add player:', playerData);
    setRosterError(null); // Clear previous specific errors first

    const currentRoster = masterRoster || [];
    const newNameTrimmedLower = playerData.name.trim().toLowerCase();
    const newNumberTrimmed = playerData.jerseyNumber.trim();

    // Check for empty name after trimming
    if (!newNameTrimmedLower) {
      setRosterError(t('rosterSettingsModal.errors.nameRequired', 'Player name cannot be empty.'));
      return;
    }

    // Check for duplicate name (case-insensitive)
    const nameExists = currentRoster.some(p => p.name.trim().toLowerCase() === newNameTrimmedLower);
    if (nameExists) {
      setRosterError(t('rosterSettingsModal.errors.duplicateName', 'A player with this name already exists. Please use a different name.'));
      return;
    }

    // Check for duplicate jersey number (only if a number is provided and not empty)
    if (newNumberTrimmed) {
      const numberExists = currentRoster.some(p => p.jerseyNumber && p.jerseyNumber.trim() === newNumberTrimmed);
      if (numberExists) {
        setRosterError(t('rosterSettingsModal.errors.duplicateNumber', 'A player with this jersey number already exists. Please use a different number or leave it blank.'));
        return;
      }
    }

    // If all checks pass, proceed with the mutation
    try {
      await handleAddPlayer(playerData);
      logger.log(`[useRosterSettingsController] add player success: ${playerData.name}.`);
    } catch (error) {
      logger.error(`[useRosterSettingsController] Exception during add of player ${playerData.name}:`, error);
      setRosterError(t('rosterSettingsModal.errors.addFailed', 'Error adding player {playerName}. Please try again.', { playerName: playerData.name }));
    }
  }, [masterRoster, handleAddPlayer, t, setRosterError]);

  return {
    availablePlayers,
    isRosterUpdating,
    rosterError,
    handleUpdatePlayerForModal,
    handleRenamePlayerForModal,
    handleSetJerseyNumberForModal,
    handleSetPlayerNotesForModal,
    handleRemovePlayerForModal,
    handleAddPlayerForModal,
    handleAddPlayerReturning: async (data: { name: string; nickname?: string }) => (await handleAddPlayer(data)) ?? null,
  };
}

export default useRosterSettingsController;
