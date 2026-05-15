/**
 * React Query hooks for the tournament-planner `PlanningSession` entity.
 *
 * Mirrors the patterns in `useTeamQueries.ts`:
 * - userId is included in query keys for cache isolation between users
 * - `useDataStore` resolves the right backend (local / cloud / synced)
 *
 * @see src/types/planningSession.ts
 * @see src/datastore/LocalDataStore.ts (planning session methods)
 * @see docs/03-active-plans/tournament-planner-integration.md
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/config/queryKeys';
import { useDataStore } from '@/hooks/useDataStore';
import type { PlanningSession } from '@/types';

export interface UsePlanningSessionsQueryOptions {
  /** Filter by team. When undefined, returns all of the user's sessions. */
  teamId?: string;
  /** When false, skip the fetch (e.g., modal closed). */
  enabled?: boolean;
}

export const usePlanningSessionsQuery = ({
  teamId,
  enabled = true,
}: UsePlanningSessionsQueryOptions = {}) => {
  const { userId, getStore } = useDataStore();

  return useQuery<PlanningSession[]>({
    queryKey: [...queryKeys.planningSessionsByTeam(teamId), userId],
    queryFn: async () => {
      const store = await getStore();
      return store.getPlanningSessions(teamId);
    },
    enabled,
  });
};

/**
 * Variables for `useSavePlanningSessionMutation`.
 *
 * Matches the DataStore method's signature: `id`/`createdAt`/`updatedAt` are
 * optional (the implementation generates new ids and stamps timestamps);
 * everything else is required.
 */
export type SavePlanningSessionVariables = Omit<
  PlanningSession,
  'id' | 'createdAt' | 'updatedAt'
> & {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
};

export const useSavePlanningSessionMutation = () => {
  const queryClient = useQueryClient();
  const { userId, getStore } = useDataStore();

  return useMutation<PlanningSession, Error, SavePlanningSessionVariables>({
    mutationFn: async (vars) => {
      const store = await getStore();
      return store.savePlanningSession(vars);
    },
    onSuccess: (saved) => {
      // Invalidate both the team-scoped list (the most common consumer) and
      // the unscoped list, so any view that listed sessions for a different
      // teamId still sees fresh data after a save.
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.planningSessionsByTeam(saved.teamId), userId],
      });
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.planningSessionsByTeam(undefined), userId],
      });
    },
  });
};

export interface DeletePlanningSessionVariables {
  sessionId: string;
  teamId: string | undefined;
}

export const useDeletePlanningSessionMutation = () => {
  const queryClient = useQueryClient();
  const { userId, getStore } = useDataStore();

  return useMutation<boolean, Error, DeletePlanningSessionVariables>({
    mutationFn: async ({ sessionId }) => {
      const store = await getStore();
      return store.deletePlanningSession(sessionId);
    },
    onSuccess: (deleted, { teamId }) => {
      if (!deleted) return;
      // Scope invalidation to (teamId, userId) so an auth-switch
      // mid-mount can't leak a delete across user accounts. Matches
      // useSavePlanningSessionMutation + useSetActiveSessionMutation.
      // Also invalidate the global "all teams" key — landing pages
      // that read sessions across every team need a refresh too.
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.planningSessionsByTeam(teamId), userId],
      });
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.planningSessionsByTeam(undefined), userId],
      });
    },
  });
};

export interface SetActiveSessionVariables {
  /** The session to mark active, or null to deactivate the active one. */
  sessionId: string | null;
  /** Team scope for the (teamId, gameIds-set) match. */
  teamId: string;
  /** The game-set the active session must cover. */
  gameIds: string[];
  /**
   * When provided, scope is restricted to siblings sharing this
   * parent_session_id (named-versions feature). When undefined/null,
   * legacy (team, gameIds-set, top-level) scope applies.
   */
  parentSessionId?: string | null;
}

export const useSetActiveSessionMutation = () => {
  const queryClient = useQueryClient();
  const { userId, getStore } = useDataStore();

  return useMutation<
    PlanningSession | null,
    Error,
    SetActiveSessionVariables
  >({
    mutationFn: async ({ sessionId, teamId, gameIds, parentSessionId }) => {
      const store = await getStore();
      return store.setActiveSession(sessionId, teamId, gameIds, parentSessionId);
    },
    onSuccess: (_result, { teamId }) => {
      // setActiveSession can flip is_active on multiple sessions in one
      // call. Invalidate the team's session list so every consumer sees
      // the new active state.
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.planningSessionsByTeam(teamId), userId],
      });
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.planningSessionsByTeam(undefined), userId],
      });
    },
  });
};
