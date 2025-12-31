/**
 * Hook for assembling field export metadata
 *
 * Extracts metadata assembly from FieldContainer to reduce prop drilling
 * and improve testability. Memoizes the metadata object to prevent
 * unnecessary re-renders.
 */

import { useMemo } from 'react';
import type { GameSessionState } from './useGameSessionReducer';
import type { Season, Tournament } from '@/types';
import type { FieldExportOptions } from '@/utils/export';

interface UseExportMetadataOptions {
  gameSessionState: GameSessionState;
  seasons: Season[];
  tournaments: Tournament[];
  locale: string;
  /** Prefix for exported filename (default: 'MatchOps') */
  filenamePrefix?: string;
}

/**
 * Assembles export metadata from game session state.
 *
 * @example
 * ```typescript
 * const exportMetadata = useExportMetadata({
 *   gameSessionState,
 *   seasons,
 *   tournaments,
 *   locale: i18n.language,
 * });
 *
 * await exportFieldAsImage(canvas, {
 *   ...exportMetadata,
 *   includeOverlay: true,
 * });
 * ```
 */
export function useExportMetadata({
  gameSessionState,
  seasons,
  tournaments,
  locale,
  filenamePrefix = 'MatchOps',
}: UseExportMetadataOptions): FieldExportOptions {
  // Memoize season/tournament name lookups separately to avoid recalculating
  // when arrays change reference but the relevant names don't change
  const seasonName = useMemo(
    () =>
      gameSessionState.seasonId
        ? seasons.find((s) => s.id === gameSessionState.seasonId)?.name
        : undefined,
    [gameSessionState.seasonId, seasons]
  );

  const tournamentName = useMemo(
    () =>
      gameSessionState.tournamentId
        ? tournaments.find((t) => t.id === gameSessionState.tournamentId)?.name
        : undefined,
    [gameSessionState.tournamentId, tournaments]
  );

  // Memoize the complete export metadata object
  const exportMetadata = useMemo<FieldExportOptions>(
    () => ({
      teamName: gameSessionState.teamName,
      opponentName: gameSessionState.opponentName,
      gameDate: gameSessionState.gameDate,
      gameTime: gameSessionState.gameTime,
      gameLocation: gameSessionState.gameLocation,
      ageGroup: gameSessionState.ageGroup,
      seasonName,
      tournamentName,
      gameType: gameSessionState.gameType,
      filenamePrefix,
      homeOrAway: gameSessionState.homeOrAway,
      locale,
      score: {
        home: gameSessionState.homeScore,
        away: gameSessionState.awayScore,
      },
    }),
    [
      gameSessionState.teamName,
      gameSessionState.opponentName,
      gameSessionState.gameDate,
      gameSessionState.gameTime,
      gameSessionState.gameLocation,
      gameSessionState.ageGroup,
      seasonName,
      tournamentName,
      gameSessionState.gameType,
      filenamePrefix,
      gameSessionState.homeOrAway,
      gameSessionState.homeScore,
      gameSessionState.awayScore,
      locale,
    ]
  );

  return exportMetadata;
}
