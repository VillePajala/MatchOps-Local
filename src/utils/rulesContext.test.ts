/**
 * @critical - a default that comes from the wrong place is invisible. The
 * futsal table sat on screen for every coach because it reflected what was
 * available to build, not what anyone plays; these assertions pin the rule that
 * replaced that: the coach's own data first, the population second.
 */
import { preferredRulesContext } from './rulesContext';
import type { AppState } from '@/types';

const g = (over: Partial<AppState>) => over as Partial<AppState>;

describe('preferredRulesContext', () => {
  it('opens on football for a coach with no games at all', () => {
    expect(preferredRulesContext(undefined)).toEqual({ sport: 'football', ageGroup: undefined });
    expect(preferredRulesContext({})).toEqual({ sport: 'football', ageGroup: undefined });
  });

  it('opens on the sport the coach actually plays', () => {
    const futsalCoach = { a: g({ gameType: 'futsal' }), b: g({ gameType: 'futsal' }), c: g({ gameType: 'soccer' }) };
    expect(preferredRulesContext(futsalCoach).sport).toBe('futsal');

    const footballCoach = { a: g({ gameType: 'soccer' }), b: g({ gameType: 'futsal' }) };
    expect(preferredRulesContext(footballCoach).sport).toBe('football');
  });

  /**
   * Legacy games predate the gameType field and are soccer. Counting them as
   * unknown would tip a long-standing football coach onto futsal the moment
   * they tried one indoor game.
   */
  it('counts games with no sport recorded as football', () => {
    const legacy = { a: g({}), b: g({}), c: g({ gameType: 'futsal' }) };
    expect(preferredRulesContext(legacy).sport).toBe('football');
  });

  it('falls back to football on a tie, since that is the app’s main use', () => {
    const tied = { a: g({ gameType: 'soccer' }), b: g({ gameType: 'futsal' }) };
    expect(preferredRulesContext(tied).sport).toBe('football');
  });

  it('opens on the age group the coach records most', () => {
    const games = {
      a: g({ ageGroup: 'U10' }),
      b: g({ ageGroup: 'U10' }),
      c: g({ ageGroup: 'U13' }),
    };
    expect(preferredRulesContext(games).ageGroup).toBe('U10');
  });

  it('is stable on an age-group tie rather than depending on key order', () => {
    const one = { a: g({ ageGroup: 'U13' }), b: g({ ageGroup: 'U9' }) };
    const other = { a: g({ ageGroup: 'U9' }), b: g({ ageGroup: 'U13' }) };
    expect(preferredRulesContext(one).ageGroup).toBe(preferredRulesContext(other).ageGroup);
  });

  it('says nothing about age when no game records one', () => {
    expect(preferredRulesContext({ a: g({ gameType: 'soccer' }) }).ageGroup).toBeUndefined();
    expect(preferredRulesContext({ a: g({ ageGroup: '  ' }) }).ageGroup).toBeUndefined();
  });
});
