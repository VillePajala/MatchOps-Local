/**
 * Type definitions for field export
 */

/**
 * Export options for field image
 */
export interface FieldExportOptions {
  /** Team name to include in filename */
  teamName?: string;
  /** Opponent name to include in filename */
  opponentName?: string;
  /** Game date for filename (YYYY-MM-DD) */
  gameDate?: string;
  /** Game time of day (HH:MM) */
  gameTime?: string;
  /** Image format (default: 'png') */
  format?: 'png' | 'jpeg';
  /** JPEG quality 0-1 (default: 0.92) */
  quality?: number;
  /** Add metadata overlay on image */
  includeOverlay?: boolean;
  /** Score to show on overlay */
  score?: { home: number; away: number };
  /** Whether team is home or away */
  homeOrAway?: 'home' | 'away';
  /** Game location/venue */
  gameLocation?: string;
  /** Age group (e.g., "U12", "P11") */
  ageGroup?: string;
  /** Season name (e.g., "Spring 2024") */
  seasonName?: string;
  /** Tournament name (e.g., "City Cup") */
  tournamentName?: string;
  /** Game type (used for filename only) */
  gameType?: 'soccer' | 'futsal';
  /** Translated game type label for overlay (e.g., "Jalkapallo", "Futsal") */
  gameTypeLabel?: string;
  /** Translated prefix for filename (e.g., "Jalkapallo", "Soccer") - replaces "field" */
  filenamePrefix?: string;
  /** Locale for date formatting (e.g., 'en', 'fi') */
  locale?: string;
  /** Export scale multiplier (default: 1 for native resolution) */
  scale?: number;
}
