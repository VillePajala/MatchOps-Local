/**
 * @critical - the defaults are only useful if they reach the screen. The helper
 * and the modal were both tested; nothing asserted that ClubModalsHost derives
 * from the coach's games and passes the result through, which is the join where
 * a default silently reverts to "football, all ages" for everyone.
 */
import fs from 'fs';
import path from 'path';
import { preferredRulesContext } from '@/utils/rulesContext';
import type { AppState } from '@/types';

const host = fs.readFileSync(
  path.join(process.cwd(), 'src/components/ClubModalsHost.tsx'),
  'utf8',
);

describe('rules defaults wiring', () => {
  it('the host derives the context from saved games', () => {
    expect(host).toContain('preferredRulesContext(loadGame.savedGames)');
  });

  it('the host passes both derived values to the rules screen', () => {
    const jsx = host.slice(host.indexOf('<RulesDirectoryModal'));
    expect(jsx).toContain('defaultSport={rulesContext.sport}');
    expect(jsx).toContain('defaultAgeGroup={rulesContext.ageGroup}');
  });

  it('produces what the screen expects for a real-shaped set of games', () => {
    const games: Record<string, Partial<AppState>> = {
      a: { gameType: 'futsal', ageGroup: 'U10' },
      b: { gameType: 'futsal', ageGroup: 'U10' },
      c: { gameType: 'soccer', ageGroup: 'U13' },
    };
    expect(preferredRulesContext(games)).toEqual({ sport: 'futsal', ageGroup: 'U10' });
  });
});
