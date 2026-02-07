import type { Personnel, PersonnelCollection } from '@/types/personnel';
import logger from '@/utils/logger';
import { getDataStore } from '@/datastore';

/**
 * Get all personnel from storage.
 * DataStore handles sorting by createdAt (newest first).
 * @param userId - User ID for user-scoped storage. Pass undefined for legacy storage.
 */
export const getAllPersonnel = async (userId?: string): Promise<Personnel[]> => {
  try {
    const dataStore = await getDataStore(userId);
    return await dataStore.getAllPersonnel();
  } catch (error) {
    logger.error('Error getting personnel:', error);
    throw error;
  }
};

/**
 * Get personnel collection as object.
 * @deprecated Use getAllPersonnel() or getPersonnelById() instead.
 * Kept for backwards compatibility during migration.
 * @param userId - User ID for user-scoped storage. Pass undefined for legacy storage.
 */
export const getPersonnelCollection = async (userId?: string): Promise<PersonnelCollection> => {
  logger.warn(
    '[DEPRECATED] getPersonnelCollection() is deprecated. Use getAllPersonnel() or getPersonnelById() instead.'
  );
  try {
    const allPersonnel = await getAllPersonnel(userId);
    const collection: PersonnelCollection = {};
    for (const person of allPersonnel) {
      collection[person.id] = person;
    }
    return collection;
  } catch (error) {
    logger.error('Error getting personnel collection:', error);
    throw error;
  }
};

/**
 * Get single personnel by ID.
 * DataStore handles storage access.
 * @param userId - User ID for user-scoped storage. Pass undefined for legacy storage.
 */
export const getPersonnelById = async (personnelId: string, userId?: string): Promise<Personnel | null> => {
  try {
    const dataStore = await getDataStore(userId);
    return await dataStore.getPersonnelById(personnelId);
  } catch (error) {
    logger.error('Error getting personnel by ID:', error);
    throw error;
  }
};

/**
 * Add new personnel member.
 * DataStore handles ID generation, validation (name, duplicate check), and storage.
 *
 * @param personnelData - Personnel data without id, createdAt, updatedAt.
 * @param userId - User ID for user-scoped storage. Pass undefined for legacy storage.
 * @returns The newly created Personnel object.
 * @throws {ValidationError} If name is empty or exceeds max length.
 * @throws {AlreadyExistsError} If name already exists (case-insensitive).
 * @throws {Error} For storage/DataStore failures.
 */
export const addPersonnelMember = async (
  personnelData: Omit<Personnel, 'id' | 'createdAt' | 'updatedAt'>,
  userId?: string
): Promise<Personnel> => {
  const dataStore = await getDataStore(userId);
  return await dataStore.addPersonnelMember(personnelData);
};

/**
 * Update existing personnel member.
 * DataStore handles validation and storage.
 *
 * @param personnelId - The ID of the personnel to update.
 * @param updates - Partial personnel data to update.
 * @param userId - User ID for user-scoped storage. Pass undefined for legacy storage.
 * @returns The updated Personnel object, or null if not found.
 * @throws {ValidationError} If name is empty or exceeds max length.
 * @throws {AlreadyExistsError} If name already exists (case-insensitive).
 * @throws {Error} For storage/DataStore failures.
 */
export const updatePersonnelMember = async (
  personnelId: string,
  updates: Partial<Omit<Personnel, 'id' | 'createdAt'>>,
  userId?: string
): Promise<Personnel | null> => {
  if (!personnelId) {
    logger.error('[updatePersonnelMember] Invalid personnel ID provided.');
    return null;
  }

  const dataStore = await getDataStore(userId);
  return await dataStore.updatePersonnelMember(personnelId, updates);
};

/**
 * Remove personnel member.
 * DataStore handles cascade delete (removes personnel from all games).
 *
 * @param personnelId - The ID of the personnel to remove.
 * @param userId - User ID for user-scoped storage. Pass undefined for legacy storage.
 * @returns True if deleted, false if not found.
 * @throws Error if storage operation fails.
 */
export const removePersonnelMember = async (personnelId: string, userId?: string): Promise<boolean> => {
  if (!personnelId) {
    throw new Error('Invalid personnel ID provided');
  }

  try {
    const dataStore = await getDataStore(userId);
    return await dataStore.removePersonnelMember(personnelId);
  } catch (error) {
    logger.error('[removePersonnelMember] Error removing personnel:', { personnelId, error });
    throw error;
  }
};

/**
 * Get personnel by role (future enhancement - filtering).
 * @param userId - User ID for user-scoped storage. Pass undefined for legacy storage.
 */
export const getPersonnelByRole = async (role: Personnel['role'], userId?: string): Promise<Personnel[]> => {
  try {
    const allPersonnel = await getAllPersonnel(userId);
    return allPersonnel.filter(p => p.role === role);
  } catch (error) {
    logger.error('Error getting personnel by role:', error);
    throw error;
  }
};

/**
 * Get all games that reference a specific personnel member.
 * DataStore handles loading saved games.
 *
 * @param personnelId - The personnel ID to search for.
 * @param userId - User ID for user-scoped storage. Pass undefined for legacy storage.
 * @returns Array of game IDs that reference this personnel member.
 */
export const getGamesWithPersonnel = async (personnelId: string, userId?: string): Promise<string[]> => {
  try {
    const dataStore = await getDataStore(userId);
    const games = await dataStore.getGames();
    const gameIds: string[] = [];

    for (const [gameId, gameState] of Object.entries(games)) {
      if (gameState.gamePersonnel?.includes(personnelId)) {
        gameIds.push(gameId);
      }
    }

    logger.log(`Found ${gameIds.length} games using personnel ${personnelId}`);
    return gameIds;
  } catch (error) {
    logger.error('Error getting games with personnel:', error);
    throw error;
  }
};
