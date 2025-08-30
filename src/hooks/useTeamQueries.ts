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
import type { Team, TeamPlayer } from '@/types';

// Query hooks
export const useTeamsQuery = () => {
  return useQuery({
    queryKey: queryKeys.teams,
    queryFn: getTeams,
  });
};

export const useTeamRosterQuery = (teamId: string | null) => {
  return useQuery({
    queryKey: queryKeys.teamRoster(teamId!),
    queryFn: () => getTeamRoster(teamId!),
    enabled: !!teamId,
  });
};

// Mutation hooks
export const useAddTeamMutation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: addTeam,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teams });
    },
  });
};

export const useUpdateTeamMutation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ teamId, updates }: { teamId: string; updates: Partial<Omit<Team, 'id' | 'createdAt'>> }) => 
      updateTeam(teamId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teams });
    },
  });
};

export const useDeleteTeamMutation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: deleteTeam,
    onSuccess: (success, teamId) => {
      if (success) {
        queryClient.invalidateQueries({ queryKey: queryKeys.teams });
        queryClient.removeQueries({ queryKey: queryKeys.teamRoster(teamId) });
        // Invalidate saved games since team deletion affects orphaned games
        queryClient.invalidateQueries({ queryKey: queryKeys.savedGames });
      }
    },
  });
};

export const useDuplicateTeamMutation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: duplicateTeam,
    onSuccess: (newTeam) => {
      if (newTeam) {
        queryClient.invalidateQueries({ queryKey: queryKeys.teams });
        // Pre-populate the new team's roster cache
        queryClient.invalidateQueries({ queryKey: queryKeys.teamRoster(newTeam.id) });
      }
    },
  });
};

// Team roster mutations
export const useSetTeamRosterMutation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ teamId, roster }: { teamId: string; roster: TeamPlayer[] }) => 
      setTeamRoster(teamId, roster),
    onSuccess: (_, { teamId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teamRoster(teamId) });
    },
  });
};

export const useAddPlayerToRosterMutation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ teamId, player }: { teamId: string; player: TeamPlayer }) => 
      addPlayerToRoster(teamId, player),
    onSuccess: (_, { teamId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teamRoster(teamId) });
    },
  });
};

export const useUpdatePlayerInRosterMutation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ teamId, playerId, updates }: { teamId: string; playerId: string; updates: Partial<TeamPlayer> }) => 
      updatePlayerInRoster(teamId, playerId, updates),
    onSuccess: (success, { teamId }) => {
      if (success) {
        queryClient.invalidateQueries({ queryKey: queryKeys.teamRoster(teamId) });
      }
    },
  });
};

export const useRemovePlayerFromRosterMutation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ teamId, playerId }: { teamId: string; playerId: string }) => 
      removePlayerFromRoster(teamId, playerId),
    onSuccess: (success, { teamId }) => {
      if (success) {
        queryClient.invalidateQueries({ queryKey: queryKeys.teamRoster(teamId) });
      }
    },
  });
};