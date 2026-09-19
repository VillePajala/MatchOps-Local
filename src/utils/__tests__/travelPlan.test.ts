/**
 * @critical - a departure time is acted on. Too late and the team misses the
 * warm-up; confidently wrong is worse than absent, which is why almost every
 * missing input returns null rather than a guess.
 */
import { distanceKm, estimateTravelMinutes, planDeparture, formatDriveTime } from '../travelPlan';

/** Real places, so the numbers can be checked against a map. */
const SAVONLINNA = { latitude: 61.8699, longitude: 28.8783 };
const MIKKELI = { latitude: 61.6885, longitude: 27.2723 };
const LAPPEENRANTA = { latitude: 61.0583, longitude: 28.1887 };

describe('distanceKm', () => {
  /** Savonlinna to Mikkeli is about 90km by road, ~87km as the crow flies. */
  it('measures a real Finnish leg', () => {
    expect(distanceKm(SAVONLINNA, MIKKELI)).toBeGreaterThan(80);
    expect(distanceKm(SAVONLINNA, MIKKELI)).toBeLessThan(95);
  });

  it('is zero between a point and itself', () => {
    expect(distanceKm(SAVONLINNA, SAVONLINNA)).toBe(0);
  });

  it('does not care which way round', () => {
    expect(distanceKm(SAVONLINNA, LAPPEENRANTA)).toBeCloseTo(distanceKm(LAPPEENRANTA, SAVONLINNA), 6);
  });
});

describe('estimateTravelMinutes', () => {
  it('turns a real leg into a plausible drive', () => {
    const mins = estimateTravelMinutes(SAVONLINNA, MIKKELI);

    // ~87km crow flies, x1.3 detour, at 60km/h -> a shade under two hours.
    expect(mins).toBeGreaterThan(90);
    expect(mins).toBeLessThan(130);
  });

  /** A pitch across town is parking and walking, not driving. */
  it('never returns less than the time it takes to arrive at all', () => {
    const almostThere = { latitude: 61.8700, longitude: 28.8784 };

    expect(estimateTravelMinutes(SAVONLINNA, almostThere)).toBe(5);
  });
});

describe('planDeparture', () => {
  const base = { kickoff: '17:30', from: SAVONLINNA, to: MIKKELI, arrivalBufferMinutes: 45 };

  /**
   * THE OWNER'S CORRECTION. You must BE there before kick-off, so the buffer
   * comes out before the drive does. Leaving it out yields a confidently late
   * departure time.
   */
  it('takes the arrival buffer out before the drive', () => {
    const plan = planDeparture({ ...base, confirmedTravelMinutes: 60 })!;

    expect(plan.arriveBy).toBe('16:45'); // 17:30 less 45 min
    expect(plan.departure).toBe('15:45'); // less the hour's drive
  });

  it('uses the time the coach measured, and says it is not a guess', () => {
    const plan = planDeparture({ ...base, confirmedTravelMinutes: 75 })!;

    expect(plan.travelMinutes).toBe(75);
    expect(plan.isEstimate).toBe(false);
  });

  it('falls back to an estimate, and says so', () => {
    const plan = planDeparture(base)!;

    expect(plan.isEstimate).toBe(true);
    expect(plan.travelMinutes).toBeGreaterThan(90);
  });

  it('reports the distance for anything that wants to show it', () => {
    expect(planDeparture(base)!.distanceKm).toBeGreaterThan(80);
  });

  describe('returns nothing rather than fiction', () => {
    it.each([
      ['no kick-off time', { kickoff: undefined }],
      ['an unparseable kick-off', { kickoff: 'later' }],
      ['an impossible kick-off', { kickoff: '25:00' }],
      ['no starting point', { from: null }],
      ['no pinned venue', { to: null }],
    ])('with %s', (_case, override) => {
      expect(planDeparture({ ...base, ...override })).toBeNull();
    });

    /** But a measured time stands on its own, with no coordinates at all. */
    it('unless the coach has already measured the drive', () => {
      const plan = planDeparture({ ...base, from: null, to: null, confirmedTravelMinutes: 40 });

      expect(plan?.departure).toBe('16:05');
      expect(plan?.distanceKm).toBe(0);
    });
  });

  describe('edges', () => {
    /** A dawn kick-off far away means setting off the night before. */
    it('flags a departure that falls on the previous day', () => {
      const plan = planDeparture({ ...base, kickoff: '09:00', confirmedTravelMinutes: 600 })!;

      expect(plan.departsPreviousDay).toBe(true);
      expect(plan.departure).toBe('22:15'); // the evening before
    });

    it('does not flag an ordinary afternoon fixture', () => {
      expect(planDeparture({ ...base, confirmedTravelMinutes: 60 })!.departsPreviousDay).toBe(false);
    });

    it('copes with no buffer at all', () => {
      const plan = planDeparture({ ...base, arrivalBufferMinutes: 0, confirmedTravelMinutes: 30 })!;

      expect(plan.arriveBy).toBe('17:30');
      expect(plan.departure).toBe('17:00');
    });

    it('treats a home fixture as a short hop, not as no journey', () => {
      const plan = planDeparture({ ...base, to: SAVONLINNA })!;

      expect(plan.travelMinutes).toBe(5);
      expect(plan.departure).toBe('16:40');
    });

    it('pads the clock', () => {
      const plan = planDeparture({ ...base, kickoff: '10:05', confirmedTravelMinutes: 5 })!;

      expect(plan.departure).toBe('09:15');
    });
  });
});

describe('formatDriveTime', () => {
  /** "132 min" has to be divided in the head before it means anything. */
  it('says hours and minutes for a long drive', () => {
    expect(formatDriveTime(132, 'h')).toBe('2 h 12 min');
  });

  it('drops a zero minutes part', () => {
    expect(formatDriveTime(120, 'h')).toBe('2 h');
    expect(formatDriveTime(60, 'h')).toBe('1 h');
  });

  /** Under an hour, minutes are how people already talk. */
  it('leaves a short drive in minutes', () => {
    expect(formatDriveTime(45, 'h')).toBe('45 min');
    expect(formatDriveTime(59, 'h')).toBe('59 min');
    expect(formatDriveTime(5, 'h')).toBe('5 min');
  });

  it('uses the hour word it is given', () => {
    expect(formatDriveTime(132, 't')).toBe('2 t 12 min');
  });

  it('copes with a very long journey', () => {
    expect(formatDriveTime(605, 'h')).toBe('10 h 5 min');
  });
});
