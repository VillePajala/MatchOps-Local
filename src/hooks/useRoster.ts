import { useState, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Player } from '@/types';
import { addPlayer, updatePlayer, removePlayer, setGoalieStatus } from '@/utils/masterRosterManager';
import { queryKeys } from '@/config/queryKeys';
import { useDataStore } from '@/hooks/useDataStore';
import logger from '@/utils/logger';

interface UseRosterArgs {
  initialPlayers: Player[];
  selectedPlayerIds: string[];
}

export const useRoster = ({ initialPlayers, selectedPlayerIds }: UseRosterArgs) => {
  const queryClient = useQueryClient();
  const { userId } = useDataStore();
  const [availablePlayers, setAvailablePlayers] = useState<Player[]>(initialPlayers);
  const [highlightRosterButton, setHighlightRosterButton] = useState(false);
  const [showRosterPrompt, setShowRosterPrompt] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [isRosterUpdating, setIsRosterUpdating] = useState(false);

  const playersForCurrentGame = useMemo(
    () => availablePlayers.filter((p) => selectedPlayerIds.includes(p.id)),
    [availablePlayers, selectedPlayerIds]
  );

  const handleAddPlayer = useCallback(async (
    data: Omit<Player, 'id' | 'isGoalie' | 'receivedFairPlayCard'>,
  ) => {
    const prev = [...availablePlayers];
    const temp: Player = {
      id: `temp-${Date.now()}`,
      isGoalie: false,
      receivedFairPlayCard: false,
      ...data,
    };
    setIsRosterUpdating(true);
    setAvailablePlayers([...availablePlayers, temp]);
    try {
      const saved = await addPlayer(data, userId);
      if (saved) {
        setAvailablePlayers((players) =>
          players.map((p) => (p.id === temp.id ? saved : p)),
        );
        setRosterError(null);
        // Immediately update React Query cache with saved data to prevent stale reads (user-scoped)
        queryClient.setQueryData([...queryKeys.masterRoster, userId], (prev: Player[] | undefined) => {
          if (!prev) return [saved];
          // Replace temp player or add new one
          const hasTemp = prev.some((p) => p.id === temp.id);
          if (hasTemp) {
            return prev.map((p) => (p.id === temp.id ? saved : p));
          }
          return [...prev, saved];
        });
        // Also invalidate to ensure background sync
        await queryClient.invalidateQueries({ queryKey: [...queryKeys.masterRoster, userId] });
      } else {
        setAvailablePlayers(prev);
        setRosterError('Failed to add player');
      }
    } catch (error) {
      logger.warn('Failed to add player to roster', { error });
      setAvailablePlayers(prev);
      setRosterError('Failed to add player');
    } finally {
      setIsRosterUpdating(false);
    }
  }, [availablePlayers, userId, queryClient]);

  const handleUpdatePlayer = useCallback(async (
    playerId: string,
    updates: Partial<Omit<Player, 'id'>>,
  ) => {
    const prev = [...availablePlayers];
    setIsRosterUpdating(true);
    setAvailablePlayers((ps) =>
      ps.map((p) => (p.id === playerId ? { ...p, ...updates } : p)),
    );
    try {
      const updated = await updatePlayer(playerId, updates, userId);
      if (updated) {
        setAvailablePlayers((ps) =>
          ps.map((p) => (p.id === updated.id ? updated : p)),
        );
        setRosterError(null);
        // Immediately update React Query cache with saved data to prevent stale reads (user-scoped)
        queryClient.setQueryData([...queryKeys.masterRoster, userId], (prev: Player[] | undefined) => {
          if (!prev) return prev;
          return prev.map((p) => (p.id === updated.id ? updated : p));
        });
        // Also invalidate to ensure background sync
        await queryClient.invalidateQueries({ queryKey: [...queryKeys.masterRoster, userId] });
      } else {
        setAvailablePlayers(prev);
        setRosterError('Failed to update player');
      }
    } catch (error) {
      logger.warn('Failed to update player in roster', { playerId, error });
      setAvailablePlayers(prev);
      setRosterError('Failed to update player');
    } finally {
      setIsRosterUpdating(false);
    }
  }, [availablePlayers, userId, queryClient]);

  const handleRemovePlayer = useCallback(async (playerId: string) => {
    const prev = [...availablePlayers];
    setIsRosterUpdating(true);
    setAvailablePlayers((ps) => ps.filter((p) => p.id !== playerId));
    try {
      const success = await removePlayer(playerId, userId);
      if (!success) {
        setAvailablePlayers(prev);
        setRosterError('Failed to remove player');
      } else {
        setRosterError(null);
        // Invalidate React Query cache so TeamRosterModal gets fresh data (user-scoped)
        await queryClient.invalidateQueries({ queryKey: [...queryKeys.masterRoster, userId] });
      }
    } catch (error) {
      logger.warn('Failed to remove player from roster', { playerId, error });
      setAvailablePlayers(prev);
      setRosterError('Failed to remove player');
    } finally {
      setIsRosterUpdating(false);
    }
  }, [availablePlayers, userId, queryClient]);

  const handleSetGoalieStatus = useCallback(async (playerId: string, isGoalie: boolean) => {
    const prev = [...availablePlayers];
    setIsRosterUpdating(true);
    setAvailablePlayers((ps) =>
      ps.map((p) => {
        if (p.id === playerId) return { ...p, isGoalie };
        if (isGoalie && p.isGoalie) return { ...p, isGoalie: false };
        return p;
      })
    );
    try {
      const updated = await setGoalieStatus(playerId, isGoalie, userId);
      if (!updated) {
        setAvailablePlayers(prev);
        setRosterError('Failed to set goalie status');
      } else {
        setRosterError(null);
        // Invalidate React Query cache so TeamRosterModal gets fresh data (user-scoped)
        await queryClient.invalidateQueries({ queryKey: [...queryKeys.masterRoster, userId] });
      }
    } catch (error) {
      logger.warn('Failed to set goalie status', { playerId, isGoalie, error });
      setAvailablePlayers(prev);
      setRosterError('Failed to set goalie status');
    } finally {
      setIsRosterUpdating(false);
    }
  }, [availablePlayers, userId, queryClient]);

  return {
    availablePlayers,
    setAvailablePlayers,
    highlightRosterButton,
    setHighlightRosterButton,
    showRosterPrompt,
    setShowRosterPrompt,
    rosterError,
    setRosterError,
    isRosterUpdating,
    playersForCurrentGame,
    handleAddPlayer,
    handleUpdatePlayer,
    handleRemovePlayer,
    handleSetGoalieStatus,
  };
};

export type UseRosterReturn = ReturnType<typeof useRoster>;

