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

  /** Add new personnel member - throws on validation failure */
  addPersonnel: (data: Omit<Personnel, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Personnel>;

  /** Update existing personnel member - returns null if not found, throws on validation failure */
  updatePersonnel: (
    personnelId: string,
    updates: Partial<Omit<Personnel, 'id' | 'createdAt'>>
  ) => Promise<Personnel | null>;

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
    async (data: Omit<Personnel, 'id' | 'createdAt' | 'updatedAt'>): Promise<Personnel> => {
      logger.debug('[usePersonnelManager] Adding personnel:', data.name);
      try {
        const result = await addMutation.mutateAsync(data);
        logger.debug('[usePersonnelManager] Personnel added successfully');
        return result;
      } catch (error) {
        logger.error('[usePersonnelManager] Error adding personnel:', error);
        throw error; // DataStore guarantees Error types
      }
    },
    [addMutation]
  );

  const updatePersonnel = useCallback(
    async (
      personnelId: string,
      updates: Partial<Omit<Personnel, 'id' | 'createdAt'>>
    ): Promise<Personnel | null> => {
      logger.debug('[usePersonnelManager] Updating personnel:', personnelId, updates);
      try {
        const result = await updateMutation.mutateAsync({ personnelId, updates });
        if (result) {
          logger.debug('[usePersonnelManager] Personnel updated successfully');
        } else {
          logger.debug('[usePersonnelManager] Personnel not found');
        }
        return result;
      } catch (error) {
        logger.error('[usePersonnelManager] Error updating personnel:', error);
        throw error; // DataStore guarantees Error types
      }
    },
    [updateMutation]
  );

  const removePersonnel = useCallback(
    async (personnelId: string) => {
      logger.debug('[usePersonnelManager] Removing personnel:', personnelId);
      try {
        await removeMutation.mutateAsync(personnelId);
        logger.debug('[usePersonnelManager] Personnel removed successfully');
      } catch (error) {
        logger.error('[usePersonnelManager] Error removing personnel:', error);
        throw error; // DataStore guarantees Error types
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
