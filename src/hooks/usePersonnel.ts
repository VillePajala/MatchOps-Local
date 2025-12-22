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
 *
 * Error handling includes special cases for:
 * - QuotaExceededError: Storage limit reached
 * - NetworkError: IndexedDB temporarily unavailable
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
      // Enhanced error logging with type detection
      const errorName = error instanceof Error ? error.name : 'Unknown';
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorName === 'QuotaExceededError') {
        logger.error('Storage quota exceeded - cannot add personnel', { error });
      } else if (errorName === 'InvalidStateError') {
        logger.error('IndexedDB in invalid state - database may be corrupted', { error });
      } else if (errorName === 'AlreadyExistsError') {
        logger.warn('Personnel already exists:', errorMessage);
      } else if (errorName === 'ValidationError') {
        logger.warn('Personnel validation failed:', errorMessage);
      } else {
        logger.error('Failed to add personnel:', errorMessage);
      }
    },
    // Retry logic: Don't retry validation/business logic errors, only transient errors
    retry: (failureCount, error) => {
      // Don't retry validation, duplicate, quota, or state errors
      if (error instanceof Error &&
          (error.name === 'QuotaExceededError' ||
           error.name === 'InvalidStateError' ||
           error.name === 'AlreadyExistsError' ||
           error.name === 'ValidationError')) {
        return false;
      }
      // Retry up to 2 times for transient errors only
      return failureCount < 2;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 3000),
  });
};

/**
 * Update personnel mutation with cache invalidation
 *
 * @remarks
 * Includes enhanced error handling and retry logic for transient failures.
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
      const errorName = error instanceof Error ? error.name : 'Unknown';
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorName === 'QuotaExceededError') {
        logger.error('Storage quota exceeded - cannot update personnel', { error });
      } else if (errorName === 'InvalidStateError') {
        logger.error('IndexedDB in invalid state - database may be corrupted', { error });
      } else if (errorName === 'AlreadyExistsError') {
        logger.warn('Personnel name already exists:', errorMessage);
      } else if (errorName === 'ValidationError') {
        logger.warn('Personnel validation failed:', errorMessage);
      } else {
        logger.error('Failed to update personnel:', errorMessage);
      }
    },
    retry: (failureCount, error) => {
      if (error instanceof Error &&
          (error.name === 'QuotaExceededError' ||
           error.name === 'InvalidStateError' ||
           error.name === 'AlreadyExistsError' ||
           error.name === 'ValidationError')) {
        return false;
      }
      return failureCount < 2;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 3000),
  });
};

/**
 * Remove personnel mutation with cache invalidation
 *
 * @remarks
 * Includes enhanced error handling and retry logic.
 * Note: Removal also cascades to remove personnel from all games.
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
      const errorName = error instanceof Error ? error.name : 'Unknown';
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorName === 'QuotaExceededError') {
        logger.error('Storage quota exceeded during personnel removal', { error });
      } else if (errorName === 'InvalidStateError') {
        logger.error('IndexedDB in invalid state - database may be corrupted', { error });
      } else {
        logger.error('Failed to remove personnel:', { error, errorName, errorMessage });
      }
    },
    retry: (failureCount, error) => {
      if (error instanceof Error &&
          (error.name === 'QuotaExceededError' || error.name === 'InvalidStateError')) {
        return false;
      }
      return failureCount < 2;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 3000),
  });
};
