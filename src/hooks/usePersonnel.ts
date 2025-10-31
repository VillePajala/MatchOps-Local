import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/config/queryKeys';
import {
  getAllPersonnel,
  getPersonnelById,
  addPersonnelMember,
  updatePersonnelMember,
  removePersonnelMember,
  getPersonnelByRole,
} from '@/utils/personnelManager';
import type { Personnel } from '@/types/personnel';
import logger from '@/utils/logger';

/**
 * Get all personnel with React Query caching
 */
export const usePersonnel = () => {
  return useQuery({
    queryKey: queryKeys.personnel,
    queryFn: getAllPersonnel,
  });
};

/**
 * Get single personnel by ID
 */
export const usePersonnelById = (personnelId: string | null) => {
  return useQuery({
    queryKey: queryKeys.personnelDetail(personnelId || ''),
    queryFn: () => personnelId ? getPersonnelById(personnelId) : null,
    enabled: !!personnelId,
  });
};

/**
 * Get personnel by role (for filtering)
 */
export const usePersonnelByRole = (role: Personnel['role']) => {
  return useQuery({
    queryKey: queryKeys.personnelByRole(role),
    queryFn: () => getPersonnelByRole(role),
  });
};

/**
 * Add personnel mutation with automatic cache invalidation
 *
 * @remarks
 * On success, invalidates personnel cache triggering automatic refetch
 * in all components using usePersonnel(). This ensures real-time updates
 * across modal boundaries.
 */
export const useAddPersonnel = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Omit<Personnel, 'id' | 'createdAt' | 'updatedAt'>) =>
      addPersonnelMember(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.personnel });
      logger.log('Personnel added successfully - cache invalidated');
    },
    onError: (error) => {
      logger.error('Failed to add personnel:', error);
    },
  });
};

/**
 * Update personnel mutation with cache invalidation
 */
export const useUpdatePersonnel = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      personnelId,
      updates
    }: {
      personnelId: string;
      updates: Partial<Omit<Personnel, 'id' | 'createdAt'>>
    }) => updatePersonnelMember(personnelId, updates),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.personnel });
      queryClient.invalidateQueries({ queryKey: queryKeys.personnelDetail(variables.personnelId) });
      logger.log('Personnel updated successfully - cache invalidated');
    },
    onError: (error) => {
      logger.error('Failed to update personnel:', error);
    },
  });
};

/**
 * Remove personnel mutation with cache invalidation
 */
export const useRemovePersonnel = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (personnelId: string) => removePersonnelMember(personnelId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.personnel });
      logger.log('Personnel removed successfully - cache invalidated');
    },
    onError: (error) => {
      logger.error('Failed to remove personnel:', error);
    },
  });
};
