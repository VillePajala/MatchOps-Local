/**
 * A STRUCTURAL guard, not a behaviour test - and named that way on purpose.
 *
 * The gap it covers is real: the defaults helper and the Rules screen are both
 * tested, but nothing else checks that ClubModalsHost derives the context from
 * saved games and hands both values over. That join is where a default would
 * silently revert to "football, all ages" for every coach.
 *
 * WHY NOT RENDER THE HOST: it pulls in ten controller hooks plus the modal
 * context, so a render test would be mostly mock scaffolding - brittle in a way
 * that fails on unrelated refactors while proving little about these two props.
 * Matching on the source is weaker, and the weakness is stated here rather than
 * dressed up: it proves the wiring EXISTS, not that it works. What the values
 * should be is asserted properly in rulesContext.test.ts.
 */
import fs from 'fs';
import path from 'path';
import { preferredRulesContext } from '@/utils/rulesContext';
import type { AppState } from '@/types';

const host = fs.readFileSync(
  path.join(process.cwd(), 'src/components/ClubModalsHost.tsx'),
  'utf8',
);
/** Collapse whitespace so formatting changes do not fail the match. */
const squashed = host.replace(/\s+/g, ' ');

describe('rules defaults wiring (structural)', () => {
  it('derives the context from the coach’s saved games', () => {
    expect(squashed).toContain('preferredRulesContext(loadGame.savedGames)');
  });

  it('hands both derived values to the rules screen', () => {
    const jsx = squashed.slice(squashed.indexOf('<RulesDirectoryModal'));
    expect(jsx).toContain('defaultSport={rulesContext.sport}');
    expect(jsx).toContain('defaultAgeGroup={rulesContext.ageGroup}');
  });

  /**
   * The behavioural half: given games shaped like a real coach's, the helper
   * produces exactly what the screen expects to receive.
   */
  it('produces what the screen expects for a real-shaped set of games', () => {
    const games: Record<string, Partial<AppState>> = {
      a: { gameType: 'futsal', ageGroup: 'U10' },
      b: { gameType: 'futsal', ageGroup: 'U10' },
      c: { gameType: 'soccer', ageGroup: 'U13' },
    };
    expect(preferredRulesContext(games)).toEqual({ sport: 'futsal', ageGroup: 'U10' });
  });
});
