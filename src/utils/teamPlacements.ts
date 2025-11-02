/**
 * Shared utilities for managing team placements in tournaments and seasons
 */

import logger from './logger';
import { withKeyLock } from './storageKeyLock';
import type { TeamPlacementInfo } from '@/types';

/**
 * An entity (Tournament or Season) that can have team placements
 */
export interface EntityWithPlacements {
  id: string;
  teamPlacements?: {
    [teamId: string]: TeamPlacementInfo;
  };
}

/**
 * Generic function to update a team's placement in an entity (tournament or season).
 *
 * @param config - Configuration object containing:
 *   - storageKey: The storage key for the entity list
 *   - entityType: Type name for logging (e.g., 'tournament', 'season')
 *   - entityId: The ID of the entity
 *   - teamId: The ID of the team
 *   - placement: The team's placement (1 = 1st place, etc.). Pass null to remove placement.
 *   - award: Optional award label
 *   - note: Optional coach note
 *   - getItems: Function to fetch all items from storage
 *   - saveItems: Function to save all items to storage
 *
 * @returns A promise that resolves to true if successful, false otherwise.
 */
export async function updateTeamPlacementGeneric<T extends EntityWithPlacements>(config: {
  storageKey: string;
  entityType: string;
  entityId: string;
  teamId: string;
  placement: number | null;
  award?: string;
  note?: string;
  getItems: () => Promise<T[]>;
  saveItems: (items: T[]) => Promise<void>;
}): Promise<boolean> {
  const { storageKey, entityType, entityId, teamId, placement, award, note, getItems, saveItems } = config;

  if (!entityId || !teamId) {
    logger.error(`[updateTeamPlacement] Invalid ${entityType} ID or team ID provided.`);
    return false;
  }

  return withKeyLock(storageKey, async () => {
    try {
      const items = await getItems();
      const itemIndex = items.findIndex(item => item.id === entityId);

      if (itemIndex === -1) {
        logger.error(`[updateTeamPlacement] ${entityType} with ID ${entityId} not found.`);
        return false;
      }

      const item = items[itemIndex];

      // If placement is null, remove the team's placement
      if (placement === null) {
        if (item.teamPlacements) {
          delete item.teamPlacements[teamId];
          // Clean up empty object
          if (Object.keys(item.teamPlacements).length === 0) {
            delete item.teamPlacements;
          }
        }
      } else {
        // Set or update the team's placement
        item.teamPlacements = {
          ...item.teamPlacements,
          [teamId]: {
            placement,
            ...(award && { award }),
            ...(note && { note }),
          },
        };
      }

      items[itemIndex] = item;
      await saveItems(items);
      return true;
    } catch (error) {
      logger.error(`[updateTeamPlacement] Unexpected error updating ${entityType} team placement:`, error);
      return false;
    }
  });
}

/**
 * Generic function to get a team's placement in an entity (tournament or season).
 *
 * @param items - Array of entities (tournaments or seasons)
 * @param entityId - The ID of the entity
 * @param teamId - The ID of the team
 * @param entityType - Type name for logging (e.g., 'tournament', 'season')
 *
 * @returns A promise that resolves to the team's placement data, or null if not found.
 */
export function getTeamPlacementFromItems<T extends EntityWithPlacements>(
  items: T[],
  entityId: string,
  teamId: string,
  entityType: string
): TeamPlacementInfo | null {
  try {
    const item = items.find(i => i.id === entityId);

    if (!item || !item.teamPlacements || !item.teamPlacements[teamId]) {
      return null;
    }

    return item.teamPlacements[teamId];
  } catch (error) {
    logger.error(`[getTeamPlacement] Error getting ${entityType} team placement:`, error);
    return null;
  }
}
