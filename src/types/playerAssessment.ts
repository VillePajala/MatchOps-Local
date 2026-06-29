export interface PlayerAssessment {
  overall: number;
  /**
   * Per-metric ratings, keyed by metric id (see src/config/assessmentMetrics.ts).
   * Id-keyed (rather than fixed fields) so the active metric set can change
   * without a schema change. Stored as a JSONB map in the cloud.
   */
  sliders: Record<string, number>;
  notes: string;
  minutesPlayed: number;
  createdAt: number;
  createdBy: string;
}
