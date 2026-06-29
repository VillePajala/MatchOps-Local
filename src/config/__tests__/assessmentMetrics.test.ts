import {
  ASSESSMENT_METRIC_IDS,
  ASSESSMENT_MIN,
  ASSESSMENT_MAX,
  ASSESSMENT_DEFAULT,
  ASSESSMENT_SLIDER_SCALE_VERSION,
  makeDefaultSliders,
  migrateAssessmentSliders,
  migrateAssessmentSliderScale,
} from '../assessmentMetrics';

describe('assessmentMetrics config', () => {
  it('has the set A metric ids (exactly 10)', () => {
    expect(ASSESSMENT_METRIC_IDS).toEqual([
      'ball_control', 'passing', 'scanning', 'game_reading', 'decisions',
      'courage', 'effort', 'enjoyment', 'teamwork', 'fair_play',
    ]);
  });

  it('uses the 1-5 developmental scale with a neutral default of 3', () => {
    expect(ASSESSMENT_MIN).toBe(1);
    expect(ASSESSMENT_MAX).toBe(5);
    expect(ASSESSMENT_DEFAULT).toBe(3);
  });

  it('makeDefaultSliders returns every metric at the default level', () => {
    const sliders = makeDefaultSliders();
    expect(Object.keys(sliders)).toEqual([...ASSESSMENT_METRIC_IDS]);
    expect(Object.values(sliders).every((v) => v === ASSESSMENT_DEFAULT)).toBe(true);
  });

  describe('migrateAssessmentSliders (legacy id mapping)', () => {
    it('renames legacy ids and drops removed ones', () => {
      const out = migrateAssessmentSliders({
        intensity: 7, technique: 8, awareness: 6, duels: 5, impact: 4,
        courage: 9, decisions: 6, teamwork: 8, fair_play: 10, creativity: 7,
      });
      expect(out).toEqual({
        effort: 7, ball_control: 8, game_reading: 6,
        courage: 9, decisions: 6, teamwork: 8, fair_play: 10, creativity: 7,
      });
      expect(out.duels).toBeUndefined();
      expect(out.impact).toBeUndefined();
    });

    it('passes current ids through unchanged', () => {
      const current = { ball_control: 3, passing: 4, scanning: 2 };
      expect(migrateAssessmentSliders(current)).toEqual(current);
    });

    it('tolerates null/undefined', () => {
      expect(migrateAssessmentSliders(null)).toEqual({});
      expect(migrateAssessmentSliders(undefined)).toEqual({});
    });
  });

  describe('migrateAssessmentSliderScale (1-10 -> 1-5)', () => {
    it('folds legacy 1-10 values into 1-5 buckets', () => {
      const out = migrateAssessmentSliderScale(
        { a: 1, b: 2, c: 4, d: 5, e: 7, f: 8, g: 9, h: 10 },
        undefined, // legacy (absent version)
      );
      expect(out).toEqual({ a: 1, b: 1, c: 2, d: 3, e: 4, f: 4, g: 5, h: 5 });
    });

    it('is a no-op when already on the current scale', () => {
      const current = { a: 1, b: 3, c: 5 };
      expect(migrateAssessmentSliderScale(current, ASSESSMENT_SLIDER_SCALE_VERSION)).toBe(current);
    });

    it('clamps into the 1-5 range', () => {
      const out = migrateAssessmentSliderScale({ a: 0, b: 20 }, 1);
      expect(out.a).toBe(ASSESSMENT_MIN);
      expect(out.b).toBe(ASSESSMENT_MAX);
    });
  });
});
