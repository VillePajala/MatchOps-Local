export interface PlayerAssessment {
  overall: number;
  /**
   * Per-metric ratings, keyed by metric id (see src/config/assessmentMetrics.ts).
   * Id-keyed (rather than fixed fields) so the active metric set can change
   * without a schema change. Stored as a JSONB map in the cloud.
   */
  sliders: Record<string, number>;
  /**
   * Scale version of `sliders` (see ASSESSMENT_SLIDER_SCALE_VERSION).
   * Absent / 1 = legacy 1-10; 2 = current 1-5 developmental word scale.
   * Legacy values are migrated to the current scale on read.
   */
  sliderScaleVersion?: number;
  notes: string;
  minutesPlayed: number;
  createdAt: number;
  createdBy: string;
}
