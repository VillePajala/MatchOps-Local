/**
 * Shared Migration Utilities
 *
 * Common types, constants, and utilities used by both:
 * - migrationService.ts (local → cloud)
 * - reverseMigrationService.ts (cloud → local)
 *
 * DESIGN PRINCIPLE: Only extract what is TRULY identical.
 * - Types with different semantic meanings stay separate
 * - Progress stages are direction-specific
 * - Only constants and generic utilities go here
 */

import type { Player, Team, TeamPlayer, Season, Tournament, Personnel, PlayerStatAdjustment } from '@/types';
import type { SavedGamesCollection, AppState } from '@/types/game';
import type { WarmupPlan } from '@/types/warmupPlan';
import type { AppSettings } from '@/types/settings';

// =============================================================================
// COMMON CONSTANTS
// =============================================================================

/**
 * Refresh auth session every N games during long migrations.
 * Prevents token expiry during large data transfers.
 */
export const SESSION_REFRESH_INTERVAL = 50;

/**
 * Maximum number of failure details to include in results.
 * Prevents overwhelming users with error lists on catastrophic failures.
 */
export const MAX_FAILURES_TO_REPORT = 5;

// =============================================================================
// COMMON TYPES
// =============================================================================

/**
 * Tracks an individual entity that failed during migration (either direction).
 * Used for detailed error reporting to users.
 */
export interface EntityMigrationFailure {
  /** Type of entity that failed */
  entityType:
    | 'player'
    | 'team'
    | 'teamRoster'
    | 'season'
    | 'tournament'
    | 'personnel'
    | 'game'
    | 'adjustment'
    | 'warmupPlan'
    | 'settings';
  /** ID of the entity (if available) */
  entityId?: string;
  /** Display name for the entity (for user-friendly error messages) */
  entityName?: string;
  /** Error message */
  error: string;
}

/**
 * Common counts structure for migration in either direction.
 * Note: The direction-specific services may add additional fields.
 */
export interface MigrationCountsBase {
  players: number;
  teams: number;
  teamRosters: number;
  seasons: number;
  tournaments: number;
  games: number;
  personnel: number;
  playerAdjustments: number;
  warmupPlan: boolean;
  settings: boolean;
}

/**
 * Common data snapshot structure for migration in either direction.
 * Contains all user data entities that are migrated.
 */
export interface DataSnapshot {
  players: Player[];
  teams: Team[];
  teamRosters: Map<string, TeamPlayer[]>; // teamId -> roster
  seasons: Season[];
  tournaments: Tournament[];
  personnel: Personnel[];
  games: SavedGamesCollection;
  playerAdjustments: Map<string, PlayerStatAdjustment[]>; // playerId -> adjustments
  warmupPlan: WarmupPlan | null;
  settings: AppSettings | null;
}

// =============================================================================
// COMMON UTILITIES
// =============================================================================

/**
 * Calculate progress within a range for a given step.
 *
 * @param current - Current step (0-indexed)
 * @param total - Total number of steps
 * @param rangeStart - Starting percentage of the range
 * @param rangeEnd - Ending percentage of the range
 * @returns Progress percentage within the range
 */
export function calculateProgressWithinRange(
  current: number,
  total: number,
  rangeStart: number,
  rangeEnd: number
): number {
  if (total <= 0) return rangeEnd;
  const rangeSize = rangeEnd - rangeStart;
  const stepProgress = (current + 1) / total;
  return Math.round(rangeStart + rangeSize * stepProgress);
}

/**
 * Format entity failures for display in result messages.
 * Limits to MAX_FAILURES_TO_REPORT to avoid overwhelming output.
 *
 * @param failures - Array of entity failures
 * @returns Array of formatted error strings
 */
export function formatFailureMessages(failures: EntityMigrationFailure[]): string[] {
  const limited = failures.slice(0, MAX_FAILURES_TO_REPORT);
  const messages = limited.map((f) => {
    const identifier = f.entityName || f.entityId || 'unknown';
    return `${f.entityType} '${identifier}': ${f.error}`;
  });

  if (failures.length > MAX_FAILURES_TO_REPORT) {
    messages.push(`...and ${failures.length - MAX_FAILURES_TO_REPORT} more errors`);
  }

  return messages;
}

/**
 * Create empty migration counts with all zeros.
 */
export function createEmptyCounts(): MigrationCountsBase {
  return {
    players: 0,
    teams: 0,
    teamRosters: 0,
    seasons: 0,
    tournaments: 0,
    games: 0,
    personnel: 0,
    playerAdjustments: 0,
    warmupPlan: false,
    settings: false,
  };
}

/**
 * Check if a data snapshot has any data to migrate.
 */
export function snapshotHasData(snapshot: DataSnapshot): boolean {
  return (
    snapshot.players.length > 0 ||
    snapshot.teams.length > 0 ||
    snapshot.seasons.length > 0 ||
    snapshot.tournaments.length > 0 ||
    snapshot.personnel.length > 0 ||
    Object.keys(snapshot.games).length > 0 ||
    snapshot.warmupPlan !== null ||
    snapshot.settings !== null
  );
}
