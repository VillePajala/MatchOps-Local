/**
 * Consolidated personnel management hook
 *
 * @remarks
 * This hook combines all personnel-related React Query hooks into a single
 * interface, simplifying personnel management in components like HomePage.
 *
 * Benefits:
 * - Reduces prop drilling
 * - Centralizes loading/error states
 * - Provides consistent API for personnel operations
 * - Easier to test and maintain
 *
 * @example
 * ```tsx
 * const personnelManager = usePersonnelManager();
 *
 * // Access personnel data
 * <PersonnelManagerModal personnel={personnelManager.personnel} />
 *
 * // Perform operations
 * await personnelManager.addPersonnel({ name: 'John', role: 'head_coach', ... });
 * ```
 */

import { useCallback } from 'react';
import {
  usePersonnel,
  useAddPersonnel,
  useUpdatePersonnel,
  useRemovePersonnel,
} from './usePersonnel';
import type { Personnel } from '@/types/personnel';
import logger from '@/utils/logger';

export interface PersonnelManagerReturn {
  /** All personnel members */
  personnel: Personnel[];

  /** Loading state - true if any operation is in progress */
  isLoading: boolean;

  /** Error from any failed operation */
  error: string | null;

  /** Add new personnel member */
  addPersonnel: (data: Omit<Personnel, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;

  /** Update existing personnel member */
  updatePersonnel: (
    personnelId: string,
    updates: Partial<Omit<Personnel, 'id' | 'createdAt'>>
  ) => Promise<void>;

  /** Remove personnel member (cascades to games) */
  removePersonnel: (personnelId: string) => Promise<void>;
}

/**
 * Consolidated hook for personnel management
 *
 * @returns Personnel data and operations with unified loading/error states
 */
export const usePersonnelManager = (): PersonnelManagerReturn => {
  // Query for fetching personnel
  const { data: personnel = [], isLoading: isFetching } = usePersonnel();

  // Mutations for CRUD operations
  const addMutation = useAddPersonnel();
  const updateMutation = useUpdatePersonnel();
  const removeMutation = useRemovePersonnel();

  // Unified loading state
  const isLoading =
    isFetching ||
    addMutation.isPending ||
    updateMutation.isPending ||
    removeMutation.isPending;

  // Unified error state (prioritize most recent error)
  const error =
    addMutation.error?.message ||
    updateMutation.error?.message ||
    removeMutation.error?.message ||
    null;

  // Wrapped operations with logging
  const addPersonnel = useCallback(
    async (data: Omit<Personnel, 'id' | 'createdAt' | 'updatedAt'>) => {
      logger.log('[usePersonnelManager] Adding personnel:', data.name);
      try {
        await addMutation.mutateAsync(data);
        logger.log('[usePersonnelManager] Personnel added successfully');
      } catch (error) {
        logger.error('[usePersonnelManager] Error adding personnel:', error);
        throw error; // Re-throw to allow component-level handling
      }
    },
    [addMutation]
  );

  const updatePersonnel = useCallback(
    async (
      personnelId: string,
      updates: Partial<Omit<Personnel, 'id' | 'createdAt'>>
    ) => {
      logger.log('[usePersonnelManager] Updating personnel:', personnelId, updates);
      try {
        await updateMutation.mutateAsync({ personnelId, updates });
        logger.log('[usePersonnelManager] Personnel updated successfully');
      } catch (error) {
        logger.error('[usePersonnelManager] Error updating personnel:', error);
        throw error;
      }
    },
    [updateMutation]
  );

  const removePersonnel = useCallback(
    async (personnelId: string) => {
      logger.log('[usePersonnelManager] Removing personnel:', personnelId);
      try {
        await removeMutation.mutateAsync(personnelId);
        logger.log('[usePersonnelManager] Personnel removed successfully');
      } catch (error) {
        logger.error('[usePersonnelManager] Error removing personnel:', error);
        throw error;
      }
    },
    [removeMutation]
  );

  return {
    personnel,
    isLoading,
    error,
    addPersonnel,
    updatePersonnel,
    removePersonnel,
  };
};
