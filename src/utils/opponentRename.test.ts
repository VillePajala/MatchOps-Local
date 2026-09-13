/**
 * @critical - this plans a bulk rewrite of the coach's games. Over-reaching by
 * one normalised key would rename games belonging to a different opponent, and
 * there is no undo.
 */
import { planOpponentRename, renameInOpponentList } from './opponentRename';
import type { SavedGamesCollection } from '@/types/game';
import type { Season } from '@/types';

const games = {
  g1: { opponentName: 'IPS' },
  g2: { opponentName: 'Ips' },
  g3: { opponentName: 'ips' },
  g4: { opponentName: 'IPS/Sininen' },
  g5: { opponentName: 'KuPS' },
} as unknown as SavedGamesCollection;

const seasons = [
  { id: 's1', name: 'Itä P11', opponents: ['Ips', 'KuPS'] },
  { id: 's2', name: 'Talvi', opponents: ['IPS', 'KuPS'] },
  { id: 's3', name: 'Kesä', opponents: ['KuPS'] },
] as unknown as Season[];

describe('planOpponentRename', () => {
  it('finds every spelling of the name and skips rows already correct', () => {
    const plan = planOpponentRename('ips', 'IPS', games, seasons);
    // g1 already reads "IPS"; only the two variants change.
    expect(plan.gameIds.sort()).toEqual(['g2', 'g3']);
    // s2 already reads "IPS"; s3 does not mention it at all.
    expect(plan.seasonIds).toEqual(['s1']);
    expect(plan.isNoop).toBe(false);
  });

  /**
   * @critical - the whole safety property. "IPS/Sininen" is a different team
   * and must never be swept up by a rename of "IPS".
   */
  it('never touches a different opponent', () => {
    const plan = planOpponentRename('ips', 'IPS', games, seasons);
    expect(plan.gameIds).not.toContain('g4'); // IPS/Sininen
    expect(plan.gameIds).not.toContain('g5'); // KuPS
  });

  it('reports a no-op when everything already reads canonically', () => {
    const settled = { a: { opponentName: 'KuPS' } } as unknown as SavedGamesCollection;
    const plan = planOpponentRename('kups', 'KuPS', settled, []);
    expect(plan.isNoop).toBe(true);
    expect(plan.gameIds).toEqual([]);
  });

  it('refuses an empty canonical spelling rather than blanking the name', () => {
    const plan = planOpponentRename('ips', '   ', games, seasons);
    expect(plan.isNoop).toBe(true);
    expect(plan.gameIds).toEqual([]);
    expect(plan.seasonIds).toEqual([]);
  });

  it('survives missing data', () => {
    expect(planOpponentRename('ips', 'IPS', undefined, undefined).isNoop).toBe(true);
  });
});

describe('renameInOpponentList', () => {
  it('collapses every spelling to the canonical one', () => {
    expect(renameInOpponentList(['Ips', 'KuPS'], 'ips', 'IPS')).toEqual(['IPS', 'KuPS']);
  });

  /**
   * @edge-case - a list holding BOTH a variant and the canonical spelling must
   * not end up with the canonical spelling twice.
   */
  it('does not duplicate when the canonical spelling is already in the list', () => {
    expect(renameInOpponentList(['IPS', 'Ips', 'KuPS'], 'ips', 'IPS')).toEqual(['IPS', 'KuPS']);
  });

  it('leaves a different opponent alone', () => {
    expect(renameInOpponentList(['IPS/Sininen', 'Ips'], 'ips', 'IPS'))
      .toEqual(['IPS/Sininen', 'IPS']);
  });

  it('keeps the order of untouched entries', () => {
    expect(renameInOpponentList(['KuPS', 'Ips', 'HJK'], 'ips', 'IPS'))
      .toEqual(['KuPS', 'IPS', 'HJK']);
  });
});
