/**
 * React Query hooks for team data management.
 *
 * All hooks use user-scoped storage when authenticated:
 * - userId is included in query keys for cache isolation
 * - userId is passed to utility functions for correct database selection
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/config/queryKeys';
import {
  getTeams,
  getTeamRoster,
  addTeam,
  updateTeam,
  deleteTeam,
  duplicateTeam,
  setTeamRoster,
  addPlayerToRoster,
  updatePlayerInRoster,
  removePlayerFromRoster,
} from '@/utils/teams';
import { useDataStore } from '@/hooks/useDataStore';
import type { Team, TeamPlayer } from '@/types';

// Query hooks
export const useTeamsQuery = () => {
  const { userId } = useDataStore();

  return useQuery({
    // Include userId in query key for cache isolation between users
    queryKey: [...queryKeys.teams, userId],
    queryFn: () => getTeams(userId),
  });
};

export const useTeamRosterQuery = (teamId: string | null) => {
  const { userId } = useDataStore();

  return useQuery({
    // Include userId in query key for cache isolation between users
    queryKey: [...queryKeys.teamRoster(teamId!), userId],
    queryFn: () => getTeamRoster(teamId!, userId),
    enabled: !!teamId,
  });
};

// Mutation hooks
export const useAddTeamMutation = () => {
  const queryClient = useQueryClient();
  const { userId } = useDataStore();

  return useMutation({
    mutationFn: (teamData: Omit<Team, 'id' | 'createdAt' | 'updatedAt'>) => addTeam(teamData, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.teams, userId] });
    },
  });
};

export const useUpdateTeamMutation = () => {
  const queryClient = useQueryClient();
  const { userId } = useDataStore();

  return useMutation({
    mutationFn: ({ teamId, updates }: { teamId: string; updates: Partial<Omit<Team, 'id' | 'createdAt'>> }) =>
      updateTeam(teamId, updates, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.teams, userId] });
      // Also invalidate savedGames so games display updated team names immediately
      queryClient.invalidateQueries({ queryKey: [...queryKeys.savedGames, userId] });
    },
  });
};

export const useDeleteTeamMutation = () => {
  const queryClient = useQueryClient();
  const { userId } = useDataStore();

  return useMutation({
    mutationFn: (teamId: string) => deleteTeam(teamId, userId),
    onSuccess: (success, teamId) => {
      if (success) {
        queryClient.invalidateQueries({ queryKey: [...queryKeys.teams, userId] });
        queryClient.removeQueries({ queryKey: [...queryKeys.teamRoster(teamId), userId] });
        // Invalidate saved games since team deletion affects orphaned games
        queryClient.invalidateQueries({ queryKey: [...queryKeys.savedGames, userId] });
      }
    },
  });
};

export const useDuplicateTeamMutation = () => {
  const queryClient = useQueryClient();
  const { userId } = useDataStore();

  return useMutation({
    mutationFn: (teamId: string) => duplicateTeam(teamId, userId),
    onSuccess: (newTeam) => {
      if (newTeam) {
        queryClient.invalidateQueries({ queryKey: [...queryKeys.teams, userId] });
        // Pre-populate the new team's roster cache
        queryClient.invalidateQueries({ queryKey: [...queryKeys.teamRoster(newTeam.id), userId] });
      }
    },
  });
};

// Team roster mutations
export const useSetTeamRosterMutation = () => {
  const queryClient = useQueryClient();
  const { userId } = useDataStore();

  return useMutation({
    mutationFn: ({ teamId, roster }: { teamId: string; roster: TeamPlayer[] }) =>
      setTeamRoster(teamId, roster, userId),
    onSuccess: (_, { teamId }) => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.teamRoster(teamId), userId] });
      // Also invalidate teams to trigger roster count refresh in TeamManagerModal
      queryClient.invalidateQueries({ queryKey: [...queryKeys.teams, userId] });
    },
  });
};

export const useAddPlayerToRosterMutation = () => {
  const queryClient = useQueryClient();
  const { userId } = useDataStore();

  return useMutation({
    mutationFn: ({ teamId, player }: { teamId: string; player: TeamPlayer }) =>
      addPlayerToRoster(teamId, player, userId),
    onSuccess: (_, { teamId }) => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.teamRoster(teamId), userId] });
      // Also invalidate teams to trigger roster count refresh in TeamManagerModal
      queryClient.invalidateQueries({ queryKey: [...queryKeys.teams, userId] });
    },
  });
};

export const useUpdatePlayerInRosterMutation = () => {
  const queryClient = useQueryClient();
  const { userId } = useDataStore();

  return useMutation({
    mutationFn: ({ teamId, playerId, updates }: { teamId: string; playerId: string; updates: Partial<TeamPlayer> }) =>
      updatePlayerInRoster(teamId, playerId, updates, userId),
    onSuccess: (success, { teamId }) => {
      if (success) {
        queryClient.invalidateQueries({ queryKey: [...queryKeys.teamRoster(teamId), userId] });
      }
    },
  });
};

export const useRemovePlayerFromRosterMutation = () => {
  const queryClient = useQueryClient();
  const { userId } = useDataStore();

  return useMutation({
    mutationFn: ({ teamId, playerId }: { teamId: string; playerId: string }) =>
      removePlayerFromRoster(teamId, playerId, userId),
    onSuccess: (success, { teamId }) => {
      if (success) {
        queryClient.invalidateQueries({ queryKey: [...queryKeys.teamRoster(teamId), userId] });
        // Also invalidate teams to trigger roster count refresh in TeamManagerModal
        queryClient.invalidateQueries({ queryKey: [...queryKeys.teams, userId] });
      }
    },
  });
};
