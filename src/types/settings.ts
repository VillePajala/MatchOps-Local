/**
 * Application settings interface.
 * Extracted to dedicated file to avoid circular dependencies between
 * appSettings.ts utilities and DataStore implementations.
 */
export interface AppSettings {
  currentGameId: string | null;
  lastHomeTeamName?: string;
  language?: string;
  hasSeenAppGuide?: boolean;
  useDemandCorrection?: boolean;
  isDrawingModeEnabled?: boolean;
  /** Club season start date (ISO format YYYY-MM-DD, default: "2000-11-15" = November 15th) */
  clubSeasonStartDate?: string;
  /** Club season end date (ISO format YYYY-MM-DD, default: "2000-10-20" = October 20th) */
  clubSeasonEndDate?: string;
  /** Tracks whether user has explicitly configured season dates (enables season filtering UI) */
  hasConfiguredSeasonDates?: boolean;
  // Add other settings as needed
}
