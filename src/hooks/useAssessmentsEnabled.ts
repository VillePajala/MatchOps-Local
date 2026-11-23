/**
 * Player assessments (ratings) are removed from the app for now (owner
 * decision 2026-11, before the regional demo): no surface offers them and
 * Settings has no switch for them.
 *
 * Non-destructive: the code, types, the stored `assessmentsEnabled` setting
 * and every rating already recorded are kept. Ratings stay in backups and in
 * the Excel exports (those include whatever rating data exists), and account
 * and data deletion remove them as before. To bring the feature back, set this
 * to true, read the stored per-account setting again here (git history of
 * this file) and restore the Settings switch.
 */
export const ASSESSMENTS_FEATURE_AVAILABLE = false;

/**
 * Whether the player-assessment feature is shown. Always false while
 * ASSESSMENTS_FEATURE_AVAILABLE is false, whatever the stored setting says.
 */
export function useAssessmentsEnabled(): boolean {
  return ASSESSMENTS_FEATURE_AVAILABLE;
}
