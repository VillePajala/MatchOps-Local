import {
  ASSESSMENT_METRIC_IDS,
  ASSESSMENT_MIN,
  ASSESSMENT_MAX,
  ASSESSMENT_DEFAULT,
  ASSESSMENT_SLIDER_SCALE_VERSION,
  RATING_STYLE_MAX,
  canonicalToDisplay,
  displayToCanonical,
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

  it('stores ratings on the canonical 1-10 scale with a neutral default of 5', () => {
    expect(ASSESSMENT_MIN).toBe(1);
    expect(ASSESSMENT_MAX).toBe(10);
    expect(ASSESSMENT_DEFAULT).toBe(5);
  });

  it('makeDefaultSliders returns every metric at the default value', () => {
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

    it('tolerates null/undefined', () => {
      expect(migrateAssessmentSliders(null)).toEqual({});
      expect(migrateAssessmentSliders(undefined)).toEqual({});
    });
  });

  describe('migrateAssessmentSliderScale (-> canonical 1-10)', () => {
    it('treats legacy 1-10 data (version absent/1) as canonical (identity)', () => {
      const legacy = { a: 1, b: 4, c: 7, d: 10 };
      expect(migrateAssessmentSliderScale(legacy, undefined)).toEqual(legacy);
      expect(migrateAssessmentSliderScale(legacy, 1)).toEqual(legacy);
    });

    it('expands interim 1-5 data (version 2) onto the 1-10 scale', () => {
      const out = migrateAssessmentSliderScale({ a: 1, b: 2, c: 3, d: 4, e: 5 }, 2);
      expect(out).toEqual({ a: 1, b: 3, c: 6, d: 8, e: 10 });
    });

    it('is a no-op when already canonical (version 3)', () => {
      const current = { a: 1, b: 5, c: 10 };
      expect(migrateAssessmentSliderScale(current, ASSESSMENT_SLIDER_SCALE_VERSION)).toBe(current);
    });
  });

  describe('canonical <-> display conversions', () => {
    it('num10 is the identity', () => {
      expect(RATING_STYLE_MAX.num10).toBe(10);
      for (let v = 1; v <= 10; v++) {
        expect(canonicalToDisplay(v, 10)).toBe(v);
        expect(displayToCanonical(v, 10)).toBe(v);
      }
    });

    it('words / 1-5 map to 5 positions and round-trip', () => {
      expect(RATING_STYLE_MAX.words).toBe(5);
      expect(RATING_STYLE_MAX.num5).toBe(5);
      // level -> canonical -> level is stable for all 5 levels
      for (let level = 1; level <= 5; level++) {
        const canonical = displayToCanonical(level, 5);
        expect(canonical).toBeGreaterThanOrEqual(1);
        expect(canonical).toBeLessThanOrEqual(10);
        expect(canonicalToDisplay(canonical, 5)).toBe(level);
      }
    });

    it('the default value reads as the middle level (Developing)', () => {
      expect(canonicalToDisplay(ASSESSMENT_DEFAULT, 5)).toBe(3);
    });
  });
});
